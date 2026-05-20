import { describe, expect, it } from "vitest";
import {
  appendCopilotActivity,
  buildCopilotActivitySnapshot,
  createCopilotActivityEvent,
  previewCopilotActivityValue,
} from "./copilotActivity";

describe("copilot activity memory", () => {
  it("keeps a bounded business-event log", () => {
    const events = Array.from({ length: 5 }, (_, index) =>
      createCopilotActivityEvent({
        kind: "route_changed",
        actor: "user",
        title: `Visited page ${index}`,
        route: `/page-${index}`,
      }),
    );

    const bounded = events.reduce(
      (acc, event) => appendCopilotActivity(acc, event, 3),
      [] as typeof events,
    );

    expect(bounded).toHaveLength(3);
    expect(bounded.map(event => event.route)).toEqual([
      "/page-2",
      "/page-3",
      "/page-4",
    ]);
  });

  it("builds a compact snapshot with the latest route, user edit, and submit result", () => {
    const events = [
      createCopilotActivityEvent({
        kind: "route_changed",
        actor: "user",
        title: "Opened inspections",
        route: "/inspections",
      }),
      createCopilotActivityEvent({
        kind: "form_opened",
        actor: "user",
        title: "Opened New Inspection Certificate",
        route: "/inspections",
        formId: "inspection_create",
        formTitle: "New Inspection Certificate",
      }),
      createCopilotActivityEvent({
        kind: "form_field_changed",
        actor: "user",
        title: "Changed contractor_name",
        route: "/inspections",
        formId: "inspection_create",
        formTitle: "New Inspection Certificate",
        field: "contractor_name",
        previousValue: "ABC Supplies Ltd.",
        currentValue: "ABC Traders Ltd.",
      }),
      createCopilotActivityEvent({
        kind: "form_submit_result",
        actor: "assistant",
        title: "Submit failed",
        route: "/inspections",
        formId: "inspection_create",
        formTitle: "New Inspection Certificate",
        result: {
          ok: false,
          message: "Inspection code already exists.",
          fieldErrors: { inspection_code: "Duplicate inspection code." },
        },
      }),
    ];

    const snapshot = buildCopilotActivitySnapshot(events, {
      currentRoute: "/inspections",
      recentLimit: 3,
    });

    expect(snapshot.currentPage.pathname).toBe("/inspections");
    expect(snapshot.activeForm).toMatchObject({
      formId: "inspection_create",
      title: "New Inspection Certificate",
    });
    expect(snapshot.lastUserEdit).toMatchObject({
      field: "contractor_name",
      previousValue: "ABC Supplies Ltd.",
      currentValue: "ABC Traders Ltd.",
    });
    expect(snapshot.lastSubmitResult).toMatchObject({
      ok: false,
      message: "Inspection code already exists.",
    });
    expect(snapshot.recentActivity).toHaveLength(3);
    expect(snapshot.totalEvents).toBe(4);
  });

  it("truncates long values before exposing them to the agent", () => {
    const value = previewCopilotActivityValue("x".repeat(500), 80);

    expect(value).toHaveLength(81);
    expect(value.endsWith("…")).toBe(true);
  });
  it("keeps assistant-set field values in recent activity for approval review", () => {
    const events = [
      createCopilotActivityEvent({
        kind: "form_values_set",
        actor: "assistant",
        title: "Assistant set 3 fields in Create Category",
        formId: "category-create",
        formTitle: "Create Category",
        fields: ["name", "code", "category_type"],
        currentValues: {
          name: "Laptop",
          code: "LAPTOP",
          category_type: "FIXED_ASSET",
        },
      }),
    ];

    const snapshot = buildCopilotActivitySnapshot(events);

    expect(snapshot.recentActivity[0]).toMatchObject({
      kind: "form_values_set",
      formId: "category-create",
      fields: ["name", "code", "category_type"],
      currentValues: {
        name: "Laptop",
        code: "LAPTOP",
        category_type: "FIXED_ASSET",
      },
    });
  });
});
