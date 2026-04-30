export type TrackingType = "INDIVIDUAL" | "QUANTITY" | string | null | undefined;

export interface ItemRecord {
  id: number;
  name: string;
  code: string;
  category: number;
  category_display?: string | null;
  category_type?: string | null;
  tracking_type?: TrackingType;
  description?: string | null;
  acct_unit?: string | null;
  specifications?: string | null;
  low_stock_threshold?: number | string | null;
  total_quantity?: number | string | null;
  in_transit_quantity?: number | string | null;
  available_quantity?: number | string | null;
  is_low_stock?: boolean;
  standalone_location_count?: number | null;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  created_by_name?: string | null;
}

export interface ItemDistributionStore {
  id: number;
  locationId: number;
  locationName: string;
  isStore: boolean;
  batchNumber: string | null;
  batchId: number | null;
  quantity: number;
  availableQuantity: number;
  inTransitQuantity: number;
  allocatedTotal: number;
  lastUpdated: string | null;
}

export interface ItemDistributionAllocation {
  id: number;
  targetName: string;
  targetType: "PERSON" | "LOCATION" | string;
  targetLocationId: number | null;
  sourceStoreId: number;
  sourceStoreName: string;
  batchNumber: string | null;
  batchId: number | null;
  quantity: number;
  allocatedAt: string | null;
  stockEntryIds: number[];
  locationId: number | null;
}

export interface ItemDistributionUnit {
  id: number;
  name: string;
  code: string;
  totalQuantity: number;
  availableQuantity: number;
  inTransitQuantity: number;
  allocatedQuantity: number;
  stores: ItemDistributionStore[];
  allocations: ItemDistributionAllocation[];
}

export interface ItemDistributionDetailRow {
  id: string;
  kind: "store" | "person" | "location";
  name: string;
  sourceStoreName: string | null;
  batchNumber: string | null;
  quantity: number;
  availableQuantity: number | null;
  inTransitQuantity: number | null;
  allocatedQuantity: number | null;
  updatedAt: string | null;
  stockEntryIds: number[];
  locationId: number | null;
}

export type ItemStatusTone = "success" | "warning" | "neutral" | "disabled" | "danger";

export function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function formatItemLabel(value: string | null | undefined, fallback = "-") {
  if (!value) return fallback;
  if (value === "INDIVIDUAL") return "Individual Tracking";
  if (value === "QUANTITY") return "Quantity Based Tracking";
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

export function formatQuantity(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(toNumber(value));
}

export function formatItemDate(value: string | null | undefined, fallback = "-") {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function canShowInstances(trackingType: TrackingType) {
  return trackingType === "INDIVIDUAL";
}

export function canShowBatches(trackingType: TrackingType, categoryType?: string | null) {
  return trackingType === "QUANTITY" && categoryType === "PERISHABLE";
}

export function findDistributionUnit(units: ItemDistributionUnit[], unitId: string | number | null | undefined) {
  const parsed = Number(unitId);
  if (!Number.isFinite(parsed)) return null;
  return units.find(unit => unit.id === parsed) ?? null;
}

export function flattenDistributionDetails(unit: ItemDistributionUnit | null | undefined): ItemDistributionDetailRow[] {
  if (!unit) return [];

  const storeRows: ItemDistributionDetailRow[] = unit.stores.map(store => ({
    id: `store-${store.id}`,
    kind: "store",
    name: store.locationName,
    sourceStoreName: null,
    batchNumber: store.batchNumber,
    quantity: store.quantity,
    availableQuantity: store.availableQuantity,
    inTransitQuantity: store.inTransitQuantity,
    allocatedQuantity: store.allocatedTotal,
    updatedAt: store.lastUpdated,
    stockEntryIds: [],
    locationId: store.locationId,
  }));

  const allocationRows: ItemDistributionDetailRow[] = unit.allocations.map(allocation => ({
    id: `allocation-${allocation.id}`,
    kind: allocation.targetType === "PERSON" ? "person" : "location",
    name: allocation.targetName,
    sourceStoreName: allocation.sourceStoreName,
    batchNumber: allocation.batchNumber,
    quantity: allocation.quantity,
    availableQuantity: null,
    inTransitQuantity: null,
    allocatedQuantity: allocation.quantity,
    updatedAt: allocation.allocatedAt,
    stockEntryIds: allocation.stockEntryIds ?? [],
    locationId: allocation.targetType === "LOCATION" ? allocation.targetLocationId : null,
  }));

  return [...storeRows, ...allocationRows];
}

export function itemStatusTone(item: Pick<ItemRecord, "total_quantity">): ItemStatusTone {
  const total = toNumber(item.total_quantity);
  return total > 0 ? "success" : "danger";
}

export function isLowStock(item: Pick<ItemRecord, "is_low_stock" | "low_stock_threshold" | "total_quantity">) {
  if (typeof item.is_low_stock === "boolean") return item.is_low_stock;
  const threshold = toNumber(item.low_stock_threshold);
  const total = toNumber(item.total_quantity);
  return threshold > 0 && total > 0 && total <= threshold;
}
