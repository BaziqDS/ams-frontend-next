export type CopilotListFilterOption = {
  value: string | number | boolean;
  label?: string;
};

export type CopilotListFilterDefinition = {
  name: string;
  type: "string" | "enum" | "multi_enum" | "boolean" | "number";
  defaultValue: unknown;
  options?: CopilotListFilterOption[];
};

export type CopilotListControlResult<T> =
  | ({ ok: true } & T)
  | { ok: false; message: string; field?: string };

type VisibleRow = {
  row_number?: number;
  id?: string | number;
  detail_route?: string;
  route?: string;
  href?: string;
  [key: string]: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function normalizeBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  const text = stringValue(value).toLowerCase();
  if (["true", "yes", "1", "on"].includes(text)) return true;
  if (["false", "no", "0", "off"].includes(text)) return false;
  return null;
}

function normalizeFilterValue(
  definition: CopilotListFilterDefinition,
  value: unknown,
): CopilotListControlResult<{ value: unknown }> {
  if (definition.type === "string") return { ok: true, value: stringValue(value) };

  if (definition.type === "multi_enum") {
    const rawValues = Array.isArray(value)
      ? value
      : stringValue(value).split(",").map(part => part.trim()).filter(Boolean);
    const values: Array<string | number | boolean> = [];
    for (const raw of rawValues) {
      const text = stringValue(raw);
      const option = definition.options?.find(candidate =>
        String(candidate.value) === text ||
        candidate.label?.trim().toLowerCase() === text.toLowerCase()
      );
      if (!option) {
        const options = definition.options?.map(candidate => String(candidate.value)).join(", ");
        return {
          ok: false,
          field: definition.name,
          message: `Invalid value "${text}" for list filter "${definition.name}". Available values: ${options || "none"}.`,
        };
      }
      values.push(option.value);
    }
    return { ok: true, value: values };
  }

  if (definition.type === "number") {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return {
        ok: false,
        field: definition.name,
        message: `Invalid numeric value for list filter "${definition.name}".`,
      };
    }
    return { ok: true, value: numeric };
  }

  if (definition.type === "boolean") {
    const boolean = normalizeBoolean(value);
    if (boolean === null) {
      return {
        ok: false,
        field: definition.name,
        message: `Invalid boolean value for list filter "${definition.name}".`,
      };
    }
    return { ok: true, value: boolean };
  }

  const text = stringValue(value);
  const option = definition.options?.find(candidate =>
    String(candidate.value) === text ||
    candidate.label?.trim().toLowerCase() === text.toLowerCase()
  );
  if (!option) {
    const options = definition.options?.map(candidate => String(candidate.value)).join(", ");
    return {
      ok: false,
      field: definition.name,
      message: `Invalid value "${text}" for list filter "${definition.name}". Available values: ${options || "none"}.`,
    };
  }
  return { ok: true, value: option.value };
}

function getFilterPatchInput(args: unknown, clear: boolean): Record<string, unknown> {
  if (!isRecord(args)) return {};
  const nested = args.filters;
  if (clear && Array.isArray(nested)) {
    return Object.fromEntries(nested.map(name => [String(name), undefined]));
  }
  return {
    ...(isRecord(nested) ? nested : {}),
    ...Object.fromEntries(
      Object.entries(args).filter(([key]) => !["entity", "filters", "reason"].includes(key)),
    ),
  };
}

export function resolveCopilotListFilterPatch(
  definitions: CopilotListFilterDefinition[],
  args: unknown,
  options: { clear?: boolean } = {},
): CopilotListControlResult<{ values: Record<string, unknown> }> {
  const clear = options.clear === true;
  const byName = new Map(definitions.map(definition => [definition.name, definition]));
  const input = getFilterPatchInput(args, clear);

  if (clear && Object.keys(input).length === 0) {
    return {
      ok: true,
      values: Object.fromEntries(definitions.map(definition => [
        definition.name,
        definition.defaultValue,
      ])),
    };
  }

  const values: Record<string, unknown> = {};
  for (const [name, rawValue] of Object.entries(input)) {
    const definition = byName.get(name);
    if (!definition) {
      return { ok: false, field: name, message: `Unknown list filter "${name}".` };
    }
    if (clear) {
      values[name] = definition.defaultValue;
      continue;
    }
    const normalized = normalizeFilterValue(definition, rawValue);
    if (!normalized.ok) return normalized;
    values[name] = normalized.value;
  }

  if (Object.keys(values).length === 0) {
    return { ok: false, message: "No list filter values were provided." };
  }

  return { ok: true, values };
}

export function resolveCopilotListPage(
  args: unknown,
  currentPage: number,
  totalPages: number,
): CopilotListControlResult<{ page: number }> {
  if (!isRecord(args)) return { ok: false, message: "Pass a page number or direction." };
  const maxPage = Math.max(1, totalPages);

  if (args.direction) {
    const direction = stringValue(args.direction).toLowerCase();
    const page =
      direction === "next" ? currentPage + 1 :
      direction === "prev" || direction === "previous" ? currentPage - 1 :
      direction === "first" ? 1 :
      direction === "last" ? maxPage :
      Number.NaN;
    if (!Number.isFinite(page)) {
      return { ok: false, message: `Unknown page direction "${String(args.direction)}".` };
    }
    return { ok: true, page: Math.min(maxPage, Math.max(1, page)) };
  }

  const page = Number(args.page);
  if (!Number.isInteger(page) || page < 1 || page > maxPage) {
    return { ok: false, message: `Page must be between 1 and ${maxPage}.` };
  }
  return { ok: true, page };
}

export function resolveCopilotVisibleRowRoute(
  rows: VisibleRow[],
  args: unknown,
): CopilotListControlResult<{ route: string; row: VisibleRow }> {
  if (!isRecord(args)) return { ok: false, message: "Pass row_number, id, or route." };
  if (typeof args.route === "string" && args.route.startsWith("/")) {
    return { ok: true, route: args.route, row: { route: args.route } };
  }
  const row = rows.find(candidate => {
    if (args.row_number != null && Number(candidate.row_number) === Number(args.row_number)) return true;
    if (args.id != null && String(candidate.id ?? "") === String(args.id)) return true;
    return false;
  });
  if (!row) {
    return { ok: false, message: "No visible row matches the requested row_number or id." };
  }
  const route = row.detail_route ?? row.route ?? row.href;
  if (!route || !route.startsWith("/")) {
    return { ok: false, message: "The matched row does not expose a navigable route." };
  }
  return { ok: true, route, row };
}

export function buildCopilotListControlActionSummary(
  filters: CopilotListFilterDefinition[],
  pagination: { page: number; totalPages: number },
) {
  return {
    set_list_filters: true,
    clear_list_filters: true,
    go_to_list_page: true,
    open_visible_row: true,
    available_filters: filters.map(filter => filter.name),
    pagination: {
      page: pagination.page,
      total_pages: pagination.totalPages,
    },
  };
}
