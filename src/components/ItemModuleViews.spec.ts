import { describe, expect, it } from "vitest";

import {
  buildItemCategoryCopilotOption,
  buildItemCopilotValuePatch,
} from "./ItemModuleViews";

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

describe("buildItemCategoryCopilotOption", () => {
  it("includes category context so the agent can avoid mismatched subcategories", () => {
    const option = buildItemCategoryCopilotOption(
      {
        id: 7,
        name: "Processors",
        code: "CPU",
        parent_category: 2,
        parent_category_display: "Computer Hardware",
        category_type: null,
        tracking_type: null,
        resolved_category_type: "FIXED_ASSET",
        resolved_tracking_type: "INDIVIDUAL",
        is_active: true,
        notes: "Desktop and laptop CPUs",
      },
      "Computer Hardware / Processors",
    );

    expect(option).toEqual({
      label: "Processors (CPU)",
      value: "7",
      category_path: "Computer Hardware / Processors",
      parent_category: 2,
      parent_category_display: "Computer Hardware",
      category_type: "FIXED_ASSET",
      tracking_type: "INDIVIDUAL",
      notes: "Desktop and laptop CPUs",
    });
  });
});
