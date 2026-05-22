import { describe, expect, it } from "vitest";
import { buildCopilotAppMap } from "./copilotAppMap";

describe("buildCopilotAppMap", () => {
  it("builds a stable module, route, and form catalog from the manifest", () => {
    const map = buildCopilotAppMap({
      currentRoute: "/stock-entries",
      observedAt: "2026-05-22T00:00:00.000Z",
      canAccess: () => true,
    });

    expect(map).toMatchObject({
      schemaVersion: 1,
      observedAt: "2026-05-22T00:00:00.000Z",
      currentRoute: "/stock-entries",
      navigation: {
        routeAction: "navigate_to_route",
        openFormAction: "open_form",
      },
    });
    expect(map.supportedListRoutes).toContain("/locations");
    expect(map.supportedOpenFormIds).toContain("stock_entry_create");
    expect(map.modules.find(module => module.id === "stock-entries")).toMatchObject({
      id: "stock-entries",
      label: "Stock Entries",
      listRoute: "/stock-entries",
      createForms: [
        {
          formId: "stock_entry_create",
          openActionName: "open_create_stock_entry_form",
          openVia: "open_form",
          available: true,
        },
      ],
    });
  });

  it("marks scoped forms as current-route eligible only on matching detail routes", () => {
    const onDetail = buildCopilotAppMap({
      currentRoute: "/categories/4",
      canAccess: () => true,
    });
    const onList = buildCopilotAppMap({
      currentRoute: "/categories",
      canAccess: () => true,
    });

    expect(onDetail.forms.find(form => form.formId === "subcategory_create")).toMatchObject({
      samePageOnly: true,
      routePattern: "/categories/:id",
      currentRouteEligible: true,
    });
    expect(onList.forms.find(form => form.formId === "subcategory_create")).toMatchObject({
      samePageOnly: true,
      routePattern: "/categories/:id",
      currentRouteEligible: false,
    });
  });

  it("keeps unavailable forms visible with capability reasons", () => {
    const map = buildCopilotAppMap({
      currentRoute: "/stock-registers",
      canAccess: (capability) => capability.module !== "stock-registers",
    });

    expect(map.forms.find(form => form.formId === "stock_register_create")).toMatchObject({
      available: false,
      blockedReason: "Requires capability stock-registers:manage.",
      requiredCapabilities: [{ module: "stock-registers", level: "manage" }],
    });
  });
});
