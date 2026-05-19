import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("ItemInstanceDetailView source structure", () => {
  const source = readFileSync("src/components/item-instance/ItemInstanceDetailView.tsx", "utf8");

  it("uses the instance identifier as the page title and item context as subtitle only", () => {
    expect(source).toContain("<h1 className={styles.pageTitle}>{primaryIdentifier}</h1>");
    expect(source).toContain("itemContext");
    expect(source).not.toContain("<h1 className={styles.pageTitle}>{title}</h1>");
    expect(source).not.toContain("heroSerial");
  });

  it("exposes high-value instance panels without duplicating the identifier", () => {
    [
      "Current Location",
      "Custodian",
      "Authority Store",
      "Net Book Value",
      "Custody & Placement",
      "Movement Timeline",
      "Lifecycle & Finance",
      "QR Label Preview",
      "Record Integrity",
      "Related Work",
    ].forEach(text => expect(source).toContain(text));
  });

  it("uses backend maintenance plans, work orders, and meter readings for related work", () => {
    expect(source).toContain("/api/inventory/maintenance/plans/?instance=");
    expect(source).toContain("/api/inventory/maintenance/work-orders/?instance=");
    expect(source).toContain("/api/inventory/maintenance/meter-readings/?instance=");
  });
});
