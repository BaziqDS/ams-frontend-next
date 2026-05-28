import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildStandaloneDistributionRows,
  buildSubDistributionRows,
  normalizeDistributionTotal,
  type DistributionPanelRow,
} from "./ItemDetailDossier";
import type { ItemDistributionUnit } from "@/lib/itemUi";

const baseRow = (overrides: Partial<DistributionPanelRow>): DistributionPanelRow => ({
  id: "row-1",
  name: "Main",
  allocated: 0,
  available: 0,
  inTransit: 0,
  total: 0,
  ...overrides,
});

describe("ItemDetailDossier distribution helpers", () => {
  it("keeps in-transit quantities separate from allocated and available totals", () => {
    expect(normalizeDistributionTotal(0, 2, 3, 4)).toBe(9);
    expect(baseRow({ allocated: 2, available: 3, inTransit: 4 }).total).toBe(0);
  });

  it("builds standalone rows with in-transit quantity and no default badge", () => {
    const rows = buildStandaloneDistributionRows([
      {
        id: 10,
        name: "NED University",
        code: "NED",
        totalQuantity: 0,
        availableQuantity: 3,
        allocatedQuantity: 2,
        inTransitQuantity: 4,
        stores: [],
        allocations: [],
      } as ItemDistributionUnit,
    ]);

    expect(rows).toEqual([
      baseRow({
        id: "unit-10",
        name: "NED University",
        kind: "unit",
        allocated: 2,
        available: 3,
        inTransit: 4,
        total: 9,
        badge: undefined,
      }),
    ]);
  });

  it("aggregates store rows with in-transit quantity", () => {
    const rows = buildSubDistributionRows({
      id: 10,
      name: "Main",
      code: "MAIN",
      totalQuantity: 0,
      availableQuantity: 0,
      allocatedQuantity: 0,
      inTransitQuantity: 0,
      allocations: [],
      stores: [
        {
          id: 1,
          locationId: 7,
          locationName: "Computer Lab",
          quantity: 0,
          availableQuantity: 3,
          allocatedTotal: 2,
          inTransitQuantity: 4,
        },
      ],
    } as ItemDistributionUnit);

    expect(rows).toEqual([
      baseRow({
        id: "store-7",
        name: "Computer Lab",
        kind: "store",
        allocated: 2,
        available: 3,
        inTransit: 4,
        total: 9,
      }),
    ]);
  });

  it("keeps employee and non-store allocation rows even when store rows exist", () => {
    const rows = buildSubDistributionRows({
      id: 10,
      name: "CSIT",
      code: "CSIT",
      totalQuantity: 15,
      availableQuantity: 9,
      allocatedQuantity: 6,
      inTransitQuantity: 0,
      stores: [
        {
          id: 1,
          locationId: 7,
          locationName: "CSIT - Main Store",
          quantity: 15,
          availableQuantity: 9,
          allocatedTotal: 6,
          inTransitQuantity: 0,
        },
      ],
      allocations: [
        {
          id: 101,
          targetName: "CSIT Lab 1",
          targetType: "LOCATION",
          targetLocationId: 20,
          sourceStoreId: 7,
          sourceStoreName: "CSIT - Main Store",
          batchNumber: null,
          batchId: null,
          quantity: 4,
          allocatedAt: null,
          stockEntryIds: [],
          locationId: 20,
        },
        {
          id: 102,
          targetName: "Dr. A. Khan",
          targetType: "PERSON",
          targetLocationId: null,
          sourceStoreId: 7,
          sourceStoreName: "CSIT - Main Store",
          batchNumber: null,
          batchId: null,
          quantity: 2,
          allocatedAt: null,
          stockEntryIds: [],
          locationId: null,
        },
      ],
    } as ItemDistributionUnit);

    expect(rows.map(row => ({ name: row.name, kind: row.kind, total: row.total, badge: row.badge }))).toEqual([
      { name: "CSIT - Main Store", kind: "store", total: 15, badge: undefined },
      { name: "CSIT Lab 1", kind: "location", total: 4, badge: "Non-store" },
      { name: "Dr. A. Khan", kind: "person", total: 2, badge: "Employee" },
    ]);
  });
});

describe("ItemDetailDossier action surface", () => {
  const source = readFileSync("src/components/ItemDetailDossier.tsx", "utf8");
  const detailStyles = readFileSync("src/components/ItemDetailDossier.module.css", "utf8");
  const distributionViewSource = readFileSync("src/components/ItemDistributionView.tsx", "utf8");
  const itemModuleSource = readFileSync("src/components/ItemModuleViews.tsx", "utf8");
  const instancesRoute = readFileSync("src/app/(dashboard)/items/[id]/instances/page.tsx", "utf8");
  const batchesRoute = readFileSync("src/app/(dashboard)/items/[id]/batches/page.tsx", "utf8");

  it("does not show stock/request/print quick actions or the removed accordion rows", () => {
    expect(source).not.toContain("Add Stock");
    expect(source).not.toContain("Transfer Stock");
    expect(source).not.toContain("New Request");
    expect(source).not.toContain("Print Label");
    expect(source).not.toContain("<AccordionRow");
  });

  it("keeps one tracking-aware quick action for batches or instances", () => {
    expect(source).toContain("View instances");
    expect(source).toContain("View batches");
  });

  it("embeds the distribution content on the item detail page instead of linking away", () => {
    expect(source).toContain("<ItemDistributionPanel");
    expect(source).not.toContain("View Distribution");
    expect(source).not.toContain("/items/${item.id}/distribution");
  });

  it("uses distribution stats at the top and removes the record-details side card", () => {
    expect(source).toContain("<ItemDistributionStats");
    expect(source).not.toContain("<ItemStatCard");
    expect(source).not.toContain("Record Details");
    expect(source).not.toContain("styles.recordList");
  });

  it("keeps the embedded distribution stack compact below the item header", () => {
    expect(source).toContain("styles.detailHead");
    expect(detailStyles).toContain(".detailHead.detailHead");
    expect(detailStyles).toContain(".detailDistributionStats {\n  margin-top: 0;");
    expect(detailStyles).toContain(".embeddedDistribution {\n  gap: 12px;");
  });

  it("does not render or fetch the recent transactions panel on the item detail page", () => {
    expect(source).not.toContain("Recent Transactions");
    expect(source).not.toContain("View all transactions");
    expect(source).not.toContain("/api/inventory/stock-entries/");
  });

  it("keeps distribution loading on the existing permission-scoped hook", () => {
    expect(source).toContain("useItemDistribution(itemId, selectedScopeTokens)");
    expect(distributionViewSource).toContain("useItemDistribution(itemId, selectedScopeTokens)");
  });

  it("does not show the locate action on the embedded item detail page", () => {
    expect(source).not.toMatch(/>\s*Locate\s*</);
    expect(source).not.toContain("onLocate");
  });

  it("does not ship mojibake separators in distribution row metadata", () => {
    expect(distributionViewSource).not.toContain(String.fromCharCode(0xc2));
    expect(distributionViewSource).not.toContain(String.fromCharCode(0xc3));
    expect(source).not.toContain(String.fromCharCode(0xc2));
    expect(source).not.toContain(String.fromCharCode(0xc3));
  });

  it("sends the tracking quick actions to dedicated listing pages", () => {
    expect(source).toContain("router.push(`/items/${itemId}/instances`)");
    expect(source).toContain("router.push(`/items/${itemId}/batches`)");
  });

  it("renders dedicated batch and instance listing routes instead of redirecting into item detail tabs", () => {
    expect(instancesRoute).toContain("ItemInstancesView");
    expect(instancesRoute).not.toContain("redirect(");
    expect(batchesRoute).toContain("ItemBatchesView");
    expect(batchesRoute).not.toContain("redirect(");
  });

  it("exposes batch-level distribution navigation from the batch listing", () => {
    expect(itemModuleSource).toContain("/batches/${record.id}/distribution");
    expect(itemModuleSource).toContain("ItemBatchDistributionView");
  });
});
