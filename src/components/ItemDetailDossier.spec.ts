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
        allocated: 2,
        available: 3,
        inTransit: 4,
        total: 9,
      }),
    ]);
  });
});

describe("ItemDetailDossier action surface", () => {
  const source = readFileSync("src/components/ItemDetailDossier.tsx", "utf8");
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
