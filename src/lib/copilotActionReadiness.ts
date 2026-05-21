import { getCopilotListRoutes } from "./copilotModuleManifest";

export type CopilotReadableLike = {
  id: string;
  value: unknown;
};

export type CopilotActionReadiness = {
  ready: boolean;
  requirement?: string;
  summary?: Record<string, unknown>;
};

const LISTING_ROUTES = new Set([
  ...getCopilotListRoutes(),
  "/depreciation",
  "/locations",
  "/maintenance",
  "/roles",
  "/stock-entries",
  "/stock-registers",
  "/users",
]);
const FORM_ACTIONS = new Set([
  "set_form_values",
  "focus_form_field",
  "validate_active_form",
  "request_form_submit",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizePath(path: string) {
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
}

function pathSegments(path: string) {
  return normalizePath(path).split("/").filter(Boolean);
}

function normalizeFormId(formId: string) {
  return formId.replace(/_/g, "-").toLowerCase();
}

function getStringArg(args: unknown, keys: string[]) {
  if (!isRecord(args)) return null;
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  const nested = args.args;
  if (!isRecord(nested)) return null;
  for (const key of keys) {
    const value = nested[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function getRecordArg(args: unknown, keys: string[]) {
  if (!isRecord(args)) return null;
  for (const key of keys) {
    const value = args[key];
    if (isRecord(value)) return value;
  }
  const nested = args.args;
  if (!isRecord(nested)) return null;
  for (const key of keys) {
    const value = nested[key];
    if (isRecord(value)) return value;
  }
  return null;
}

function getRuntimeRoute(readables: CopilotReadableLike[]) {
  const runtime = readables.find((readable) => {
    return readable.id === "__ams_runtime_context" && isRecord(readable.value);
  });
  if (!runtime || !isRecord(runtime.value)) return null;

  const route = runtime.value.route;
  if (typeof route === "string") return normalizePath(route);
  if (isRecord(route) && typeof route.pathname === "string") {
    return normalizePath(route.pathname);
  }
  if (typeof runtime.value.pathname === "string") {
    return normalizePath(runtime.value.pathname);
  }
  if (typeof runtime.value.path === "string") {
    return normalizePath(runtime.value.path);
  }
  return null;
}

function getListReadable(readables: CopilotReadableLike[], route?: string | null) {
  const normalizedRoute = route ? normalizePath(route) : null;
  for (const readable of readables) {
    if (!isRecord(readable.value)) continue;
    if (
      normalizedRoute &&
      typeof readable.value.route === "string" &&
      normalizePath(readable.value.route) !== normalizedRoute
    ) {
      continue;
    }
    if (Array.isArray(readable.value.visible_rows)) {
      return readable.value;
    }
  }
  return null;
}

function isListLoading(value: Record<string, unknown>) {
  return (
    value.loading === true ||
    value.is_loading === true ||
    value.isLoading === true ||
    value.ready === false ||
    value.loaded === false ||
    value.load_state === "loading" ||
    value.loading_state === "loading"
  );
}

function getDetailReadable(readables: CopilotReadableLike[], route: string) {
  const normalizedRoute = normalizePath(route);
  for (const readable of readables) {
    if (!isRecord(readable.value)) continue;
    const valueRoute = readable.value.route;
    if (typeof valueRoute !== "string" || normalizePath(valueRoute) !== normalizedRoute) {
      continue;
    }
    if (
      readable.value.page_kind === "detail" ||
      Object.prototype.hasOwnProperty.call(readable.value, "selected_record")
    ) {
      return readable.value;
    }
  }
  return null;
}

function detailEntity(detail: Record<string, unknown>) {
  return typeof detail.entity === "string" && detail.entity.trim()
    ? detail.entity.trim()
    : "detail";
}

function selectedRecordId(detail: Record<string, unknown>) {
  const selected = detail.selected_record;
  if (!isRecord(selected)) return undefined;
  const id = selected.id;
  return typeof id === "string" || typeof id === "number" ? id : undefined;
}

function isDetailSelected(detail: Record<string, unknown>) {
  return isRecord(detail.selected_record);
}

function detailNeedsActiveForm(detail: Record<string, unknown>) {
  const writableFields = detail.writable_field_names;
  if (Array.isArray(writableFields) && writableFields.length > 0) return true;

  const workflow = detail.workflow;
  if (isRecord(workflow)) {
    if (
      workflow.canEdit === true ||
      workflow.canAdvance === true ||
      workflow.canSubmit === true
    ) {
      return true;
    }
  }

  const actions = detail.actions;
  if (!isRecord(actions)) return false;
  return actions.save_progress === true || actions.submit_current_stage === true;
}

function listReadySummary(route: string | null, listReadable: Record<string, unknown>) {
  const visibleRows = listReadable.visible_rows;
  return {
    route,
    visibleRowsCount: Array.isArray(visibleRows) ? visibleRows.length : null,
  };
}

function getActiveForm(
  readables: CopilotReadableLike[],
  requestedFormId?: string | null,
) {
  const normalizedRequested = requestedFormId
    ? normalizeFormId(requestedFormId)
    : null;

  for (const readable of readables) {
    if (!isRecord(readable.value)) continue;
    const value = isRecord(readable.value.activeForm)
      ? readable.value.activeForm
      : readable.value;
    const formId = value.formId ?? value.form_id;
    if (normalizedRequested && typeof formId === "string") {
      if (normalizeFormId(formId) !== normalizedRequested) continue;
    }
    if (normalizedRequested && typeof formId !== "string") continue;
    const fields = value.fields;
    if (Array.isArray(fields) && fields.length > 0) {
      return { formId, fields };
    }
  }
  return null;
}

function getRequestedFieldNames(actionName: string, args: unknown) {
  if (actionName === "set_form_values") {
    return Object.keys(getRecordArg(args, ["values"]) ?? {});
  }
  const field = getStringArg(args, ["field"]);
  return field ? [field] : [];
}

function formReadySummary(
  actionName: string,
  activeForm: { formId: unknown; fields: unknown[] },
  args: unknown,
) {
  const fieldNames = new Set(
    activeForm.fields
      .map((field) => (isRecord(field) ? field.name : undefined))
      .filter((name): name is string => typeof name === "string" && Boolean(name)),
  );
  const requestedFields = getRequestedFieldNames(actionName, args);
  const knownRequestedFields = requestedFields.filter((field) => fieldNames.has(field));
  const unknownRequestedFields = requestedFields.filter((field) => !fieldNames.has(field));

  return {
    activeFormId: activeForm.formId,
    writableFieldsCount: activeForm.fields.length,
    ...(requestedFields.length > 0 ? { requestedFields } : {}),
    ...(knownRequestedFields.length > 0 ? { knownRequestedFields } : {}),
    ...(unknownRequestedFields.length > 0 ? { unknownRequestedFields } : {}),
  };
}

export function getCopilotActionReadiness(
  actionName: string,
  args: unknown,
  readables: CopilotReadableLike[],
): CopilotActionReadiness {
  if (actionName === "navigate_to_route") {
    const target = getStringArg(args, ["path", "route", "url", "href", "target"]);
    if (!target) return { ready: true };

    const route = getRuntimeRoute(readables);
    const normalizedTarget = normalizePath(target);
    if (route !== normalizedTarget) {
      return {
        ready: false,
        requirement: `route "${normalizedTarget}"`,
        summary: { expectedRoute: normalizedTarget, currentRoute: route },
      };
    }

    if (LISTING_ROUTES.has(normalizedTarget)) {
      const listReadable = getListReadable(readables, normalizedTarget);
      if (!listReadable) {
        return {
          ready: false,
          requirement: `route "${normalizedTarget}" with visible_rows`,
          summary: { route, visibleRowsCount: null },
        };
      }
      if (isListLoading(listReadable)) {
        return {
          ready: false,
          requirement: `route "${normalizedTarget}" with loaded visible_rows`,
          summary: { route, visibleRowsCount: null, loading: true },
        };
      }
      return {
        ready: true,
        summary: listReadySummary(route, listReadable),
      };
    }

    const detailReadable = getDetailReadable(readables, normalizedTarget);
    if (detailReadable) {
      const entity = detailEntity(detailReadable);
      if (!isDetailSelected(detailReadable)) {
        return {
          ready: false,
          requirement: `route "${normalizedTarget}" with selected ${entity} record`,
          summary: { route, detailContext: true, entity, selectedRecord: false },
        };
      }

      if (detailNeedsActiveForm(detailReadable)) {
        const activeForm = getActiveForm(readables);
        if (!activeForm) {
          return {
            ready: false,
            requirement: `route "${normalizedTarget}" with active ${entity} form`,
            summary: {
              route,
              detailContext: true,
              entity,
              selectedRecord: true,
              activeForm: false,
            },
          };
        }
        return {
          ready: true,
          summary: {
            route,
            detailContext: true,
            entity,
            selectedRecordId: selectedRecordId(detailReadable),
            activeFormId: activeForm.formId,
            writableFieldsCount: activeForm.fields.length,
          },
        };
      }

      return {
        ready: true,
        summary: {
          route,
          detailContext: true,
          entity,
          selectedRecordId: selectedRecordId(detailReadable),
        },
      };
    }

    const routeScopedListReadable = getListReadable(readables, normalizedTarget);
    if (routeScopedListReadable) {
      if (isListLoading(routeScopedListReadable)) {
        return {
          ready: false,
          requirement: `route "${normalizedTarget}" with loaded route-scoped list context`,
          summary: { route, visibleRowsCount: null, loading: true },
        };
      }
      return {
        ready: true,
        summary: listReadySummary(route, routeScopedListReadable),
      };
    }

    if (pathSegments(normalizedTarget).length >= 2) {
      return {
        ready: false,
        requirement: `route "${normalizedTarget}" with route-scoped page context`,
        summary: { route, detailContext: false, listContext: false },
      };
    }

    return { ready: true, summary: { route } };
  }

  if (actionName === "open_form") {
    const formId = getStringArg(args, ["form_id", "formId"]);
    const activeForm = getActiveForm(readables, formId);
    if (!activeForm) {
      return {
        ready: false,
        requirement: formId
          ? `active form "${formId}" with writable fields`
          : "an active form with writable fields",
      };
    }
    return {
      ready: true,
      summary: {
        activeFormId: activeForm.formId,
        writableFieldsCount: activeForm.fields.length,
      },
    };
  }

  if (actionName.startsWith("open_create_") && actionName.endsWith("_form")) {
    const activeForm = getActiveForm(readables);
    if (!activeForm) {
      return {
        ready: false,
        requirement: "an active create form with writable fields",
      };
    }
    return {
      ready: true,
      summary: {
        activeFormId: activeForm.formId,
        writableFieldsCount: activeForm.fields.length,
      },
    };
  }

  if (FORM_ACTIONS.has(actionName)) {
    const formId = getStringArg(args, ["form_id", "formId"]);
    const activeForm = getActiveForm(readables, formId);
    if (!activeForm) {
      return {
        ready: false,
        requirement: formId
          ? `active form "${formId}" with writable fields`
          : "an active form with writable fields",
      };
    }
    return {
      ready: true,
      summary: formReadySummary(actionName, activeForm, args),
    };
  }

  return { ready: true };
}

export function actionNeedsReadyPageContext(actionName: string) {
  return (
    actionName === "navigate_to_route" ||
    actionName === "open_form" ||
    FORM_ACTIONS.has(actionName) ||
    (actionName.startsWith("open_create_") && actionName.endsWith("_form"))
  );
}

export function actionNeedsReadyBeforeExecution(actionName: string) {
  return FORM_ACTIONS.has(actionName);
}
