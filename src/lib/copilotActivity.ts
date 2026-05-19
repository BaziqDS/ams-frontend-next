export type CopilotActivityActor = "user" | "assistant" | "system";

export type CopilotActivityKind =
  | "route_changed"
  | "form_opened"
  | "form_closed"
  | "form_field_changed"
  | "form_values_set"
  | "form_validated"
  | "form_submit_requested"
  | "form_submit_result"
  | "frontend_action_requested"
  | "frontend_action_result"
  | "frontend_action_denied"
  | "frontend_action_failed";

export type CopilotActivityEventInput = {
  kind: CopilotActivityKind;
  actor: CopilotActivityActor;
  title: string;
  route?: string;
  formId?: string;
  formTitle?: string;
  field?: string;
  fields?: string[];
  previousValue?: unknown;
  currentValue?: unknown;
  previousValues?: Record<string, unknown>;
  currentValues?: Record<string, unknown>;
  result?: unknown;
  details?: Record<string, unknown>;
};

export type CopilotActivityEvent = CopilotActivityEventInput & {
  id: string;
  at: string;
};

export type CopilotActivitySnapshot = {
  currentPage: {
    pathname: string | null;
    observedAt: string | null;
  };
  activeForm: {
    formId: string;
    title?: string;
    route?: string;
    openedAt: string;
  } | null;
  lastUserEdit: {
    formId?: string;
    formTitle?: string;
    field?: string;
    fields: string[];
    previousValue?: unknown;
    currentValue?: unknown;
    previousValues?: Record<string, unknown>;
    currentValues?: Record<string, unknown>;
    at: string;
  } | null;
  lastSubmitResult: {
    formId?: string;
    formTitle?: string;
    ok?: boolean;
    message?: string;
    result: unknown;
    at: string;
  } | null;
  recentActivity: Array<{
    at: string;
    actor: CopilotActivityActor;
    kind: CopilotActivityKind;
    title: string;
    route?: string;
    formId?: string;
    field?: string;
    fields?: string[];
    result?: unknown;
  }>;
  totalEvents: number;
};

function makeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function previewCopilotActivityValue(
  value: unknown,
  maxLength = 160,
): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.length > maxLength ? `${value.slice(0, maxLength)}…` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    const preview = value.slice(0, 5).map(item =>
      previewCopilotActivityValue(item, Math.max(24, Math.floor(maxLength / 3))),
    );
    return value.length > 5 ? [...preview, `+${value.length - 5} more`] : preview;
  }
  if (isPlainObject(value)) {
    const entries = Object.entries(value).slice(0, 8).map(([key, entry]) => [
      key,
      previewCopilotActivityValue(entry, Math.max(24, Math.floor(maxLength / 3))),
    ]);
    const preview = Object.fromEntries(entries);
    const extra = Object.keys(value).length - entries.length;
    return extra > 0 ? { ...preview, _more: extra } : preview;
  }
  const text = String(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function previewRecord(value: Record<string, unknown> | undefined) {
  if (!value) return undefined;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      previewCopilotActivityValue(entry),
    ]),
  );
}

export function createCopilotActivityEvent(
  input: CopilotActivityEventInput,
): CopilotActivityEvent {
  return {
    ...input,
    previousValue: previewCopilotActivityValue(input.previousValue),
    currentValue: previewCopilotActivityValue(input.currentValue),
    previousValues: previewRecord(input.previousValues),
    currentValues: previewRecord(input.currentValues),
    result: previewCopilotActivityValue(input.result),
    details: previewRecord(input.details),
    id: makeId(),
    at: new Date().toISOString(),
  };
}

export function appendCopilotActivity(
  events: CopilotActivityEvent[],
  event: CopilotActivityEvent,
  limit = 200,
): CopilotActivityEvent[] {
  return [...events, event].slice(-limit);
}

function latestRouteEvent(events: CopilotActivityEvent[]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.route) return event;
  }
  return undefined;
}

function latestActiveForm(events: CopilotActivityEvent[]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event.formId) continue;
    if (event.kind === "form_closed") return null;
    if (
      event.kind === "form_opened" ||
      event.kind === "form_field_changed" ||
      event.kind === "form_values_set" ||
      event.kind === "form_submit_requested" ||
      event.kind === "form_submit_result"
    ) {
      return {
        formId: event.formId,
        title: event.formTitle,
        route: event.route,
        openedAt: event.at,
      };
    }
  }
  return null;
}

function latestUserEdit(events: CopilotActivityEvent[]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.kind !== "form_field_changed" || event.actor !== "user") continue;
    return {
      formId: event.formId,
      formTitle: event.formTitle,
      field: event.field,
      fields: event.fields ?? (event.field ? [event.field] : []),
      previousValue: event.previousValue,
      currentValue: event.currentValue,
      previousValues: event.previousValues,
      currentValues: event.currentValues,
      at: event.at,
    };
  }
  return null;
}

function latestSubmitResult(events: CopilotActivityEvent[]) {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.kind !== "form_submit_result") continue;
    const result = isPlainObject(event.result) ? event.result : {};
    return {
      formId: event.formId,
      formTitle: event.formTitle,
      ok: typeof result.ok === "boolean" ? result.ok : undefined,
      message: typeof result.message === "string" ? result.message : undefined,
      result: event.result,
      at: event.at,
    };
  }
  return null;
}

export function buildCopilotActivitySnapshot(
  events: CopilotActivityEvent[],
  options: {
    currentRoute?: string | null;
    recentLimit?: number;
  } = {},
): CopilotActivitySnapshot {
  const routeEvent = latestRouteEvent(events);
  const recent = events.slice(-(options.recentLimit ?? 20)).map(event => ({
    at: event.at,
    actor: event.actor,
    kind: event.kind,
    title: event.title,
    route: event.route,
    formId: event.formId,
    field: event.field,
    fields: event.fields,
    result: event.result,
  }));

  return {
    currentPage: {
      pathname: options.currentRoute ?? routeEvent?.route ?? null,
      observedAt: routeEvent?.at ?? null,
    },
    activeForm: latestActiveForm(events),
    lastUserEdit: latestUserEdit(events),
    lastSubmitResult: latestSubmitResult(events),
    recentActivity: recent,
    totalEvents: events.length,
  };
}
