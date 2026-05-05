"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { ListPagination } from "@/components/ListPagination";
import { MultiSelectFilter, type MultiSelectFilterOption } from "@/components/MultiSelectFilter";
import { ThemedSelect } from "@/components/ThemedSelect";
import { Topbar } from "@/components/Topbar";
import type { CategoryRecord } from "@/components/CategoryModal";
import { useCan, useCapabilities } from "@/contexts/CapabilitiesContext";
import { apiFetch, type Page } from "@/lib/api";
import { useClientPagination } from "@/lib/listPagination";
import {
  buildItemsWorkspaceHref,
  normalizeItemsWorkspaceState,
  parseItemsWorkspaceSearch,
  type ItemsWorkspaceState,
  type ItemsWorkspaceTab,
} from "@/lib/itemsWorkspaceState";
import {
  canShowInstances,
  canShowBatches,
  findDistributionUnit,
  flattenDistributionDetails,
  formatItemDate,
  formatItemLabel,
  formatQuantity,
  formatTrackingTypeLabel,
  isLowStock,
  itemStatusTone,
  toNumber,
  type ItemDistributionAllocation,
  type ItemDistributionDetailRow,
  type ItemDistributionStore,
  type ItemDistributionUnit,
  type ItemScopeOption,
  type ItemScopeOptionsResponse,
  type DepreciationSummary,
  type ItemRecord,
  type ItemStatusTone,
} from "@/lib/itemUi";
import { relTime } from "@/lib/userUiShared";
import workspaceStyles from "./ItemWorkspace.module.css";

export const Ic = ({ d, size = 16 }: { d: ReactNode | string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true" focusable="false">
    {typeof d === "string" ? <path d={d} /> : d}
  </svg>
);

type WorkspaceFilterKey = "all" | "individual" | "perishable" | "low" | "out";
type ItemsAlertFocus = "out-of-stock" | "low-stock" | "expired-batches" | "expiring-batches";

function parseItemsListSearch(searchParams: URLSearchParams): { filterKey: WorkspaceFilterKey; alertFocus: ItemsAlertFocus | null } {
  const focusParam = searchParams.get("focus");
  const alertFocus = focusParam === "out-of-stock"
    || focusParam === "low-stock"
    || focusParam === "expired-batches"
    || focusParam === "expiring-batches"
    ? focusParam
    : null;

  const stockParam = searchParams.get("stock");
  if (stockParam === "low" || stockParam === "out") {
    return { filterKey: stockParam, alertFocus };
  }

  const trackingParam = searchParams.get("tracking");
  if (trackingParam === "individual") {
    return { filterKey: "individual", alertFocus };
  }
  if (trackingParam === "perishable" || trackingParam === "batches" || trackingParam === "lots") {
    return { filterKey: "perishable", alertFocus };
  }

  if (alertFocus === "out-of-stock") {
    return { filterKey: "out", alertFocus };
  }
  if (alertFocus === "low-stock") {
    return { filterKey: "low", alertFocus };
  }
  if (alertFocus === "expired-batches" || alertFocus === "expiring-batches") {
    return { filterKey: "perishable", alertFocus };
  }

  return { filterKey: "all", alertFocus };
}

function getItemsAlertFocusConfig(alertFocus: ItemsAlertFocus | null) {
  switch (alertFocus) {
    case "out-of-stock":
      return {
        tone: "critical" as const,
        title: "Out-of-stock alert focus",
        message: "Showing items that are currently at zero stock in your visible scope.",
        openLabel: "Open",
        openTitle: "Open item workspace",
        preferBatchesTab: false,
      };
    case "low-stock":
      return {
        tone: "warning" as const,
        title: "Low-stock alert focus",
        message: "Showing items that are at or below their configured low-stock threshold in your visible scope.",
        openLabel: "Open",
        openTitle: "Open item workspace",
        preferBatchesTab: false,
      };
    case "expired-batches":
      return {
        tone: "critical" as const,
        title: "Expired batch alert focus",
        message: "Showing batch / lot tracked items. Use Open batches to jump straight into the item batches view and review the expired lots in your visible stores.",
        openLabel: "Open batches",
        openTitle: "Open item batches",
        preferBatchesTab: true,
      };
    case "expiring-batches":
      return {
        tone: "warning" as const,
        title: "Expiring batch alert focus",
        message: "Showing batch / lot tracked items. Use Open batches to jump straight into the item batches view and review lots that expire soon.",
        openLabel: "Open batches",
        openTitle: "Open item batches",
        preferBatchesTab: true,
      };
    default:
      return null;
  }
}

const ITEMS_PAGE_SIZE = 15;
const ITEM_DISTRIBUTION_PAGE_SIZE = 12;
const ITEM_DETAIL_ROWS_PAGE_SIZE = 12;
const ITEM_RELATED_RECORDS_PAGE_SIZE = 12;
const EMPTY_SCOPE_TOKENS: string[] = [];

export type WorkspaceLocationPanelState = {
  key: string;
  unitId: number;
  eyebrow: string;
  title: string;
  subtitle: string;
  locationId: string | null;
  quantity: number;
  availableQuantity: number | null;
  allocatedQuantity: number | null;
  inTransitQuantity: number | null;
  stores: ItemDistributionStore[];
  allocations: ItemDistributionAllocation[];
};

export function workspaceTrackingIcon(trackingType: string | null | undefined) {
  if (trackingType === "INDIVIDUAL") {
    return <Ic d={<><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="M3.3 7 12 12l8.7-5M12 22V12" /></>} size={14} />;
  }
  if (trackingType === "QUANTITY") {
    return <Ic d={<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><path d="M14 2v6h6" /></>} size={14} />;
  }
  return <Ic d={<><path d="M9 2v6L4 20a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2L15 8V2" /><path d="M8 2h8M7 14h10" /></>} size={14} />;
}

export function workspaceLocationIcon(kind: "unit" | "store" | "person" | "location" | "repair") {
  if (kind === "unit") {
    return <Ic d={<><rect x="4" y="2" width="16" height="20" rx="1" /><path d="M9 6h6M9 10h6M9 14h6M9 18h2" /></>} size={14} />;
  }
  if (kind === "store") {
    return <Ic d={<><rect x="3" y="6" width="18" height="4" /><rect x="3" y="14" width="18" height="4" /></>} size={14} />;
  }
  if (kind === "person") {
    return <Ic d={<><circle cx="12" cy="8" r="4" /><path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8" /></>} size={14} />;
  }
  if (kind === "repair") {
    return <Ic d="M14.7 6.3a4 4 0 0 1 5.4 5.4l-9.4 9.4-3.4 1.2 1.2-3.4 9.4-9.4-3.2-3.2" size={14} />;
  }
  return <Ic d={<><path d="M12 21s-7-6.5-7-12a7 7 0 1 1 14 0c0 5.5-7 12-7 12Z" /><circle cx="12" cy="9" r="2.5" /></>} size={14} />;
}

export function workspaceTrackingTone(trackingType: string | null | undefined) {
  if (trackingType === "INDIVIDUAL") return "individual";
  if (trackingType === "QUANTITY") return "quantity";
  return "perishable";
}

export function workspaceLastUpdate(item: Pick<ItemRecord, "updated_at" | "created_at">) {
  return formatItemDate(item.updated_at ?? item.created_at, "Unknown");
}

function ItemTimestampCell({ value, fallback }: { value: string | null | undefined; fallback: string }) {
  if (!value) {
    return <div className="login-cell"><div>{fallback}</div></div>;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return <div className="login-cell"><div>{fallback}</div></div>;
  }

  return (
    <div className="login-cell" title={formatItemDate(value, fallback)}>
      <div>{relTime(value)}</div>
      <div className="login-cell-sub mono">{date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</div>
    </div>
  );
}

export function buildUnitPanelState(item: ItemRecord, unit: ItemDistributionUnit): WorkspaceLocationPanelState {
  return {
    key: `unit-${unit.id}`,
    unitId: unit.id,
    eyebrow: "Standalone location",
    title: unit.name,
    subtitle: `${unit.code} · ${formatQuantity(unit.totalQuantity)} ${item.acct_unit ?? "unit"} of ${item.name}`,
    locationId: String(unit.id),
    quantity: unit.totalQuantity,
    availableQuantity: unit.availableQuantity,
    allocatedQuantity: unit.allocatedQuantity,
    inTransitQuantity: unit.inTransitQuantity,
    stores: unit.stores,
    allocations: unit.allocations,
  };
}

export function buildStorePanelState(item: ItemRecord, unit: ItemDistributionUnit, store: ItemDistributionStore): WorkspaceLocationPanelState {
  return {
    key: `store-${store.id}`,
    unitId: unit.id,
    eyebrow: store.isStore ? "Store row" : "Location row",
    title: store.locationName,
    subtitle: `${unit.name} · ${store.batchNumber ? `Batch ${store.batchNumber} · ` : ""}${formatQuantity(store.quantity)} ${item.acct_unit ?? "unit"}`,
    locationId: String(store.locationId),
    quantity: store.quantity,
    availableQuantity: store.availableQuantity,
    allocatedQuantity: store.allocatedTotal,
    inTransitQuantity: store.inTransitQuantity,
    stores: [],
    allocations: unit.allocations.filter(allocation => allocation.sourceStoreId === store.id),
  };
}

export function buildAllocationPanelState(item: ItemRecord, unit: ItemDistributionUnit, allocation: ItemDistributionAllocation): WorkspaceLocationPanelState {
  return {
    key: `allocation-${allocation.id}`,
    unitId: unit.id,
    eyebrow: allocation.targetType === "PERSON" ? "Allocated to person" : "Allocated to location",
    title: allocation.targetName,
    subtitle: `${allocation.sourceStoreName} · ${formatQuantity(allocation.quantity)} ${item.acct_unit ?? "unit"} of ${item.name}`,
    locationId: allocation.locationId != null ? String(allocation.locationId) : null,
    quantity: allocation.quantity,
    availableQuantity: null,
    allocatedQuantity: allocation.quantity,
    inTransitQuantity: null,
    stores: [],
    allocations: [],
  };
}

export function buildCategoryPath(categoryId: number | string | null | undefined, categories: CategoryRecord[], fallback?: string | null) {
  const parsed = Number(categoryId);
  if (!Number.isFinite(parsed) || !categories.length) return fallback ?? null;

  const byId = new Map(categories.map(category => [category.id, category]));
  const parts: string[] = [];
  let current = byId.get(parsed) ?? null;
  const seen = new Set<number>();

  while (current && !seen.has(current.id)) {
    parts.unshift(current.name);
    seen.add(current.id);
    current = current.parent_category != null ? byId.get(current.parent_category) ?? null : null;
  }

  return parts.length ? parts.join(" / ") : fallback ?? null;
}

type Density = "compact" | "balanced" | "comfortable";

type ItemFormState = {
  name: string;
  code: string;
  category: string;
  acct_unit: string;
  low_stock_threshold: string;
  description: string;
  specifications: string;
  is_active: boolean;
};

type ItemInstanceRecord = {
  id: number;
  item: number;
  item_name?: string | null;
  item_code?: string | null;
  item_category_name?: string | null;
  item_model_number?: string | null;
  serial_number: string;
  qr_code?: string | null;
  qr_code_image?: string | null;
  current_location: number | null;
  location_name?: string | null;
  location_code?: string | null;
  full_location_path?: string | null;
  status: string;
  in_charge?: string | null;
  authority_store_name?: string | null;
  authority_store_code?: string | null;
  inspection_certificate?: string | null;
  inspection_certificate_id?: number | null;
  allocated_to?: string | null;
  allocated_to_type?: string | null;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  created_by_name?: string | null;
  depreciation_summary?: DepreciationSummary | null;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

type ItemBatchRecord = {
  id: number;
  item: number;
  item_name?: string | null;
  item_code?: string | null;
  batch_number: string;
  manufactured_date?: string | null;
  expiry_date?: string | null;
  quantity?: number | string | null;
  available_quantity?: number | string | null;
  in_transit_quantity?: number | string | null;
  allocated_quantity?: number | string | null;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  created_by_name?: string | null;
  depreciation_summary?: DepreciationSummary | null;
};

export function normalizeList<T>(data: Page<T> | T[]) {
  return Array.isArray(data) ? data : data.results;
}

function buildScopeQuery(scopeTokens: string[]) {
  if (!scopeTokens.length) return "";
  return scopeTokens.map(token => `scope=${encodeURIComponent(token)}`).join("&");
}

export function scopeFilterOptions(options: ItemScopeOption[]): MultiSelectFilterOption[] {
  return options.map(option => ({
    id: option.id,
    label: option.label,
    meta: option.kind === "store" ? "Store" : option.kind === "all" ? "Default" : "Standalone",
  }));
}

function getMediaHref(file: string | null | undefined) {
  if (!file) return null;
  return file.startsWith("http") ? file : `${API_BASE}${file}`;
}

export function Alert({ children, onDismiss, action }: { children: ReactNode; onDismiss?: () => void; action?: ReactNode }) {
  return (
    <div style={{ padding: "12px 16px", background: "var(--danger-weak)", border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)", borderRadius: "var(--radius)", color: "var(--danger)", fontSize: 13, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span>{children}</span>
      <div style={{ display: "flex", gap: 8 }}>
        {action}
        {onDismiss && (
          <button type="button" className="btn btn-xs btn-ghost" onClick={onDismiss}>
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}

function DensityToggle({ density, setDensity }: { density: Density; setDensity: (density: Density) => void }) {
  return (
    <div className="seg">
      {(["compact", "balanced", "comfortable"] as const).map(option => (
        <button type="button" key={option} className={"seg-btn" + (density === option ? " active" : "")} onClick={() => setDensity(option)}>
          {option.charAt(0).toUpperCase() + option.slice(1)}
        </button>
      ))}
    </div>
  );
}

function StatusPill({ active, tone, label }: { active?: boolean; tone?: ItemStatusTone | "danger"; label?: string }) {
  const resolvedTone = tone ?? (active ? "success" : "disabled");
  const className = resolvedTone === "success"
    ? "pill pill-success"
    : resolvedTone === "warning"
      ? "pill pill-warning"
    : resolvedTone === "danger"
      ? "pill pill-danger"
      : "pill pill-neutral";
  return (
    <span className={className}>
      <span className={"status-dot " + (resolvedTone === "success" ? "active" : "inactive")} />
      {label ?? (resolvedTone === "danger" ? "Out of Stock" : resolvedTone === "disabled" ? "Disabled" : "In Stock")}
    </span>
  );
}

function EmptyTableRow({ colSpan, message }: { colSpan: number; message: string }) {
  return (
    <tr>
      <td colSpan={colSpan}>
        <div style={{ padding: "32px 12px", textAlign: "center", color: "var(--text-2)", fontSize: 13 }}>
          {message}
        </div>
      </td>
    </tr>
  );
}

export function DetailKV({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="detail-kv">
      <div className="detail-kv-label">{label}</div>
      <div className="detail-kv-value">{value || "-"}</div>
      {sub ? <div className="detail-kv-sub">{sub}</div> : null}
    </div>
  );
}

function Field({ label, required, error, hint, children, span = 1 }: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
  span?: number;
}) {
  return (
    <div className={"field" + (error ? " has-error" : "")} style={{ gridColumn: `span ${span}` }}>
      <div className="field-label">{label}{required && <span className="field-req">*</span>}</div>
      {children}
      {error ? <div className="field-error">{error}</div> : hint ? <div className="field-hint">{hint}</div> : null}
    </div>
  );
}

function Section({ n, title, sub, children }: { n: number; title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="form-section">
      <header className="form-section-head">
        <div className="form-section-n mono">{String(n).padStart(2, "0")}</div>
        <div>
          <h3>{title}</h3>
          {sub && <div className="form-section-sub">{sub}</div>}
        </div>
      </header>
      <div className="form-section-body">{children}</div>
    </section>
  );
}

function itemForm(item: ItemRecord | null): ItemFormState {
  return {
    name: item?.name ?? "",
    code: item?.code ?? "",
    category: item?.category == null ? "" : String(item.category),
    acct_unit: item?.acct_unit ?? "",
    low_stock_threshold: item?.low_stock_threshold == null ? "" : String(item.low_stock_threshold),
    description: item?.description ?? "",
    specifications: item?.specifications ?? "",
    is_active: item?.is_active ?? true,
  };
}

function itemPayload(form: ItemFormState, options?: { provisionalInspectionId?: number | null }) {
  return {
    name: form.name.trim(),
    code: form.code.trim().toUpperCase(),
    category: Number(form.category),
    acct_unit: form.acct_unit.trim(),
    low_stock_threshold: Number(form.low_stock_threshold),
    description: form.description.trim() || null,
    specifications: form.specifications.trim() || null,
    is_active: form.is_active,
    ...(options?.provisionalInspectionId
      ? {
          is_provisional: true,
          provisional_inspection: options.provisionalInspectionId,
        }
      : {}),
  };
}

export function isFixedAssetItem(item: Pick<ItemRecord, "category_type"> | null | undefined) {
  return item?.category_type === "FIXED_ASSET";
}

export function isFixedAssetLotItem(item: Pick<ItemRecord, "category_type" | "tracking_type"> | null | undefined) {
  return item?.category_type === "FIXED_ASSET" && item.tracking_type === "QUANTITY";
}

export function batchLabelForItem(item: Pick<ItemRecord, "category_type" | "tracking_type"> | null | undefined, plural = true) {
  if (isFixedAssetLotItem(item)) return plural ? "Asset Lots" : "Asset Lot";
  return plural ? "Batches" : "Batch";
}

export function formatMoneyValue(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(toNumber(value));
}

function LowStockBadge({ item }: { item: Pick<ItemRecord, "is_low_stock" | "low_stock_threshold" | "total_quantity"> }) {
  if (!isLowStock(item)) return null;
  return <StatusPill tone="warning" label="Low Stock" />;
}

export function ItemModal({
  open,
  mode,
  item,
  categories,
  provisionalInspectionId = null,
  onClose,
  onSave,
}: {
  open: boolean;
  mode: "create" | "edit";
  item: ItemRecord | null;
  categories: CategoryRecord[];
  provisionalInspectionId?: number | null;
  onClose: () => void;
  onSave: (savedItem: ItemRecord) => void | Promise<void>;
}) {
  const isEdit = mode === "edit";
  const [form, setForm] = useState<ItemFormState>(() => itemForm(item));
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(itemForm(item));
    setTouched(new Set());
    setSubmitError(null);
    setSubmitting(false);
  }, [item, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const errors = {
    name: touched.has("name") && !form.name.trim() ? "Item name is required." : undefined,
    category: touched.has("category") && !form.category ? "Select a subcategory for this item." : undefined,
    acct_unit: touched.has("acct_unit") && !form.acct_unit.trim() ? "Accounting unit is required." : undefined,
    low_stock_threshold: touched.has("low_stock_threshold") && (!form.low_stock_threshold || !/^\d+$/.test(form.low_stock_threshold) || Number(form.low_stock_threshold) < 1)
      ? "Low-stock threshold must be at least 1."
      : undefined,
  };
  const issueCount = Object.values(errors).filter(Boolean).length;
  const canSave = !submitting && categories.length > 0;
  const categorySetupMessage = categories.length === 0
    ? "Create at least one active subcategory before adding an item here."
    : null;
  const set = (patch: Partial<ItemFormState>) => setForm(prev => ({ ...prev, ...patch }));

  const submit = async () => {
    setTouched(new Set(["name", "category", "acct_unit", "low_stock_threshold"]));

    if (
      !form.name.trim() ||
      !form.category ||
      !form.acct_unit.trim() ||
      !form.low_stock_threshold ||
      !/^\d+$/.test(form.low_stock_threshold) ||
      Number(form.low_stock_threshold) < 1
    ) {
      setSubmitError("Please complete the required fields.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const body = JSON.stringify(itemPayload(form, { provisionalInspectionId }));
      let savedItem: ItemRecord;
      if (isEdit && item) {
        savedItem = await apiFetch<ItemRecord>(`/api/inventory/items/${item.id}/`, { method: "PATCH", body });
      } else {
        savedItem = await apiFetch<ItemRecord>("/api/inventory/items/", { method: "POST", body });
      }
      await onSave(savedItem);
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : (isEdit ? "Failed to update item." : "Failed to create item."));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal modal-lg" role="dialog" aria-modal="true" aria-labelledby="item-modal-title">
        <header className="modal-head">
          <div>
            <div className="eyebrow">Inventory / {isEdit ? "Edit Record" : "New Record"}</div>
            <h2 id="item-modal-title">{isEdit ? "Edit Item" : "Create Item"}</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <Ic d="M6 6l12 12M6 18L18 6" />
          </button>
        </header>

        <div className="modal-body">
          <div style={{ display: "grid", gap: 16, padding: "24px" }}>
            {submitError && (
              <div style={{ padding: "10px 14px", background: "var(--danger-weak)", border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)", borderRadius: "var(--radius)", color: "var(--danger)", fontSize: 13 }}>
                {submitError}
              </div>
            )}
            {categorySetupMessage ? (
              <div style={{ padding: "10px 14px", background: "var(--warning-weak)", border: "1px solid color-mix(in oklch, var(--warn) 30%, transparent)", borderRadius: "var(--radius)", color: "var(--text-1)", fontSize: 13 }}>
                {categorySetupMessage}
              </div>
            ) : null}

            <Section n={1} title="Identity" sub="Core item details used throughout inventory records.">
              <div className="form-grid cols-2">
                <Field label="Item name" required error={errors.name}>
                  <input value={form.name} onChange={e => set({ name: e.target.value })} onBlur={() => setTouched(prev => new Set(prev).add("name"))} placeholder="Enter item name" />
                </Field>
                <Field label="Item code" hint="Leave blank to let the backend generate one.">
                  <input value={form.code} onChange={e => set({ code: e.target.value.toUpperCase() })} placeholder="Enter item code" />
                </Field>
                <Field label="Subcategory" required error={errors.category} span={2} hint={categories.length === 0 ? "You need at least one subcategory before creating items." : "Tracking type is inherited from the selected subcategory."}>
                  <ThemedSelect
                    value={form.category}
                    onChange={value => {
                      set({ category: value });
                      setTouched(prev => new Set(prev).add("category"));
                    }}
                    placeholder="Select subcategory"
                    ariaLabel="Subcategory"
                    disabled={categories.length === 0}
                    options={categories.map(category => ({
                      value: String(category.id),
                      label: category.name,
                      meta: `${category.code} - ${formatItemLabel(category.resolved_tracking_type ?? category.tracking_type)}`,
                    }))}
                  />
                </Field>
                <Field label="Accounting unit" required error={errors.acct_unit}>
                  <input value={form.acct_unit} onChange={e => set({ acct_unit: e.target.value })} onBlur={() => setTouched(prev => new Set(prev).add("acct_unit"))} placeholder="pcs, units, meters" />
                </Field>
                <Field label="Low-stock threshold" required error={errors.low_stock_threshold} hint="Trigger a warning when total stock reaches this quantity or lower.">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={form.low_stock_threshold}
                    onChange={e => set({ low_stock_threshold: e.target.value })}
                    onBlur={() => setTouched(prev => new Set(prev).add("low_stock_threshold"))}
                    placeholder="Enter minimum threshold"
                  />
                </Field>
                <Field label="Active state">
                  <div className="seg seg-inline">
                    <button type="button" className={"seg-btn" + (form.is_active ? " active" : "")} onClick={() => set({ is_active: true })}>Active</button>
                    <button type="button" className={"seg-btn" + (!form.is_active ? " active" : "")} onClick={() => set({ is_active: false })}>Disabled</button>
                  </div>
                </Field>
              </div>
            </Section>

            <Section n={2} title="Description" sub="Optional searchable context for specifications and procurement details.">
              <div className="form-grid cols-1">
                <Field label="Description">
                  <textarea className="textarea-field" rows={3} value={form.description} onChange={e => set({ description: e.target.value })} placeholder="Short description" />
                </Field>
                <Field label="Specifications">
                  <textarea className="textarea-field" rows={4} value={form.specifications} onChange={e => set({ specifications: e.target.value })} placeholder="Technical specifications" />
                </Field>
              </div>
            </Section>
          </div>
        </div>

        <footer className="modal-foot">
          <div className="modal-foot-meta mono">
            {issueCount > 0
              ? <span className="foot-err">{issueCount} issue{issueCount > 1 ? "s" : ""} to resolve</span>
              : <span className="foot-ok">Item record ready</span>}
          </div>
          <div className="modal-foot-actions">
            <button type="button" className="btn btn-md" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-md btn-primary" onClick={submit} disabled={!canSave}>{submitting ? "Saving..." : isEdit ? "Save changes" : "Create item"}</button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function ItemActions({
  item,
  openHref,
  openLabel,
  openTitle,
  canEdit,
  canDelete,
  pageBusy,
  deleteBusy,
  onEdit,
  onDelete,
}: {
  item: ItemRecord;
  openHref: string;
  openLabel: string;
  openTitle: string;
  canEdit: boolean;
  canDelete: boolean;
  pageBusy: boolean;
  deleteBusy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="row-actions">
      <Link className="btn btn-xs btn-ghost row-action" href={openHref} onClick={event => event.stopPropagation()} title={openTitle}>
        <Ic d="M9 18l6-6-6-6" size={13} />
        <span className="ra-label">{openLabel}</span>
      </Link>
      {canEdit && (
        <button type="button" className="btn btn-xs btn-ghost row-action" onClick={event => { event.stopPropagation(); onEdit(); }} title="Edit item" disabled={pageBusy}>
          <Ic d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" size={13} />
          <span className="ra-label">Edit</span>
        </button>
      )}
      {canDelete && (
        <button type="button" className="btn btn-xs btn-danger-ghost row-action" onClick={event => { event.stopPropagation(); onDelete(); }} title="Delete item" disabled={pageBusy}>
          <Ic d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0l1 12h6l1-12" size={13} />
          <span className="ra-label">{deleteBusy ? "Deleting..." : "Delete"}</span>
        </button>
      )}
    </div>
  );
}

function ItemCard({
  item,
  canEdit,
  canDelete,
  pageBusy,
  deleteBusy,
  onOpen,
  onEdit,
  onDelete,
}: {
  item: ItemRecord;
  canEdit: boolean;
  canDelete: boolean;
  pageBusy: boolean;
  deleteBusy: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tone = itemStatusTone(item);

  return (
    <div className="user-card" onClick={onOpen} style={{ cursor: "pointer" }}>
      <div className="user-card-head">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <StatusPill tone={tone} label={tone === "danger" ? "Out of Stock" : "In Stock"} />
          <LowStockBadge item={item} />
        </div>
      </div>
      <div className="user-card-name">{item.name}</div>
      <div className="user-card-meta mono">{item.code}</div>
      <div className="user-card-eid mono">{item.acct_unit ?? "unit"}</div>
      <div className="user-card-section">
        <div className="eyebrow">Category</div>
        <div className="group-cell">
          <span className="chip">{item.category_display ?? "Uncategorized"}</span>
          {item.category_type && <span className="muted-note mono">{formatItemLabel(item.category_type)}</span>}
        </div>
      </div>
      <div className="user-card-section">
        <div className="eyebrow">Tracking</div>
        <div className="group-cell">
          <span className="chip">{formatTrackingTypeLabel(item.tracking_type, { compact: true })}</span>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginTop: 12 }}>
        {[
          ["Total", item.total_quantity],
          ["Available", item.available_quantity],
          ["Transit", item.in_transit_quantity],
        ].map(([label, value]) => (
          <div key={String(label)} style={{ border: "1px solid var(--hairline)", borderRadius: 8, padding: 8, background: "var(--surface-2)", textAlign: "center" }}>
            <div className="eyebrow">{label}</div>
            <div className="mono" style={{ color: "var(--text-1)", fontWeight: 700, marginTop: 3 }}>{formatQuantity(value as number | string | null | undefined)}</div>
          </div>
        ))}
      </div>
      <div className="user-card-foot">
        <div>
          <div className="eyebrow">Updated</div>
          <div className="user-card-last mono">{formatItemDate(item.updated_at, "Unknown")}</div>
        </div>
        <div className="row-actions">
          <button type="button" className="btn btn-xs btn-ghost row-action icon-only" onClick={event => { event.stopPropagation(); onOpen(); }} title="Open distribution" disabled={pageBusy}>
            <Ic d="M9 18l6-6-6-6" size={13} />
          </button>
          {canEdit && (
            <button type="button" className="btn btn-xs btn-ghost row-action icon-only" onClick={event => { event.stopPropagation(); onEdit(); }} title="Edit item" disabled={pageBusy}>
              <Ic d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" size={13} />
            </button>
          )}
          {canDelete && (
            <button type="button" className="btn btn-xs btn-danger-ghost row-action icon-only" onClick={event => { event.stopPropagation(); onDelete(); }} title={deleteBusy ? "Deleting item" : "Delete item"} disabled={pageBusy}>
              <Ic d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0l1 12h6l1-12" size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function ItemListView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoading: capsLoading } = useCapabilities();
  const canViewItems = useCan("items");
  const canManageItems = useCan("items", "manage");
  const canDeleteItems = useCan("items", "full");
  const [items, setItems] = useState<ItemRecord[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filterKey, setFilterKey] = useState<WorkspaceFilterKey>(() => parseItemsListSearch(new URLSearchParams(searchParams.toString())).filterKey);
  const [alertFocus, setAlertFocus] = useState<ItemsAlertFocus | null>(() => parseItemsListSearch(new URLSearchParams(searchParams.toString())).alertFocus);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemRecord | null>(null);
  const [busyAction, setBusyAction] = useState<{ kind: "delete"; itemId: number } | null>(null);
  const [density, setDensity] = useState<Density>("balanced");
  const [scopeOptions, setScopeOptions] = useState<ItemScopeOption[]>([]);
  const [defaultScopeTokens, setDefaultScopeTokens] = useState<string[]>([]);
  const [selectedScopeTokens, setSelectedScopeTokens] = useState<string[]>([]);
  const legacyWorkspaceState = useMemo(
    () => parseItemsWorkspaceSearch(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const leafCategories = useMemo(
    () => categories.filter(category => category.parent_category !== null && category.is_active),
    [categories],
  );

  const loadItems = useCallback(async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
    if (showLoading) setIsLoading(true);
    setFetchError(null);
    try {
      const scopeQuery = buildScopeQuery(selectedScopeTokens);
      const [itemsData, categoriesData] = await Promise.all([
        apiFetch<ItemScopeOptionsResponse>("/api/inventory/distribution/scope-options/")
          .then(data => {
            setScopeOptions(data.options);
            setDefaultScopeTokens(data.default);
            if (selectedScopeTokens.length === 0 && data.default.length > 0) {
              setSelectedScopeTokens(data.default);
            }
            return apiFetch<Page<ItemRecord> | ItemRecord[]>(`/api/inventory/items/?page_size=500${scopeQuery ? `&${scopeQuery}` : ""}`);
          }),
        canManageItems
          ? apiFetch<Page<CategoryRecord> | CategoryRecord[]>("/api/inventory/categories/?page_size=500")
          : Promise.resolve([] as CategoryRecord[]),
      ]);
      setItems(normalizeList(itemsData));
      setCategories(normalizeList(categoriesData));
      return true;
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load items");
      return false;
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [canManageItems, selectedScopeTokens]);

  useEffect(() => {
    if (capsLoading) return;
    if (!canViewItems) {
      router.replace("/403");
      return;
    }
    loadItems();
  }, [canViewItems, capsLoading, loadItems, router]);

  useEffect(() => {
    if (legacyWorkspaceState.itemId) {
      router.replace(
        buildItemsWorkspaceHref({
          itemId: legacyWorkspaceState.itemId,
          tab: legacyWorkspaceState.tab,
          locationId: legacyWorkspaceState.locationId,
        }),
        { scroll: false },
      );
    }
  }, [legacyWorkspaceState.itemId, legacyWorkspaceState.locationId, legacyWorkspaceState.tab, router]);

  useEffect(() => {
    const nextSearchState = parseItemsListSearch(new URLSearchParams(searchParams.toString()));
    setFilterKey(nextSearchState.filterKey);
    setAlertFocus(nextSearchState.alertFocus);
  }, [searchParams]);

  const alertFocusConfig = useMemo(() => getItemsAlertFocusConfig(alertFocus), [alertFocus]);

  const getItemOpenHref = useCallback((item: ItemRecord) => {
    if (alertFocusConfig?.preferBatchesTab && canShowBatches(item.tracking_type, item.category_type)) {
      return buildItemsWorkspaceHref({ itemId: item.id, tab: "batches" });
    }
    return `/items/${item.id}`;
  }, [alertFocusConfig]);

  const clearAlertFocus = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("focus");
    params.delete("stock");
    params.delete("tracking");
    setAlertFocus(null);
    const query = params.toString();
    router.replace(query ? `/items?${query}` : "/items", { scroll: false });
  }, [router, searchParams]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(item => {
      if (q) {
        const hay = [
          item.name,
          item.code,
          item.category_display ?? "",
          item.category_type ?? "",
          item.tracking_type ?? "",
          item.acct_unit ?? "",
          item.description ?? "",
          item.specifications ?? "",
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterKey === "individual" && item.tracking_type !== "INDIVIDUAL") return false;
      if (filterKey === "perishable" && !canShowBatches(item.tracking_type, item.category_type)) return false;
      if (filterKey === "low" && !isLowStock(item)) return false;
      if (filterKey === "out" && toNumber(item.total_quantity) > 0) return false;
      return true;
    });
  }, [filterKey, items, search]);

  const {
    page,
    totalPages,
    pageItems: pagedItems,
    pageStart,
    pageEnd,
    setPage,
  } = useClientPagination(filteredItems, ITEMS_PAGE_SIZE, [search, filterKey]);

  const effectiveScopeTokens = selectedScopeTokens.length ? selectedScopeTokens : defaultScopeTokens;
  const handleScopeChange = (nextTokens: string[]) => {
    setSelectedScopeTokens(nextTokens.length ? nextTokens : defaultScopeTokens);
  };

  const openCreateModal = () => {
    setEditingItem(null);
    setModalOpen(true);
  };

  const openEditModal = (item: ItemRecord) => {
    setEditingItem(item);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingItem(null);
  };

  const handleSave = async (_savedItem: ItemRecord) => {
    const refreshed = await loadItems({ showLoading: false });
    if (!refreshed) setActionError("Item saved, but the list could not be refreshed. Reload to resync the list.");
  };

  const handleDelete = async (item: ItemRecord) => {
    if (!canDeleteItems || busyAction) return;
    const confirmed = window.confirm(`Delete ${item.name}? This cannot be undone.`);
    if (!confirmed) return;

    setBusyAction({ kind: "delete", itemId: item.id });
    setActionError(null);
    try {
      await apiFetch(`/api/inventory/items/${item.id}/`, { method: "DELETE" });
      setItems(prev => prev.filter(record => record.id !== item.id));
      const refreshed = await loadItems({ showLoading: false });
      if (!refreshed) setActionError("Item deleted, but the list could not be refreshed. The row was removed locally; reload to resync.");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete item");
    } finally {
      setBusyAction(null);
    }
  };

  const pageBusy = busyAction !== null;
  const deleteBusyItemId = busyAction?.kind === "delete" ? busyAction.itemId : null;

  return (
    <div data-density={density}>
      <ItemModal
        open={modalOpen}
        mode={editingItem ? "edit" : "create"}
        item={editingItem}
        categories={leafCategories}
        onClose={closeModal}
        onSave={handleSave}
      />
      <Topbar breadcrumb={["Inventory", "Items"]} />
      <div className="page">
        {fetchError && (
          <Alert
            onDismiss={() => setFetchError(null)}
            action={<button type="button" className="btn btn-xs" onClick={() => loadItems()}>Retry</button>}
          >
            {fetchError}
          </Alert>
        )}
        {actionError && <Alert onDismiss={() => setActionError(null)}>{actionError}</Alert>}

        <div className="page-head">
          <div className="page-title-group">
            <div className="eyebrow">Inventory</div>
            <h1>Items</h1>
            <div className="page-sub">Browse inventory item definitions and open a full detail workspace from any row.</div>
          </div>
          <div className="page-head-actions">
            <button type="button" className="btn btn-sm btn-ghost">
              <Ic d={<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5M12 3v12" /></>} size={14} />
              Import
            </button>
          </div>
        </div>

        {alertFocusConfig ? (
          <div
            style={{
              padding: "12px 16px",
              borderRadius: 12,
              border: alertFocusConfig.tone === "critical"
                ? "1px solid color-mix(in oklch, var(--danger) 30%, transparent)"
                : "1px solid color-mix(in oklch, var(--warn) 30%, transparent)",
              background: alertFocusConfig.tone === "critical"
                ? "var(--danger-weak)"
                : "color-mix(in oklch, var(--warn) 10%, var(--surface))",
              marginBottom: 16,
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div>
              <div className="eyebrow">Alert focus</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-1)", marginTop: 4 }}>{alertFocusConfig.title}</div>
              <div style={{ fontSize: 13, color: "var(--text-2)", marginTop: 4, maxWidth: 820 }}>{alertFocusConfig.message}</div>
            </div>
            <button type="button" className="btn btn-xs btn-ghost" onClick={clearAlertFocus}>
              Clear
            </button>
          </div>
        ) : null}

        <div className="filter-bar">
          <div className="filter-bar-left">
            <div className="search-input">
              <Ic d={<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>} size={14} />
              <input
                placeholder="Search by item, code, category, unit, or specification..."
                value={search}
                onChange={event => setSearch(event.target.value)}
                aria-label="Search items"
              />
              {search && <button type="button" className="clear-search" onClick={() => setSearch("")}>x</button>}
            </div>

            <div className="filter-select-group">
              <div className="chip-filter-label">Tracking</div>
              <div className="filter-select-wrap">
                <ThemedSelect
                  value={["individual", "perishable"].includes(filterKey) ? filterKey : "all"}
                  onChange={value => {
                    setFilterKey(value as WorkspaceFilterKey);
                    setAlertFocus(null);
                  }}
                  size="compact"
                  ariaLabel="Filter items by tracking"
                  options={[
                    { value: "all", label: "All tracking" },
                    { value: "individual", label: "Individual" },
                    { value: "perishable", label: "Batches/Lots" },
                  ]}
                />
              </div>
            </div>

            <div className="filter-select-group">
              <div className="chip-filter-label">Stock</div>
              <div className="filter-select-wrap">
                <ThemedSelect
                  value={["low", "out"].includes(filterKey) ? filterKey : "all"}
                  onChange={value => {
                    setFilterKey(value as WorkspaceFilterKey);
                    setAlertFocus(null);
                  }}
                  size="compact"
                  ariaLabel="Filter items by stock"
                  options={[
                    { value: "all", label: "All stock" },
                    { value: "low", label: "Low stock" },
                    { value: "out", label: "No stock" },
                  ]}
                />
              </div>
            </div>

            {scopeOptions.length > 1 ? (
              <div className="filter-select-group">
                <div className="chip-filter-label">Scope</div>
                <MultiSelectFilter
                  options={scopeFilterOptions(scopeOptions)}
                  value={effectiveScopeTokens}
                  onChange={handleScopeChange}
                  placeholder="All visible locations"
                  searchPlaceholder="Search locations or stores..."
                  minWidth={260}
                />
              </div>
            ) : null}
          </div>
          <div className="filter-bar-right">
            <DensityToggle density={density} setDensity={setDensity} />
            {canManageItems ? (
              <button type="button" className="btn btn-primary btn-sm" onClick={openCreateModal} disabled={pageBusy}>
                <Ic d="M12 5v14M5 12h14" size={14} />
                New item
              </button>
            ) : null}
          </div>
        </div>

        <div className="table-card">
          <div className="table-card-head">
            <div className="table-card-head-left">
              <div className="eyebrow">Items list</div>
              <div className="table-count">
                <span className="mono">{filteredItems.length}</span>
                <span>of</span>
                <span className="mono">{items.length}</span>
                <span>items</span>
              </div>
            </div>
          </div>
          <div className="h-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Tracking</th>
                  <th>Total</th>
                  <th>Available</th>
                  <th>In Transit</th>
                  <th>Locations</th>
                  <th>Status</th>
                  <th>Updated</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
              {isLoading ? (
                <EmptyTableRow colSpan={9} message="Loading items..." />
              ) : filteredItems.length > 0 ? (
                pagedItems.map(item => {
                  const openHref = getItemOpenHref(item);
                  return (
                    <ItemListTableRow
                      key={item.id}
                      item={item}
                      categoryPath={buildCategoryPath(item.category, categories, item.category_display)}
                      canEdit={canManageItems}
                      canDelete={canDeleteItems}
                      pageBusy={pageBusy}
                      deleteBusy={deleteBusyItemId === item.id}
                      openHref={openHref}
                      openLabel={alertFocusConfig?.openLabel ?? "Open"}
                      openTitle={alertFocusConfig?.openTitle ?? "Open item workspace"}
                      onOpen={() => router.push(openHref)}
                      onEdit={() => openEditModal(item)}
                      onDelete={() => handleDelete(item)}
                    />
                  );
                })
              ) : (
                <EmptyTableRow colSpan={9} message="No items match the current filters." />
              )}
              </tbody>
            </table>
          </div>
          <ListPagination
            summary={filteredItems.length === 0 ? "Showing 0 items" : `Showing ${pageStart}-${pageEnd} of ${filteredItems.length} items`}
            page={page}
            totalPages={totalPages}
            onPrev={() => setPage(current => Math.max(1, current - 1))}
            onNext={() => setPage(current => Math.min(totalPages, current + 1))}
          />
        </div>
      </div>
    </div>
  );
}

function ItemListTableRow({
  item,
  categoryPath,
  canEdit,
  canDelete,
  pageBusy,
  deleteBusy,
  openHref,
  openLabel,
  openTitle,
  onOpen,
  onEdit,
  onDelete,
}: {
  item: ItemRecord;
  categoryPath: string | null;
  canEdit: boolean;
  canDelete: boolean;
  pageBusy: boolean;
  deleteBusy: boolean;
  openHref: string;
  openLabel: string;
  openTitle: string;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const totalQuantity = toNumber(item.total_quantity);
  const standaloneLocationCount = toNumber(item.standalone_location_count);
  const statusTone = itemStatusTone(item);
  const lastUpdated = item.updated_at ?? item.created_at;

  return (
    <tr className="clickable-table-row" onClick={onOpen}>
      <td className="col-user">
        <div className="user-cell">
          <span className={workspaceStyles.itemTableIcon} data-tracking={workspaceTrackingTone(item.tracking_type)}>
            {workspaceTrackingIcon(item.tracking_type)}
          </span>
          <div>
            <div className="user-name">{item.name}</div>
            <div className="user-username mono">{item.code} · {categoryPath ?? item.category_display ?? "Uncategorized"}</div>
          </div>
        </div>
      </td>
      <td><span className="chip">{formatTrackingTypeLabel(item.tracking_type, { compact: true })}</span></td>
      <td className="mono">{formatQuantity(item.total_quantity)} {item.acct_unit ?? "unit"}</td>
      <td className="mono">{formatQuantity(item.available_quantity)}</td>
      <td className="mono">{formatQuantity(item.in_transit_quantity)}</td>
      <td><span className="chip chip-loc">{standaloneLocationCount} {standaloneLocationCount === 1 ? "location" : "locations"}</span></td>
      <td>
        <div className="group-cell">
          <StatusPill tone={statusTone} label={totalQuantity <= 0 ? "Out of Stock" : "In Stock"} />
          <LowStockBadge item={item} />
        </div>
      </td>
      <td className="col-login">
        <ItemTimestampCell value={lastUpdated} fallback="Unknown" />
      </td>
      <td className="col-actions">
        <ItemActions
          item={item}
          openHref={openHref}
          openLabel={openLabel}
          openTitle={openTitle}
          canEdit={canEdit}
          canDelete={canDelete}
          pageBusy={pageBusy}
          deleteBusy={deleteBusy}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </td>
    </tr>
  );
}

export function ItemWorkspaceDetailView({ itemId }: { itemId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoading: capsLoading } = useCapabilities();
  const canViewItems = useCan("items");
  const canManageItems = useCan("items", "manage");
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemRecord | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const workspaceState = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("item", itemId);
    return parseItemsWorkspaceSearch(params);
  }, [itemId, searchParams]);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(workspaceState.locationId);

  const leafCategories = useMemo(
    () => categories.filter(category => category.parent_category !== null && category.is_active),
    [categories],
  );

  const loadCategories = useCallback(async () => {
    if (!canManageItems) {
      setCategories([]);
      return;
    }

    try {
      const categoriesData = await apiFetch<Page<CategoryRecord> | CategoryRecord[]>("/api/inventory/categories/?page_size=500");
      setCategories(normalizeList(categoriesData));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to load item categories.");
    }
  }, [canManageItems]);

  useEffect(() => {
    if (capsLoading) return;
    if (!canViewItems) {
      router.replace("/403");
      return;
    }
    loadCategories();
  }, [canViewItems, capsLoading, loadCategories, router]);

  useEffect(() => {
    setSelectedLocationId(workspaceState.locationId ?? null);
  }, [itemId]);

  useEffect(() => {
    if (workspaceState.locationId) {
      setSelectedLocationId(workspaceState.locationId);
    }
  }, [workspaceState.locationId]);

  const closeModal = () => {
    setModalOpen(false);
    setEditingItem(null);
  };

  const openEditModal = (item: ItemRecord) => {
    setEditingItem(item);
    setModalOpen(true);
  };

  const handleSave = async (_savedItem: ItemRecord) => {
    setRefreshToken(current => current + 1);
  };

  const setWorkspace = useCallback((next: {
    itemId?: string | null;
    tab?: ItemsWorkspaceTab;
    locationId?: string | null;
  }) => {
    const nextItemId = next.itemId !== undefined ? next.itemId : itemId;
    const nextTab = next.tab ?? workspaceState.tab;
    const nextLocationId = next.locationId !== undefined ? next.locationId : selectedLocationId;

    if (!nextItemId) {
      router.replace("/items", { scroll: false });
      return;
    }

    router.replace(
      buildItemsWorkspaceHref({
        itemId: nextItemId,
        tab: nextTab,
        locationId: nextTab === "distribution" ? nextLocationId : null,
      }),
      { scroll: false },
    );
  }, [itemId, router, selectedLocationId, workspaceState.tab]);

  if (capsLoading) {
    return (
      <div>
        <Topbar breadcrumb={["Inventory", "Items", "Item detail"]} />
        <div className="page">
          <div className="detail-card detail-card-body">Loading item permissions...</div>
        </div>
      </div>
    );
  }

  if (!canViewItems) return null;

  return (
    <div data-density="compact">
      <ItemModal
        open={modalOpen}
        mode={editingItem ? "edit" : "create"}
        item={editingItem}
        categories={leafCategories}
        onClose={closeModal}
        onSave={handleSave}
      />
      <Topbar breadcrumb={["Inventory", "Items", "Item detail"]} />
      {actionError ? (
        <div className="page" style={{ paddingTop: 16, paddingBottom: 0 }}>
          <Alert onDismiss={() => setActionError(null)}>{actionError}</Alert>
        </div>
      ) : null}
      <div className={workspaceStyles.detailPageShell}>
        <WorkspaceSelectedItemPane
          itemId={itemId}
          categories={categories}
          activeTab={workspaceState.tab}
          selectedLocationId={selectedLocationId}
          canManageItems={canManageItems}
          refreshToken={refreshToken}
          onBackToList={() => {
            setSelectedLocationId(null);
            router.push("/items");
          }}
          onEditItem={item => openEditModal(item)}
          onSelectLocation={locationId => {
            setSelectedLocationId(locationId);
            setWorkspace({ tab: "distribution", locationId });
          }}
          onClearSelectedLocation={() => {
            setSelectedLocationId(null);
            setWorkspace({ tab: "distribution", locationId: null });
          }}
          onSelectTab={tab => setWorkspace({ tab })}
          onNormalizeState={nextState => {
            if (nextState.locationId !== undefined) {
              setSelectedLocationId(nextState.locationId);
            }
            setWorkspace(nextState);
          }}
        />
      </div>
    </div>
  );
}

function WorkspaceItemRow({
  item,
  categoryPath,
  selected,
  canEdit,
  canDelete,
  pageBusy,
  deleteBusy,
  onSelect,
  onEdit,
  onDelete,
}: {
  item: ItemRecord;
  categoryPath: string | null;
  selected: boolean;
  canEdit: boolean;
  canDelete: boolean;
  pageBusy: boolean;
  deleteBusy: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const totalQuantity = toNumber(item.total_quantity);
  const standaloneLocationCount = toNumber(item.standalone_location_count);
  const rowBadges = [
    isLowStock(item) ? <span key="low" className={`${workspaceStyles.itemRowFlag} ${workspaceStyles.itemRowFlagLow}`}>LOW</span> : null,
    totalQuantity <= 0 ? <span key="out" className={`${workspaceStyles.itemRowFlag} ${workspaceStyles.itemRowFlagDanger}`}>OUT</span> : null,
  ].filter(Boolean);

  const handleRowKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      className={`${workspaceStyles.itemRow} ${selected ? workspaceStyles.itemRowSelected : ""}`}
      onClick={onSelect}
      onKeyDown={handleRowKeyDown}
      data-tracking={workspaceTrackingTone(item.tracking_type)}
    >
      <span className={workspaceStyles.itemRowAvatar}>
        {workspaceTrackingIcon(item.tracking_type)}
      </span>
      <span className={workspaceStyles.itemRowMain}>
        <span className={workspaceStyles.itemRowTitle}>{item.name}</span>
        <span className={workspaceStyles.itemRowMeta}>
          <span className="mono">{item.code}</span>
          <span className={workspaceStyles.itemRowMetaSep}>·</span>
          <span>{categoryPath ?? item.category_display ?? "Uncategorized"}</span>
          <span className={workspaceStyles.itemRowMetaSep}>·</span>
          <span>{standaloneLocationCount} {standaloneLocationCount === 1 ? "location" : "locations"}</span>
        </span>
      </span>
      <span className={workspaceStyles.itemRowSide}>
        <span className={workspaceStyles.itemRowQuantity}>
          {formatQuantity(item.total_quantity)}
          <span className={workspaceStyles.itemRowUnit}>{item.acct_unit ?? "unit"}</span>
        </span>
        {rowBadges.length ? <span className={workspaceStyles.itemRowFlags}>{rowBadges}</span> : null}
        <span className={workspaceStyles.itemRowActions}>
          {canEdit ? (
            <button
              type="button"
              className="btn btn-xs btn-ghost row-action icon-only"
              onClick={event => {
                event.stopPropagation();
                onEdit();
              }}
              title="Edit item"
              disabled={pageBusy}
            >
              <Ic d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" size={13} />
            </button>
          ) : null}
          {canDelete ? (
            <button
              type="button"
              className="btn btn-xs btn-danger-ghost row-action icon-only"
              onClick={event => {
                event.stopPropagation();
                onDelete();
              }}
              title={deleteBusy ? "Deleting item" : "Delete item"}
              disabled={pageBusy}
            >
              <Ic d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0l1 12h6l1-12" size={13} />
            </button>
          ) : null}
        </span>
      </span>
    </div>
  );
}

function WorkspaceEmptyState() {
  return (
    <div className={workspaceStyles.emptyState}>
      <div className={workspaceStyles.emptyBadge}>Item workspace</div>
      <h2 className={workspaceStyles.emptyTitle}>Select an item from the left</h2>
      <p className={workspaceStyles.emptyCopy}>
        Distribution, instances, and batches will open here in one continuous workspace instead of sending you through nested item routes.
      </p>
    </div>
  );
}

function WorkspaceTabButton({
  active,
  count,
  children,
  onClick,
}: {
  active: boolean;
  count?: number;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`${workspaceStyles.tabButton} ${active ? workspaceStyles.tabButtonActive : ""}`}
      onClick={onClick}
    >
      <span>{children}</span>
      {typeof count === "number" ? <span className={workspaceStyles.tabCount}>{count}</span> : null}
    </button>
  );
}

function WorkspaceMetric({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className={workspaceStyles.metricCard}>
      <div className={workspaceStyles.metricLabel}>{label}</div>
      <div className={workspaceStyles.metricValue}>{value}</div>
      {sub ? <div className={workspaceStyles.metricSub}>{sub}</div> : null}
    </div>
  );
}

type LocateRow =
  | { kind: "location"; key: string; name: string; code: string; path: string; qty: number; unit: string; jump: { unitId: number; storeId?: number } }
  | { kind: "person"; key: string; name: string; tag: string; path: string; jump: { unitId: number; storeId?: number } }
  | { kind: "store"; key: string; name: string; code: string; path: string; qty: number; unit: string; jump: { unitId: number; storeId: number } };

function WorkspaceLocatePalette({
  open,
  onClose,
  item,
  units,
  onJump,
}: {
  open: boolean;
  onClose: () => void;
  item: ItemRecord;
  units: ItemDistributionUnit[];
  onJump: (target: { unitId: number; storeId?: number }) => void;
}) {
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const allRows = useMemo<LocateRow[]>(() => {
    const acctUnit = item.acct_unit ?? "unit";
    const out: LocateRow[] = [];
    units.forEach(unit => {
      out.push({
        kind: "location",
        key: `unit-${unit.id}`,
        name: unit.name,
        code: unit.code,
        path: unit.name,
        qty: toNumber(unit.totalQuantity),
        unit: acctUnit,
        jump: { unitId: unit.id },
      });
      unit.stores.forEach(store => {
        out.push({
          kind: "store",
          key: `store-${store.id}`,
          name: store.locationName,
          code: store.batchNumber ? `Batch ${store.batchNumber}` : "",
          path: `${unit.name} › ${store.locationName}`,
          qty: toNumber(store.quantity),
          unit: acctUnit,
          jump: { unitId: unit.id, storeId: store.id },
        });
      });
      unit.allocations.forEach(allocation => {
        if (allocation.targetType === "PERSON") {
          out.push({
            kind: "person",
            key: `alloc-${allocation.id}`,
            name: allocation.targetName,
            tag: allocation.batchNumber ? `Batch ${allocation.batchNumber}` : `${formatQuantity(allocation.quantity)} ${acctUnit}`,
            path: `${unit.name} › ${allocation.sourceStoreName}`,
            jump: { unitId: unit.id, storeId: allocation.sourceStoreId },
          });
        }
      });
    });
    return out;
  }, [item.acct_unit, units]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter(row => {
      const hay = (
        row.name +
        " " +
        ("code" in row ? row.code : "") +
        " " +
        row.path +
        " " +
        ("tag" in row ? row.tag : "")
      ).toLowerCase();
      return hay.includes(q);
    });
  }, [allRows, query]);

  const grouped = useMemo(() => {
    const locations = filtered.filter(r => r.kind === "location") as Extract<LocateRow, { kind: "location" }>[];
    const stores = filtered.filter(r => r.kind === "store") as Extract<LocateRow, { kind: "store" }>[];
    const persons = filtered.filter(r => r.kind === "person") as Extract<LocateRow, { kind: "person" }>[];
    return { locations, stores, persons };
  }, [filtered]);

  if (!open) return null;

  const itemShortName = item.name.split("—")[0].trim();

  return (
    <>
      <button type="button" className={workspaceStyles.locateBackdrop} onClick={onClose} aria-label="Close locate" />
      <div className={workspaceStyles.locatePanel} role="dialog" aria-label="Locate within item">
        <div className={workspaceStyles.locateSearch}>
          <Ic d={<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>} size={14} />
          <input
            autoFocus
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={`Find a location, store row or person within ${itemShortName}…`}
            onKeyDown={event => {
              if (event.key === "Escape") onClose();
              if (event.key === "Enter" && filtered.length) {
                onJump(filtered[0].jump);
                onClose();
              }
            }}
          />
          <span className={workspaceStyles.locateSearchEsc}>esc</span>
        </div>
        <div className={workspaceStyles.locateResults}>
          {filtered.length === 0 ? (
            <div className={workspaceStyles.locateEmpty}>No matches</div>
          ) : (
            <>
              {grouped.locations.length > 0 && (
                <>
                  <div className={workspaceStyles.locateSectionH}>Locations · {grouped.locations.length}</div>
                  {grouped.locations.slice(0, 10).map(row => (
                    <button
                      key={row.key}
                      type="button"
                      className={workspaceStyles.locateRow}
                      onClick={() => { onJump(row.jump); onClose(); }}
                    >
                      <span className={workspaceStyles.locateRowIcon}>
                        <Ic d={<><path d="M12 21s-7-6.5-7-12a7 7 0 1 1 14 0c0 5.5-7 12-7 12Z" /><circle cx="12" cy="9" r="2.5" /></>} size={14} />
                      </span>
                      <span className={workspaceStyles.locateRowText}>
                        <span className={workspaceStyles.locateRowName}>{row.name}</span>
                        <span className={workspaceStyles.locateRowPath}>{row.code ? `${row.code} · ` : ""}{row.path}</span>
                      </span>
                      <span className={workspaceStyles.locateRowQty}>{formatQuantity(row.qty)} {row.unit}</span>
                    </button>
                  ))}
                </>
              )}
              {grouped.stores.length > 0 && (
                <>
                  <div className={workspaceStyles.locateSectionH}>Store rows · {grouped.stores.length}</div>
                  {grouped.stores.slice(0, 10).map(row => (
                    <button
                      key={row.key}
                      type="button"
                      className={workspaceStyles.locateRow}
                      onClick={() => { onJump(row.jump); onClose(); }}
                    >
                      <span className={workspaceStyles.locateRowIcon}>
                        <Ic d={<><rect x="3" y="6" width="18" height="4" /><rect x="3" y="14" width="18" height="4" /></>} size={14} />
                      </span>
                      <span className={workspaceStyles.locateRowText}>
                        <span className={workspaceStyles.locateRowName}>{row.name}</span>
                        <span className={workspaceStyles.locateRowPath}>{row.code ? `${row.code} · ` : ""}{row.path}</span>
                      </span>
                      <span className={workspaceStyles.locateRowQty}>{formatQuantity(row.qty)} {row.unit}</span>
                    </button>
                  ))}
                </>
              )}
              {grouped.persons.length > 0 && (
                <>
                  <div className={workspaceStyles.locateSectionH}>Allocated to persons · {grouped.persons.length}</div>
                  {grouped.persons.slice(0, 10).map(row => (
                    <button
                      key={row.key}
                      type="button"
                      className={workspaceStyles.locateRow}
                      onClick={() => { onJump(row.jump); onClose(); }}
                    >
                      <span className={workspaceStyles.locateRowIcon}>
                        <Ic d={<><circle cx="12" cy="8" r="4" /><path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8" /></>} size={14} />
                      </span>
                      <span className={workspaceStyles.locateRowText}>
                        <span className={workspaceStyles.locateRowName}>{row.name}</span>
                        <span className={workspaceStyles.locateRowPath}>{row.tag} · {row.path}</span>
                      </span>
                      <span className={workspaceStyles.locateRowQty}>allocated</span>
                    </button>
                  ))}
                </>
              )}
            </>
          )}
        </div>
        <div className={workspaceStyles.locateFoot}>
          <div className={workspaceStyles.locateKeys}>
            <span><span className={workspaceStyles.locateKbd}>⏎</span> jump to</span>
            <span><span className={workspaceStyles.locateKbd}>esc</span> close</span>
          </div>
          <div>{filtered.length} results</div>
        </div>
      </div>
    </>
  );
}

function WorkspaceSelectedItemPane({
  itemId,
  categories,
  activeTab,
  selectedLocationId,
  canManageItems,
  refreshToken,
  onBackToList,
  onEditItem,
  onSelectLocation,
  onClearSelectedLocation,
  onSelectTab,
  onNormalizeState,
}: {
  itemId: string;
  categories: CategoryRecord[];
  activeTab: ItemsWorkspaceTab;
  selectedLocationId: string | null;
  canManageItems: boolean;
  refreshToken: number;
  onBackToList: () => void;
  onEditItem: (item: ItemRecord) => void;
  onSelectLocation: (locationId: string | null) => void;
  onClearSelectedLocation: () => void;
  onSelectTab: (tab: ItemsWorkspaceTab) => void;
  onNormalizeState: (state: ItemsWorkspaceState) => void;
}) {
  const router = useRouter();
  const [locateOpen, setLocateOpen] = useState(false);
  const [jumpTarget, setJumpTarget] = useState<{ unitId: number; storeId?: number; nonce: number } | null>(null);
  const [selectedScopeTokens, setSelectedScopeTokens] = useState<string[]>([]);
  const {
    item,
    units,
    scopeOptions,
    defaultScopeTokens,
    isLoading,
    fetchError,
    setFetchError,
    load,
  } = useItemDistribution(itemId, selectedScopeTokens);
  const effectiveScopeTokens = selectedScopeTokens.length ? selectedScopeTokens : defaultScopeTokens;

  useEffect(() => {
    load();
  }, [load, refreshToken]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (item) {
          event.preventDefault();
          setLocateOpen(true);
        }
        return;
      }
      if (event.key === "Escape") {
        setLocateOpen(current => (current ? false : current));
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [item]);

  useEffect(() => {
    if (!item) return;

    const normalized = normalizeItemsWorkspaceState(
      {
        itemId,
        tab: activeTab,
        locationId: selectedLocationId,
      },
      {
        canShowInstances: canShowInstances(item.tracking_type),
        canShowBatches: canShowBatches(item.tracking_type, item.category_type),
      },
    );

    if (
      normalized.tab !== activeTab ||
      normalized.locationId !== selectedLocationId
    ) {
      onNormalizeState(normalized);
    }
  }, [activeTab, item, itemId, onNormalizeState, selectedLocationId]);

  const totalQuantity = toNumber(item?.total_quantity);
  const availableQuantity = toNumber(item?.available_quantity);
  const inTransitQuantity = toNumber(item?.in_transit_quantity);
  const issuedQuantity = Math.max(totalQuantity - availableQuantity - inTransitQuantity, 0);
  const lowStockThreshold = toNumber(item?.low_stock_threshold);
  const categoryPath = item ? buildCategoryPath(item.category, categories, item.category_display) : null;
  const instanceCount = item && canShowInstances(item.tracking_type) ? totalQuantity : undefined;
  const batchCount = item && canShowBatches(item.tracking_type, item.category_type) ? undefined : undefined;

  if (isLoading && !item) {
    return (
      <div className={workspaceStyles.detailEmptyState}>
        <div className={workspaceStyles.detailEmptyCopy}>Loading item workspace...</div>
      </div>
    );
  }

  return (
    <div className={workspaceStyles.detailStack}>
      {fetchError ? (
        <Alert onDismiss={() => setFetchError(null)} action={<button type="button" className="btn btn-xs" onClick={() => load()}>Retry</button>}>
          {fetchError}
        </Alert>
      ) : null}

      {item ? (
        <>
          <div className={workspaceStyles.mobileBackRow}>
            <button type="button" className={workspaceStyles.mobileBackButton} onClick={onBackToList}>
              <Ic d="M19 12H5M12 19l-7-7 7-7" size={12} />
              Back to items
            </button>
          </div>

          <div className={workspaceStyles.detailHeader}>
            <div className={workspaceStyles.detailHeaderMain}>
              <div className="eyebrow">{(categoryPath ?? item.category_display ?? "Inventory item").toUpperCase()}</div>
              <h2 className={workspaceStyles.detailTitle}>{item.name}</h2>
              <div className={workspaceStyles.detailIdentityRow}>
                <span className={workspaceStyles.detailCodeChip}>{item.code}</span>
                <span className={workspaceStyles.detailTrackingPill} data-t={workspaceTrackingTone(item.tracking_type)}>
                  <span className={workspaceStyles.detailTrackingDot} />
                  {item.tracking_type === "INDIVIDUAL" ? "Individual tracking" : isFixedAssetLotItem(item) ? "Asset lot tracking" : item.tracking_type === "QUANTITY" ? "Quantity tracking" : "Perishable batches"}
                </span>
              </div>
              <div className={workspaceStyles.detailMeta}>
                <span>Last movement <strong>{workspaceLastUpdate(item)}</strong></span>
                {item.created_by_name ? (
                  <>
                    <span className={workspaceStyles.detailSubSep}>·</span>
                    <span>{item.created_by_name}</span>
                  </>
                ) : null}
              </div>
            </div>
            <div className={workspaceStyles.detailHeaderActions}>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => onSelectTab("instances")}>
                <Ic d={<><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3M21 14v7M14 21h3" /></>} size={14} />
                QR labels
              </button>
              <button type="button" className="btn btn-sm btn-ghost" onClick={() => window.print()}>
                <Ic d={<><path d="M6 9V2h12v7" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v8H6z" /></>} size={14} />
                Print card
              </button>
              {canManageItems ? (
                <button type="button" className="btn btn-sm" onClick={() => onEditItem(item)}>
                  <Ic d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7M18.5 2.5a2.1 2.1 0 113 3L12 15l-4 1 1-4 9.5-9.5Z" size={14} />
                  Edit item
                </button>
              ) : null}
              <button type="button" className="btn btn-primary btn-sm" onClick={() => router.push(`/stock-entries?item=${itemId}`)}>
                <Ic d="M5 12h14M12 5l7 7-7 7" size={14} />
                New entry
              </button>
            </div>
          </div>

          <div className={workspaceStyles.metricGrid}>
            {(() => {
              const unit = item.acct_unit ?? "unit";
              const lowFlag = isLowStock(item);
              if (canShowInstances(item.tracking_type)) {
                return (
                  <>
                    <WorkspaceMetric
                      label="Total units"
                      value={<>{formatQuantity(totalQuantity)}<span className={workspaceStyles.metricUnit}>{unit}</span></>}
                      sub={`across ${units.length} locations`}
                    />
                    <WorkspaceMetric
                      label="Deployed"
                      value={<>{formatQuantity(issuedQuantity)}</>}
                      sub="in active use"
                    />
                    <WorkspaceMetric
                      label="Idle / Stock"
                      value={<span className={lowFlag ? workspaceStyles.metricValueWarn : undefined}>{formatQuantity(availableQuantity)}</span>}
                      sub={`in stores · min ${lowStockThreshold > 0 ? formatQuantity(lowStockThreshold) : "—"}`}
                    />
                    <WorkspaceMetric
                      label="In transit"
                      value={<span className={inTransitQuantity > 0 ? workspaceStyles.metricValueWarn : undefined}>{formatQuantity(inTransitQuantity)}</span>}
                      sub={inTransitQuantity > 0 ? "moving between stores" : "all settled"}
                    />
                  </>
                );
              }
              if (canShowBatches(item.tracking_type, item.category_type)) {
                return (
                  <>
                    <WorkspaceMetric
                      label="Total stock"
                      value={<>{formatQuantity(totalQuantity)}<span className={workspaceStyles.metricUnit}>{unit}</span></>}
                      sub={`across ${units.length} locations`}
                    />
                    <WorkspaceMetric
                      label="Available"
                      value={<>{formatQuantity(availableQuantity)}<span className={workspaceStyles.metricUnit}>{unit}</span></>}
                      sub="usable stock in current scope"
                    />
                    <WorkspaceMetric
                      label="Allocated"
                      value={<>{formatQuantity(Math.max(totalQuantity - availableQuantity - inTransitQuantity, 0))}<span className={workspaceStyles.metricUnit}>{unit}</span></>}
                      sub="committed downstream"
                    />
                    <WorkspaceMetric
                      label="In transit"
                      value={<span className={inTransitQuantity > 0 ? workspaceStyles.metricValueWarn : undefined}>{formatQuantity(inTransitQuantity)}<span className={workspaceStyles.metricUnit}>{unit}</span></span>}
                      sub={inTransitQuantity > 0 ? "moving between stores" : "all settled"}
                    />
                  </>
                );
              }
              return (
                <>
                  <WorkspaceMetric
                    label="Total stock"
                    value={<>{formatQuantity(totalQuantity)}<span className={workspaceStyles.metricUnit}>{unit}</span></>}
                    sub={`across ${units.length} locations`}
                  />
                  <WorkspaceMetric
                    label="Min stock"
                    value={lowStockThreshold > 0 ? <>{formatQuantity(lowStockThreshold)}<span className={workspaceStyles.metricUnit}>{unit}</span></> : "—"}
                    sub="re-order threshold"
                  />
                  <WorkspaceMetric
                    label="Available"
                    value={<span className={lowFlag ? workspaceStyles.metricValueWarn : undefined}>{formatQuantity(availableQuantity)}<span className={workspaceStyles.metricUnit}>{unit}</span></span>}
                    sub={lowFlag ? "below re-order line" : "usable stock"}
                  />
                  <WorkspaceMetric
                    label="In transit"
                    value={<>{formatQuantity(inTransitQuantity)}<span className={workspaceStyles.metricUnit}>{unit}</span></>}
                    sub={inTransitQuantity > 0 ? "moving between stores" : "all settled"}
                  />
                </>
              );
            })()}
          </div>

          {scopeOptions.length > 1 ? (
            <div className="filter-bar">
              <div className="filter-bar-left">
                <div className="filter-select-group">
                  <div className="chip-filter-label">Distribution scope</div>
                  <MultiSelectFilter
                    options={scopeFilterOptions(scopeOptions)}
                    value={effectiveScopeTokens}
                    onChange={tokens => setSelectedScopeTokens(tokens.length ? tokens : defaultScopeTokens)}
                    placeholder="All visible locations"
                    searchPlaceholder="Search locations or stores..."
                    minWidth={300}
                  />
                </div>
              </div>
              <div className="filter-bar-right">
                <button type="button" className="btn btn-xs btn-ghost" onClick={() => setSelectedScopeTokens(defaultScopeTokens)}>
                  Reset
                </button>
              </div>
            </div>
          ) : null}

          {isFixedAssetItem(item) ? (
            <div className="detail-kv-grid" style={{ marginTop: 12 }}>
              <DetailKV label="Capitalized assets" value={<span className="mono">{formatQuantity(item.depreciation_summary?.asset_count ?? (item.depreciation_summary?.capitalized ? 1 : 0))}</span>} />
              <DetailKV label="Original cost" value={formatMoneyValue(item.depreciation_summary?.original_cost)} />
              <DetailKV label="Accumulated depreciation" value={formatMoneyValue(item.depreciation_summary?.accumulated_depreciation)} />
              <DetailKV label="Current WDV / NBV" value={formatMoneyValue(item.depreciation_summary?.current_wdv)} sub={item.depreciation_summary?.latest_posted_fiscal_year ? `FY ${item.depreciation_summary.latest_posted_fiscal_year}-${String(item.depreciation_summary.latest_posted_fiscal_year + 1).slice(-2)}` : "No posted run"} />
            </div>
          ) : null}

          <div className={workspaceStyles.tabBar}>
            <WorkspaceTabButton active={activeTab === "distribution"} count={units.length} onClick={() => onSelectTab("distribution")}>
              Distribution
            </WorkspaceTabButton>
            {canShowInstances(item.tracking_type) ? (
              <WorkspaceTabButton active={activeTab === "instances"} count={instanceCount} onClick={() => onSelectTab("instances")}>
                Instances
              </WorkspaceTabButton>
            ) : null}
            {canShowBatches(item.tracking_type, item.category_type) ? (
              <WorkspaceTabButton active={activeTab === "batches"} count={batchCount} onClick={() => onSelectTab("batches")}>
                {batchLabelForItem(item)}
              </WorkspaceTabButton>
            ) : null}
            <WorkspaceTabButton active={activeTab === "info"} onClick={() => onSelectTab("info")}>
              Item info
            </WorkspaceTabButton>
            <WorkspaceTabButton active={activeTab === "activity"} onClick={() => onSelectTab("activity")}>
              Activity
            </WorkspaceTabButton>
          </div>

          {activeTab === "distribution" ? (
            <WorkspaceDistributionTab
              item={item}
              units={units}
              isLoading={isLoading}
              selectedLocationId={selectedLocationId}
              onSelectLocation={onSelectLocation}
              onClearSelectedLocation={onClearSelectedLocation}
              onSelectTab={onSelectTab}
              onOpenLocate={() => setLocateOpen(true)}
              jumpTarget={jumpTarget}
              onJumpTargetHandled={() => setJumpTarget(null)}
            />
          ) : activeTab === "instances" ? (
            <WorkspaceInstancesTab
              itemId={itemId}
              selectedLocationId={selectedLocationId}
              onClearSelectedLocation={onClearSelectedLocation}
            />
          ) : activeTab === "info" ? (
            <WorkspaceInfoTab item={item} units={units} />
          ) : activeTab === "activity" ? (
            <WorkspaceActivityTab item={item} />
          ) : (
            <WorkspaceBatchesTab
              itemId={itemId}
              selectedLocationId={selectedLocationId}
              onClearSelectedLocation={onClearSelectedLocation}
            />
          )}
        </>
      ) : (
        <div className={workspaceStyles.detailEmptyState}>
          <div className={workspaceStyles.detailEmptyCopy}>This item is no longer available in your current permission scope.</div>
        </div>
      )}
      {item ? (
        <WorkspaceLocatePalette
          open={locateOpen}
          onClose={() => setLocateOpen(false)}
          item={item}
          units={units}
          onJump={target => {
            if (activeTab !== "distribution") onSelectTab("distribution");
            setJumpTarget({ ...target, nonce: Date.now() });
          }}
        />
      ) : null}
    </div>
  );
}

function WorkspaceDistributionTab({
  item,
  units,
  isLoading,
  selectedLocationId,
  onSelectLocation,
  onClearSelectedLocation,
  onSelectTab,
  onOpenLocate,
  jumpTarget,
  onJumpTargetHandled,
}: {
  item: ItemRecord;
  units: ItemDistributionUnit[];
  isLoading: boolean;
  selectedLocationId: string | null;
  onSelectLocation: (locationId: string | null) => void;
  onClearSelectedLocation: () => void;
  onSelectTab: (tab: ItemsWorkspaceTab) => void;
  onOpenLocate: () => void;
  jumpTarget: { unitId: number; storeId?: number; nonce: number } | null;
  onJumpTargetHandled: () => void;
}) {
  const [openNodes, setOpenNodes] = useState<Set<string>>(() => new Set());
  const [panel, setPanel] = useState<WorkspaceLocationPanelState | null>(null);

  const filteredUnits = units;

  useEffect(() => {
    if (!jumpTarget) return;
    const unitKey = `unit-${jumpTarget.unitId}`;
    setOpenNodes(prev => {
      const next = new Set(prev);
      next.add(unitKey);
      if (jumpTarget.storeId != null) next.add(`store-${jumpTarget.storeId}`);
      return next;
    });
    const targetSelector = jumpTarget.storeId != null
      ? `[data-tree-id="store-${jumpTarget.storeId}"]`
      : `[data-tree-id="unit-${jumpTarget.unitId}"]`;
    const handle = window.setTimeout(() => {
      const el = document.querySelector(targetSelector) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        el.classList.add(workspaceStyles.treeRowFlash);
        window.setTimeout(() => el.classList.remove(workspaceStyles.treeRowFlash), 1300);
      }
      onJumpTargetHandled();
    }, 60);
    return () => window.clearTimeout(handle);
  }, [jumpTarget, onJumpTargetHandled]);

  const maxQuantity = useMemo(
    () => Math.max(1, ...filteredUnits.map(unit => toNumber(unit.totalQuantity))),
    [filteredUnits],
  );
  const panelUnit = useMemo(
    () => panel ? units.find(unit => unit.id === panel.unitId) ?? null : null,
    [panel, units],
  );

  const toggleNode = useCallback((key: string) => {
    setOpenNodes(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const inspectPanel = useCallback((nextPanel: WorkspaceLocationPanelState) => {
    setPanel(nextPanel);
    if (nextPanel.locationId) {
      onSelectLocation(nextPanel.locationId);
    }
  }, [onSelectLocation]);

  const closePanel = useCallback(() => {
    setPanel(null);
  }, []);

  return (
    <div className={workspaceStyles.tabStack}>
      <button
        type="button"
        className={workspaceStyles.locateBar}
        onClick={onOpenLocate}
        aria-label="Locate within this item"
      >
        <Ic d={<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>} size={14} />
        <span style={{ flex: 1, fontSize: 13, color: "var(--muted)" }}>
          Locate within {item.name.split("—")[0].trim()} — search by department, store row, or person…
        </span>
        <span className={workspaceStyles.locateBarKbd}>⌘K</span>
      </button>

      <div className={workspaceStyles.treeSectionHead}>
        <h3>Distribution by location</h3>
        <div className={workspaceStyles.treeSectionMeta}>{filteredUnits.length} locations · expand to see allocations</div>
      </div>

      {isLoading ? (
        <div className={workspaceStyles.listEmpty}>Loading distribution...</div>
      ) : filteredUnits.length === 0 ? (
        <div className={workspaceStyles.listEmpty}>No standalone distribution matches the current filters.</div>
      ) : (
        <div className={workspaceStyles.treeList}>
          {filteredUnits.map(unit => {
            const unitKey = `unit-${unit.id}`;
            const unitOpen = openNodes.has(unitKey);
            const linkedAllocationIds = new Set<number>();
            const availableTone = selectedLocationId === String(unit.id) ? workspaceStyles.treeRowSelected : "";

            return (
              <div key={unit.id} className={workspaceStyles.treeWrap} data-depth={0} data-open={unitOpen ? "true" : "false"}>
                <div className={`${workspaceStyles.treeRow} ${availableTone}`} data-open={unitOpen ? "true" : "false"} data-tree-id={`unit-${unit.id}`}>
                  <button type="button" className={workspaceStyles.treeCaret} onClick={() => toggleNode(unitKey)} aria-label={unitOpen ? "Collapse location" : "Expand location"}>
                    <Ic d="M9 6l6 6-6 6" size={14} />
                  </button>
                  <button type="button" className={workspaceStyles.treeMain} onClick={() => toggleNode(unitKey)}>
                    <span className={workspaceStyles.treeIcon}>{workspaceLocationIcon("unit")}</span>
                    <span className={workspaceStyles.treeText}>
                      <span className={workspaceStyles.treeName}>
                        {unit.name}
                        <span className={workspaceStyles.treeCode}>{unit.code}</span>
                      </span>
                      <span className={workspaceStyles.treeSub}>
                        {unit.availableQuantity > 0 ? <span className={workspaceStyles.treeMiniPill}>{formatQuantity(unit.availableQuantity)} in stock</span> : null}
                        {unit.allocatedQuantity > 0 ? <span className={`${workspaceStyles.treeMiniPill} ${workspaceStyles.treeMiniPillAllocated}`}>{formatQuantity(unit.allocatedQuantity)} allocated</span> : null}
                        {unit.inTransitQuantity > 0 ? <span className={`${workspaceStyles.treeMiniPill} ${workspaceStyles.treeMiniPillDeployed}`}>{formatQuantity(unit.inTransitQuantity)} in transit</span> : null}
                      </span>
                    </span>
                  </button>
                  <div className={workspaceStyles.treeRight}>
                    <div className={workspaceStyles.treeBar}>
                      <span className={workspaceStyles.treeBarFill} style={{ width: `${Math.min(100, (toNumber(unit.totalQuantity) / maxQuantity) * 100)}%` }} />
                    </div>
                    <div className={workspaceStyles.treeQty}>
                      {formatQuantity(unit.totalQuantity)}
                      <span className={workspaceStyles.treeQtyUnit}>{item.acct_unit ?? "unit"}</span>
                    </div>
                    <button type="button" className={workspaceStyles.treeJump} onClick={() => inspectPanel(buildUnitPanelState(item, unit))} aria-label="Inspect location">
                      <Ic d="M9 18l6-6-6-6" size={13} />
                    </button>
                  </div>
                </div>

                {unitOpen ? (
                  <div className={workspaceStyles.treeChildren}>
                    {unit.stores.map(store => {
                      const storeKey = `store-${store.id}`;
                      const storeOpen = openNodes.has(storeKey);
                      const storeAllocations = unit.allocations.filter(allocation => allocation.sourceStoreId === store.id);
                      storeAllocations.forEach(allocation => linkedAllocationIds.add(allocation.id));

                      return (
                        <div key={store.id} className={workspaceStyles.treeWrap} data-depth={1} data-open={storeOpen ? "true" : "false"}>
                          <div className={`${workspaceStyles.treeRow} ${selectedLocationId === String(store.locationId) ? workspaceStyles.treeRowSelected : ""}`} data-open={storeOpen ? "true" : "false"} data-tree-id={`store-${store.id}`}>
                            <button
                              type="button"
                              className={workspaceStyles.treeCaret}
                              onClick={() => storeAllocations.length ? toggleNode(storeKey) : inspectPanel(buildStorePanelState(item, unit, store))}
                              aria-label={storeOpen ? "Collapse store" : "Expand store"}
                            >
                              {storeAllocations.length ? <Ic d="M9 6l6 6-6 6" size={14} /> : null}
                            </button>
                            <button type="button" className={workspaceStyles.treeMain} onClick={() => storeAllocations.length ? toggleNode(storeKey) : inspectPanel(buildStorePanelState(item, unit, store))}>
                              <span className={workspaceStyles.treeIcon}>{workspaceLocationIcon("store")}</span>
                              <span className={workspaceStyles.treeText}>
                                <span className={workspaceStyles.treeName}>
                                  {store.locationName}
                                  {store.batchNumber ? <span className={workspaceStyles.treeCode}>Batch {store.batchNumber}</span> : null}
                                </span>
                                <span className={workspaceStyles.treeSub}>
                                  {store.availableQuantity > 0 ? <span className={workspaceStyles.treeMiniPill}>{formatQuantity(store.availableQuantity)} in stock</span> : null}
                                  {store.allocatedTotal > 0 ? <span className={`${workspaceStyles.treeMiniPill} ${workspaceStyles.treeMiniPillAllocated}`}>{formatQuantity(store.allocatedTotal)} allocated</span> : null}
                                  {store.inTransitQuantity > 0 ? <span className={`${workspaceStyles.treeMiniPill} ${workspaceStyles.treeMiniPillDeployed}`}>{formatQuantity(store.inTransitQuantity)} in transit</span> : null}
                                </span>
                              </span>
                            </button>
                            <div className={workspaceStyles.treeRight}>
                              <div className={workspaceStyles.treeBar}>
                                <span className={workspaceStyles.treeBarFill} style={{ width: `${Math.min(100, (toNumber(store.quantity) / maxQuantity) * 100)}%` }} />
                              </div>
                              <div className={workspaceStyles.treeQty}>
                                {formatQuantity(store.quantity)}
                                <span className={workspaceStyles.treeQtyUnit}>{item.acct_unit ?? "unit"}</span>
                              </div>
                              <button type="button" className={workspaceStyles.treeJump} onClick={() => inspectPanel(buildStorePanelState(item, unit, store))} aria-label="Inspect store">
                                <Ic d="M9 18l6-6-6-6" size={13} />
                              </button>
                            </div>
                          </div>

                          {storeOpen && storeAllocations.length ? (
                            <div className={workspaceStyles.leafGroup}>
                              {storeAllocations.map(allocation => (
                                <button
                                  key={allocation.id}
                                  type="button"
                                  className={workspaceStyles.leafRow}
                                  onClick={() => inspectPanel(buildAllocationPanelState(item, unit, allocation))}
                                >
                                  <span className={workspaceStyles.leafTag}>{allocation.targetType === "PERSON" ? "PERSON" : "LOCATION"}</span>
                                  <span className={workspaceStyles.leafMid}>
                                    <span className={workspaceStyles.leafName}>{allocation.targetName}</span>
                                    <span className={workspaceStyles.leafStatus}>allocated</span>
                                    {allocation.batchNumber ? <span>batch {allocation.batchNumber}</span> : null}
                                  </span>
                                  <span className={workspaceStyles.leafRight}>
                                    {formatQuantity(allocation.quantity)}
                                    <span className={workspaceStyles.treeQtyUnit}>{item.acct_unit ?? "unit"}</span>
                                  </span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}

                    {unit.allocations.filter(allocation => !linkedAllocationIds.has(allocation.id)).length ? (
                      <div className={workspaceStyles.leafGroup}>
                        {unit.allocations.filter(allocation => !linkedAllocationIds.has(allocation.id)).map(allocation => (
                          <button
                            key={allocation.id}
                            type="button"
                            className={workspaceStyles.leafRow}
                            onClick={() => inspectPanel(buildAllocationPanelState(item, unit, allocation))}
                          >
                            <span className={workspaceStyles.leafTag}>{allocation.targetType === "PERSON" ? "PERSON" : "LOCATION"}</span>
                            <span className={workspaceStyles.leafMid}>
                              <span className={workspaceStyles.leafName}>{allocation.targetName}</span>
                              <span className={workspaceStyles.leafStatus}>allocated</span>
                              <span>{allocation.sourceStoreName}</span>
                            </span>
                            <span className={workspaceStyles.leafRight}>
                              {formatQuantity(allocation.quantity)}
                              <span className={workspaceStyles.treeQtyUnit}>{item.acct_unit ?? "unit"}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {panel ? (
        <>
          <button type="button" className={workspaceStyles.slidePanelBackdrop} onClick={closePanel} aria-label="Close location details" />
          <aside className={`${workspaceStyles.slidePanel} ${workspaceStyles.slidePanelOpen}`} aria-hidden="false">
            <div className={workspaceStyles.slidePanelHead}>
              <div>
                <div className="eyebrow">{panel.eyebrow}</div>
                <h3 className={workspaceStyles.slidePanelTitle}>{panel.title}</h3>
                <div className={workspaceStyles.slidePanelSub}>{panel.subtitle}</div>
              </div>
              <button type="button" className={workspaceStyles.slidePanelClose} onClick={closePanel} aria-label="Close panel">
                <Ic d="M18 6 6 18M6 6l12 12" size={14} />
              </button>
            </div>

            <div className={workspaceStyles.slidePanelBody}>
              <div className={workspaceStyles.slidePanelMetrics}>
                <WorkspaceMetric label="Total" value={<>{formatQuantity(panel.quantity)}<span className={workspaceStyles.metricUnit}>{item.acct_unit ?? "unit"}</span></>} />
                <WorkspaceMetric label="Available" value={panel.availableQuantity == null ? "—" : <>{formatQuantity(panel.availableQuantity)}<span className={workspaceStyles.metricUnit}>{item.acct_unit ?? "unit"}</span></>} />
                <WorkspaceMetric label="Allocated" value={panel.allocatedQuantity == null ? "—" : <>{formatQuantity(panel.allocatedQuantity)}<span className={workspaceStyles.metricUnit}>{item.acct_unit ?? "unit"}</span></>} />
                <WorkspaceMetric label="In transit" value={panel.inTransitQuantity == null ? "—" : <>{formatQuantity(panel.inTransitQuantity)}<span className={workspaceStyles.metricUnit}>{item.acct_unit ?? "unit"}</span></>} />
              </div>

              {panel.stores.length ? (
                <div className={workspaceStyles.panelSection}>
                  <div className={workspaceStyles.panelSectionLabel}>Store rows · {panel.stores.length}</div>
                  <div className={workspaceStyles.panelList}>
                    {panel.stores.map(store => (
                      <button
                        key={store.id}
                        type="button"
                        className={workspaceStyles.panelRow}
                        onClick={() => {
                          if (panelUnit) inspectPanel(buildStorePanelState(item, panelUnit, store));
                        }}
                      >
                        <span className={workspaceStyles.panelRowIcon}>{workspaceLocationIcon("store")}</span>
                        <span className={workspaceStyles.panelRowText}>
                          <span className={workspaceStyles.panelRowTitle}>{store.locationName}</span>
                          <span className={workspaceStyles.panelRowMeta}>{store.batchNumber ? `Batch ${store.batchNumber} · ` : ""}{formatQuantity(store.quantity)} {item.acct_unit ?? "unit"}</span>
                        </span>
                        <span className={workspaceStyles.panelRowValue}>{formatQuantity(store.availableQuantity)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {panel.allocations.length ? (
                <div className={workspaceStyles.panelSection}>
                  <div className={workspaceStyles.panelSectionLabel}>Allocations · {panel.allocations.length}</div>
                  <div className={workspaceStyles.panelList}>
                    {panel.allocations.map(allocation => (
                      <button
                        key={allocation.id}
                        type="button"
                        className={workspaceStyles.panelRow}
                        onClick={() => {
                          if (panelUnit) inspectPanel(buildAllocationPanelState(item, panelUnit, allocation));
                        }}
                      >
                        <span className={workspaceStyles.panelRowIcon}>{workspaceLocationIcon(allocation.targetType === "PERSON" ? "person" : "location")}</span>
                        <span className={workspaceStyles.panelRowText}>
                          <span className={workspaceStyles.panelRowTitle}>{allocation.targetName}</span>
                          <span className={workspaceStyles.panelRowMeta}>{allocation.sourceStoreName} · {formatItemDate(allocation.allocatedAt, "Unknown")}</span>
                        </span>
                        <span className={workspaceStyles.panelRowValue}>{formatQuantity(allocation.quantity)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className={workspaceStyles.slidePanelActions}>
                {canShowInstances(item.tracking_type) && panel.locationId ? (
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => onSelectTab("instances")}>
                    Instances here
                  </button>
                ) : null}
                {canShowBatches(item.tracking_type, item.category_type) && panel.locationId ? (
                  <button type="button" className="btn btn-sm btn-ghost" onClick={() => onSelectTab("batches")}>
                    {isFixedAssetLotItem(item) ? "Asset lots here" : "Batches here"}
                  </button>
                ) : null}
                {panel.locationId ? (
                  <button type="button" className="btn btn-sm btn-ghost" onClick={onClearSelectedLocation}>
                    Clear location filter
                  </button>
                ) : null}
              </div>
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}

function WorkspaceInfoTab({
  item,
  units,
}: {
  item: ItemRecord;
  units: ItemDistributionUnit[];
}) {
  return (
    <div className={workspaceStyles.infoGrid}>
      <div className={workspaceStyles.infoCard}>
        <div className="eyebrow">Identity and specifications</div>
        <div className={workspaceStyles.infoKvs}>
          <DetailKV label="Item code" value={<span className="mono">{item.code}</span>} />
          <DetailKV label="Category" value={item.category_display ?? "-"} />
          <DetailKV label="Tracking" value={formatItemLabel(String(item.tracking_type ?? ""))} />
          <DetailKV label="Accounting unit" value={item.acct_unit ?? "-"} />
          <DetailKV label="Low-stock threshold" value={toNumber(item.low_stock_threshold) > 0 ? `${formatQuantity(item.low_stock_threshold)} ${item.acct_unit ?? "unit"}` : "—"} />
          <DetailKV label="Standalone locations" value={<span className="mono">{units.length}</span>} />
        </div>
      </div>
      <div className={workspaceStyles.infoCard}>
        <div className="eyebrow">Description</div>
        <div className={workspaceStyles.infoBodyText}>{item.description?.trim() || "No description has been added for this item yet."}</div>
      </div>
      <div className={workspaceStyles.infoCard}>
        <div className="eyebrow">Specifications</div>
        <div className={workspaceStyles.infoBodyText}>{item.specifications?.trim() || "No specifications have been added for this item yet."}</div>
      </div>
      {isFixedAssetItem(item) ? (
        <div className={workspaceStyles.infoCard}>
          <div className="eyebrow">Depreciation</div>
          <div className={workspaceStyles.infoKvs}>
            <DetailKV label="Capitalization status" value={item.depreciation_summary?.capitalized ? "Capitalized" : "Not capitalized"} />
            <DetailKV label="Register entries" value={<span className="mono">{formatQuantity(item.depreciation_summary?.asset_count ?? (item.depreciation_summary?.capitalized ? 1 : 0))}</span>} />
            <DetailKV label="Original cost" value={formatMoneyValue(item.depreciation_summary?.original_cost)} />
            <DetailKV label="Accumulated depreciation" value={formatMoneyValue(item.depreciation_summary?.accumulated_depreciation)} />
            <DetailKV label="Current WDV / NBV" value={formatMoneyValue(item.depreciation_summary?.current_wdv)} />
            <DetailKV label="Latest posted FY" value={item.depreciation_summary?.latest_posted_fiscal_year ? `${item.depreciation_summary.latest_posted_fiscal_year}-${String(item.depreciation_summary.latest_posted_fiscal_year + 1).slice(-2)}` : "-"} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function WorkspaceActivityTab({ item }: { item: ItemRecord }) {
  const events = [
    item.updated_at ? {
      key: "updated",
      label: "Record updated",
      meta: formatItemDate(item.updated_at, "Unknown"),
      note: item.created_by_name ? `Visible in the current permission scope · ${item.created_by_name}` : "Visible in the current permission scope",
    } : null,
    item.created_at ? {
      key: "created",
      label: "Record created",
      meta: formatItemDate(item.created_at, "Unknown"),
      note: item.created_by_name ? `Created by ${item.created_by_name}` : "Creation source not available",
    } : null,
  ].filter(Boolean) as Array<{ key: string; label: string; meta: string; note: string }>;

  return (
    <div className={workspaceStyles.activityCard}>
      <div className={workspaceStyles.activityHead}>
        <h3>Recent activity</h3>
        <div className={workspaceStyles.activityHeadMeta}>latest known record events</div>
      </div>
      <div className={workspaceStyles.activityList}>
        {events.length ? events.map(event => (
          <div key={event.key} className={workspaceStyles.activityRow}>
            <span className={workspaceStyles.activityIcon}>
              <Ic d="M12 5v14M5 12h14" size={13} />
            </span>
            <span className={workspaceStyles.activityText}>
              <strong>{event.label}</strong>
              <span>{event.note}</span>
            </span>
            <span className={workspaceStyles.activityMeta}>{event.meta}</span>
          </div>
        )) : (
          <div className={workspaceStyles.listEmpty}>No item activity is available for this record yet.</div>
        )}
      </div>
    </div>
  );
}

export function WorkspaceInstancesTab({
  itemId,
  selectedLocationId,
  onClearSelectedLocation,
}: {
  itemId: string;
  selectedLocationId: string | null;
  onClearSelectedLocation: () => void;
}) {
  const router = useRouter();
  const extraQuery = selectedLocationId ? `&location=${encodeURIComponent(selectedLocationId)}` : "";
  const { records, isLoading, fetchError, setFetchError, load } = useItemRelatedList<ItemInstanceRecord>(itemId, "/api/inventory/item-instances/", "Failed to load item instances", extraQuery);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    load();
  }, [load]);

  const statusOptions = useMemo(() => {
    const values = new Set<string>();
    records.forEach(record => {
      if (record.status) values.add(record.status);
    });
    return Array.from(values).sort();
  }, [records]);

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter(record => {
      if (q) {
        const hay = [
          record.serial_number,
          record.qr_code ?? "",
          record.location_name ?? "",
          record.full_location_path ?? "",
          record.allocated_to ?? "",
          record.in_charge ?? "",
          record.authority_store_name ?? "",
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter !== "all" && record.status !== statusFilter) return false;
      return true;
    });
  }, [records, search, statusFilter]);

  return (
    <div className={workspaceStyles.tabStack}>
      {fetchError ? (
        <Alert onDismiss={() => setFetchError(null)} action={<button type="button" className="btn btn-xs" onClick={() => load()}>Retry</button>}>
          {fetchError}
        </Alert>
      ) : null}
      {selectedLocationId ? (
        <div className={workspaceStyles.scopeNotice}>
          <span>Filtered to the location selected in Distribution.</span>
          <button type="button" className="btn btn-xs btn-ghost" onClick={onClearSelectedLocation}>
            All item instances
          </button>
        </div>
      ) : null}
      <div className={workspaceStyles.tabToolbar}>
        <div className="search-input">
          <Ic d={<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>} size={14} />
          <input placeholder="Search instance code, serial, location, assignee, or authority store..." value={search} onChange={event => setSearch(event.target.value)} />
          {search ? <button type="button" className="clear-search" onClick={() => setSearch("")}>x</button> : null}
        </div>
        <div className="filter-select-wrap">
          <ThemedSelect
            value={statusFilter}
            onChange={setStatusFilter}
            ariaLabel="Filter item instances by status"
            size="compact"
            options={[
              { value: "all", label: "All statuses" },
              ...statusOptions.map(status => ({ value: status, label: formatItemLabel(status) })),
            ]}
          />
        </div>
      </div>
      <div className="table-card">
        <div className="table-card-head">
          <div className="table-card-head-left">
            <div className="eyebrow">Instance list</div>
            <div className="table-count">
              <span className="mono">{filteredRecords.length}</span>
              <span>of</span>
              <span className="mono">{records.length}</span>
              <span>instances</span>
            </div>
          </div>
        </div>
        {isLoading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--muted)", borderTop: "1px solid var(--hairline)" }}>Loading instances...</div>
        ) : (
          <div className="h-scroll">
            <table className="data-table instance-list-table">
              <thead>
                <tr>
                  <th>Instance</th>
                  <th>Serial number</th>
                  <th>Status</th>
                  <th>Current Location</th>
                  <th>Allocated To</th>
                  <th>In Charge</th>
                  <th>Authority Store</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length === 0 ? (
                  <EmptyTableRow colSpan={7} message="No item instances match the current filters." />
                ) : filteredRecords.map(record => (
                  <tr key={record.id} className="clickable-table-row" onClick={() => router.push(`/items/${itemId}/instances/${record.id}`)}>
                    <td className="col-user">
                      <div className="identity-cell">
                        <div className="user-name mono">{record.qr_code ?? "Uncoded instance"}</div>
                        <div className="user-username">{record.item_name ?? "Tracked item instance"}</div>
                      </div>
                    </td>
                    <td><span className="mono">{record.serial_number || "-"}</span></td>
                    <td><span className="chip">{formatItemLabel(record.status)}</span></td>
                    <td>
                      <div className="login-cell instance-table-cell">
                        <div>{record.location_name ?? "-"}</div>
                        <div className="login-cell-sub mono">{record.full_location_path ?? record.location_code ?? "-"}</div>
                      </div>
                    </td>
                    <td>
                      {record.allocated_to
                        ? <span className="chip">{record.allocated_to} ({formatItemLabel(record.allocated_to_type)})</span>
                        : <span className="muted-note">-</span>}
                    </td>
                    <td>{record.in_charge ?? "-"}</td>
                    <td>
                      <div className="login-cell instance-table-cell">
                        <div>{record.authority_store_name ?? "-"}</div>
                        <div className="login-cell-sub mono">{record.authority_store_code ?? "-"}</div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function WorkspaceBatchesTab({
  itemId,
  selectedLocationId,
  onClearSelectedLocation,
}: {
  itemId: string;
  selectedLocationId: string | null;
  onClearSelectedLocation: () => void;
}) {
  const extraQuery = selectedLocationId ? `&location=${encodeURIComponent(selectedLocationId)}` : "";
  const { item, records, isLoading, fetchError, setFetchError, load } = useItemRelatedList<ItemBatchRecord>(itemId, "/api/inventory/item-batches/", "Failed to load item batches", extraQuery);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const pluralBatchLabel = batchLabelForItem(item);
  const singularBatchLabel = batchLabelForItem(item, false);

  useEffect(() => {
    load();
  }, [load]);

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter(record => {
      if (q) {
        const hay = [record.batch_number, record.item_code ?? "", record.created_by_name ?? ""].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter === "active" && !record.is_active) return false;
      if (statusFilter === "disabled" && record.is_active) return false;
      if (statusFilter === "expired" && !isExpired(record.expiry_date)) return false;
      return true;
    });
  }, [records, search, statusFilter]);

  return (
    <div className={workspaceStyles.tabStack}>
      {fetchError ? (
        <Alert onDismiss={() => setFetchError(null)} action={<button type="button" className="btn btn-xs" onClick={() => load()}>Retry</button>}>
          {fetchError}
        </Alert>
      ) : null}
      {selectedLocationId ? (
        <div className={workspaceStyles.scopeNotice}>
          <span>Filtered to the location selected in Distribution.</span>
          <button type="button" className="btn btn-xs btn-ghost" onClick={onClearSelectedLocation}>
            All item {pluralBatchLabel.toLowerCase()}
          </button>
        </div>
      ) : null}
      <div className={workspaceStyles.tabToolbar}>
        <div className="search-input">
          <Ic d={<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>} size={14} />
          <input placeholder={`Search ${singularBatchLabel.toLowerCase()}, item code, or creator...`} value={search} onChange={event => setSearch(event.target.value)} />
          {search ? <button type="button" className="clear-search" onClick={() => setSearch("")}>x</button> : null}
        </div>
        <div className="chip-filter">
          {[
            { key: "all", label: "All" },
            { key: "active", label: "Active" },
            { key: "disabled", label: "Disabled" },
            { key: "expired", label: "Expired" },
          ].map(option => (
            <button
              key={option.key}
              type="button"
              className={"chip-filter-btn" + (statusFilter === option.key ? " active" : "")}
              onClick={() => setStatusFilter(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="table-card">
        <div className="table-card-head">
          <div className="table-card-head-left">
            <div className="eyebrow">{singularBatchLabel} list</div>
            <div className="table-count">
              <span className="mono">{filteredRecords.length}</span>
              <span>of</span>
              <span className="mono">{records.length}</span>
              <span>{pluralBatchLabel.toLowerCase()}</span>
            </div>
          </div>
        </div>
        {isLoading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--muted)", borderTop: "1px solid var(--hairline)" }}>Loading batches...</div>
        ) : (
          <div className="h-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{singularBatchLabel}</th>
                  <th>Quantity</th>
                  <th>Available</th>
                  <th>Manufactured</th>
                  <th>Expiry</th>
                  <th>Expiry Status</th>
                  {isFixedAssetLotItem(item) ? <th>WDV / NBV</th> : null}
                  <th>Active</th>
                  <th>Created By</th>
                  <th>Updated</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length === 0 ? (
                  <EmptyTableRow colSpan={isFixedAssetLotItem(item) ? 10 : 9} message={`No item ${pluralBatchLabel.toLowerCase()} match the current filters.`} />
                ) : filteredRecords.map(record => (
                  <tr key={record.id}>
                    <td className="col-user">
                      <div className="identity-cell">
                        <div className="user-name">{record.batch_number}</div>
                        <div className="user-username mono">{record.item_code ?? "-"}</div>
                      </div>
                    </td>
                    <td>{formatQuantity(record.quantity)}</td>
                    <td>{formatQuantity(record.available_quantity)}</td>
                    <td>{formatItemDate(record.manufactured_date)}</td>
                    <td>{formatItemDate(record.expiry_date)}</td>
                    <td>{isFixedAssetLotItem(item) ? <span className="pill pill-neutral">No expiry</span> : isExpired(record.expiry_date) ? <StatusPill tone="warning" label="Expired" /> : <StatusPill tone="success" label="Valid" />}</td>
                    {isFixedAssetLotItem(item) ? <td>{formatMoneyValue(record.depreciation_summary?.current_wdv)}</td> : null}
                    <td><StatusPill active={record.is_active} /></td>
                    <td>{record.created_by_name ?? "-"}</td>
                    <td>{formatItemDate(record.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ItemPageActions({ item }: { item: ItemRecord | null }) {
  if (!item) return null;
  return (
    <>
      <Link className="btn btn-sm" href="/items">
        <Ic d="M15 18l-6-6 6-6" size={14} />
        Items
      </Link>
      {canShowInstances(item.tracking_type) && (
        <Link className="btn btn-sm btn-ghost" href={`/items/${item.id}/instances`}>
          <Ic d="M8 7V3m8 4V3M4 11h16M6 5h12a2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2z" size={14} />
          Instances
        </Link>
      )}
      {canShowBatches(item.tracking_type, item.category_type) && (
        <Link className="btn btn-sm btn-ghost" href={`/items/${item.id}/batches`}>
          <Ic d="M20 7l-8 4-8-4m8 4v10m8-14l-8-4-8 4 8 4 8-4z" size={14} />
          {batchLabelForItem(item)}
        </Link>
      )}
    </>
  );
}

export function useItemDistribution(itemId: string, scopeTokens: string[] = EMPTY_SCOPE_TOKENS) {
  const [item, setItem] = useState<ItemRecord | null>(null);
  const [units, setUnits] = useState<ItemDistributionUnit[]>([]);
  const [scopeOptions, setScopeOptions] = useState<ItemScopeOption[]>([]);
  const [defaultScopeTokens, setDefaultScopeTokens] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const scopeKey = scopeTokens.join("|");

  const load = useCallback(async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
    if (!itemId) return false;
    if (showLoading) setIsLoading(true);
    setFetchError(null);
    try {
      const scopeQuery = buildScopeQuery(scopeKey ? scopeKey.split("|") : []);
      const scopeSuffix = scopeQuery ? `&${scopeQuery}` : "";
      const [itemData, unitData, scopeData] = await Promise.all([
        apiFetch<ItemRecord>(`/api/inventory/items/${itemId}/${scopeQuery ? `?${scopeQuery}` : ""}`),
        apiFetch<ItemDistributionUnit[]>(`/api/inventory/distribution/hierarchical/?item=${encodeURIComponent(itemId)}${scopeSuffix}`),
        apiFetch<ItemScopeOptionsResponse>("/api/inventory/distribution/scope-options/"),
      ]);
      setItem(itemData);
      setUnits(unitData);
      setScopeOptions(scopeData.options);
      setDefaultScopeTokens(scopeData.default);
      return true;
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load item distribution");
      return false;
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [itemId, scopeKey]);

  return { item, units, scopeOptions, defaultScopeTokens, isLoading, fetchError, setFetchError, load };
}

export function ItemDistributionView({ itemId }: { itemId: string }) {
  const router = useRouter();
  const { isLoading: capsLoading } = useCapabilities();
  const canViewItems = useCan("items");
  const { item, units, isLoading, fetchError, setFetchError, load } = useItemDistribution(itemId);
  const [density, setDensity] = useState<Density>("balanced");
  const [search, setSearch] = useState("");
  const [stockFilter, setStockFilter] = useState("all");

  useEffect(() => {
    if (capsLoading) return;
    if (!canViewItems) {
      router.replace("/403");
      return;
    }
    load();
  }, [canViewItems, capsLoading, load, router]);

  const filteredUnits = useMemo(() => {
    const q = search.trim().toLowerCase();
    return units.filter(unit => {
      if (q) {
        const hay = [unit.name, unit.code, ...unit.stores.map(store => store.locationName), ...unit.allocations.map(allocation => allocation.targetName)].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (stockFilter === "available" && unit.availableQuantity <= 0) return false;
      if (stockFilter === "allocated" && unit.allocatedQuantity <= 0) return false;
      if (stockFilter === "transit" && unit.inTransitQuantity <= 0) return false;
      return true;
    });
  }, [search, stockFilter, units]);

  const {
    page,
    totalPages,
    pageItems: pagedUnits,
    pageStart,
    pageEnd,
    setPage,
  } = useClientPagination(filteredUnits, ITEM_DISTRIBUTION_PAGE_SIZE, [search, stockFilter]);

  return (
    <div data-density={density}>
      <Topbar breadcrumb={["Inventory", "Items", item?.name ?? "Distribution"]} />
      <div className="page">
        {fetchError && (
          <Alert onDismiss={() => setFetchError(null)} action={<button type="button" className="btn btn-xs" onClick={() => load()}>Retry</button>}>
            {fetchError}
          </Alert>
        )}
        {item && isLowStock(item) && (
          <Alert>
            {`${item.name} is low on stock. Total quantity is ${formatQuantity(item.total_quantity)} against a threshold of ${formatQuantity(item.low_stock_threshold)}.`}
          </Alert>
        )}

        <div className="page-head">
          <div className="page-title-group">
            <div className="eyebrow">Item distribution</div>
            <h1>{item?.name ?? "Item"}</h1>
            <div className="page-sub">
              {item ? `${item.code} / ${item.category_display ?? "Uncategorized"} / ${formatItemLabel(String(item.tracking_type ?? ""))}` : "Loading permission-scoped distribution."}
            </div>
          </div>
          <div className="page-head-actions">
            <ItemPageActions item={item} />
          </div>
        </div>

        <div className="filter-bar">
          <div className="filter-bar-left">
            <div className="search-input">
              <Ic d={<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>} size={14} />
              <input placeholder="Search standalone, store, person, or sub-location..." value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button type="button" className="clear-search" onClick={() => setSearch("")}>x</button>}
            </div>
            <div className="chip-filter-group">
              <div className="chip-filter-label">Focus</div>
              <div className="chip-filter">
                {[
                  { k: "all", label: "All" },
                  { k: "available", label: "Available" },
                  { k: "allocated", label: "Allocated" },
                  { k: "transit", label: "Transit" },
                ].map(option => (
                  <button key={option.k} type="button" className={"chip-filter-btn" + (stockFilter === option.k ? " active" : "")} onClick={() => setStockFilter(option.k)}>
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="filter-bar-right">
            <DensityToggle density={density} setDensity={setDensity} />
          </div>
        </div>

        <div className="table-card">
          <div className="table-card-head">
            <div className="table-card-head-left">
              <div className="eyebrow">Standalone locations</div>
              <div className="table-count">
                <span className="mono">{filteredUnits.length}</span>
                <span>of</span>
                <span className="mono">{units.length}</span>
                <span>standalone units</span>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--muted)", borderTop: "1px solid var(--hairline)" }}>Loading distribution...</div>
          ) : (
            <div className="h-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Standalone Location</th>
                    <th>Total</th>
                    <th>Available</th>
                    <th>Allocated</th>
                    <th>In Transit</th>
                    <th>Store Rows</th>
                    <th>Issued Targets</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUnits.length === 0 ? (
                    <EmptyTableRow colSpan={8} message="No standalone distribution matches the current filters." />
                  ) : pagedUnits.map(unit => (
                    <tr key={unit.id} onClick={() => router.push(`/items/${itemId}/distribution/${unit.id}`)} style={{ cursor: "pointer" }}>
                      <td className="col-user">
                        <div className="identity-cell">
                          <div className="user-name">{unit.name}</div>
                          <div className="user-username mono">{unit.code}</div>
                        </div>
                      </td>
                      <td className="mono">{formatQuantity(unit.totalQuantity)}</td>
                      <td className="mono">{formatQuantity(unit.availableQuantity)}</td>
                      <td className="mono">{formatQuantity(unit.allocatedQuantity)}</td>
                      <td className="mono">{formatQuantity(unit.inTransitQuantity)}</td>
                      <td><span className="chip">{unit.stores.length} stores</span></td>
                      <td><span className="chip">{unit.allocations.length} targets</span></td>
                      <td className="col-actions">
                        <Link className="btn btn-xs btn-ghost row-action" href={`/items/${itemId}/distribution/${unit.id}`} onClick={event => event.stopPropagation()}>
                          <Ic d="M9 18l6-6-6-6" size={13} />
                          <span className="ra-label">Details</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <ListPagination
            summary={filteredUnits.length === 0 ? "Showing 0 standalone units" : `Showing ${pageStart}-${pageEnd} of ${filteredUnits.length} standalone units`}
            page={page}
            totalPages={totalPages}
            onPrev={() => setPage(current => Math.max(1, current - 1))}
            onNext={() => setPage(current => Math.min(totalPages, current + 1))}
          />
        </div>
      </div>
    </div>
  );
}

function detailKindLabel(kind: ItemDistributionDetailRow["kind"]) {
  if (kind === "store") return "Store location";
  if (kind === "person") return "Person";
  return "Non-store location";
}

export function ItemStandaloneDistributionView({ itemId, standaloneId }: { itemId: string; standaloneId: string }) {
  const router = useRouter();
  const { isLoading: capsLoading } = useCapabilities();
  const canViewItems = useCan("items");
  const { item, units, isLoading, fetchError, setFetchError, load } = useItemDistribution(itemId);
  const [density, setDensity] = useState<Density>("balanced");
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("all");

  useEffect(() => {
    if (capsLoading) return;
    if (!canViewItems) {
      router.replace("/403");
      return;
    }
    load();
  }, [canViewItems, capsLoading, load, router]);

  const unit = useMemo(() => findDistributionUnit(units, standaloneId), [standaloneId, units]);
  const details = useMemo(() => flattenDistributionDetails(unit), [unit]);
  const filteredDetails = useMemo(() => {
    const q = search.trim().toLowerCase();
    return details.filter(row => {
      if (q) {
        const hay = [row.name, row.sourceStoreName ?? "", row.stockEntryIds.join(" ")].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (kindFilter !== "all" && row.kind !== kindFilter) return false;
      return true;
    });
  }, [details, kindFilter, search]);

  const {
    page,
    totalPages,
    pageItems: pagedDetails,
    pageStart,
    pageEnd,
    setPage,
  } = useClientPagination(filteredDetails, ITEM_DETAIL_ROWS_PAGE_SIZE, [search, kindFilter, standaloneId]);

  return (
    <div data-density={density}>
      <Topbar breadcrumb={["Inventory", "Items", item?.name ?? "Item", unit?.name ?? "Location"]} />
      <div className="page">
        {fetchError && (
          <Alert onDismiss={() => setFetchError(null)} action={<button type="button" className="btn btn-xs" onClick={() => load()}>Retry</button>}>
            {fetchError}
          </Alert>
        )}
        {item && isLowStock(item) && (
          <Alert>
            {`${item.name} is low on stock. Total quantity is ${formatQuantity(item.total_quantity)} against a threshold of ${formatQuantity(item.low_stock_threshold)}.`}
          </Alert>
        )}

        <div className="page-head">
          <div className="page-title-group">
            <div className="eyebrow">Standalone detail</div>
            <h1>{unit?.name ?? "Location distribution"}</h1>
            <div className="page-sub">
              {item && unit ? `${item.name} / ${item.code} / ${unit.code}` : "Loading store, non-store, and person distribution."}
            </div>
          </div>
          <div className="page-head-actions">
            <Link className="btn btn-sm" href={`/items/${itemId}`}>
              <Ic d="M15 18l-6-6 6-6" size={14} />
              Distribution
            </Link>
            <ItemPageActions item={item} />
          </div>
        </div>

        {unit && (
          <div className="table-card" style={{ marginBottom: 16 }}>
            <div className="table-card-head">
              <div className="table-card-head-left">
                <div className="eyebrow">Location totals</div>
                <div className="table-count">
                  <span className="mono">{formatQuantity(unit.totalQuantity)}</span>
                  <span>total stock</span>
                </div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(140px, 1fr))", gap: 12, padding: 16, borderTop: "1px solid var(--hairline)" }}>
              {[
                ["Available", unit.availableQuantity],
                ["Allocated", unit.allocatedQuantity],
                ["In Transit", unit.inTransitQuantity],
                ["Detail Rows", details.length],
              ].map(([label, value]) => (
                <div key={String(label)} style={{ border: "1px solid var(--hairline)", borderRadius: 8, padding: 12, background: "var(--surface-2)" }}>
                  <div className="eyebrow">{label}</div>
                  <div className="mono" style={{ color: "var(--text-1)", fontSize: 18, fontWeight: 700, marginTop: 4 }}>{formatQuantity(value as number)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="filter-bar">
          <div className="filter-bar-left">
            <div className="search-input">
              <Ic d={<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>} size={14} />
              <input placeholder="Search store, lab, person, batch, or stock entry..." value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button type="button" className="clear-search" onClick={() => setSearch("")}>x</button>}
            </div>
            <div className="filter-select-group">
              <div className="chip-filter-label">Type</div>
              <div className="filter-select-wrap">
                <ThemedSelect
                  value={kindFilter}
                  onChange={setKindFilter}
                  ariaLabel="Filter distribution detail by type"
                  size="compact"
                  options={[
                    { value: "all", label: "All rows" },
                    { value: "store", label: "Stores" },
                    { value: "location", label: "Non-store locations" },
                    { value: "person", label: "Persons" },
                  ]}
                />
              </div>
            </div>
          </div>
          <div className="filter-bar-right">
            <DensityToggle density={density} setDensity={setDensity} />
          </div>
        </div>

        <div className="table-card">
          <div className="table-card-head">
            <div className="table-card-head-left">
              <div className="eyebrow">Store, sub-location, and person distribution</div>
              <div className="table-count">
                <span className="mono">{filteredDetails.length}</span>
                <span>of</span>
                <span className="mono">{details.length}</span>
                <span>rows</span>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--muted)", borderTop: "1px solid var(--hairline)" }}>Loading location details...</div>
          ) : (
            <div className="h-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Destination</th>
                    <th>Type</th>
                    <th>Source Store</th>
                    <th>Quantity</th>
                    <th>Available</th>
                    <th>Allocated</th>
                    <th>In Transit</th>
                    <th>Last Activity</th>
                    <th>Stock Entries</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {!unit ? (
                    <EmptyTableRow colSpan={10} message="This standalone location was not found in the current item distribution." />
                  ) : filteredDetails.length === 0 ? (
                    <EmptyTableRow colSpan={10} message="No detailed rows match the current filters." />
                  ) : pagedDetails.map(row => (
                    <tr key={row.id}>
                      <td className="col-user">
                        <div className="identity-cell">
                          <div className="user-name">{row.name}</div>
                          <div className="user-username mono">{row.id}</div>
                        </div>
                      </td>
                      <td><span className="chip">{detailKindLabel(row.kind)}</span></td>
                      <td>{row.sourceStoreName ? <span className="chip chip-loc">{row.sourceStoreName}</span> : <span className="muted-note">Current store row</span>}</td>
                      <td className="mono">{formatQuantity(row.quantity)}</td>
                      <td className="mono">{row.availableQuantity == null ? "-" : formatQuantity(row.availableQuantity)}</td>
                      <td className="mono">{row.allocatedQuantity == null ? "-" : formatQuantity(row.allocatedQuantity)}</td>
                      <td className="mono">{row.inTransitQuantity == null ? "-" : formatQuantity(row.inTransitQuantity)}</td>
                      <td className="col-login">
                        <div className="login-cell">
                          <div>{formatItemDate(row.updatedAt, "Unknown")}</div>
                        </div>
                      </td>
                      <td className="mono">{row.stockEntryIds.length ? row.stockEntryIds.join(", ") : "-"}</td>
                      <td className="col-actions">
                        {item && row.locationId && canShowInstances(item.tracking_type) && (
                          <Link className="btn btn-xs btn-ghost row-action" href={`/items/${itemId}/instances?location=${row.locationId}`}>
                            <Ic d="M4 7h16M4 12h16M4 17h16" size={13} />
                            <span className="ra-label">Instances</span>
                          </Link>
                        )}
                        {item && row.locationId && canShowBatches(item.tracking_type, item.category_type) && (
                          <Link className="btn btn-xs btn-ghost row-action" href={`/items/${itemId}/batches?location=${row.locationId}`}>
                            <Ic d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" size={13} />
                            <span className="ra-label">{batchLabelForItem(item)}</span>
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <ListPagination
            summary={filteredDetails.length === 0 ? "Showing 0 detail rows" : `Showing ${pageStart}-${pageEnd} of ${filteredDetails.length} detail rows`}
            page={page}
            totalPages={totalPages}
            onPrev={() => setPage(current => Math.max(1, current - 1))}
            onNext={() => setPage(current => Math.min(totalPages, current + 1))}
          />
        </div>
      </div>
    </div>
  );
}

function useItemRelatedList<T>(itemId: string, path: string, fallback: string, extraQuery = "") {
  const [item, setItem] = useState<ItemRecord | null>(null);
  const [records, setRecords] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const load = useCallback(async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
    if (showLoading) setIsLoading(true);
    setFetchError(null);
    try {
      const [itemData, listData] = await Promise.all([
        apiFetch<ItemRecord>(`/api/inventory/items/${itemId}/`),
        apiFetch<Page<T> | T[]>(`${path}?item=${encodeURIComponent(itemId)}&page_size=500${extraQuery}`),
      ]);
      setItem(itemData);
      setRecords(normalizeList(listData));
      return true;
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : fallback);
      return false;
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [extraQuery, fallback, itemId, path]);

  return { item, records, isLoading, fetchError, setFetchError, load };
}

export function ItemInstancesView({ itemId }: { itemId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locationId = searchParams.get("location");
  const { isLoading: capsLoading } = useCapabilities();
  const canViewItems = useCan("items");
  const extraQuery = locationId ? `&location=${encodeURIComponent(locationId)}` : "";
  const { item, records, isLoading, fetchError, setFetchError, load } = useItemRelatedList<ItemInstanceRecord>(itemId, "/api/inventory/item-instances/", "Failed to load item instances", extraQuery);
  const [density, setDensity] = useState<Density>("balanced");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    if (capsLoading) return;
    if (!canViewItems) {
      router.replace("/403");
      return;
    }
    load();
  }, [canViewItems, capsLoading, load, router]);

  const statusOptions = useMemo(() => {
    const values = new Set<string>();
    records.forEach(record => {
      if (record.status) values.add(record.status);
    });
    return Array.from(values).sort();
  }, [records]);

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter(record => {
      if (q) {
        const hay = [
          record.serial_number,
          record.qr_code ?? "",
          record.location_name ?? "",
          record.full_location_path ?? "",
          record.allocated_to ?? "",
          record.in_charge ?? "",
          record.authority_store_name ?? "",
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter !== "all" && record.status !== statusFilter) return false;
      return true;
    });
  }, [records, search, statusFilter]);

  const {
    page,
    totalPages,
    pageItems: pagedRecords,
    pageStart,
    pageEnd,
    setPage,
  } = useClientPagination(filteredRecords, ITEM_RELATED_RECORDS_PAGE_SIZE, [search, statusFilter, itemId, locationId]);

  const showInstances = !item || canShowInstances(item.tracking_type);

  return (
    <div data-density={density}>
      <Topbar breadcrumb={["Inventory", "Items", item?.name ?? "Item", "Instances"]} />
      <div className="page">
        {fetchError && (
          <Alert onDismiss={() => setFetchError(null)} action={<button type="button" className="btn btn-xs" onClick={() => load()}>Retry</button>}>
            {fetchError}
          </Alert>
        )}

        <div className="page-head">
          <div className="page-title-group">
            <div className="eyebrow">Item instances</div>
            <h1>{item?.name ?? "Instances"}</h1>
            <div className="page-sub">{item ? `${item.code} / ${formatItemLabel(String(item.tracking_type ?? ""))}` : "Loading tracked item instances."}</div>
          </div>
          <div className="page-head-actions">
            <Link className="btn btn-sm" href={`/items/${itemId}`}>
              <Ic d="M15 18l-6-6 6-6" size={14} />
              Distribution
            </Link>
          </div>
        </div>

        {!showInstances ? (
          <div className="table-card">
            <div style={{ padding: 24, color: "var(--text-2)", fontSize: 13 }}>
              This item is quantity tracked, so individual instances are not exposed.
            </div>
          </div>
        ) : (
          <>
            <div className="filter-bar">
              <div className="filter-bar-left">
                <div className="search-input">
                  <Ic d={<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>} size={14} />
                  <input placeholder="Search instance code, serial, location, assignee, or authority store..." value={search} onChange={e => setSearch(e.target.value)} />
                  {search && <button type="button" className="clear-search" onClick={() => setSearch("")}>x</button>}
                </div>
                <div className="filter-select-group">
                  <div className="chip-filter-label">Status</div>
                  <div className="filter-select-wrap">
                    <ThemedSelect
                      value={statusFilter}
                      onChange={setStatusFilter}
                      ariaLabel="Filter item instances by status"
                      size="compact"
                      options={[
                        { value: "all", label: "All statuses" },
                        ...statusOptions.map(status => ({ value: status, label: formatItemLabel(status) })),
                      ]}
                    />
                  </div>
                </div>
              </div>
              <div className="filter-bar-right">
                <DensityToggle density={density} setDensity={setDensity} />
              </div>
            </div>

            <div className="table-card">
              <div className="table-card-head">
                <div className="table-card-head-left">
                  <div className="eyebrow">Instance list</div>
                  <div className="table-count">
                    <span className="mono">{filteredRecords.length}</span>
                    <span>of</span>
                    <span className="mono">{records.length}</span>
                    <span>instances</span>
                  </div>
                </div>
              </div>
              {isLoading ? (
                <div style={{ padding: 32, textAlign: "center", color: "var(--muted)", borderTop: "1px solid var(--hairline)" }}>Loading instances...</div>
              ) : (
                <div className="h-scroll">
                  <table className="data-table instance-list-table">
                    <thead>
                      <tr>
                        <th>Instance</th>
                        <th>Serial number</th>
                        <th>Status</th>
                        <th>Current Location</th>
                        <th>Allocated To</th>
                        <th>In Charge</th>
                        <th>Authority Store</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecords.length === 0 ? (
                        <EmptyTableRow colSpan={7} message="No item instances match the current filters." />
                      ) : pagedRecords.map(record => (
                        <tr key={record.id} className="clickable-table-row" onClick={() => router.push(`/items/${itemId}/instances/${record.id}`)}>
                          <td className="col-user">
                            <div className="identity-cell">
                              <div className="user-name mono">{record.qr_code ?? "Uncoded instance"}</div>
                              <div className="user-username">{record.item_name ?? item?.name ?? "Tracked item instance"}</div>
                            </div>
                          </td>
                          <td><span className="mono">{record.serial_number || "-"}</span></td>
                          <td><span className="chip">{formatItemLabel(record.status)}</span></td>
                          <td>
                            <div className="login-cell instance-table-cell">
                              <div>{record.location_name ?? "-"}</div>
                              <div className="login-cell-sub mono">{record.full_location_path ?? record.location_code ?? "-"}</div>
                            </div>
                          </td>
                          <td>
                            {record.allocated_to
                              ? <span className="chip">{record.allocated_to} ({formatItemLabel(record.allocated_to_type)})</span>
                              : <span className="muted-note">-</span>}
                          </td>
                          <td>{record.in_charge ?? "-"}</td>
                          <td>
                            <div className="login-cell instance-table-cell">
                              <div>{record.authority_store_name ?? "-"}</div>
                              <div className="login-cell-sub mono">{record.authority_store_code ?? "-"}</div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <ListPagination
                summary={filteredRecords.length === 0 ? "Showing 0 item instances" : `Showing ${pageStart}-${pageEnd} of ${filteredRecords.length} item instances`}
                page={page}
                totalPages={totalPages}
                onPrev={() => setPage(current => Math.max(1, current - 1))}
                onNext={() => setPage(current => Math.min(totalPages, current + 1))}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export function ItemInstanceDetailView({ itemId, instanceId }: { itemId: string; instanceId: string }) {
  const router = useRouter();
  const { isLoading: capsLoading } = useCapabilities();
  const canViewItems = useCan("items");
  const [item, setItem] = useState<ItemRecord | null>(null);
  const [instance, setInstance] = useState<ItemInstanceRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const [itemData, instanceData] = await Promise.all([
        apiFetch<ItemRecord>(`/api/inventory/items/${itemId}/`),
        apiFetch<ItemInstanceRecord>(`/api/inventory/item-instances/${instanceId}/`),
      ]);
      setItem(itemData);
      setInstance(instanceData);
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load item instance");
    } finally {
      setIsLoading(false);
    }
  }, [instanceId, itemId]);

  useEffect(() => {
    if (capsLoading) return;
    if (!canViewItems) {
      router.replace("/403");
      return;
    }
    load();
  }, [canViewItems, capsLoading, load, router]);

  const qrHref = getMediaHref(instance?.qr_code_image);
  const title = instance?.serial_number || instance?.qr_code || `Instance #${instanceId}`;

  return (
    <div>
      <Topbar breadcrumb={["Inventory", "Items", item?.name ?? "Item", "Instances", title]} />
      <div className="page">
        <Link className="detail-page-back" href={`/items/${itemId}/instances`}>
          <Ic d="M19 12H5M12 19l-7-7 7-7" size={12} />
          Back to Instances
        </Link>

        {fetchError && (
          <Alert onDismiss={() => setFetchError(null)} action={<button type="button" className="btn btn-xs" onClick={() => load()}>Retry</button>}>
            {fetchError}
          </Alert>
        )}

        {isLoading ? (
          <div className="detail-card detail-card-body">Loading item instance...</div>
        ) : instance ? (
          <>
            <div className="page-head-detail item-instance-detail-head">
              <div className="page-title-group">
                <div className="eyebrow">Item Instance</div>
                <h1>{title}</h1>
                <div className="page-sub">{item ? `${item.name} / ${item.code}` : instance.item_name ?? "Tracked inventory instance"}</div>
                <div className="page-id-row">
                  <span className="doc-no">{instance.qr_code ?? `#${instance.id}`}</span>
                  <span className="chip">{formatItemLabel(instance.status)}</span>
                  <StatusPill active={instance.is_active} />
                </div>
              </div>
              <div className="page-head-actions">
                <Link className="btn btn-sm" href={`/items/${itemId}`}>
                  <Ic d="M3 12h18M3 6h18M3 18h18" size={14} />
                  Distribution
                </Link>
              </div>
            </div>

            <div className="item-instance-detail-grid">
              <main className="detail-card">
                <header className="detail-card-head">
                  <div>
                    <div className="eyebrow">Instance record</div>
                    <h2>Identity, custody and current placement</h2>
                  </div>
                </header>
                <div className="detail-card-body">
                  <div className="detail-kv-grid">
                    <DetailKV label="Serial number" value={instance.serial_number} />
                    <DetailKV label="QR code" value={<span className="mono">{instance.qr_code ?? "-"}</span>} />
                    <DetailKV label="Item" value={instance.item_name ?? item?.name} sub={instance.item_code ?? item?.code} />
                    <DetailKV label="Category" value={instance.item_category_name} sub={instance.item_model_number ? `Model ${instance.item_model_number}` : undefined} />
                    <DetailKV label="Current location" value={instance.location_name} sub={instance.full_location_path ?? instance.location_code} />
                    <DetailKV label="Authority store" value={instance.authority_store_name} sub={instance.authority_store_code} />
                    <DetailKV label="Allocated to" value={instance.allocated_to ?? "Not allocated"} sub={instance.allocated_to_type ? formatItemLabel(instance.allocated_to_type) : undefined} />
                    <DetailKV label="In charge" value={instance.in_charge} />
                    <DetailKV label="Inspection certificate" value={instance.inspection_certificate ?? "Not linked"} />
                    <DetailKV label="Created by" value={instance.created_by_name} sub={formatItemDate(instance.created_at)} />
                    <DetailKV label="Last updated" value={formatItemDate(instance.updated_at)} />
                  </div>
                </div>
              </main>

              <aside className="detail-card item-instance-qr-card">
                <header className="detail-card-head">
                  <div>
                    <div className="eyebrow">QR asset</div>
                    <h2>Scan code</h2>
                  </div>
                </header>
                <div className="detail-card-body">
                  {qrHref ? (
                    <a href={qrHref} target="_blank" rel="noopener noreferrer" className="item-instance-qr-preview">
                      <img src={qrHref} alt={`QR code for ${title}`} />
                    </a>
                  ) : (
                    <div className="item-instance-qr-empty">No QR image available</div>
                  )}
                  <div className="detail-muted-row item-instance-qr-code">
                    <span className="mono">{instance.qr_code ?? "-"}</span>
                  </div>
                </div>
              </aside>
            </div>
          </>
        ) : (
          <div className="detail-card detail-card-body">Item instance not found.</div>
        )}
      </div>
    </div>
  );
}

function isExpired(date: string | null | undefined) {
  if (!date) return false;
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() < Date.now();
}

export function ItemBatchesView({ itemId }: { itemId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locationId = searchParams.get("location");
  const { isLoading: capsLoading } = useCapabilities();
  const canViewItems = useCan("items");
  const extraQuery = locationId ? `&location=${encodeURIComponent(locationId)}` : "";
  const { item, records, isLoading, fetchError, setFetchError, load } = useItemRelatedList<ItemBatchRecord>(itemId, "/api/inventory/item-batches/", "Failed to load item batches", extraQuery);
  const [density, setDensity] = useState<Density>("balanced");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const pluralBatchLabel = batchLabelForItem(item);
  const singularBatchLabel = batchLabelForItem(item, false);

  useEffect(() => {
    if (capsLoading) return;
    if (!canViewItems) {
      router.replace("/403");
      return;
    }
    load();
  }, [canViewItems, capsLoading, load, router]);

  const filteredRecords = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter(record => {
      if (q) {
        const hay = [record.batch_number, record.item_code ?? "", record.created_by_name ?? ""].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (statusFilter === "active" && !record.is_active) return false;
      if (statusFilter === "disabled" && record.is_active) return false;
      if (statusFilter === "expired" && !isExpired(record.expiry_date)) return false;
      return true;
    });
  }, [records, search, statusFilter]);

  const {
    page,
    totalPages,
    pageItems: pagedRecords,
    pageStart,
    pageEnd,
    setPage,
  } = useClientPagination(filteredRecords, ITEM_RELATED_RECORDS_PAGE_SIZE, [search, statusFilter, itemId, locationId]);

  return (
    <div data-density={density}>
      <Topbar breadcrumb={["Inventory", "Items", item?.name ?? "Item", pluralBatchLabel]} />
      <div className="page">
        {fetchError && (
          <Alert onDismiss={() => setFetchError(null)} action={<button type="button" className="btn btn-xs" onClick={() => load()}>Retry</button>}>
            {fetchError}
          </Alert>
        )}

        <div className="page-head">
          <div className="page-title-group">
            <div className="eyebrow">Item {pluralBatchLabel.toLowerCase()}</div>
            <h1>{item?.name ?? pluralBatchLabel}</h1>
            <div className="page-sub">{item ? `${item.code} / ${formatItemLabel(String(item.tracking_type ?? ""))}` : "Loading item batch records."}</div>
          </div>
          <div className="page-head-actions">
            <Link className="btn btn-sm" href={`/items/${itemId}`}>
              <Ic d="M15 18l-6-6 6-6" size={14} />
              Distribution
            </Link>
          </div>
        </div>

        <div className="filter-bar">
          <div className="filter-bar-left">
            <div className="search-input">
              <Ic d={<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>} size={14} />
              <input placeholder={`Search ${singularBatchLabel.toLowerCase()}, item code, or creator...`} value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button type="button" className="clear-search" onClick={() => setSearch("")}>x</button>}
            </div>
            <div className="chip-filter-group">
              <div className="chip-filter-label">Status</div>
              <div className="chip-filter">
                {[
                  { k: "all", label: "All" },
                  { k: "active", label: "Active" },
                  { k: "disabled", label: "Disabled" },
                  { k: "expired", label: "Expired" },
                ].map(option => (
                  <button key={option.k} type="button" className={"chip-filter-btn" + (statusFilter === option.k ? " active" : "")} onClick={() => setStatusFilter(option.k)}>
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="filter-bar-right">
            <DensityToggle density={density} setDensity={setDensity} />
          </div>
        </div>

        <div className="table-card">
          <div className="table-card-head">
            <div className="table-card-head-left">
              <div className="eyebrow">{singularBatchLabel} list</div>
              <div className="table-count">
                <span className="mono">{filteredRecords.length}</span>
                <span>of</span>
                <span className="mono">{records.length}</span>
                    <span>{pluralBatchLabel.toLowerCase()}</span>
              </div>
            </div>
          </div>
          {isLoading ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--muted)", borderTop: "1px solid var(--hairline)" }}>Loading batches...</div>
          ) : (
            <div className="h-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{singularBatchLabel}</th>
                    <th>Quantity</th>
                    <th>Available</th>
                    <th>Manufactured</th>
                    <th>Expiry</th>
                    <th>Expiry Status</th>
                    {isFixedAssetLotItem(item) ? <th>WDV / NBV</th> : null}
                    <th>Active</th>
                    <th>Created By</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.length === 0 ? (
                    <EmptyTableRow colSpan={isFixedAssetLotItem(item) ? 10 : 9} message={`No item ${pluralBatchLabel.toLowerCase()} match the current filters.`} />
                  ) : pagedRecords.map(record => (
                    <tr key={record.id}>
                      <td className="col-user">
                        <div className="identity-cell">
                          <div className="user-name">{record.batch_number}</div>
                          <div className="user-username mono">{record.item_code ?? item?.code ?? "-"}</div>
                        </div>
                      </td>
                      <td>{formatQuantity(record.quantity)}</td>
                      <td>{formatQuantity(record.available_quantity)}</td>
                      <td>{formatItemDate(record.manufactured_date)}</td>
                      <td>{formatItemDate(record.expiry_date)}</td>
                      <td>{isFixedAssetLotItem(item) ? <span className="pill pill-neutral">No expiry</span> : isExpired(record.expiry_date) ? <StatusPill tone="warning" label="Expired" /> : <StatusPill tone="success" label="Valid" />}</td>
                      {isFixedAssetLotItem(item) ? <td>{formatMoneyValue(record.depreciation_summary?.current_wdv)}</td> : null}
                      <td><StatusPill active={record.is_active} /></td>
                      <td>{record.created_by_name ?? "-"}</td>
                      <td>{formatItemDate(record.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <ListPagination
            summary={filteredRecords.length === 0 ? `Showing 0 ${pluralBatchLabel.toLowerCase()}` : `Showing ${pageStart}-${pageEnd} of ${filteredRecords.length} ${pluralBatchLabel.toLowerCase()}`}
            page={page}
            totalPages={totalPages}
            onPrev={() => setPage(current => Math.max(1, current - 1))}
            onNext={() => setPage(current => Math.min(totalPages, current + 1))}
          />
        </div>
      </div>
    </div>
  );
}
