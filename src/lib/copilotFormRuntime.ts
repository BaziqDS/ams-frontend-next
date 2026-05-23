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

export const COPILOT_FORM_OPTION_PREVIEW_LIMIT = 25;

export type CopilotFormOption = {
  label?: string;
  value?: unknown;
  [key: string]: unknown;
};

export type CopilotFormOptionsState =
  | "complete"
  | "truncated"
  | "requires_dependency"
  | "loading"
  | "empty"
  | "remote_search"
  | "error";

export type CopilotPatchField = {
  name: string;
  label?: string;
  type?: string;
  arrayItemType?: "string" | "number" | "boolean" | "unknown";
  options?: CopilotFormOption[];
  readOnly?: boolean;
  required?: boolean;
  description?: string;
  arrayItemFields?: CopilotPatchField[];
  dependsOn?: string[];
  affects?: string[];
  optionSource?: string;
  optionsMode?: "complete" | "local_search" | "remote_search";
  optionsState?: CopilotFormOptionsState;
  optionsPreview?: CopilotFormOption[];
  totalCount?: number;
  hasMore?: boolean;
  resolver?: "search_form_options" | string;
  searchRequired?: boolean;
  missingDependencies?: string[];
  emptyReason?: string;
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

export type CopilotFormContextField = Omit<CopilotPatchField, "arrayItemFields"> & {
  optionsState: CopilotFormOptionsState;
  optionsPreview?: CopilotFormOption[];
  totalCount?: number;
  hasMore?: boolean;
  resolver?: string;
  emptyReason?: string;
  arrayItemFields?: CopilotFormContextField[];
};

export type CopilotFormOptionSearchStatus =
  | "matched"
  | "candidates"
  | "ambiguous"
  | "not_found"
  | "missing_dependencies"
  | "unknown_field";

export type CopilotFormOptionSearchArgs = {
  fields: CopilotPatchField[];
  field: string;
  query?: string;
  currentValues?: Record<string, unknown>;
  limit?: number;
  previewLimit?: number;
};

export type CopilotFormOptionSearchResult = {
  ok: boolean;
  status: CopilotFormOptionSearchStatus;
  field: string;
  query: string;
  selected?: CopilotFormOption;
  candidates: CopilotFormOption[];
  totalCount: number;
  hasMore: boolean;
  optionsState?: CopilotFormOptionsState;
  missingDependencies?: string[];
  message?: string;
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

function readNestedValue(values: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let current: unknown = values;
  for (const part of parts) {
    if (Array.isArray(current)) {
      const index = Number(part);
      if (!Number.isInteger(index) || index < 0) return undefined;
      current = current[index];
      continue;
    }
    if (!current || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function readFlatOrNestedValue(values: Record<string, unknown>, path: string): unknown {
  if (Object.prototype.hasOwnProperty.call(values, path)) {
    return values[path];
  }
  return readNestedValue(values, path);
}

function rowSpecificDependencyPath(path: string, contextPath?: string) {
  if (!contextPath || !path.includes("[].")) return null;
  const [arrayField, nestedPath] = path.split("[].", 2);
  const escapedArrayField = arrayField.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = contextPath.match(new RegExp(`^${escapedArrayField}\\.(\\d+)\\.`));
  if (!match) return null;
  return `${arrayField}.${match[1]}.${nestedPath}`;
}

function valueAtPath(
  values: Record<string, unknown>,
  path: string,
  contextPath?: string,
): unknown {
  const rowPath = rowSpecificDependencyPath(path, contextPath);
  if (rowPath) {
    return readFlatOrNestedValue(values, rowPath);
  }

  const direct = readFlatOrNestedValue(values, path);
  if (!isEmptySelectValue(direct)) return direct;

  if (path.includes("[].")) {
    const [arrayField, nestedPath] = path.split("[].", 2);
    const rows = values[arrayField];

    if (Array.isArray(rows)) {
      const nestedRowValue = rows
        .map((row): unknown => row && typeof row === "object" && !Array.isArray(row)
          ? valueAtPath(row as Record<string, unknown>, nestedPath)
          : undefined)
        .find(value => !isEmptySelectValue(value));
      if (!isEmptySelectValue(nestedRowValue)) return nestedRowValue;
    }

    const flatPrefix = `${arrayField}.`;
    const flatSuffix = `.${nestedPath}`;
    return Object.entries(values)
      .filter(([key]) => key.startsWith(flatPrefix) && key.endsWith(flatSuffix))
      .map(([_key, value]) => value)
      .find(value => !isEmptySelectValue(value));
  }

  return direct;
}

function missingFieldDependencies(
  field: CopilotPatchField,
  values?: Record<string, unknown>,
  fieldPath?: string,
) {
  if (Array.isArray(field.missingDependencies) && field.missingDependencies.length > 0) {
    return field.missingDependencies;
  }
  if (!values || !Array.isArray(field.dependsOn) || field.dependsOn.length === 0) {
    return [];
  }
  return field.dependsOn.filter((dependency) => isEmptySelectValue(valueAtPath(values, dependency, fieldPath)));
}

function inferOptionsState({
  field,
  values,
  previewLimit,
  fieldPath,
}: {
  field: CopilotPatchField;
  values?: Record<string, unknown>;
  previewLimit: number;
  fieldPath?: string;
}): CopilotFormOptionsState {
  const missingDependencies = missingFieldDependencies(field, values, fieldPath);
  if (
    field.optionsState &&
    (field.optionsState !== "requires_dependency" || missingDependencies.length > 0)
  ) {
    return field.optionsState;
  }
  if (missingDependencies.length > 0) return "requires_dependency";
  if (field.optionsMode === "remote_search") return "remote_search";
  const options = field.options ?? [];
  if (options.length === 0) return "empty";
  if (options.length > previewLimit) return "truncated";
  return "complete";
}

function shouldExposeFullOptions(field: CopilotPatchField, previewLimit: number) {
  const state = inferOptionsState({ field, previewLimit, fieldPath: field.name });
  const options = field.options ?? [];
  return state === "complete" && options.length <= previewLimit;
}

function contextFieldFor(
  field: CopilotPatchField,
  {
    previewLimit,
    values,
  }: {
    previewLimit: number;
    values?: Record<string, unknown>;
  },
): CopilotFormContextField {
  const options = field.options ?? [];
  const state = inferOptionsState({ field, values, previewLimit, fieldPath: field.name });
  const fullOptionsVisible = state === "complete" && options.length <= previewLimit;
  const missingDependencies = missingFieldDependencies(field, values, field.name);
  const {
    options: _options,
    arrayItemFields,
    optionsPreview,
    ...rest
  } = field;
  const preview = optionsPreview ?? options.slice(0, previewLimit);
  const totalCount = field.totalCount ?? options.length;
  const hasMore = field.hasMore ?? totalCount > preview.length;
  const emptyReason = field.emptyReason
    ?? (state === "empty"
      ? `No options exist for ${field.label ?? field.name} in the current form state.`
      : undefined);

  return {
    ...rest,
    ...(fullOptionsVisible ? { options } : {}),
    optionsState: state,
    ...(!fullOptionsVisible ? { optionsPreview: preview } : {}),
    ...(options.length > 0 || field.totalCount !== undefined || state === "empty" ? { totalCount } : {}),
    ...(options.length > 0 || field.hasMore !== undefined || state === "empty" ? { hasMore } : {}),
    ...(state !== "complete" || field.resolver ? { resolver: field.resolver ?? "search_form_options" } : {}),
    ...(missingDependencies.length > 0 ? { missingDependencies } : {}),
    ...(emptyReason ? { emptyReason } : {}),
    ...(arrayItemFields
      ? {
          arrayItemFields: buildCopilotFormContextFields(arrayItemFields, {
            previewLimit,
            values,
          }),
        }
      : {}),
  };
}

export function buildCopilotFormContextFields(
  fields: CopilotPatchField[],
  options: {
    previewLimit?: number;
    values?: Record<string, unknown>;
  } = {},
): CopilotFormContextField[] {
  const previewLimit = options.previewLimit ?? COPILOT_FORM_OPTION_PREVIEW_LIMIT;
  return fields.map(field => contextFieldFor(field, {
    previewLimit,
    values: options.values,
  }));
}

function fieldByPath(fields: CopilotPatchField[], path: string) {
  const direct = fields.find(field => field.name === path);
  if (direct) return direct;

  const dottedArrayMatch = path.match(/^([^.]+)\.(\d+|\*)\.(.+)$/);
  if (!dottedArrayMatch) return null;

  const arrayField = fields.find(field => field.name === dottedArrayMatch[1]);
  if (!arrayField || arrayField.type !== "array") return null;
  return (arrayField.arrayItemFields ?? []).find(field => field.name === dottedArrayMatch[3]) ?? null;
}

export function ensureValueInOptions<T extends CopilotFormOption>(
  options: T[],
  value: unknown,
  label?: string | null,
): T[] {
  if (value == null || value === "") return options;
  const stringValue = String(value);
  const alreadyPresent = options.some(
    option => String(option.value ?? "") === stringValue,
  );
  if (alreadyPresent) return options;
  return [...options, { value, label: label ?? stringValue } as T];
}

function normalizeSearchText(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ");
}

function optionSearchText(option: CopilotFormOption) {
  return normalizeSearchText(
    Object.entries(option)
      .filter(([_key, value]) => ["string", "number", "boolean"].includes(typeof value))
      .map(([_key, value]) => String(value))
      .join(" "),
  );
}

function optionMatchesQuery(option: CopilotFormOption, query: string) {
  if (!query) return true;
  return optionSearchText(option).includes(query);
}

function optionMatchesExactly(option: CopilotFormOption, query: string) {
  if (!query) return false;
  return (
    normalizeSearchText(option.label) === query ||
    normalizeSearchText(option.value) === query
  );
}

function compactSearchText(value: string) {
  return normalizeSearchText(value).replace(/\s+/g, "");
}

function editDistance(a: string, b: string) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  let previous = Array.from({ length: b.length + 1 }, (_unused, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + cost,
      );
    }
    previous = current;
  }
  return previous[b.length];
}

function fuzzyOptionDistance(option: CopilotFormOption, query: string) {
  const compactQuery = compactSearchText(query);
  if (compactQuery.length < 4) return Number.POSITIVE_INFINITY;

  const tokens = optionSearchText(option)
    .split(" ")
    .map(token => compactSearchText(token))
    .filter(Boolean);
  const candidates = [...tokens];
  for (let size = 2; size <= Math.min(3, tokens.length); size += 1) {
    for (let start = 0; start <= tokens.length - size; start += 1) {
      candidates.push(tokens.slice(start, start + size).join(""));
    }
  }

  return candidates
    .filter(token => token.length >= 4)
    .reduce((best, token) => Math.min(best, editDistance(token, compactQuery)), Number.POSITIVE_INFINITY);
}

function fuzzyOptionMatches(
  options: CopilotFormOption[],
  query: string,
  limit: number,
) {
  if (!query) return [];
  return options
    .map(option => ({ option, distance: fuzzyOptionDistance(option, query) }))
    .filter(match => match.distance <= 1)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, Math.max(1, limit))
    .map(match => match.option);
}

function normalizeOptionForResponse(option: CopilotFormOption): CopilotFormOption {
  const label = option.label ?? String(option.value ?? "");
  return {
    ...option,
    label,
  };
}

export function searchCopilotFormOptions({
  fields,
  field: fieldPath,
  query = "",
  currentValues,
  limit = 10,
  previewLimit = COPILOT_FORM_OPTION_PREVIEW_LIMIT,
}: CopilotFormOptionSearchArgs): CopilotFormOptionSearchResult {
  const normalizedQuery = normalizeSearchText(query);
  const field = fieldByPath(fields, fieldPath);
  if (!field) {
    return {
      ok: false,
      status: "unknown_field",
      field: fieldPath,
      query,
      candidates: [],
      totalCount: 0,
      hasMore: false,
      message: `Unknown form option field: ${fieldPath}`,
    };
  }

  const missingDependencies = missingFieldDependencies(field, currentValues, fieldPath);
  const optionsState = inferOptionsState({
    field,
    values: currentValues,
    previewLimit,
    fieldPath,
  });
  if (optionsState === "requires_dependency" || missingDependencies.length > 0) {
    return {
      ok: false,
      status: "missing_dependencies",
      field: fieldPath,
      query,
      candidates: [],
      totalCount: 0,
      hasMore: false,
      optionsState: "requires_dependency",
      missingDependencies,
      message: `Resolve dependencies before searching ${fieldPath}: ${missingDependencies.join(", ")}`,
    };
  }

  const options = field.options ?? [];
  if (optionsState === "empty" && options.length === 0) {
    return {
      ok: false,
      status: "not_found",
      field: fieldPath,
      query,
      candidates: [],
      totalCount: 0,
      hasMore: false,
      optionsState,
      message: field.emptyReason
        ?? `No options exist for ${field.label ?? fieldPath} in the current form state.`,
    };
  }

  const matches = options.filter(option => optionMatchesQuery(option, normalizedQuery));
  const fuzzyMatches = matches.length === 0
    ? fuzzyOptionMatches(options, normalizedQuery, limit)
    : [];
  const effectiveMatches = matches.length > 0 ? matches : fuzzyMatches;
  const exactMatches = options.filter(option => optionMatchesExactly(option, normalizedQuery));
  const candidates = effectiveMatches.slice(0, Math.max(1, limit)).map(normalizeOptionForResponse);
  const selectedSource =
    exactMatches.length === 1
      ? exactMatches[0]
      : normalizedQuery && effectiveMatches.length === 1
        ? effectiveMatches[0]
        : undefined;
  const selected = selectedSource ? normalizeOptionForResponse(selectedSource) : undefined;
  const status: CopilotFormOptionSearchStatus = selected
    ? "matched"
    : effectiveMatches.length === 0
      ? "not_found"
      : normalizedQuery
        ? "ambiguous"
        : "candidates";

  return {
    ok: status !== "not_found",
    status,
    field: fieldPath,
    query,
    ...(selected ? { selected } : {}),
    candidates,
    totalCount: options.length,
    hasMore: options.length > Math.min(previewLimit, limit),
    optionsState,
  };
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

function previewSelectOptions(field: CopilotPatchField) {
  return (field.options ?? []).slice(0, COPILOT_FORM_OPTION_PREVIEW_LIMIT);
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
      if ((field.arrayItemFields ?? []).length > 0) {
        return z.array(buildZodObjectSchema(field.arrayItemFields ?? [], {
          includeArrayMetaFields: true,
        }));
      }
      if ((field.options ?? []).length > 0) return z.array(enumSchemaForOptions(field));
      switch (field.arrayItemType) {
        case "number":
          return z.array(z.coerce.number());
        case "boolean":
          return z.array(z.boolean());
        case "string":
          return z.array(z.coerce.string());
        case "unknown":
        default:
          return z.array(z.unknown());
      }
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
  const exposeOptions = shouldExposeFullOptions(field, COPILOT_FORM_OPTION_PREVIEW_LIMIT);
  const description = [
    field.description,
    field.required ? "Required before submit." : "",
    !exposeOptions && (field.options ?? []).length > 0
      ? "Options are searchable/truncated; use search_form_options to resolve user text to a valid option value before patching."
      : "",
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
        ...(exposeOptions ? { enum: field.options?.map(option => option.value) ?? [] } : {}),
        description: [
          description,
          exposeOptions && field.options?.length
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
        items: jsonArrayItemSchemaForField(field),
      };
    case "object":
      return { ...base, type: "object", additionalProperties: true };
    case "string":
    default:
      return { ...base, type: "string" };
  }
}

function jsonArrayItemSchemaForField(field: CopilotPatchField): CopilotJsonSchema {
  if ((field.arrayItemFields ?? []).length > 0) {
    return buildJsonObjectSchema(field.arrayItemFields ?? [], {
      includeArrayMetaFields: true,
    });
  }
  if ((field.options ?? []).length > 0 && shouldExposeFullOptions(field, COPILOT_FORM_OPTION_PREVIEW_LIMIT)) {
    return {
      ...(field.arrayItemType && field.arrayItemType !== "unknown"
        ? { type: field.arrayItemType }
        : {}),
      enum: field.options?.map(option => option.value) ?? [],
    };
  }
  switch (field.arrayItemType) {
    case "number":
      return { type: "number" };
    case "boolean":
      return { type: "boolean" };
    case "string":
      return { type: "string" };
    case "unknown":
    default:
      return {};
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
    if ((field.arrayItemFields ?? []).length === 0) {
      return value.map(item => normalizeSelectValue(field, item));
    }
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
        allowedOptions: previewSelectOptions(field),
      });
    }

    if (field.type === "array" && Array.isArray(value)) {
      if ((field.arrayItemFields ?? []).length === 0) {
        if ((field.options ?? []).length > 0) {
          value.forEach((item, index) => {
            if (matchesSelectOptionValue(field, item)) return;
            failures.push({
              field: `${fieldPath}.${index}`,
              value: item,
              allowedOptions: previewSelectOptions(field),
            });
          });
        }
      } else {
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
