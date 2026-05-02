import { describe, expect, it } from "vitest";
import { ADMIN_PERMISSIONS, PROTECTED_ADMIN_ROUTES } from "./adminPermissions";

describe("admin permissions items module", () => {
  it("protects the items route with the domain view permission", () => {
    expect(ADMIN_PERMISSIONS.items.view).toBe("inventory.view_items");
    expect(PROTECTED_ADMIN_ROUTES["/items"]).toBe("inventory.view_items");
  });

  it("protects the stock-registers route with the domain view permission", () => {
    expect(ADMIN_PERMISSIONS.stockRegisters.view).toBe("inventory.view_stock_registers");
    expect(PROTECTED_ADMIN_ROUTES["/stock-registers"]).toBe("inventory.view_stock_registers");
  });

  it("protects the reports route with the domain view permission", () => {
    expect(ADMIN_PERMISSIONS.reports.view).toBe("inventory.view_reports");
    expect(PROTECTED_ADMIN_ROUTES["/reports"]).toBe("inventory.view_reports");
  });
});
