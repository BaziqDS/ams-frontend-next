import { describe, expect, it } from "vitest";

import {
  buildCopilotListControlActionSummary,
  resolveCopilotListFilterPatch,
  resolveCopilotListPage,
  resolveCopilotVisibleRowRoute,
  type CopilotListFilterDefinition,
} from "./copilotListControls";

const filters: CopilotListFilterDefinition[] = [
  { name: "search", type: "string", defaultValue: "" },
  {
    name: "status",
    type: "enum",
    defaultValue: "all",
    options: [
      { value: "all", label: "All" },
      { value: "active", label: "Active" },
      { value: "inactive", label: "Inactive" },
    ],
  },
  {
    name: "low_stock",
    type: "boolean",
    defaultValue: false,
  },
  {
    name: "location",
    type: "multi_enum",
    defaultValue: [],
    options: [
      { value: "5", label: "Central Store" },
      { value: "7", label: "CSIT Main Store" },
    ],
  },
];

describe("copilot list controls", () => {
  it("normalizes a valid filter patch from nested or top-level args", () => {
    expect(
      resolveCopilotListFilterPatch(filters, {
        filters: { status: "active" },
        search: "core i5",
        low_stock: "true",
      }),
    ).toEqual({
      ok: true,
      values: {
        search: "core i5",
        status: "active",
        low_stock: true,
      },
    });
  });

  it("normalizes multi-select enum filters from labels, ids, arrays, or comma-separated text", () => {
    expect(
      resolveCopilotListFilterPatch(filters, {
        filters: { location: ["Central Store", "7"] },
      }),
    ).toEqual({
      ok: true,
      values: { location: ["5", "7"] },
    });

    expect(
      resolveCopilotListFilterPatch(filters, {
        filters: { location: "Central Store, CSIT Main Store" },
      }),
    ).toEqual({
      ok: true,
      values: { location: ["5", "7"] },
    });
  });

  it("rejects unknown filters and invalid enum values", () => {
    expect(
      resolveCopilotListFilterPatch(filters, { filters: { stage: "DRAFT" } }),
    ).toMatchObject({
      ok: false,
      message: expect.stringMatching(/Unknown list filter/i),
    });

    expect(
      resolveCopilotListFilterPatch(filters, { filters: { status: "done" } }),
    ).toMatchObject({
      ok: false,
      message: expect.stringMatching(/Invalid value/i),
    });
  });

  it("builds clear patches for all or selected filters", () => {
    expect(resolveCopilotListFilterPatch(filters, {}, { clear: true })).toEqual({
      ok: true,
      values: { search: "", status: "all", low_stock: false, location: [] },
    });

    expect(
      resolveCopilotListFilterPatch(filters, { filters: ["search"] }, { clear: true }),
    ).toEqual({
      ok: true,
      values: { search: "" },
    });
  });

  it("resolves page changes by absolute page or direction", () => {
    expect(resolveCopilotListPage({ page: 3 }, 1, 5)).toEqual({ ok: true, page: 3 });
    expect(resolveCopilotListPage({ direction: "next" }, 1, 5)).toEqual({ ok: true, page: 2 });
    expect(resolveCopilotListPage({ direction: "last" }, 1, 5)).toEqual({ ok: true, page: 5 });
    expect(resolveCopilotListPage({ page: 7 }, 1, 5)).toMatchObject({ ok: false });
  });

  it("resolves a visible row route by row number or id", () => {
    const rows = [
      { row_number: 1, id: 10, detail_route: "/items/10" },
      { row_number: 2, id: 11, detail_route: "/items/11" },
    ];

    expect(resolveCopilotVisibleRowRoute(rows, { row_number: 2 })).toEqual({
      ok: true,
      route: "/items/11",
      row: rows[1],
    });
    expect(resolveCopilotVisibleRowRoute(rows, { id: 10 })).toEqual({
      ok: true,
      route: "/items/10",
      row: rows[0],
    });
  });

  it("summarizes available list-control actions for page context", () => {
    expect(buildCopilotListControlActionSummary(filters, { page: 1, totalPages: 2 })).toEqual({
      set_list_filters: true,
      clear_list_filters: true,
      go_to_list_page: true,
      open_visible_row: true,
      available_filters: ["search", "status", "low_stock", "location"],
      pagination: { page: 1, total_pages: 2 },
    });
  });
});
