import { describe, expect, it } from "vitest";
import {
  actionNeedsReadyBeforeExecution,
  actionNeedsReadyPageContext,
  buildCopilotInterruptionActionResult,
  getCopilotActionReadiness,
  type CopilotReadableLike,
} from "./copilotActionReadiness";

function runtime(pathname: string): CopilotReadableLike {
  return {
    id: "__ams_runtime_context",
    value: { route: { pathname } },
  };
}

describe("copilot action readiness", () => {
  it("requires visible rows before list navigation is ready", () => {
    expect(
      getCopilotActionReadiness("navigate_to_route", { path: "/inspections" }, [
        runtime("/inspections"),
      ]),
    ).toMatchObject({
      ready: false,
      requirement: 'route "/inspections" with visible_rows',
    });

    expect(
      getCopilotActionReadiness("navigate_to_route", { path: "/inspections" }, [
        runtime("/inspections"),
        {
          id: "inspection-list",
          value: {
            route: "/inspections",
            visible_rows: [{ id: 13, detail_route: "/inspections/13" }],
          },
        },
      ]),
    ).toMatchObject({
      ready: true,
      summary: { route: "/inspections", visibleRowsCount: 1 },
    });
  });

  it("does not treat an empty loading list as ready", () => {
    expect(
      getCopilotActionReadiness("navigate_to_route", { path: "/inspections" }, [
        runtime("/inspections"),
        {
          id: "inspection-list",
          value: {
            route: "/inspections",
            page_kind: "list",
            loading: true,
            visible_rows: [],
          },
        },
      ]),
    ).toMatchObject({
      ready: false,
      requirement: 'route "/inspections" with loaded visible_rows',
    });
  });

  it("treats non-workflow inspection detail navigation as ready once detail context is present", () => {
    expect(
      getCopilotActionReadiness(
        "navigate_to_route",
        { path: "/inspections/13" },
        [
          runtime("/inspections/13"),
          {
            id: "inspection-detail",
            value: {
              route: "/inspections/13",
              page_kind: "detail",
              selected_record: { id: 13 },
              workflow: { canAdvance: false, canEdit: false },
            },
          },
        ],
      ),
    ).toMatchObject({
      ready: true,
      summary: { route: "/inspections/13", detailContext: true },
    });
  });

  it("requires inspection detail context before detail navigation is ready", () => {
    expect(
      getCopilotActionReadiness(
        "navigate_to_route",
        { path: "/inspections/13" },
        [runtime("/inspections/13")],
      ),
    ).toMatchObject({
      ready: false,
      requirement: 'route "/inspections/13" with route-scoped page context',
    });
  });

  it("does not treat empty detail context as ready", () => {
    expect(
      getCopilotActionReadiness(
        "navigate_to_route",
        { path: "/inspections/13" },
        [
          runtime("/inspections/13"),
          {
            id: "inspection-detail",
            value: {
              route: "/inspections/13",
              page_kind: "detail",
              entity: "inspection",
              selected_record: null,
              writable_field_names: [],
            },
          },
        ],
      ),
    ).toMatchObject({
      ready: false,
      requirement: 'route "/inspections/13" with selected inspection record',
    });
  });

  it("requires active workflow form when inspection detail can advance", () => {
    expect(
      getCopilotActionReadiness(
        "navigate_to_route",
        { path: "/inspections/13" },
        [
          runtime("/inspections/13"),
          {
            id: "inspection-detail",
            value: {
              route: "/inspections/13",
              page_kind: "detail",
              entity: "inspection",
              selected_record: { id: 13 },
              workflow: { canAdvance: true },
            },
          },
        ],
      ),
    ).toMatchObject({
      ready: false,
      requirement: 'route "/inspections/13" with active inspection form',
    });

    expect(
      getCopilotActionReadiness(
        "navigate_to_route",
        { path: "/inspections/13" },
        [
          runtime("/inspections/13"),
          {
            id: "inspection-detail",
            value: {
              route: "/inspections/13",
              page_kind: "detail",
              entity: "inspection",
              selected_record: { id: 13 },
              workflow: { canAdvance: true },
            },
          },
          {
            id: "inspection-form",
            value: {
              route: "/inspections/13",
              activeForm: {
                formId: "inspection_detail_13_central_register",
                fields: [{ name: "items.0.item" }],
              },
            },
          },
        ],
      ),
    ).toMatchObject({
      ready: true,
      summary: {
        route: "/inspections/13",
        detailContext: true,
        activeFormId: "inspection_detail_13_central_register",
      },
    });
  });

  it("uses the same selected-record readiness for category and item detail pages", () => {
    expect(
      getCopilotActionReadiness(
        "navigate_to_route",
        { path: "/categories/4" },
        [
          runtime("/categories/4"),
          {
            id: "category-detail",
            value: {
              route: "/categories/4",
              page_kind: "detail",
              entity: "category",
              selected_record: null,
            },
          },
          {
            id: "category-children",
            value: {
              route: "/categories/4",
              page_kind: "list",
              visible_rows: [],
              loading: false,
            },
          },
        ],
      ),
    ).toMatchObject({
      ready: false,
      requirement: 'route "/categories/4" with selected category record',
    });

    expect(
      getCopilotActionReadiness(
        "navigate_to_route",
        { path: "/items/3" },
        [
          runtime("/items/3"),
          {
            id: "item-detail",
            value: {
              route: "/items/3",
              page_kind: "detail",
              entity: "item",
              selected_record: { id: 3, name: "Core i7" },
            },
          },
        ],
      ),
    ).toMatchObject({
      ready: true,
      summary: {
        route: "/items/3",
        detailContext: true,
        entity: "item",
      },
    });
  });

  it("allows route-scoped child-list pages while requiring context for unknown detail routes", () => {
    expect(
      getCopilotActionReadiness(
        "navigate_to_route",
        { path: "/locations/4" },
        [
          runtime("/locations/4"),
          {
            id: "location-children",
            value: {
              route: "/locations/4",
              page_kind: "list",
              visible_rows: [{ id: 8, name: "Child store" }],
              loading: false,
            },
          },
        ],
      ),
    ).toMatchObject({
      ready: true,
      summary: { route: "/locations/4", visibleRowsCount: 1 },
    });

    expect(
      getCopilotActionReadiness(
        "navigate_to_route",
        { path: "/stock-entries/7" },
        [runtime("/stock-entries/7")],
      ),
    ).toMatchObject({
      ready: false,
      requirement: 'route "/stock-entries/7" with route-scoped page context',
    });
  });

  it("matches open_form ids across snake and kebab case", () => {
    expect(
      getCopilotActionReadiness("open_form", { form_id: "category_create" }, [
        runtime("/categories"),
        {
          id: "category-form",
          value: {
            formId: "category-create",
            fields: [{ name: "name" }],
          },
        },
      ]),
    ).toMatchObject({
      ready: true,
      summary: { activeFormId: "category-create", writableFieldsCount: 1 },
    });
  });

  it("waits after open_form until the active form can accept set_form_values", () => {
    expect(
      getCopilotActionReadiness("open_form", { form_id: "stock_entry_create" }, [
        runtime("/stock-entries"),
        {
          id: "stock-entry-form",
          value: {
            route: "/stock-entries",
            activeForm: {
              formId: "stock-entry-create",
              fields: [{ name: "entry_type" }],
              allowedActions: { set_form_values: false },
            },
          },
        },
      ]),
    ).toMatchObject({
      ready: false,
      requirement: 'active form "stock_entry_create" with set_form_values enabled',
    });

    expect(
      getCopilotActionReadiness("open_form", { form_id: "stock_entry_create" }, [
        runtime("/stock-entries"),
        {
          id: "stock-entry-form",
          value: {
            route: "/stock-entries",
            activeForm: {
              formId: "stock-entry-create",
              fields: [{ name: "entry_type" }],
              allowedActions: { set_form_values: true },
            },
          },
        },
      ]),
    ).toMatchObject({
      ready: true,
      summary: { activeFormId: "stock-entry-create", writableFieldsCount: 1 },
    });
  });

  it("requires an active form schema before form tools can run", () => {
    expect(
      getCopilotActionReadiness("set_form_values", { values: { name: "Laptop" } }, [
        runtime("/items"),
      ]),
    ).toMatchObject({
      ready: false,
      requirement: "an active form with writable fields",
    });

    expect(
      getCopilotActionReadiness("set_form_values", { formId: "item-create", values: { name: "Laptop" } }, [
        runtime("/items"),
        {
          id: "item-form",
          value: {
            route: "/items",
            activeForm: {
              formId: "item-create",
              fields: [],
            },
          },
        },
      ]),
    ).toMatchObject({
      ready: false,
      requirement: 'active form "item-create" with writable fields',
    });

    expect(
      getCopilotActionReadiness("set_form_values", { formId: "item-create", values: { name: "Laptop" } }, [
        runtime("/items"),
        {
          id: "item-form",
          value: {
            route: "/items",
            activeForm: {
              formId: "item-create",
              fields: [{ name: "name" }],
            },
          },
        },
      ]),
    ).toMatchObject({
      ready: true,
      summary: {
        activeFormId: "item-create",
        writableFieldsCount: 1,
        requestedFields: ["name"],
      },
    });
  });

  it("reports a user interruption when a requested form was closed", () => {
    expect(
      getCopilotActionReadiness(
        "set_form_values",
        { formId: "stock-entry-create", values: { entry_type: "ISSUE" } },
        [
          runtime("/stock-entries"),
          {
            id: "__ams_activity_context",
            value: {
              lastClosedForm: {
                formId: "stock-entry-create",
                title: "Create Stock Entry",
                route: "/stock-entries",
                closedAt: "2026-05-22T00:00:00.000Z",
              },
            },
          },
        ],
      ),
    ).toMatchObject({
      ready: false,
      interruption: {
        type: "user_closed_form",
        formId: "stock-entry-create",
        formTitle: "Create Stock Entry",
      },
    });
  });

  it("can ignore closed-form interruptions that happened before the current wait started", () => {
    const readiness = getCopilotActionReadiness(
      "open_form",
      { form_id: "stock-entry-create" },
      [
        runtime("/stock-entries"),
        {
          id: "__ams_activity_context",
          value: {
            lastClosedForm: {
              formId: "stock-entry-create",
              title: "Create Stock Entry",
              route: "/stock-entries",
              closedAt: "2026-05-22T00:00:00.000Z",
            },
          },
        },
      ],
    );

    expect(buildCopilotInterruptionActionResult(readiness, null, {
      occurredAfter: "2026-05-22T00:00:01.000Z",
    })).toBeNull();
    expect(buildCopilotInterruptionActionResult(readiness, null, {
      occurredAfter: "2026-05-21T23:59:59.000Z",
    })).toMatchObject({
      ok: false,
      errorType: "user_interrupted",
    });
  });

  it("lets loaded forms report real unknown-field errors instead of waiting forever", () => {
    expect(
      getCopilotActionReadiness("set_form_values", { formId: "category-create", values: { typo_name: "Spare" } }, [
        runtime("/categories"),
        {
          id: "category-form",
          value: {
            route: "/categories",
            activeForm: {
              formId: "category-create",
              fields: [{ name: "name" }],
            },
          },
        },
      ]),
    ).toMatchObject({
      ready: true,
      summary: {
        activeFormId: "category-create",
        writableFieldsCount: 1,
        unknownRequestedFields: ["typo_name"],
      },
    });
  });

  it("gates focus, validation, and submit actions on the same active form schema", () => {
    for (const actionName of [
      "focus_form_field",
      "validate_active_form",
      "request_form_submit",
    ]) {
      expect(
        getCopilotActionReadiness(actionName, { formId: "inspection_detail_7_central_register" }, [
          runtime("/inspections/7"),
        ]),
      ).toMatchObject({
        ready: false,
        requirement: 'active form "inspection_detail_7_central_register" with writable fields',
      });
    }
  });

  it("recognizes active forms nested inside route-scoped readable values", () => {
    expect(
      getCopilotActionReadiness("open_form", { form_id: "category_create" }, [
        runtime("/categories"),
        {
          id: "category-form-runtime",
          value: {
            route: "/categories",
            activeForm: {
              formId: "category-create",
              fields: [{ name: "name" }],
            },
          },
        },
      ]),
    ).toMatchObject({
      ready: true,
      summary: { activeFormId: "category-create", writableFieldsCount: 1 },
    });
  });

  it("only gates page-changing and form-opening actions", () => {
    expect(actionNeedsReadyPageContext("set_form_values")).toBe(true);
    expect(actionNeedsReadyPageContext("request_form_submit")).toBe(true);
    expect(actionNeedsReadyPageContext("validate_active_form")).toBe(true);
    expect(actionNeedsReadyPageContext("focus_form_field")).toBe(true);
    expect(actionNeedsReadyPageContext("navigate_to_route")).toBe(true);
    expect(actionNeedsReadyPageContext("open_form")).toBe(true);
    expect(actionNeedsReadyPageContext("open_create_category_form")).toBe(true);
  });

  it("only blocks form tools before execution; navigation and open-form actions wait after they run", () => {
    expect(actionNeedsReadyBeforeExecution("set_form_values")).toBe(true);
    expect(actionNeedsReadyBeforeExecution("request_form_submit")).toBe(true);
    expect(actionNeedsReadyBeforeExecution("validate_active_form")).toBe(true);
    expect(actionNeedsReadyBeforeExecution("focus_form_field")).toBe(true);

    expect(actionNeedsReadyBeforeExecution("navigate_to_route")).toBe(false);
    expect(actionNeedsReadyBeforeExecution("open_form")).toBe(false);
    expect(actionNeedsReadyBeforeExecution("open_create_category_form")).toBe(false);
    expect(actionNeedsReadyBeforeExecution("open_create_inspection_catalog_item_form")).toBe(false);
    expect(actionNeedsReadyPageContext("open_create_inspection_catalog_item_form")).toBe(true);
  });
});
