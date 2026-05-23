"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useCopilotAction } from "@/hooks/useCopilotAction";
import {
  buildCopilotListControlActionSummary,
  resolveCopilotListFilterPatch,
  resolveCopilotListPage,
  resolveCopilotVisibleRowRoute,
  type CopilotListFilterDefinition,
} from "@/lib/copilotListControls";

type CopilotListFilterController = CopilotListFilterDefinition & {
  label?: string;
  description?: string;
  setValue: (value: unknown) => void;
};

type VisibleRow = {
  row_number?: number;
  id?: string | number;
  detail_route?: string;
  route?: string;
  href?: string;
  [key: string]: unknown;
};

export type CopilotListControlsConfig = {
  entity: string;
  enabled?: boolean;
  filters: CopilotListFilterController[];
  page: number;
  totalPages: number;
  setPage: (value: number | ((current: number) => number)) => void;
  visibleRows?: VisibleRow[];
};

function filterParameters(filters: CopilotListFilterController[]) {
  return Object.fromEntries(
    filters.map(filter => [
      filter.name,
      {
        type:
          filter.type === "multi_enum" ? "array" :
          filter.type === "boolean" ? "boolean" :
          filter.type === "number" ? "number" :
          "string",
        description: [
          filter.label ?? filter.name,
          filter.description,
          filter.options?.length
            ? `Allowed values: ${filter.options.map(option => `${option.value}${option.label ? ` (${option.label})` : ""}`).join(", ")}.`
            : null,
        ].filter(Boolean).join(" "),
      },
    ]),
  );
}

export function useCopilotListControls({
  entity,
  enabled = true,
  filters,
  page,
  totalPages,
  setPage,
  visibleRows = [],
}: CopilotListControlsConfig) {
  const router = useRouter();
  const filterDefinitions = useMemo<CopilotListFilterDefinition[]>(
    () => filters.map(({ setValue: _setValue, label: _label, description: _description, ...definition }) => definition),
    [filters],
  );

  const summary = useMemo(
    () => buildCopilotListControlActionSummary(filterDefinitions, { page, totalPages }),
    [filterDefinitions, page, totalPages],
  );

  useCopilotAction({
    name: "set_list_filters",
    description:
      `Set search/filter controls on the current ${entity} list page. ` +
      "Use this instead of SQL or DOM clicks when the user asks to search, filter, show only a status/type/stage, or narrow the current list.",
    parameters: {
      entity: { type: "string", description: `Optional entity guard. Expected "${entity}".` },
      filters: {
        type: "object",
        description: "Filter patch object. You may also pass known filters as top-level args.",
        properties: filterParameters(filters),
      },
      ...filterParameters(filters),
    },
    enabled,
    handler: (args: unknown) => {
      const result = resolveCopilotListFilterPatch(filterDefinitions, args);
      if (!result.ok) return result;
      for (const [name, value] of Object.entries(result.values)) {
        filters.find(filter => filter.name === name)?.setValue(value);
      }
      setPage(1);
      return {
        ok: true,
        entity,
        applied: result.values,
        message: `Updated ${entity} list filters.`,
      };
    },
  });

  useCopilotAction({
    name: "clear_list_filters",
    description:
      `Clear search/filter controls on the current ${entity} list page. ` +
      "Pass { filters: [names] } to clear selected filters, or no filters to reset all.",
    parameters: {
      entity: { type: "string", description: `Optional entity guard. Expected "${entity}".` },
      filters: {
        type: "array",
        description: `Optional names to clear. Available: ${filters.map(filter => filter.name).join(", ")}.`,
      },
    },
    enabled,
    handler: (args: unknown) => {
      const result = resolveCopilotListFilterPatch(filterDefinitions, args, { clear: true });
      if (!result.ok) return result;
      for (const [name, value] of Object.entries(result.values)) {
        filters.find(filter => filter.name === name)?.setValue(value);
      }
      setPage(1);
      return {
        ok: true,
        entity,
        cleared: Object.keys(result.values),
        message: `Cleared ${entity} list filters.`,
      };
    },
  });

  useCopilotAction({
    name: "go_to_list_page",
    description:
      `Move pagination on the current ${entity} list page. Args: { page?: number, direction?: "next" | "previous" | "first" | "last" }.`,
    parameters: {
      entity: { type: "string", description: `Optional entity guard. Expected "${entity}".` },
      page: { type: "number", description: "Absolute page number." },
      direction: { type: "string", description: "next, previous, first, or last." },
    },
    enabled,
    handler: (args: unknown) => {
      const result = resolveCopilotListPage(args, page, totalPages);
      if (!result.ok) return result;
      setPage(result.page);
      return {
        ok: true,
        entity,
        page: result.page,
        totalPages,
        message: `Moved ${entity} list to page ${result.page}.`,
      };
    },
  });

  useCopilotAction({
    name: "open_visible_row",
    description:
      `Open a currently visible ${entity} list row by row_number, id, or route. Use visible_rows from the live page context first.`,
    parameters: {
      entity: { type: "string", description: `Optional entity guard. Expected "${entity}".` },
      row_number: { type: "number", description: "Visible row_number from the list context." },
      id: { type: "string", description: "Visible row id." },
      route: { type: "string", description: "Explicit relative detail route." },
    },
    enabled,
    handler: (args: unknown) => {
      const result = resolveCopilotVisibleRowRoute(visibleRows, args);
      if (!result.ok) return result;
      router.push(result.route);
      return {
        ok: true,
        entity,
        route: result.route,
        row: result.row,
        message: `Opened ${entity} row.`,
      };
    },
  });

  return summary;
}
