const HIDDEN_ARG_KEYS = new Set(["approvalContext", "intent", "reviewContext", "summary"]);

export type DetachedApprovalAction = {
  name: string;
  args: Record<string, unknown>;
  description?: string;
};

type DetachedApprovalReadable = {
  id?: string;
  description?: string;
  value?: unknown;
};

type DetachedApprovalContext = {
  readables?: DetachedApprovalReadable[];
};

export type DetachedApprovalField = {
  label: string;
  value: string;
  missing: boolean;
};

export type DetachedApprovalReview = {
  title: string;
  eyebrow: string;
  description: string;
  metadata: Array<{ label: string; value: string }>;
  fields: DetachedApprovalField[];
  approveLabel: string;
  rejectLabel: string;
};

type BuildDetachedApprovalReviewOptions = {
  context?: DetachedApprovalContext | null;
  now?: Date;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function humanizeToken(value: string) {
  return value
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleize(value: string) {
  return humanizeToken(value).replace(/\b\w/g, (char) => char.toUpperCase());
}

function renderValue(value: unknown) {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function getNestedValue(source: unknown, path: string): unknown {
  if (!path) return undefined;
  if (isRecord(source) && path in source) return source[path];
  return path.split(".").reduce<unknown>((current, segment) => {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number(segment);
      return Number.isInteger(index) ? current[index] : undefined;
    }
    if (isRecord(current)) return current[segment];
    return undefined;
  }, source);
}

function findActiveForm(
  context: DetachedApprovalContext | null | undefined,
  formId: unknown,
) {
  const readables = Array.isArray(context?.readables) ? context.readables : [];
  const forms = readables
    .map((readable) => readable.value)
    .filter(isRecord)
    .map((value) => (isRecord(value.activeForm) ? value.activeForm : null))
    .filter((value): value is Record<string, unknown> => Boolean(value));
  const target = typeof formId === "string" ? formId : null;
  return forms.find((form) => !target || form.formId === target) ?? forms[0] ?? null;
}

function findRuntimeUser(context: DetachedApprovalContext | null | undefined) {
  const runtime = context?.readables?.find(
    (readable) => readable.id === "__ams_runtime_context",
  );
  const user = isRecord(runtime?.value) && isRecord(runtime.value.user)
    ? runtime.value.user
    : null;
  const display =
    user &&
    [
      typeof user.first_name === "string" ? user.first_name : "",
      typeof user.last_name === "string" ? user.last_name : "",
    ]
      .join(" ")
      .trim();
  return (
    display ||
    (typeof user?.username === "string" ? user.username : "") ||
    (typeof user?.email === "string" ? user.email : "") ||
    "Current user"
  );
}

function findLatestAssistantEdit(
  context: DetachedApprovalContext | null | undefined,
  formId: unknown,
) {
  const activity = context?.readables?.find(
    (readable) => readable.id === "__ams_activity_context",
  );
  const events = isRecord(activity?.value) && Array.isArray(activity.value.recentActivity)
    ? activity.value.recentActivity
    : [];
  const target = typeof formId === "string" ? formId : null;

  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!isRecord(event)) continue;
    if (event.kind !== "form_values_set" || event.actor !== "assistant") continue;
    if (target && event.formId !== target) continue;
    return {
      fields: Array.isArray(event.fields)
        ? event.fields.filter((field): field is string => typeof field === "string")
        : [],
      currentValues: event.currentValues,
    };
  }

  return { fields: [] as string[], currentValues: undefined };
}

function fieldMap(activeForm: Record<string, unknown> | null) {
  const fields = Array.isArray(activeForm?.fields) ? activeForm.fields : [];
  return new Map(
    fields
      .filter(isRecord)
      .filter((field): field is Record<string, unknown> & { name: string } =>
        typeof field.name === "string",
      )
      .map((field) => [field.name, field]),
  );
}

function formatDateValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatDisplayDate(value: Date) {
  const day = String(value.getDate()).padStart(2, "0");
  const month = String(value.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${value.getFullYear()}`;
}

function renderFieldValue(field: Record<string, unknown> | undefined, value: unknown) {
  if (value === undefined || value === null || value === "") return "Not set";
  const option = Array.isArray(field?.options)
    ? field.options.find((entry) => {
        if (!isRecord(entry)) return false;
        return String(entry.value) === String(value);
      })
    : null;
  if (isRecord(option) && typeof option.label === "string") {
    return `${option.label} (${renderValue(value)})`;
  }
  if (field?.type === "date" && typeof value === "string") return formatDateValue(value);
  return renderValue(value);
}

function expandFieldNames(
  names: string[],
  activeForm: Record<string, unknown> | null,
  currentValues: unknown,
) {
  const fieldsByName = fieldMap(activeForm);
  const knownNames = Array.from(fieldsByName.keys());
  const expanded: string[] = [];

  for (const name of names) {
    if (fieldsByName.has(name) && !Array.isArray(getNestedValue(currentValues, name))) {
      expanded.push(name);
      continue;
    }

    const childNames = knownNames.filter((fieldName) => fieldName.startsWith(`${name}.`));
    if (childNames.length) {
      expanded.push(...childNames);
      continue;
    }

    const value = getNestedValue(currentValues, name);
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const row = value[index];
        if (!isRecord(row)) continue;
        for (const key of Object.keys(row)) {
          const itemValue = row[key];
          if (["id", "index"].includes(key)) continue;
          if (itemValue === null || ["string", "number", "boolean"].includes(typeof itemValue)) {
            expanded.push(`${name}.${index}.${key}`);
          }
        }
      }
      if (expanded.length) continue;
    }

    expanded.push(name);
  }

  return Array.from(new Set(expanded));
}

function buildChangedFields(
  activeForm: Record<string, unknown> | null,
  context: DetachedApprovalContext | null | undefined,
  formId: unknown,
): DetachedApprovalField[] {
  const edit = findLatestAssistantEdit(context, formId);
  const fieldsByName = fieldMap(activeForm);
  const fallbackValues = [
    edit.currentValues,
    isRecord(activeForm?.lastAssistantEdit)
      ? activeForm.lastAssistantEdit.currentValues
      : undefined,
    activeForm?.values,
  ];
  const names = expandFieldNames(edit.fields, activeForm, edit.currentValues);

  if (!names.length && isRecord(activeForm?.lastAssistantEdit)) {
    const lastFields = Array.isArray(activeForm.lastAssistantEdit.fields)
      ? activeForm.lastAssistantEdit.fields.filter((field): field is string => typeof field === "string")
      : [];
    names.push(...expandFieldNames(lastFields, activeForm, activeForm.lastAssistantEdit.currentValues));
  }

  const missingRequiredNames = Array.from(fieldsByName.values())
    .filter((field) => field.required === true && field.readOnly !== true)
    .map((field) => field.name)
    .filter((name) => !names.includes(name))
    .filter((name) => {
      const value = fallbackValues.reduce<unknown>((resolved, source) => {
        if (resolved !== undefined) return resolved;
        return getNestedValue(source, name);
      }, undefined);
      return value === undefined || value === null || value === "";
    });

  return Array.from(new Set([...names, ...missingRequiredNames])).slice(0, 8).map((name) => {
    const field = fieldsByName.get(name);
    const label = typeof field?.label === "string" ? field.label : titleize(name);
    const value = fallbackValues.reduce<unknown>((resolved, source) => {
      if (resolved !== undefined) return resolved;
      return getNestedValue(source, name);
    }, undefined);
    return {
      label,
      value: renderFieldValue(field, value),
      missing: value === undefined || value === null || value === "",
    };
  });
}

function intentLabel(value: unknown) {
  const normalized = String(value ?? "submit").toLowerCase();
  if (normalized === "save") return "Save form";
  if (normalized === "approve") return "Approve form";
  if (normalized === "advance") return "Advance form";
  return "Submit form";
}

function labelForArg(key: string) {
  if (key === "formId" || key === "form_id") return "Form";
  return titleize(key);
}

function renderArg(key: string, value: unknown) {
  if ((key === "formId" || key === "form_id") && typeof value === "string") {
    return humanizeToken(value);
  }
  return renderValue(value);
}

export function formatDetachedApprovalAction(name: string) {
  if (name === "request_form_submit") return "Submit active AMS form";
  return titleize(name);
}

export function summarizeDetachedApprovalArgs(
  args: Record<string, unknown>,
  limit = 5,
) {
  return Object.entries(args)
    .filter(([key]) => !HIDDEN_ARG_KEYS.has(key))
    .map(([key, value]) => `${labelForArg(key)}: ${renderArg(key, value)}`)
    .slice(0, limit);
}

export function buildDetachedApprovalReview(
  action: DetachedApprovalAction,
  options: BuildDetachedApprovalReviewOptions = {},
): DetachedApprovalReview {
  const formId = action.args.formId ?? action.args.form_id;
  const activeForm = findActiveForm(options.context, formId);
  const formTitle =
    (typeof activeForm?.title === "string" && activeForm.title.trim()) ||
    (typeof formId === "string" && humanizeToken(formId)) ||
    formatDetachedApprovalAction(action.name);
  const date = formatDisplayDate(options.now ?? new Date());
  const intent = intentLabel(action.args.intent);
  const fields = buildChangedFields(activeForm, options.context, formId);

  return {
    title: formTitle,
    eyebrow: "Assigned to agent",
    description: fields.length
      ? `Review ${fields.length} field${fields.length === 1 ? "" : "s"} the assistant filled before approving.`
      : "Review the prepared form submission before the assistant writes through AMS.",
    metadata: [
      { label: "Form", value: formTitle },
      { label: "Requested by", value: findRuntimeUser(options.context) },
      { label: "Filled by", value: "AMS Assistant" },
      { label: "Date", value: date },
      { label: "Status", value: "Ready" },
    ],
    fields: fields.length
      ? fields
      : summarizeDetachedApprovalArgs(action.args, 6).map((line) => {
          const [label, ...rest] = line.split(": ");
          return { label, value: rest.join(": "), missing: false };
        }),
    approveLabel: intent === "Save form" ? "Approve save" : "Approve",
    rejectLabel: "Reject",
  };
}
