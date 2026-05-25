import { describe, expect, it } from "vitest";

import {
  buildStorePanelState,
  buildUnitPanelState,
  buildWorkspacePanelHolderRows,
  buildItemCategoryCopilotOption,
  buildItemCopilotValuePatch,
} from "./ItemModuleViews";
import type { ItemDistributionUnit, ItemRecord } from "@/lib/itemUi";

describe("buildItemCopilotValuePatch", () => {
  it("normalizes copilot item form values into a safe form patch", () => {
    expect(
      buildItemCopilotValuePatch({
        name: "Laptop",
        code: "lap-001",
        category: 2,
        acct_unit: "pcs",
        low_stock_threshold: 5,
        description: "Office laptop",
        specifications: "16GB RAM",
        is_active: false,
        unknown: "ignored",
      }),
    ).toEqual({
      name: "Laptop",
      code: "LAP-001",
      category: "2",
      acct_unit: "pcs",
      low_stock_threshold: "5",
      description: "Office laptop",
      specifications: "16GB RAM",
      is_active: false,
    });
  });
});

describe("buildItemCategoryCopilotOption", () => {
  it("includes category context so the agent can avoid mismatched subcategories", () => {
    const option = buildItemCategoryCopilotOption(
      {
        id: 7,
        name: "Processors",
        code: "CPU",
        parent_category: 2,
        parent_category_display: "Computer Hardware",
        category_type: null,
        tracking_type: null,
        resolved_category_type: "FIXED_ASSET",
        resolved_tracking_type: "INDIVIDUAL",
        is_active: true,
        notes: "Desktop and laptop CPUs",
      },
      "Computer Hardware / Processors",
    );

    expect(option).toEqual({
      label: "Processors (CPU)",
      value: "7",
      category_path: "Computer Hardware / Processors",
      parent_category: 2,
      parent_category_display: "Computer Hardware",
      category_type: "FIXED_ASSET",
      tracking_type: "INDIVIDUAL",
      notes: "Desktop and laptop CPUs",
    });
  });
});

describe("buildStorePanelState", () => {
  const item = {
    id: 1,
    name: "Desktop CPU",
    code: "CPU-01",
    category: 1,
    acct_unit: "pcs",
    is_active: true,
  } satisfies ItemRecord;

  const unit = {
    id: 10,
    name: "CSIT",
    code: "CSIT",
    totalQuantity: 4,
    availableQuantity: 1,
    inTransitQuantity: 0,
    allocatedQuantity: 3,
    stores: [
      {
        id: 501,
        locationId: 100,
        locationName: "CSIT Main Store",
        isStore: true,
        batchNumber: null,
        batchId: null,
        quantity: 4,
        availableQuantity: 1,
        inTransitQuantity: 0,
        allocatedTotal: 3,
        lastUpdated: null,
      },
    ],
    allocations: [
      {
        id: 701,
        targetName: "CS Lab B",
        targetType: "LOCATION",
        targetLocationId: 102,
        sourceStoreId: 100,
        sourceStoreName: "CSIT Main Store",
        batchNumber: null,
        batchId: null,
        quantity: 2,
        allocatedAt: null,
        stockEntryIds: [],
        locationId: 102,
      },
      {
        id: 702,
        targetName: "Dr. A. Khan",
        targetType: "PERSON",
        targetLocationId: null,
        sourceStoreId: 100,
        sourceStoreName: "CSIT Main Store",
        batchNumber: null,
        batchId: null,
        quantity: 1,
        allocatedAt: null,
        stockEntryIds: [],
        locationId: null,
      },
    ],
  } satisfies ItemDistributionUnit;

  it("links employee and non-store allocations by source store location id", () => {
    const panel = buildStorePanelState(item, unit, unit.stores[0]);

    expect(panel.allocations.map(allocation => allocation.targetName)).toEqual(["CS Lab B", "Dr. A. Khan"]);
  });

  it("combines stores, non-store locations, and employees as standalone inventory holders", () => {
    const panel = buildUnitPanelState(item, unit);
    const rows = buildWorkspacePanelHolderRows(panel, "pcs");

    const groupedLabels = {
      store: rows.filter(row => row.kind === "store").map(row => row.label),
      location: rows.filter(row => row.kind === "location").map(row => row.label),
      person: rows.filter(row => row.kind === "person").map(row => row.label),
    };

    expect(groupedLabels).toEqual({
      store: ["CSIT Main Store"],
      location: ["CS Lab B"],
      person: ["Dr. A. Khan"],
    });
  });
});
