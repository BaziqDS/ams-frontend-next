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
  "/categories",
  "/depreciation",
  "/inspections",
  "/items",
  "/locations",
  "/maintenance",
  "/roles",
  "/stock-entries",
  "/stock-registers",
  "/users",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizePath(path: string) {
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path;
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

function getVisibleRows(readables: CopilotReadableLike[], route?: string | null) {
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
      return readable.value.visible_rows;
    }
  }
  return null;
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
    const formId = readable.value.formId ?? readable.value.form_id;
    if (normalizedRequested && typeof formId === "string") {
      if (normalizeFormId(formId) !== normalizedRequested) continue;
    }
    if (normalizedRequested && typeof formId !== "string") continue;
    const fields = readable.value.fields;
    if (Array.isArray(fields) && fields.length > 0) {
      return { formId, fields };
    }
  }
  return null;
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
      const visibleRows = getVisibleRows(readables, normalizedTarget);
      if (!visibleRows) {
        return {
          ready: false,
          requirement: `route "${normalizedTarget}" with visible_rows`,
          summary: { route, visibleRowsCount: null },
        };
      }
      return {
        ready: true,
        summary: { route, visibleRowsCount: visibleRows.length },
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

  return { ready: true };
}

export function actionNeedsReadyPageContext(actionName: string) {
  return (
    actionName === "navigate_to_route" ||
    actionName === "open_form" ||
    (actionName.startsWith("open_create_") && actionName.endsWith("_form"))
  );
}
