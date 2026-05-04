import type { InspectionItemRecord } from "@/lib/inspectionUi";

export type StageItemsPayloadMode = "stock" | "central" | "finance";
export type StockRegisterStoreLike = {
  store?: number | string | null;
};
export type InspectionLocationScopeLike = {
  id: number;
  is_standalone: boolean;
  hierarchy_level: number;
  hierarchy_path?: string | null;
};
export type InspectionMainStoreLocationLike = {
  main_store_id?: number | string | null;
};
export type InspectionCentralStoreLocationLike = InspectionMainStoreLocationLike & {
  hierarchy_level?: number | null;
  root_main_store_id?: number | string | null;
};

export function parseInspectionQuantity(value: string) {
  const parsed = Number.parseInt(value || "0", 10);
  return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
}

export function getDefaultFinanceCheckDate(value: string | null | undefined, now = new Date()) {
  if (value) return value;
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function normalizeStageItems(items: InspectionItemRecord[]) {
  return items.map(item => ({
    ...item,
    item: item.item ?? null,
    item_description: item.item_description ?? "",
    item_specifications: item.item_specifications ?? "",
    tendered_quantity: Number(item.tendered_quantity || 0),
    accepted_quantity: Number(item.accepted_quantity || 0),
    rejected_quantity: Number(item.rejected_quantity || 0),
    unit_price: item.unit_price ?? "0.00",
    remarks: item.remarks ?? "",
    stock_register: item.stock_register ?? null,
    stock_register_no: item.stock_register_no ?? "",
    stock_register_page_no: item.stock_register_page_no ?? "",
    stock_entry_date: item.stock_entry_date ?? "",
    central_register: item.central_register ?? null,
    central_register_no: item.central_register_no ?? "",
    central_register_page_no: item.central_register_page_no ?? "",
    batch_number: item.batch_number ?? "",
    manufactured_date: item.manufactured_date ?? "",
    expiry_date: item.expiry_date ?? "",
    depreciation_asset_class: item.depreciation_asset_class ?? null,
    depreciation_asset_class_name: item.depreciation_asset_class_name ?? null,
    capitalization_cost: item.capitalization_cost ?? "",
    capitalization_date: item.capitalization_date ?? "",
  }));
}

export function buildStageItemsPayload(items: InspectionItemRecord[], mode: StageItemsPayloadMode) {
  return items.map(item => {
    const payload: Record<string, unknown> = {
      ...(item.id ? { id: item.id } : {}),
      item: item.item || null,
      item_description: item.item_description,
      item_specifications: item.item_specifications || null,
      tendered_quantity: item.tendered_quantity,
      accepted_quantity: item.accepted_quantity,
      rejected_quantity: item.rejected_quantity,
      unit_price: item.unit_price,
      remarks: item.remarks || null,
      stock_register: item.stock_register || null,
      stock_register_no: item.stock_register_no || null,
      stock_register_page_no: item.stock_register_page_no || null,
      stock_entry_date: item.stock_entry_date || null,
    };

    if (mode === "central" || mode === "finance") {
      payload.central_register = item.central_register || null;
      payload.central_register_no = item.central_register_no || null;
      payload.central_register_page_no = item.central_register_page_no || null;
      payload.batch_number = item.batch_number || null;
      payload.manufactured_date = item.manufactured_date || null;
      payload.expiry_date = item.expiry_date || null;
    }

    if (mode === "finance") {
      payload.depreciation_asset_class = item.depreciation_asset_class || null;
      payload.capitalization_cost = item.capitalization_cost || null;
      payload.capitalization_date = item.capitalization_date || null;
    }

    return payload;
  });
}

export function getInspectionItemFinancials(
  item: Pick<InspectionItemRecord, "accepted_quantity" | "unit_price">,
) {
  const unitPrice = typeof item.unit_price === "number"
    ? item.unit_price
    : Number.parseFloat(item.unit_price);
  const safeUnitPrice = Number.isFinite(unitPrice) ? unitPrice : 0;
  const acceptedQuantity = Number(item.accepted_quantity || 0);

  return {
    unitPrice: safeUnitPrice,
    totalPrice: safeUnitPrice * acceptedQuantity,
  };
}

export function getInspectionQuantityError(
  item: Pick<InspectionItemRecord, "tendered_quantity" | "accepted_quantity" | "rejected_quantity">,
) {
  const tendered = Number(item.tendered_quantity || 0);
  const accepted = Number(item.accepted_quantity || 0);
  const rejected = Number(item.rejected_quantity || 0);

  if (tendered < 1) return "Tendered quantity must be at least 1.";
  if (accepted > tendered) return "Accepted quantity cannot exceed tendered quantity.";
  if (rejected > tendered) return "Rejected quantity cannot exceed tendered quantity.";
  if (accepted + rejected > tendered) return "Accepted and rejected quantities cannot exceed tendered quantity.";
  return null;
}

export function getInspectionQuantityUpdateError(
  item: Pick<InspectionItemRecord, "tendered_quantity" | "accepted_quantity" | "rejected_quantity">,
  patch: Partial<Pick<InspectionItemRecord, "tendered_quantity" | "accepted_quantity" | "rejected_quantity">>,
) {
  return getInspectionQuantityError({ ...item, ...patch });
}

export function filterStockRegistersForInspectionStore<T extends StockRegisterStoreLike>(
  registers: T[],
  mainStoreId: number | string | null | undefined,
) {
  if (mainStoreId === null || mainStoreId === undefined || mainStoreId === "") return registers;
  return registers.filter(register => String(register.store ?? "") === String(mainStoreId));
}

export function getInspectionMainStoreRegisters<T extends StockRegisterStoreLike>(
  registers: T[],
  location: InspectionMainStoreLocationLike | null | undefined,
) {
  return filterStockRegistersForInspectionStore(registers, location?.main_store_id);
}

export function getInspectionCentralStoreId(
  location: InspectionCentralStoreLocationLike | null | undefined,
) {
  if (!location) return null;
  if (location.root_main_store_id !== null && location.root_main_store_id !== undefined && location.root_main_store_id !== "") {
    return location.root_main_store_id;
  }
  if (location.hierarchy_level === 0) {
    return location.main_store_id ?? null;
  }
  return null;
}

export function getInspectionCentralStoreRegisters<T extends StockRegisterStoreLike>(
  registers: T[],
  location: InspectionCentralStoreLocationLike | null | undefined,
) {
  return filterStockRegistersForInspectionStore(registers, getInspectionCentralStoreId(location));
}

export function getScopedInspectionLocations<T extends InspectionLocationScopeLike>(
  locations: T[],
  assignedLocationIds: number[] | undefined,
  includeAllStandalones: boolean,
) {
  const standaloneLocations = locations.filter(location => location.is_standalone);
  if (includeAllStandalones) return standaloneLocations;

  const assigned = new Set((assignedLocationIds ?? []).map(id => Number(id)));
  const assignedStandaloneIds = new Set<number>();
  const assignedLocations = locations.filter(location => assigned.has(location.id));

  assignedLocations.forEach(location => {
    if (location.is_standalone) {
      assignedStandaloneIds.add(location.id);
      return;
    }

    const owner = standaloneLocations
      .filter(standalone => {
        if (!standalone.hierarchy_path || !location.hierarchy_path) return false;
        return location.hierarchy_path === standalone.hierarchy_path
          || location.hierarchy_path.startsWith(`${standalone.hierarchy_path}/`);
      })
      .sort((a, b) => (b.hierarchy_path?.length ?? 0) - (a.hierarchy_path?.length ?? 0))[0];
    if (owner) assignedStandaloneIds.add(owner.id);
  });

  return standaloneLocations.filter(location => assignedStandaloneIds.has(location.id));
}

export function getAutoSelectedInspectionLocation<T extends { id: number }>(locations: T[]) {
  return locations.length === 1 ? locations[0].id : "";
}
