import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { __buildAggregatesForTest, __buildUnitAggregateForTest } from "./ItemDistributionView";
import type { ItemDistributionUnit } from "@/lib/itemUi";

describe("ItemDistributionView nested item breakdown", () => {
  it("builds store rows with nested batch rows and per-batch allocations", () => {
    const row = __buildUnitAggregateForTest({
      id: 10,
      name: "CSIT",
      code: "CSIT",
      totalQuantity: 9,
      availableQuantity: 6,
      allocatedQuantity: 3,
      inTransitQuantity: 0,
      stores: [
        {
          id: 7,
          locationId: 7,
          locationName: "CSIT Store",
          isStore: true,
          batchNumber: null,
          batchId: null,
          quantity: 9,
          availableQuantity: 6,
          inTransitQuantity: 0,
          allocatedTotal: 3,
          lastUpdated: null,
          batches: [
            {
              batchId: 1,
              batchNumber: "B-001",
              quantity: 5,
              availableQuantity: 3,
              inTransitQuantity: 0,
              allocatedTotal: 2,
              lastUpdated: null,
              allocations: [
                {
                  id: 101,
                  targetName: "Dr. A. Khan",
                  targetType: "PERSON",
                  targetLocationId: null,
                  sourceStoreId: 7,
                  sourceStoreName: "CSIT Store",
                  batchNumber: "B-001",
                  batchId: 1,
                  quantity: 2,
                  allocatedAt: null,
                  stockEntryIds: [],
                  locationId: null,
                },
              ],
            },
            {
              batchId: 2,
              batchNumber: "B-002",
              quantity: 4,
              availableQuantity: 3,
              inTransitQuantity: 0,
              allocatedTotal: 1,
              lastUpdated: null,
              allocations: [
                {
                  id: 102,
                  targetName: "CSIT Lab 1",
                  targetType: "LOCATION",
                  targetLocationId: 22,
                  sourceStoreId: 7,
                  sourceStoreName: "CSIT Store",
                  batchNumber: "B-002",
                  batchId: 2,
                  quantity: 1,
                  allocatedAt: null,
                  stockEntryIds: [],
                  locationId: 22,
                },
              ],
            },
          ],
        },
      ],
      allocations: [],
    } as unknown as ItemDistributionUnit);

    const store = row.children?.find(child => child.kind === "store");
    const batches = store?.children ?? [];

    expect(batches.map(batch => ({
      name: batch.name,
      kind: batch.kind,
      level: batch.level,
      total: batch.total,
      allocated: batch.allocated,
      available: batch.available,
    }))).toEqual([
      { name: "Batch B-001", kind: "batch", level: 2, total: 5, allocated: 2, available: 3 },
      { name: "Batch B-002", kind: "batch", level: 2, total: 4, allocated: 1, available: 3 },
    ]);
    expect(batches[0]?.children?.map(child => ({
      name: child.name,
      kind: child.kind,
      level: child.level,
      total: child.total,
    }))).toEqual([
      { name: "Dr. A. Khan", kind: "person", level: 3, total: 2 },
    ]);
    expect(batches[1]?.children?.map(child => ({
      name: child.name,
      kind: child.kind,
      level: child.level,
      total: child.total,
    }))).toEqual([
      { name: "CSIT Lab 1", kind: "location", level: 3, total: 1 },
    ]);
  });

  it("builds individual-tracked store rows with instance preview children instead of batch rows", () => {
    const row = __buildUnitAggregateForTest(
      {
        id: 10,
        name: "CSIT",
        code: "CSIT",
        totalQuantity: 2,
        availableQuantity: 2,
        allocatedQuantity: 0,
        inTransitQuantity: 0,
        stores: [
          {
            id: 7,
            locationId: 7,
            locationName: "CSIT Store",
            isStore: true,
            batchNumber: null,
            batchId: null,
            quantity: 2,
            availableQuantity: 2,
            inTransitQuantity: 0,
            allocatedTotal: 0,
            lastUpdated: null,
          },
        ],
        allocations: [],
      } as unknown as ItemDistributionUnit,
      {
        item: { tracking_type: "INDIVIDUAL" },
        instancesByLocation: new Map([
          [
            7,
            [
              {
                id: 301,
                qr_code: "QR-301",
                serial_number: "SN-301",
                status: "AVAILABLE",
                current_location: 7,
                location_name: "CSIT Store",
              },
              {
                id: 302,
                qr_code: "QR-302",
                serial_number: "SN-302",
                status: "AVAILABLE",
                current_location: 7,
                location_name: "CSIT Store",
              },
            ],
          ],
        ]),
      },
    );

    const store = row.children?.find(child => child.kind === "store");

    expect(store?.children?.map(child => ({
      name: child.name,
      kind: child.kind,
      level: child.level,
      total: child.total,
      badge: child.badge,
    }))).toEqual([
      { name: "QR-301", kind: "instance", level: 2, total: 1, badge: "SN-301 - Available" },
      { name: "QR-302", kind: "instance", level: 2, total: 1, badge: "SN-302 - Available" },
    ]);
  });

  it("does not show stale unbatched batch rows for individual-tracked stores with no visible instances", () => {
    const row = __buildUnitAggregateForTest(
      {
        id: 10,
        name: "NED",
        code: "DEPT-0001",
        totalQuantity: 0,
        availableQuantity: 0,
        allocatedQuantity: 0,
        inTransitQuantity: 0,
        stores: [
          {
            id: 7,
            locationId: 7,
            locationName: "Central Store",
            isStore: true,
            batchNumber: null,
            batchId: null,
            quantity: 0,
            availableQuantity: 0,
            inTransitQuantity: 0,
            allocatedTotal: 0,
            lastUpdated: null,
            batches: [
              {
                batchId: null,
                batchNumber: null,
                quantity: 0,
                availableQuantity: 0,
                inTransitQuantity: 0,
                allocatedTotal: 0,
                lastUpdated: null,
                allocations: [],
              },
            ],
          },
        ],
        allocations: [],
      } as unknown as ItemDistributionUnit,
      {
        item: { tracking_type: "INDIVIDUAL" },
        instancesByLocation: new Map(),
      },
    );

    expect(row.children).toEqual([]);
    expect(row.total).toBe(0);
    expect(row.badge).toBe("No holders");
  });

  it("uses scoped instance status counts for individual-tracked store and location totals", () => {
    const row = __buildUnitAggregateForTest(
      {
        id: 20,
        name: "CSIT",
        code: "DEPT-0003",
        totalQuantity: 1,
        availableQuantity: 0,
        allocatedQuantity: 0,
        inTransitQuantity: 1,
        stores: [
          {
            id: 8,
            locationId: 8,
            locationName: "CSIT - Main Store",
            isStore: true,
            batchNumber: null,
            batchId: null,
            quantity: 1,
            availableQuantity: 0,
            inTransitQuantity: 1,
            allocatedTotal: 0,
            lastUpdated: null,
            batches: [
              {
                batchId: null,
                batchNumber: null,
                quantity: 1,
                availableQuantity: 0,
                inTransitQuantity: 1,
                allocatedTotal: 0,
                lastUpdated: null,
                allocations: [],
              },
            ],
          },
        ],
        allocations: [],
      } as unknown as ItemDistributionUnit,
      {
        item: { tracking_type: "INDIVIDUAL" },
        instancesByLocation: new Map([
          [
            8,
            [
              {
                id: 401,
                item: 99,
                qr_code: "AMS-INST-BA281CD62016",
                serial_number: null,
                status: "AVAILABLE",
                current_location: 8,
                location_name: "CSIT - Main Store",
                is_active: true,
              },
            ],
          ],
        ]),
      },
    );

    const store = row.children?.find(child => child.kind === "store");

    expect(row.available).toBe(1);
    expect(row.inTransit).toBe(0);
    expect(row.total).toBe(1);
    expect(store?.available).toBe(1);
    expect(store?.inTransit).toBe(0);
    expect(store?.children?.map(child => child.kind)).toEqual(["instance"]);
  });

  it("omits individual-tracked locations when no scoped instances or allocations remain visible", () => {
    const rows = __buildAggregatesForTest(
      [
        {
          id: 10,
          name: "NED",
          code: "DEPT-0001",
          totalQuantity: 0,
          availableQuantity: 0,
          allocatedQuantity: 0,
          inTransitQuantity: 0,
          stores: [
            {
              id: 7,
              locationId: 7,
              locationName: "Central Store",
              isStore: true,
              batchNumber: null,
              batchId: null,
              quantity: 0,
              availableQuantity: 0,
              inTransitQuantity: 0,
              allocatedTotal: 0,
              lastUpdated: null,
              batches: [
                {
                  batchId: null,
                  batchNumber: null,
                  quantity: 0,
                  availableQuantity: 0,
                  inTransitQuantity: 0,
                  allocatedTotal: 0,
                  lastUpdated: null,
                  allocations: [],
                },
              ],
            },
          ],
          allocations: [],
        },
      ] as unknown as ItemDistributionUnit[],
      {
        item: { tracking_type: "INDIVIDUAL" },
        instancesByLocation: new Map(),
      },
    );

    expect(rows).toEqual([]);
  });
});

describe("ItemDistributionView store details", () => {
  const source = readFileSync("src/components/ItemDistributionView.tsx", "utf8");

  it("loads permission-scoped instances and exposes a store detail drawer", () => {
    expect(source).toContain("/api/inventory/item-instances/");
    expect(source).toContain("StoreDetailDrawer");
    expect(source).toContain("View detail");
  });

  it("keeps individual distribution in a loading state while scoped instances are loading", () => {
    expect(source).toContain("instancesLoading");
    expect(source).toContain("const tableLoading = isLoading || instancesLoading");
  });

  it("uses instance counts for individual store detail metrics", () => {
    expect(source).toContain("const detailCounts = isIndividual ? instanceStatusCounts(instances) : null");
    expect(source).toContain("value={detailCounts ? detailCounts.total : toNumber(store.quantity)}");
  });
});
