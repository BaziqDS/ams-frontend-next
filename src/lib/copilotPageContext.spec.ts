import { describe, expect, it } from "vitest";
import {
  buildCopilotDetailContext,
  buildCopilotListContext,
  buildInspectionWorkflowContext,
  filterCopilotReadablesForRoute,
} from "./copilotPageContext";

describe("copilot page context helpers", () => {
  it("builds a standard list context with filters, pagination, and row positions", () => {
    const context = buildCopilotListContext({
      route: "/items",
      entity: "item",
      total: 10,
      filteredTotal: 2,
      filters: { search: "core", filter_key: "low" },
      pagination: { page: 1, pageSize: 15, totalPages: 1 },
      rows: [
        { id: 3, name: "Core i5", detail_route: "/items/3" },
        { id: 4, name: "Core i7", detail_route: "/items/4" },
      ],
      actions: { create: true },
    });

    expect(context).toMatchObject({
      route: "/items",
      page_kind: "list",
      entity: "item",
      total: 10,
      filtered_total: 2,
      filters: { search: "core", filter_key: "low" },
      pagination: { page: 1, page_size: 15, total_pages: 1 },
      actions: { create: true },
    });
    expect(context.visible_rows).toEqual([
      { row_number: 1, id: 3, name: "Core i5", detail_route: "/items/3" },
      { row_number: 2, id: 4, name: "Core i7", detail_route: "/items/4" },
    ]);
  });

  it("builds standard list load-state fields for readiness gates", () => {
    const context = buildCopilotListContext({
      route: "/stock-entries",
      entity: "stock_entry",
      total: 0,
      filteredTotal: 0,
      filters: {},
      pagination: { page: 1, pageSize: 15, totalPages: 1 },
      rows: [],
      loading: true,
    });

    expect(context).toMatchObject({
      loading: true,
      load_state: "loading",
    });
  });

  it("builds inspection workflow context for the current and next stage", () => {
    expect(buildInspectionWorkflowContext("CENTRAL_REGISTER")).toMatchObject({
      current_stage: "CENTRAL_REGISTER",
      current_stage_label: "Central Register",
      previous_stage: "STOCK_DETAILS",
      next_stage: "FINANCE_REVIEW",
      next_stage_label: "Finance Review",
      submit_intent: "submit",
      transition_action: "submit_to_finance_review",
    });
  });

  it("builds a detail context with selected record and workflow", () => {
    const context = buildCopilotDetailContext({
      route: "/inspections/13",
      entity: "inspection",
      selectedRecord: { id: 13, contract_no: "CTR-2026-001" },
      workflow: buildInspectionWorkflowContext("STOCK_DETAILS"),
      actions: { save: true, submit: true },
    });

    expect(context).toMatchObject({
      route: "/inspections/13",
      page_kind: "detail",
      entity: "inspection",
      selected_record: { id: 13, contract_no: "CTR-2026-001" },
      workflow: { current_stage: "STOCK_DETAILS", next_stage: "CENTRAL_REGISTER" },
      actions: { save: true, submit: true },
    });
  });

  it("filters page readables to the current route before sending context", () => {
    const readables = [
      {
        id: "__ams_runtime_context",
        description: "Runtime",
        value: { route: { pathname: "/inspections/13" } },
      },
      {
        id: "inspection-detail",
        description: "Inspection detail",
        value: { route: "/inspections/13", page_kind: "detail" },
      },
      {
        id: "locations-list",
        description: "Locations list",
        value: { route: "/locations", visible_rows: [{ id: 4, name: "NED" }] },
      },
      {
        id: "legacy-unscoped-readable",
        description: "No route",
        value: { visible_rows: [{ id: 1, name: "Stale" }] },
      },
    ];

    expect(filterCopilotReadablesForRoute(readables, "/inspections/13")).toEqual([
      readables[0],
      readables[1],
    ]);
  });
});
