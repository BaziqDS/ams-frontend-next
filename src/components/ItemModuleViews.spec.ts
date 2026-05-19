import { describe, expect, it } from "vitest";

import { buildItemCopilotValuePatch } from "./ItemModuleViews";

describe("buildItemCopilotValuePatch", () => {
  it("normalizes copilot item form values into a safe form patch", () => {
    expect(
      buildItemCopilotValuePatch({
        name: "Laptop",
        code: "lap-001",
        category: 2,
        acct_unit: "pcs",
        low_stock_threshold: 5,
        description: "Office laptop",
        specifications: "16GB RAM",
        is_active: false,
        unknown: "ignored",
      }),
    ).toEqual({
      name: "Laptop",
      code: "LAP-001",
      category: "2",
      acct_unit: "pcs",
      low_stock_threshold: "5",
      description: "Office laptop",
      specifications: "16GB RAM",
      is_active: false,
    });
  });
});
