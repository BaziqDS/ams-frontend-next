import { describe, expect, it } from "vitest";
import {
  actionNeedsReadyPageContext,
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

  it("treats detail route navigation as ready once the runtime route matches", () => {
    expect(
      getCopilotActionReadiness(
        "navigate_to_route",
        { path: "/inspections/13" },
        [runtime("/inspections/13")],
      ),
    ).toMatchObject({
      ready: true,
      summary: { route: "/inspections/13" },
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
    expect(actionNeedsReadyPageContext("set_form_values")).toBe(false);
    expect(actionNeedsReadyPageContext("navigate_to_route")).toBe(true);
    expect(actionNeedsReadyPageContext("open_form")).toBe(true);
    expect(actionNeedsReadyPageContext("open_create_category_form")).toBe(true);
  });
});
