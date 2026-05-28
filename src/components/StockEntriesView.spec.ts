import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("StockEntriesView source-store references", () => {
  const source = readFileSync("src/components/StockEntriesView.tsx", "utf8");

  it("passes backend scoped stores into the create modal", () => {
    expect(source).toContain("scopeStores={scopeStores}");
    expect(source).toContain("getSelectableStockEntryStores");
  });

  it("loads all paginated locations for stock-entry dropdowns", () => {
    expect(source).toContain('fetchAllPages<LocationRecord>("/api/inventory/locations/?page_size=500")');
  });

  it("auto-selects a single source register so it is visible without searching", () => {
    expect(source).toContain("resolveStockEntrySourceRegisterValue");
    expect(source).toContain("sourceRegisterOptions");
    expect(source).toContain("stock_register: nextStockRegister");
  });
});
