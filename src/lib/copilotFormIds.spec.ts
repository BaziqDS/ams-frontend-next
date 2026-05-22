import { describe, expect, it } from "vitest";

import { copilotFormIdsMatch } from "./copilotFormIds";

describe("copilot form id matching", () => {
  it("treats manifest underscore ids and active hyphen ids as aliases", () => {
    expect(copilotFormIdsMatch("stock-entry-create", "stock_entry_create")).toBe(true);
    expect(copilotFormIdsMatch("stock-register-create", "stock_register_create")).toBe(true);
  });

  it("still rejects unrelated form ids", () => {
    expect(copilotFormIdsMatch("stock-entry-create", "stock_register_create")).toBe(false);
  });
});
