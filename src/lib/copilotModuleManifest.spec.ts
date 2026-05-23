import { describe, expect, it } from "vitest";
import {
  COPILOT_MODULE_MANIFEST,
  getCopilotListRoutes,
  getCopilotOpenFormContract,
  getCopilotOpenFormIds,
  routeMatchesCopilotPattern,
} from "./copilotModuleManifest";

describe("copilot module manifest", () => {
  it("declares the first production modules as reusable contracts", () => {
    expect(COPILOT_MODULE_MANIFEST.map((module) => module.id)).toEqual([
      "inspections",
      "locations",
      "categories",
      "items",
      "stock-entries",
      "stock-registers",
    ]);
    expect(getCopilotListRoutes()).toEqual([
      "/inspections",
      "/locations",
      "/categories",
      "/items",
      "/stock-entries",
      "/stock-registers",
    ]);
  });

  it("keeps cross-page create forms in one registry", () => {
    expect(getCopilotOpenFormIds()).toEqual([
      "inspection_create",
      "location_create",
      "sublocation_create",
      "category_create",
      "subcategory_create",
      "item_create",
      "stock_entry_create",
      "stock_register_create",
    ]);
    expect(getCopilotOpenFormContract("location_create")).toMatchObject({
      formId: "location_create",
      route: "/locations",
      capability: { module: "locations", level: "manage" },
    });
    expect(getCopilotOpenFormContract("item_create")).toMatchObject({
      formId: "item_create",
      route: "/items",
      capability: { module: "items", level: "manage" },
    });
    expect(getCopilotOpenFormContract("stock_entry_create")).toMatchObject({
      formId: "stock_entry_create",
      route: "/stock-entries",
      capability: { module: "stock-entries", level: "manage" },
    });
    expect(getCopilotOpenFormContract("stock_register_create")).toMatchObject({
      formId: "stock_register_create",
      route: "/stock-registers",
      capability: { module: "stock-registers", level: "manage" },
    });
    expect(getCopilotOpenFormContract("stock-register-create")).toMatchObject({
      formId: "stock_register_create",
    });
  });

  it("marks scoped forms as same-page contracts", () => {
    const subcategory = getCopilotOpenFormContract("subcategory_create");

    expect(subcategory).toMatchObject({
      formId: "subcategory_create",
      routePattern: "/categories/:id",
      samePageOnly: true,
      capability: { module: "categories", level: "manage" },
    });
    expect(routeMatchesCopilotPattern("/categories/4", subcategory?.routePattern)).toBe(true);
    expect(routeMatchesCopilotPattern("/categories", subcategory?.routePattern)).toBe(false);
  });
});
