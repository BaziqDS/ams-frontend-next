import type { StockAllocationRecord } from "./stockEntryLocationRules";

export interface StockEntryStockItem {
  id: number;
  name: string;
  code: string;
  is_active: boolean;
  tracking_type?: string | null;
}

export interface StockEntryItemBatch {
  id: number;
  item: number;
  batch_number: string;
  is_active: boolean;
}

export interface StockEntryStockRecord {
  id: number;
  item: number;
  batch: number | null;
  location: number;
  available_quantity: number;
}

export interface StockEntryItemInstance {
  id: number;
  item: number;
  current_location: number;
  status: string;
  serial_number?: string | null;
  qr_code?: string | null;
  is_active?: boolean;
  stock_entry_ids?: number[];
}

export type StockEntryReturnTarget = {
  type: "PERSON" | "LOCATION";
  id: string | number | null | undefined;
};

function toNumericId(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
}

function isActiveAllocation(allocation: StockAllocationRecord) {
  return allocation.status === "ALLOCATED" && (allocation.quantity ?? 0) > 0;
}

function matchesReturnTarget(allocation: StockAllocationRecord, target: StockEntryReturnTarget) {
  const targetId = toNumericId(target.id);
  if (targetId == null) return false;
  if (target.type === "PERSON") return Number(allocation.allocated_to_person) === targetId;
  return Number(allocation.allocated_to_location) === targetId;
}

function matchingReturnAllocations(
  receivingStoreId: string | number | null | undefined,
  target: StockEntryReturnTarget,
  allocations: StockAllocationRecord[],
) {
  const storeId = toNumericId(receivingStoreId);
  if (storeId == null) return [];

  return allocations.filter(allocation => (
    isActiveAllocation(allocation) &&
    Number(allocation.source_location) === storeId &&
    matchesReturnTarget(allocation, target)
  ));
}

export function getIssueItemOptions<T extends StockEntryStockItem>(
  sourceStoreId: string | number | null | undefined,
  items: T[],
  stockRecords: StockEntryStockRecord[],
) {
  const storeId = toNumericId(sourceStoreId);
  if (storeId == null) return [];

  const itemIds = new Set(
    stockRecords
      .filter(record => Number(record.location) === storeId && Number(record.available_quantity) > 0)
      .map(record => Number(record.item)),
  );

  return items.filter(item => item.is_active && itemIds.has(item.id));
}

export function getIssueBatchOptions<T extends StockEntryItemBatch>(
  sourceStoreId: string | number | null | undefined,
  itemId: string | number | null | undefined,
  batches: T[],
  stockRecords: StockEntryStockRecord[],
) {
  const storeId = toNumericId(sourceStoreId);
  const selectedItemId = toNumericId(itemId);
  if (storeId == null || selectedItemId == null) return [];

  const batchIds = new Set(
    stockRecords
      .filter(record => (
        Number(record.location) === storeId &&
        Number(record.item) === selectedItemId &&
        record.batch != null &&
        Number(record.available_quantity) > 0
      ))
      .map(record => Number(record.batch)),
  );

  return batches.filter(batch => batch.is_active && Number(batch.item) === selectedItemId && batchIds.has(batch.id));
}

export function getIssueAvailableQuantity(
  sourceStoreId: string | number | null | undefined,
  itemId: string | number | null | undefined,
  batchId: string | number | null | undefined,
  stockRecords: StockEntryStockRecord[],
) {
  const storeId = toNumericId(sourceStoreId);
  const selectedItemId = toNumericId(itemId);
  const selectedBatchId = toNumericId(batchId);
  if (storeId == null || selectedItemId == null) return 0;

  return stockRecords
    .filter(record => (
      Number(record.location) === storeId &&
      Number(record.item) === selectedItemId &&
      (selectedBatchId == null || Number(record.batch) === selectedBatchId)
    ))
    .reduce((sum, record) => sum + Number(record.available_quantity || 0), 0);
}

export function getIssueInstanceOptions<T extends StockEntryItemInstance>(
  sourceStoreId: string | number | null | undefined,
  itemId: string | number | null | undefined,
  instances: T[],
) {
  const storeId = toNumericId(sourceStoreId);
  const selectedItemId = toNumericId(itemId);
  if (storeId == null || selectedItemId == null) return [];

  return instances.filter(instance => (
    instance.is_active !== false &&
    Number(instance.item) === selectedItemId &&
    Number(instance.current_location) === storeId &&
    instance.status === "AVAILABLE"
  ));
}

export function getReturnItemOptions<T extends StockEntryStockItem>(
  receivingStoreId: string | number | null | undefined,
  target: StockEntryReturnTarget,
  items: T[],
  allocations: StockAllocationRecord[],
) {
  const itemIds = new Set(
    matchingReturnAllocations(receivingStoreId, target, allocations)
      .filter(allocation => allocation.item != null)
      .map(allocation => Number(allocation.item)),
  );

  return items.filter(item => item.is_active && itemIds.has(item.id));
}

export function getReturnBatchOptions<T extends StockEntryItemBatch>(
  receivingStoreId: string | number | null | undefined,
  target: StockEntryReturnTarget,
  itemId: string | number | null | undefined,
  batches: T[],
  allocations: StockAllocationRecord[],
) {
  const selectedItemId = toNumericId(itemId);
  if (selectedItemId == null) return [];

  const batchIds = new Set(
    matchingReturnAllocations(receivingStoreId, target, allocations)
      .filter(allocation => Number(allocation.item) === selectedItemId && allocation.batch != null)
      .map(allocation => Number(allocation.batch)),
  );

  return batches.filter(batch => batch.is_active && Number(batch.item) === selectedItemId && batchIds.has(batch.id));
}

export function getReturnQuantityLimit(
  receivingStoreId: string | number | null | undefined,
  target: StockEntryReturnTarget,
  itemId: string | number | null | undefined,
  batchId: string | number | null | undefined,
  allocations: StockAllocationRecord[],
) {
  const selectedItemId = toNumericId(itemId);
  const selectedBatchId = toNumericId(batchId);
  if (selectedItemId == null) return 0;

  return matchingReturnAllocations(receivingStoreId, target, allocations)
    .filter(allocation => (
      Number(allocation.item) === selectedItemId &&
      (selectedBatchId == null || Number(allocation.batch) === selectedBatchId)
    ))
    .reduce((sum, allocation) => sum + Number(allocation.quantity || 0), 0);
}

export function getReturnInstanceOptions<T extends StockEntryItemInstance>(
  receivingStoreId: string | number | null | undefined,
  target: StockEntryReturnTarget,
  itemId: string | number | null | undefined,
  allocations: StockAllocationRecord[],
  instances: T[],
) {
  const selectedItemId = toNumericId(itemId);
  if (selectedItemId == null) return [];

  const stockEntryIds = new Set(
    matchingReturnAllocations(receivingStoreId, target, allocations)
      .filter(allocation => Number(allocation.item) === selectedItemId && allocation.stock_entry != null)
      .map(allocation => Number(allocation.stock_entry)),
  );

  return instances.filter(instance => (
    instance.is_active !== false &&
    Number(instance.item) === selectedItemId &&
    instance.status === "ALLOCATED" &&
    (instance.stock_entry_ids ?? []).some(stockEntryId => stockEntryIds.has(Number(stockEntryId)))
  ));
}
