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

export type CopilotPatchField = {
  name: string;
  type?: string;
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

export function normalizeCopilotFormPatchValues(
  fields: CopilotPatchField[],
  values: Record<string, unknown>,
  now = new Date(),
) {
  const fieldTypes = new Map(fields.map(field => [field.name, field.type]));
  return Object.fromEntries(
    Object.entries(values).map(([field, value]) => [
      field,
      fieldTypes.get(field) === "date" ? normalizeDateValue(value, now) : value,
    ]),
  );
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
  return {
    ok: false,
    errorType: "submit_exception",
    message: error instanceof Error ? error.message : String(error || "Failed to submit form."),
  };
}
