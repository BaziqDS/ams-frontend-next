import { describe, expect, it } from "vitest";
import {
  COPILOT_NAVIGATE_TO_ROUTE_DESCRIPTION,
  COPILOT_OPEN_FORM_DESCRIPTION,
  COPILOT_OPEN_FORM_ID_PARAMETER_DESCRIPTION,
} from "./copilotActionCopy";

const HARDCODED_APP_KNOWLEDGE = [
  /\/inspections/,
  /\/locations/,
  /\/categories/,
  /\/items/,
  /\/stock-entries/,
  /\/stock-registers/,
  /inspection_create/,
  /location_create/,
  /category_create/,
  /subcategory_create/,
  /item_create/,
  /stock_entry_create/,
  /stock_register_create/,
];

describe("copilot action copy", () => {
  it("keeps route and form discovery in get_app_map instead of hardcoded action prompt text", () => {
    const copy = [
      COPILOT_NAVIGATE_TO_ROUTE_DESCRIPTION,
      COPILOT_OPEN_FORM_DESCRIPTION,
      COPILOT_OPEN_FORM_ID_PARAMETER_DESCRIPTION,
    ].join("\n");

    expect(copy).toContain("get_app_map");
    for (const hardcoded of HARDCODED_APP_KNOWLEDGE) {
      expect(copy).not.toMatch(hardcoded);
    }
  });
});
