import { extractApiErrorDetails } from "@/lib/api";
import * as z from "zod";

export type CopilotFormChangeSource = "assistant" | "user" | "mixed";

export type CopilotFormChange = {
  field?: string;
  fields: string[];
  previousValue?: unknown;
  currentValue?: unknown;
  previousValues?: Record<string, unknown>;
  currentValues?: Record<string, unknown>;
  source: CopilotFormChangeSource;
  changedAt: string;
};

export type CopilotFormRuntimeState = {
  initialValues: Record<string, unknown>;
  currentValues: Record<string, unknown>;
  dirtyFields: string[];
  touchedFields: string[];
  lastChange: CopilotFormChange | null;
  lastUserEdit: CopilotFormChange | null;
  lastAssistantEdit: CopilotFormChange | null;
};

export type CopilotSubmitSuccess = {
  ok: true;
  message: string;
  recordId?: string | number;
  redirectTo?: string;
  [key: string]: unknown;
};

export type CopilotSubmitFailure = {
  ok: false;
  errorType: string;
  message: string;
  fieldErrors?: Record<string, string>;
  globalErrors?: string[];
  [key: string]: unknown;
};

export type CopilotSubmitResult = CopilotSubmitSuccess | CopilotSubmitFailure;

export type CopilotSetValuesHandlerResult = {
  applied?: unknown;
  ignored?: unknown;
  reason?: unknown;
};

export type CopilotSetValuesResponse = {
  ok: boolean;
  applied: string[];
  unknown: string[];
  ignored: string[];
  result: unknown;
  errorType?: string;
  message?: string;
};

export type CopilotPatchField = {
  name: string;
  type?: string;
  options?: Array<{
    label?: string;
    value?: unknown;
  }>;
  readOnly?: boolean;
  required?: boolean;
  description?: string;
  arrayItemFields?: CopilotPatchField[];
};

export type CopilotJsonSchema = {
  type?: string | string[];
  description?: string;
  properties?: Record<string, CopilotJsonSchema>;
  items?: CopilotJsonSchema;
  enum?: unknown[];
  additionalProperties?: boolean | CopilotJsonSchema;
};

export type CopilotFormSchemaValidationResult =
  | { ok: true; values: Record<string, unknown> }
  | { ok: false; fieldErrors: Record<string, string> };

export type CopilotSelectValidationFailure = {
  field: string;
  value: unknown;
  allowedOptions: Array<{ label?: string; value?: unknown }>;
};

function stableSerialize(value: unknown): string {
  if (value === undefined) return "__undefined__";
  try {
    return JSON.stringify(value, (_key, innerValue) => {
      if (!innerValue || typeof innerValue !== "object" || Array.isArray(innerValue)) {
        return innerValue;
      }
      return Object.keys(innerValue as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = (innerValue as Record<string, unknown>)[key];
          return acc;
        }, {});
    });
  } catch {
    return String(value);
  }
}

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseMonthName(value: string) {
  const months: Record<string, number> = {
    jan: 1,
    january: 1,
    feb: 2,
    february: 2,
    mar: 3,
    march: 3,
    apr: 4,
    april: 4,
    may: 5,
    jun: 6,
    june: 6,
    jul: 7,
    july: 7,
    aug: 8,
    august: 8,
    sep: 9,
    sept: 9,
    september: 9,
    oct: 10,
    october: 10,
    nov: 11,
    november: 11,
    dec: 12,
    december: 12,
  };
  return months[value.toLowerCase()] ?? null;
}

function normalizeDateValue(value: unknown, now: Date) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateInputValue(value);
  }
  if (typeof value !== "string") return value;

  const trimmed = value.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  const relative = new Date(now);
  if (lower === "today") return formatDateInputValue(relative);
  if (lower === "tomorrow") {
    relative.setDate(relative.getDate() + 1);
    return formatDateInputValue(relative);
  }
  if (lower === "yesterday") {
    relative.setDate(relative.getDate() - 1);
    return formatDateInputValue(relative);
  }

  const isoMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}`;
  }

  const monthNameMatch = trimmed.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (monthNameMatch) {
    const month = parseMonthName(monthNameMatch[2]);
    if (month) {
      return `${monthNameMatch[3]}-${String(month).padStart(2, "0")}-${monthNameMatch[1].padStart(2, "0")}`;
    }
  }

  const dayFirstMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dayFirstMatch) {
    return `${dayFirstMatch[3]}-${dayFirstMatch[2].padStart(2, "0")}-${dayFirstMatch[1].padStart(2, "0")}`;
  }

  return value;
}

function normalizeLookupKey(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isEmptySelectValue(value: unknown) {
  return value === "" || value === null || value === undefined;
}

function matchesSelectOptionValue(field: CopilotPatchField, value: unknown) {
  const options = Array.isArray(field.options) ? field.options : [];
  if (options.length === 0 || isEmptySelectValue(value)) return true;

  const valueKey = normalizeLookupKey(value);
  const numericValue = typeof value === "number" ? value : Number(value);

  return options.some(option => {
    if (option.value === value) return true;
    if (
      Number.isFinite(numericValue) &&
      typeof option.value === "number" &&
      option.value === numericValue
    ) {
      return true;
    }
    return normalizeLookupKey(option.value) === valueKey;
  });
}

function literalSchemaForValue(value: unknown): z.ZodTypeAny {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return z.literal(value);
  }
  return z.unknown();
}

function enumSchemaForOptions(field: CopilotPatchField): z.ZodTypeAny {
  const optionValues = (field.options ?? []).map(option => option.value);
  if (optionValues.length === 0) return z.unknown();
  const uniqueValues = Array.from(
    new Map(optionValues.map(value => [stableSerialize(value), value])).values(),
  );
  const literals = uniqueValues.map(literalSchemaForValue);
  return literals.length === 1 ? literals[0] : z.union(literals as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]);
}

function buildZodFieldSchema(field: CopilotPatchField): z.ZodTypeAny {
  switch (field.type) {
    case "number":
      return z.coerce.number();
    case "boolean":
      return z.boolean();
    case "date":
    case "string":
      return z.string();
    case "select":
      return enumSchemaForOptions(field);
    case "array":
      return z.array(buildZodObjectSchema(field.arrayItemFields ?? [], {
        includeArrayMetaFields: true,
      }));
    case "object":
      return z.record(z.string(), z.unknown());
    default:
      return z.unknown();
  }
}

function buildZodObjectSchema(
  fields: CopilotPatchField[],
  options: { includeArrayMetaFields?: boolean } = {},
) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of fields) {
    if (field.readOnly) continue;
    shape[field.name] = buildZodFieldSchema(field).optional();
  }
  if (options.includeArrayMetaFields) {
    shape.id = z.union([z.coerce.number(), z.string()]).optional();
    shape.index = z.coerce.number().int().nonnegative().optional();
  }
  return z.strictObject(shape);
}

function jsonTypeForField(field: CopilotPatchField): CopilotJsonSchema {
  const description = [
    field.description,
    field.required ? "Required before submit." : "",
  ].filter(Boolean).join(" ");

  const base = description ? { description } : {};
  switch (field.type) {
    case "number":
      return { ...base, type: "number" };
    case "boolean":
      return { ...base, type: "boolean" };
    case "date":
      return {
        ...base,
        type: "string",
        description: [description, "Use YYYY-MM-DD."].filter(Boolean).join(" "),
      };
    case "select":
      return {
        ...base,
        ...(field.options?.length ? { enum: field.options.map(option => option.value) } : {}),
        description: [
          description,
          field.options?.length
            ? `Allowed values: ${field.options
                .map(option => `${String(option.label ?? option.value)}=${String(option.value)}`)
                .join(", ")}.`
            : "",
        ].filter(Boolean).join(" "),
      };
    case "array":
      return {
        ...base,
        type: "array",
        items: buildJsonObjectSchema(field.arrayItemFields ?? [], {
          includeArrayMetaFields: true,
        }),
      };
    case "object":
      return { ...base, type: "object", additionalProperties: true };
    case "string":
    default:
      return { ...base, type: "string" };
  }
}

function buildJsonObjectSchema(
  fields: CopilotPatchField[],
  options: { includeArrayMetaFields?: boolean } = {},
): CopilotJsonSchema {
  const properties: Record<string, CopilotJsonSchema> = {};
  for (const field of fields) {
    if (field.readOnly) continue;
    properties[field.name] = jsonTypeForField(field);
  }
  if (options.includeArrayMetaFields) {
    properties.id = {
      type: ["number", "string"],
      description: "Optional existing row id used only to target an existing row.",
    };
    properties.index = {
      type: "number",
      description: "Optional zero-based row index used only to target an existing row.",
    };
  }
  return {
    type: "object",
    properties,
    additionalProperties: false,
  };
}

export function buildCopilotFormValuesSchema(
  fields: CopilotPatchField[],
): CopilotJsonSchema {
  return buildJsonObjectSchema(fields);
}

export function buildCopilotSetFormValuesParameters(
  fields: CopilotPatchField[],
) {
  return {
    formId: { type: "string", description: "Optional target form id." },
    values: {
      ...buildCopilotFormValuesSchema(fields),
      description:
        "Strict patch object. Use only keys listed in properties; omit fields you are not changing.",
      required: true,
    },
    reason: { type: "string", description: "Optional reason for audit/debugging." },
  };
}

export function validateCopilotFormPatchValues(
  fields: CopilotPatchField[],
  values: Record<string, unknown>,
): CopilotFormSchemaValidationResult {
  const result = buildZodObjectSchema(fields).safeParse(values);
  if (result.success) return { ok: true, values: result.data };

  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const path = issue.path.map(String).join(".");
    fieldErrors[path || "values"] = issue.message;
  }
  return { ok: false, fieldErrors };
}

function normalizeSelectValue(field: CopilotPatchField, value: unknown) {
  if (value === "" || value === null || value === undefined) return value;
  const options = Array.isArray(field.options) ? field.options : [];
  if (options.length === 0) return value;

  const valueKey = normalizeLookupKey(value);
  const numericValue = typeof value === "number" ? value : Number(value);

  for (const option of options) {
    if (option.value === value) return value;
    if (
      Number.isFinite(numericValue) &&
      typeof option.value === "number" &&
      option.value === numericValue
    ) {
      return option.value;
    }
    if (normalizeLookupKey(option.value) === valueKey) return option.value;
    if (normalizeLookupKey(option.label) === valueKey) return option.value;
  }

  return value;
}

function expandDottedArrayPatchValues(
  fields: CopilotPatchField[],
  values: Record<string, unknown>,
) {
  const fieldsByName = new Map(fields.map(field => [field.name, field]));
  const expanded: Record<string, unknown> = {};

  for (const [fieldName, value] of Object.entries(values)) {
    if (fieldsByName.has(fieldName)) {
      expanded[fieldName] = value;
      continue;
    }

    const match = fieldName.match(/^([^.]+)\.(\d+)\.(.+)$/);
    const arrayFieldName = match?.[1];
    const rowIndex = match?.[2] ? Number(match[2]) : Number.NaN;
    const itemFieldName = match?.[3];
    const arrayField = arrayFieldName ? fieldsByName.get(arrayFieldName) : undefined;
    const itemFields = arrayField?.arrayItemFields ?? [];
    const itemFieldNames = new Set([
      ...itemFields.map(field => field.name),
      "id",
      "index",
    ]);

    if (
      arrayField?.type !== "array" ||
      !arrayFieldName ||
      !Number.isInteger(rowIndex) ||
      rowIndex < 0 ||
      !itemFieldName ||
      !itemFieldNames.has(itemFieldName)
    ) {
      expanded[fieldName] = value;
      continue;
    }

    const existingArray = Array.isArray(expanded[arrayFieldName])
      ? [...expanded[arrayFieldName] as unknown[]]
      : [];
    const existingRow = existingArray[rowIndex];
    const nextRow =
      existingRow && typeof existingRow === "object" && !Array.isArray(existingRow)
        ? { ...existingRow as Record<string, unknown> }
        : {};

    nextRow[itemFieldName] = value;
    existingArray[rowIndex] = nextRow;
    expanded[arrayFieldName] = existingArray;
  }

  return expanded;
}

function normalizeFieldPatchValue(
  field: CopilotPatchField,
  value: unknown,
  now: Date,
): unknown {
  if (field.type === "date") return normalizeDateValue(value, now);
  if (field.type === "select") return normalizeSelectValue(field, value);
  if (field.type === "array" && Array.isArray(value)) {
    const itemFieldsByName = new Map(
      (field.arrayItemFields ?? []).map(itemField => [itemField.name, itemField]),
    );
    return value.map(row => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return row;
      return Object.fromEntries(
        Object.entries(row).map(([itemFieldName, itemValue]) => {
          const itemField = itemFieldsByName.get(itemFieldName);
          return [
            itemFieldName,
            itemField
              ? normalizeFieldPatchValue(itemField, itemValue, now)
              : itemValue,
          ];
        }),
      );
    });
  }
  return value;
}

export function normalizeCopilotFormPatchValues(
  fields: CopilotPatchField[],
  values: Record<string, unknown>,
  now = new Date(),
) {
  const fieldsByName = new Map(fields.map(field => [field.name, field]));
  const expanded = expandDottedArrayPatchValues(fields, values);
  return Object.fromEntries(
    Object.entries(expanded).map(([fieldName, value]) => {
      const field = fieldsByName.get(fieldName);
      return [
        fieldName,
        field ? normalizeFieldPatchValue(field, value, now) : value,
      ];
    }),
  );
}

function collectInvalidSelectValues(
  fields: CopilotPatchField[],
  values: Record<string, unknown>,
  prefix = "",
): CopilotSelectValidationFailure[] {
  const failures: CopilotSelectValidationFailure[] = [];

  for (const field of fields) {
    if (!(field.name in values)) continue;
    const value = values[field.name];
    const fieldPath = prefix ? `${prefix}.${field.name}` : field.name;

    if (field.type === "select" && !matchesSelectOptionValue(field, value)) {
      failures.push({
        field: fieldPath,
        value,
        allowedOptions: field.options ?? [],
      });
    }

    if (field.type === "array" && Array.isArray(value)) {
      value.forEach((row, index) => {
        if (!row || typeof row !== "object" || Array.isArray(row)) return;
        failures.push(
          ...collectInvalidSelectValues(
            field.arrayItemFields ?? [],
            row as Record<string, unknown>,
            `${fieldPath}.${index}`,
          ),
        );
      });
    }
  }

  return failures;
}

export function findInvalidCopilotSelectValues(
  fields: CopilotPatchField[],
  values: Record<string, unknown>,
): CopilotSelectValidationFailure[] {
  return collectInvalidSelectValues(fields, values);
}

function sortedUnique(values: Iterable<string>): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function getChangedFields(
  previous: Record<string, unknown>,
  current: Record<string, unknown>,
): string[] {
  const fields = sortedUnique([...Object.keys(previous), ...Object.keys(current)]);
  return fields.filter(
    field => stableSerialize(previous[field]) !== stableSerialize(current[field]),
  );
}

function pickValues(values: Record<string, unknown>, fields: string[]) {
  return fields.reduce<Record<string, unknown>>((acc, field) => {
    acc[field] = values[field];
    return acc;
  }, {});
}

function buildChange({
  previous,
  current,
  fields,
  source,
}: {
  previous: Record<string, unknown>;
  current: Record<string, unknown>;
  fields: string[];
  source: CopilotFormChangeSource;
}): CopilotFormChange {
  const base = {
    fields,
    source,
    changedAt: new Date().toISOString(),
  };

  if (fields.length === 1) {
    const field = fields[0];
    return {
      ...base,
      field,
      previousValue: previous[field],
      currentValue: current[field],
    };
  }

  return {
    ...base,
    previousValues: pickValues(previous, fields),
    currentValues: pickValues(current, fields),
  };
}

export function createCopilotFormRuntimeState(
  values: Record<string, unknown>,
): CopilotFormRuntimeState {
  return {
    initialValues: values,
    currentValues: values,
    dirtyFields: [],
    touchedFields: [],
    lastChange: null,
    lastUserEdit: null,
    lastAssistantEdit: null,
  };
}

export function updateCopilotFormRuntimeState(
  previousState: CopilotFormRuntimeState,
  currentValues: Record<string, unknown>,
  options: { assistantPatchedFields?: string[] } = {},
): CopilotFormRuntimeState {
  const changedFields = getChangedFields(previousState.currentValues, currentValues);
  if (changedFields.length === 0) return previousState;

  const assistantFields = new Set(options.assistantPatchedFields ?? []);
  const userChangedFields = changedFields.filter(field => !assistantFields.has(field));
  const assistantChangedFields = changedFields.filter(field => assistantFields.has(field));
  const source: CopilotFormChangeSource =
    userChangedFields.length > 0 && assistantChangedFields.length > 0
      ? "mixed"
      : userChangedFields.length > 0
        ? "user"
        : "assistant";

  const lastChange = buildChange({
    previous: previousState.currentValues,
    current: currentValues,
    fields: changedFields,
    source,
  });
  const lastUserEdit =
    userChangedFields.length > 0
      ? source === "user"
        ? lastChange
        : buildChange({
            previous: previousState.currentValues,
            current: currentValues,
            fields: userChangedFields,
            source: "user",
          })
      : previousState.lastUserEdit;
  const lastAssistantEdit =
    assistantChangedFields.length > 0
      ? source === "assistant"
        ? lastChange
        : buildChange({
            previous: previousState.currentValues,
            current: currentValues,
            fields: assistantChangedFields,
            source: "assistant",
          })
      : previousState.lastAssistantEdit;

  return {
    initialValues: previousState.initialValues,
    currentValues,
    dirtyFields: getChangedFields(previousState.initialValues, currentValues),
    touchedFields: sortedUnique([...previousState.touchedFields, ...changedFields]),
    lastChange,
    lastUserEdit,
    lastAssistantEdit,
  };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeStringMap(value: unknown): Record<string, string> | undefined {
  if (!isObject(value)) return undefined;
  const entries = Object.entries(value).map(([key, entry]) => [
    key,
    Array.isArray(entry) ? entry.join(" ") : String(entry),
  ]);
  return Object.fromEntries(entries);
}

function normalizeStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value.filter((entry): entry is string => typeof entry === "string");
}

export function normalizeCopilotSetValuesResponse({
  acceptedFields,
  unknownFields,
  setterResult,
}: {
  acceptedFields: string[];
  unknownFields: string[];
  setterResult: unknown;
}): CopilotSetValuesResponse {
  const result = setterResult && typeof setterResult === "object"
    ? setterResult as CopilotSetValuesHandlerResult
    : null;
  const actualApplied = normalizeStringArray(result?.applied) ?? acceptedFields;
  const ignored = normalizeStringArray(result?.ignored) ?? [];
  const ok = actualApplied.length > 0;

  return {
    ok,
    applied: actualApplied,
    unknown: unknownFields,
    ignored,
    result: setterResult ?? null,
    ...(ok
      ? {}
      : {
          errorType: "values_not_applied",
          message:
            typeof result?.reason === "string" && result.reason.trim()
              ? result.reason
              : "The form did not apply any requested values.",
        }),
  };
}

export function normalizeCopilotSubmitResult(value: unknown): CopilotSubmitResult {
  if (isObject(value) && typeof value.ok === "boolean") {
    if (value.ok) {
      return {
        ...value,
        ok: true,
        message:
          typeof value.message === "string" && value.message.trim()
            ? value.message
            : "Form submitted successfully.",
      };
    }

    return {
      ...value,
      ok: false,
      errorType:
        typeof value.errorType === "string" && value.errorType.trim()
          ? value.errorType
          : "submit_failed",
      message:
        typeof value.message === "string" && value.message.trim()
          ? value.message
          : "The form submit failed.",
      fieldErrors: normalizeStringMap(value.fieldErrors),
      globalErrors: Array.isArray(value.globalErrors)
        ? value.globalErrors.map(entry => String(entry))
        : undefined,
    };
  }

  return {
    ok: false,
    errorType: "unverified_submit_result",
    message:
      "The form submit handler did not return a verified result. Check the UI before telling the user it was submitted.",
  };
}

export function normalizeCopilotSubmitError(error: unknown): CopilotSubmitFailure {
  const errorRecord = isObject(error) ? error : null;
  const apiBody = errorRecord && "body" in errorRecord ? errorRecord.body : undefined;
  const apiStatus = errorRecord && typeof errorRecord.status === "number"
    ? errorRecord.status
    : undefined;
  const details = extractApiErrorDetails(apiBody);
  const hasFieldErrors = Object.keys(details.fieldErrors).length > 0;
  const hasGlobalErrors = details.globalErrors.length > 0;

  return {
    ok: false,
    errorType: apiStatus ? "backend_error" : "submit_exception",
    message:
      details.message
      ?? (error instanceof Error ? error.message : String(error || "Failed to submit form.")),
    status: apiStatus,
    fieldErrors: hasFieldErrors ? details.fieldErrors : undefined,
    globalErrors: hasGlobalErrors ? details.globalErrors : undefined,
  };
}
