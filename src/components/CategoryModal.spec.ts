import { describe, expect, it } from "vitest";

import { buildCategoryCopilotValuePatch } from "./CategoryModal";

describe("buildCategoryCopilotValuePatch", () => {
  it("normalizes copilot category form values into a safe form patch", () => {
    expect(
      buildCategoryCopilotValuePatch({
        name: "Hardware",
        code: "hw",
        parent_category: 3,
        category_type: "fixed_asset",
        tracking_type: "individual",
        is_active: false,
        notes: "Managed by IT",
        unknown: "ignored",
      }),
    ).toEqual({
      name: "Hardware",
      code: "HW",
      parent_category: "3",
      category_type: "FIXED_ASSET",
      tracking_type: "INDIVIDUAL",
      is_active: false,
      notes: "Managed by IT",
    });
  });
});
