import { describe, expect, it } from "vitest";
import {
  canShowInstances,
  canShowBatches,
  findDistributionUnit,
  flattenDistributionDetails,
  formatTrackingTypeLabel,
  isLowStock,
  itemStatusTone,
  type ItemDistributionUnit,
} from "./itemUi";

const units: ItemDistributionUnit[] = [
  {
    id: 10,
    name: "CSIT",
    code: "CIS",
    totalQuantity: 5,
    availableQuantity: 1,
    inTransitQuantity: 0,
    allocatedQuantity: 4,
    stores: [
      {
        id: 1,
        locationId: 100,
        locationName: "CSIT Main Store",
        isStore: true,
        batchNumber: "B-001",
        batchId: 1,
        quantity: 3,
        availableQuantity: 1,
        inTransitQuantity: 0,
        allocatedTotal: 2,
        lastUpdated: "2026-04-20T10:00:00Z",
      },
    ],
    allocations: [
      {
        id: 7,
        targetName: "Dr. A. Khan",
        targetType: "PERSON",
        targetLocationId: null,
        sourceStoreId: 100,
        sourceStoreName: "CSIT Main Store",
        batchNumber: "B-001",
        batchId: 1,
        quantity: 2,
        allocatedAt: "2026-04-20T11:00:00Z",
        stockEntryIds: [55],
      },
      {
        id: 8,
        targetName: "CIS Lab B",
        targetType: "LOCATION",
        targetLocationId: 102,
        sourceStoreId: 100,
        sourceStoreName: "CSIT Main Store",
        batchNumber: null,
        batchId: null,
        quantity: 2,
        allocatedAt: "2026-04-20T12:00:00Z",
        stockEntryIds: [56],
      },
    ],
  },
];

describe("item UI helpers", () => {
  it("only exposes instance browsing for individually tracked items", () => {
    expect(canShowInstances("INDIVIDUAL")).toBe(true);
    expect(canShowInstances("QUANTITY")).toBe(false);
    expect(canShowInstances(null)).toBe(false);
  });

  it("only exposes batch browsing for perishable quantity-tracked items", () => {
    expect(canShowBatches("QUANTITY", "PERISHABLE")).toBe(true);
    expect(canShowBatches("QUANTITY", "CONSUMABLE")).toBe(false);
    expect(canShowBatches("INDIVIDUAL", "FIXED_ASSET")).toBe(false);
  });

  it("finds a standalone distribution unit by route param", () => {
    expect(findDistributionUnit(units, "10")?.name).toBe("CSIT");
    expect(findDistributionUnit(units, "missing")).toBeNull();
  });

  it("flattens store and allocation rows for standalone detail pages", () => {
    expect(flattenDistributionDetails(units[0])).toEqual([
      expect.objectContaining({ kind: "store", name: "CSIT Main Store", quantity: 3 }),
      expect.objectContaining({ kind: "person", name: "Dr. A. Khan", quantity: 2 }),
      expect.objectContaining({ kind: "location", name: "CIS Lab B", quantity: 2, locationId: 102 }),
    ]);
  });

  it("supports compact tracking labels for narrow list columns", () => {
    expect(formatTrackingTypeLabel("QUANTITY")).toBe("Quantity Based Tracking");
    expect(formatTrackingTypeLabel("QUANTITY", { compact: true })).toBe("Quantity Based");
    expect(formatTrackingTypeLabel("INDIVIDUAL", { compact: true })).toBe("Individual");
    expect(formatTrackingTypeLabel(null, { compact: true, fallback: "Unknown" })).toBe("Unknown");
  });

  it("marks items as in stock only when total quantity is above zero", () => {
    expect(itemStatusTone({ total_quantity: 10 })).toBe("success");
    expect(itemStatusTone({ total_quantity: 4 })).toBe("success");
    expect(itemStatusTone({ total_quantity: 0 })).toBe("danger");
  });

  it("flags low stock only when quantity is above zero and within threshold", () => {
    expect(isLowStock({ total_quantity: 3, low_stock_threshold: 5 })).toBe(true);
    expect(isLowStock({ total_quantity: 7, low_stock_threshold: 5 })).toBe(false);
    expect(isLowStock({ total_quantity: 0, low_stock_threshold: 5 })).toBe(false);
  });
});
