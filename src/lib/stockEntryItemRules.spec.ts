import { describe, expect, it } from "vitest";
import {
  getIssueAvailableQuantity,
  getIssueBatchOptions,
  getIssueInstanceOptions,
  getIssueItemOptions,
  getReturnBatchOptions,
  getReturnInstanceOptions,
  getReturnItemOptions,
  getReturnQuantityLimit,
  type StockEntryItemBatch,
  type StockEntryItemInstance,
  type StockEntryStockItem,
  type StockEntryStockRecord,
} from "./stockEntryItemRules";
import type { StockAllocationRecord } from "./stockEntryLocationRules";

const items: StockEntryStockItem[] = [
  { id: 1, name: "Table", code: "ITM-TBL", is_active: true, tracking_type: "INDIVIDUAL" },
  { id: 2, name: "Paper", code: "ITM-PPR", is_active: true, tracking_type: "QUANTITY" },
  { id: 3, name: "Processor", code: "ITM-CPU", is_active: true, tracking_type: "INDIVIDUAL" },
  { id: 4, name: "Retired Chair", code: "ITM-OLD", is_active: false, tracking_type: "QUANTITY" },
];

const batches: StockEntryItemBatch[] = [
  { id: 10, item: 2, batch_number: "PPR-001", is_active: true },
  { id: 11, item: 2, batch_number: "PPR-002", is_active: true },
  { id: 12, item: 2, batch_number: "PPR-OLD", is_active: false },
];

const stockRecords: StockEntryStockRecord[] = [
  { id: 1, item: 1, batch: null, location: 11, available_quantity: 2 },
  { id: 2, item: 2, batch: 10, location: 11, available_quantity: 25 },
  { id: 3, item: 2, batch: 11, location: 11, available_quantity: 0 },
  { id: 4, item: 3, batch: null, location: 21, available_quantity: 5 },
  { id: 5, item: 4, batch: null, location: 11, available_quantity: 4 },
];

const allocations: StockAllocationRecord[] = [
  { id: 1, item: 1, batch: null, source_location: 11, allocated_to_person: 7, allocated_to_location: null, quantity: 2, status: "ALLOCATED", stock_entry: 101 },
  { id: 2, item: 2, batch: 10, source_location: 11, allocated_to_person: 7, allocated_to_location: null, quantity: 10, status: "ALLOCATED", stock_entry: 102 },
  { id: 3, item: 3, batch: null, source_location: 11, allocated_to_person: 8, allocated_to_location: null, quantity: 1, status: "ALLOCATED", stock_entry: 103 },
  { id: 4, item: 2, batch: 11, source_location: 11, allocated_to_person: 7, allocated_to_location: null, quantity: 5, status: "RETURNED", stock_entry: 104 },
  { id: 5, item: 2, batch: 10, source_location: 11, allocated_to_person: null, allocated_to_location: 12, quantity: 3, status: "ALLOCATED", stock_entry: 105 },
];

const instances: StockEntryItemInstance[] = [
  { id: 1001, item: 1, current_location: 11, status: "AVAILABLE", serial_number: "TBL-001", stock_entry_ids: [] },
  { id: 1002, item: 1, current_location: 11, status: "AVAILABLE", serial_number: "TBL-002", stock_entry_ids: [] },
  { id: 1003, item: 1, current_location: 11, status: "ALLOCATED", serial_number: "TBL-003", stock_entry_ids: [101] },
  { id: 1004, item: 1, current_location: 11, status: "ALLOCATED", serial_number: "TBL-004", stock_entry_ids: [101] },
  { id: 1005, item: 3, current_location: 21, status: "AVAILABLE", serial_number: "CPU-001", stock_entry_ids: [] },
];

describe("stock entry item filtering rules", () => {
  it("limits issue items to active stock available in the selected source store", () => {
    expect(getIssueItemOptions("11", items, stockRecords).map(item => item.name)).toEqual(["Table", "Paper"]);
  });

  it("limits issue batches and quantity to available stock for the selected source store", () => {
    expect(getIssueBatchOptions("11", "2", batches, stockRecords).map(batch => batch.batch_number)).toEqual(["PPR-001"]);
    expect(getIssueAvailableQuantity("11", "2", "10", stockRecords)).toBe(25);
  });

  it("limits issue instances to available instances in the selected source store", () => {
    expect(getIssueInstanceOptions("11", "1", instances).map(instance => instance.serial_number)).toEqual(["TBL-001", "TBL-002"]);
  });

  it("limits return items to active allocations for the selected receiving store and return source", () => {
    expect(getReturnItemOptions("11", { type: "PERSON", id: "7" }, items, allocations).map(item => item.name)).toEqual(["Table", "Paper"]);
    expect(getReturnItemOptions("11", { type: "LOCATION", id: "12" }, items, allocations).map(item => item.name)).toEqual(["Paper"]);
  });

  it("limits return batches and quantity to active allocations for the selected target", () => {
    expect(getReturnBatchOptions("11", { type: "PERSON", id: "7" }, "2", batches, allocations).map(batch => batch.batch_number)).toEqual(["PPR-001"]);
    expect(getReturnQuantityLimit("11", { type: "PERSON", id: "7" }, "2", "10", allocations)).toBe(10);
  });

  it("limits return instances to instances from active allocation entries for the selected target", () => {
    expect(getReturnInstanceOptions("11", { type: "PERSON", id: "7" }, "1", allocations, instances).map(instance => instance.serial_number)).toEqual(["TBL-003", "TBL-004"]);
  });
});
