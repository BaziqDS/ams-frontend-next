"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Topbar } from "@/components/Topbar";
import type { CategoryRecord } from "@/components/CategoryModal";
import { useCan, useCapabilities } from "@/contexts/CapabilitiesContext";
import { apiFetch, type Page } from "@/lib/api";
import {
  canShowInstances,
  canShowBatches,
  findDistributionUnit,
  flattenDistributionDetails,
  formatItemDate,
  formatItemLabel,
  formatQuantity,
  isLowStock,
  itemStatusTone,
  toNumber,
  type ItemDistributionDetailRow,
  type ItemDistributionUnit,
  type ItemRecord,
  type ItemStatusTone,
} from "@/lib/itemUi";

const Ic = ({ d, size = 16 }: { d: ReactNode | string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true" focusable="false">
    {typeof d === "string" ? <path d={d} /> : d}
  </svg>
);

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
};

function normalizeList<T>(data: Page<T> | T[]) {
  return Array.isArray(data) ? data : data.results;
}

function getMediaHref(file: string | null | undefined) {
  if (!file) return null;
  return file.startsWith("http") ? file : `${API_BASE}${file}`;
}

function Alert({ children, onDismiss, action }: { children: ReactNode; onDismiss?: () => void; action?: ReactNode }) {
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

function DetailKV({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
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

function itemPayload(form: ItemFormState) {
  return {
    name: form.name.trim(),
    code: form.code.trim().toUpperCase(),
    category: Number(form.category),
    acct_unit: form.acct_unit.trim(),
    low_stock_threshold: Number(form.low_stock_threshold),
    description: form.description.trim() || null,
    specifications: form.specifications.trim() || null,
    is_active: form.is_active,
  };
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
  onClose,
  onSave,
}: {
  open: boolean;
  mode: "create" | "edit";
  item: ItemRecord | null;
  categories: CategoryRecord[];
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
      const body = JSON.stringify(itemPayload(form));
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

            <Section n={1} title="Identity" sub="Core item details used throughout inventory records.">
              <div className="form-grid cols-2">
                <Field label="Item name" required error={errors.name}>
                  <input value={form.name} onChange={e => set({ name: e.target.value })} onBlur={() => setTouched(prev => new Set(prev).add("name"))} placeholder="Enter item name" />
                </Field>
                <Field label="Item code" hint="Leave blank to let the backend generate one.">
                  <input value={form.code} onChange={e => set({ code: e.target.value.toUpperCase() })} placeholder="Enter item code" />
                </Field>
                <Field label="Subcategory" required error={errors.category} span={2} hint={categories.length === 0 ? "You need at least one subcategory before creating items." : "Tracking type is inherited from the selected subcategory."}>
                  <select value={form.category} onChange={e => set({ category: e.target.value })} onBlur={() => setTouched(prev => new Set(prev).add("category"))} disabled={categories.length === 0}>
                    <option value="">Select subcategory</option>
                    {categories.map(category => (
                      <option key={category.id} value={category.id}>
                        {category.name} ({category.code}) - {formatItemLabel(category.resolved_tracking_type ?? category.tracking_type)}
                      </option>
                    ))}
                  </select>
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
  canEdit,
  canDelete,
  pageBusy,
  deleteBusy,
  onEdit,
  onDelete,
}: {
  item: ItemRecord;
  canEdit: boolean;
  canDelete: boolean;
  pageBusy: boolean;
  deleteBusy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="row-actions">
      <Link className="btn btn-xs btn-ghost row-action" href={`/items/${item.id}`} onClick={event => event.stopPropagation()} title="Open distribution">
        <Ic d="M9 18l6-6-6-6" size={13} />
        <span className="ra-label">Open</span>
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
        <div className="avatar" style={{ width: 44, height: 44, fontSize: 12, background: "linear-gradient(135deg, color-mix(in oklch, var(--primary) 82%, white), var(--primary))" }}>
          {(item.name || "IT").split(" ").map(n => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "IT"}
        </div>
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
          <span className="chip">{formatItemLabel(String(item.tracking_type ?? ""))}</span>
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
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [trackingFilter, setTrackingFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [density, setDensity] = useState<Density>("balanced");
  const [mode, setMode] = useState<"table" | "grid">("table");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemRecord | null>(null);
  const [busyAction, setBusyAction] = useState<{ kind: "delete"; itemId: number } | null>(null);

  const leafCategories = useMemo(
    () => categories.filter(category => category.parent_category !== null && category.is_active),
    [categories],
  );

  const loadItems = useCallback(async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
    if (showLoading) setIsLoading(true);
    setFetchError(null);
    try {
      const [itemsData, categoriesData] = await Promise.all([
        apiFetch<Page<ItemRecord> | ItemRecord[]>("/api/inventory/items/?page_size=500"),
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
  }, [canManageItems]);

  useEffect(() => {
    if (capsLoading) return;
    if (!canViewItems) {
      router.replace("/403");
      return;
    }
    loadItems();
  }, [canViewItems, capsLoading, loadItems, router]);

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
      if (categoryFilter !== "all" && item.category_display !== categoryFilter) return false;
      if (trackingFilter !== "all" && item.tracking_type !== trackingFilter) return false;
      if (statusFilter === "active" && !item.is_active) return false;
      if (statusFilter === "disabled" && item.is_active) return false;
      if (statusFilter === "available" && toNumber(item.available_quantity) <= 0) return false;
      if (statusFilter === "out" && (toNumber(item.total_quantity) <= 0 || toNumber(item.available_quantity) > 0)) return false;
      if (statusFilter === "low" && !isLowStock(item)) return false;
      return true;
    });
  }, [categoryFilter, items, search, statusFilter, trackingFilter]);

  const categoryOptions = useMemo(() => {
    const values = new Set<string>();
    items.forEach(item => {
      if (item.category_display) values.add(item.category_display);
    });
    return Array.from(values).sort();
  }, [items]);

  const trackingOptions = useMemo(() => {
    const values = new Set<string>();
    items.forEach(item => {
      if (item.tracking_type) values.add(String(item.tracking_type));
    });
    return Array.from(values).sort();
  }, [items]);

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
            <div className="page-sub">Browse item records and open each item to inspect stock distribution by standalone location.</div>
          </div>
        </div>

        <div className="filter-bar">
          <div className="filter-bar-left">
            <div className="search-input">
              <Ic d={<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>} size={14} />
              <input placeholder="Search by item, code, category, unit, or specification..." value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button type="button" className="clear-search" onClick={() => setSearch("")}>x</button>}
            </div>

            <div className="filter-select-group">
              <div className="chip-filter-label">Category</div>
              <label className="filter-select-wrap">
                <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} aria-label="Filter items by category">
                  <option value="all">All categories</option>
                  {categoryOptions.map(category => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
            </div>

            <div className="filter-select-group">
              <div className="chip-filter-label">Tracking</div>
              <label className="filter-select-wrap">
                <select value={trackingFilter} onChange={e => setTrackingFilter(e.target.value)} aria-label="Filter items by tracking type">
                  <option value="all">All tracking</option>
                  {trackingOptions.map(tracking => <option key={tracking} value={tracking}>{formatItemLabel(tracking)}</option>)}
                </select>
              </label>
            </div>

            <div className="filter-select-group">
              <div className="chip-filter-label">Status</div>
              <label className="filter-select-wrap">
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Filter items by status">
                  <option value="all">All statuses</option>
                  <option value="available">Available</option>
                  <option value="low">Low stock</option>
                  <option value="out">No stock</option>
                  <option value="active">Active</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>
            </div>
          </div>

          <div className="filter-bar-right">
            <DensityToggle density={density} setDensity={setDensity} />
            <div className="seg" title="View mode">
              <button type="button" className={"seg-btn icon-only" + (mode === "table" ? " active" : "")} onClick={() => setMode("table")} title="Table">
                <Ic d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" size={14} />
              </button>
              <button type="button" className={"seg-btn icon-only" + (mode === "grid" ? " active" : "")} onClick={() => setMode("grid")} title="Grid">
                <Ic d={<><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>} size={14} />
              </button>
            </div>
            {canManageItems && (
              <button type="button" className="btn btn-sm btn-primary" onClick={openCreateModal} disabled={pageBusy}>
                <Ic d="M12 5v14M5 12h14" size={14} />
                Add Item
              </button>
            )}
          </div>
        </div>

        {mode === "table" ? (
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

          {isLoading ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--muted)", borderTop: "1px solid var(--hairline)" }}>Loading items...</div>
          ) : (
            <div className="h-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Category</th>
                    <th>Tracking</th>
                    <th>Total</th>
                    <th>Available</th>
                    <th>In Transit</th>
                    <th>Status</th>
                    <th>Alert</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length === 0 ? (
                    <EmptyTableRow colSpan={10} message="No items match the current filters." />
                  ) : filteredItems.map(item => {
                    const tone = itemStatusTone(item);
                    return (
                      <tr key={item.id} onClick={() => router.push(`/items/${item.id}`)} style={{ cursor: "pointer" }}>
                        <td className="col-user">
                          <div className="user-cell">
                            <div className="avatar" style={{ width: 32, height: 32, fontSize: 11, background: "linear-gradient(135deg, color-mix(in oklch, var(--primary) 82%, white), var(--primary))" }}>
                              {(item.name || "IT").split(" ").map(n => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "IT"}
                            </div>
                            <div>
                              <div className="user-name">{item.name}</div>
                              <div className="user-username mono">{item.code}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <div className="group-cell">
                            <span className="chip">{item.category_display ?? "Uncategorized"}</span>
                            {item.category_type && <span className="muted-note mono">{formatItemLabel(item.category_type)}</span>}
                          </div>
                        </td>
                        <td><span className="chip">{formatItemLabel(String(item.tracking_type ?? ""))}</span></td>
                        <td className="mono">{formatQuantity(item.total_quantity)}</td>
                        <td className="mono">{formatQuantity(item.available_quantity)}</td>
                        <td className="mono">{formatQuantity(item.in_transit_quantity)}</td>
                        <td><StatusPill tone={tone} label={tone === "danger" ? "Out of Stock" : "In Stock"} /></td>
                        <td>{isLowStock(item) ? <LowStockBadge item={item} /> : <span className="muted-note">-</span>}</td>
                        <td className="col-login">
                          <div className="login-cell">
                            <div>{formatItemDate(item.updated_at, "Unknown")}</div>
                            <div className="login-cell-sub mono">{item.acct_unit ?? "unit"}</div>
                          </div>
                        </td>
                        <td className="col-actions">
                          <ItemActions
                            item={item}
                            canEdit={canManageItems}
                            canDelete={canDeleteItems}
                            pageBusy={pageBusy}
                            deleteBusy={deleteBusyItemId === item.id}
                            onEdit={() => openEditModal(item)}
                            onDelete={() => handleDelete(item)}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="table-card-foot">
            <div className="eyebrow">Showing {filteredItems.length} rows</div>
            <div className="pager">
              <span className="mono pager-current">Permission-scoped totals</span>
            </div>
          </div>
        </div>
        ) : filteredItems.length > 0 ? (
          <div className="users-grid">
            {filteredItems.map(item => (
              <ItemCard
                key={item.id}
                item={item}
                canEdit={canManageItems}
                canDelete={canDeleteItems}
                pageBusy={pageBusy}
                deleteBusy={deleteBusyItemId === item.id}
                onOpen={() => router.push(`/items/${item.id}`)}
                onEdit={() => openEditModal(item)}
                onDelete={() => handleDelete(item)}
              />
            ))}
          </div>
        ) : (
          <div className="table-card">
            <div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
              No items match the current filters.
            </div>
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
          Batches
        </Link>
      )}
    </>
  );
}

function useItemDistribution(itemId: string) {
  const [item, setItem] = useState<ItemRecord | null>(null);
  const [units, setUnits] = useState<ItemDistributionUnit[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const load = useCallback(async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
    if (!itemId) return false;
    if (showLoading) setIsLoading(true);
    setFetchError(null);
    try {
      const [itemData, unitData] = await Promise.all([
        apiFetch<ItemRecord>(`/api/inventory/items/${itemId}/`),
        apiFetch<ItemDistributionUnit[]>(`/api/inventory/distribution/hierarchical/?item=${encodeURIComponent(itemId)}`),
      ]);
      setItem(itemData);
      setUnits(unitData);
      return true;
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load item distribution");
      return false;
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [itemId]);

  return { item, units, isLoading, fetchError, setFetchError, load };
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
                  ) : filteredUnits.map(unit => (
                    <tr key={unit.id} onClick={() => router.push(`/items/${itemId}/distribution/${unit.id}`)} style={{ cursor: "pointer" }}>
                      <td className="col-user">
                        <div className="user-cell">
                          <div className="avatar" style={{ width: 32, height: 32, fontSize: 11, background: "linear-gradient(135deg, #3b4052, #0e1116)" }}>
                            {(unit.name || "LC").split(" ").map(n => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "LC"}
                          </div>
                          <div>
                            <div className="user-name">{unit.name}</div>
                            <div className="user-username mono">{unit.code}</div>
                          </div>
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

          <div className="table-card-foot">
            <div className="eyebrow">Distribution is scoped by your item permissions and assigned locations</div>
            <div className="pager"><span className="mono pager-current">Standalone summary</span></div>
          </div>
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
              <label className="filter-select-wrap">
                <select value={kindFilter} onChange={e => setKindFilter(e.target.value)} aria-label="Filter distribution detail by type">
                  <option value="all">All rows</option>
                  <option value="store">Stores</option>
                  <option value="location">Non-store locations</option>
                  <option value="person">Persons</option>
                </select>
              </label>
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
                  ) : filteredDetails.map(row => (
                    <tr key={row.id}>
                      <td className="col-user">
                        <div className="user-cell">
                          <div className="avatar" style={{ width: 32, height: 32, fontSize: 11, background: row.kind === "person" ? "linear-gradient(135deg, #8a7b60, #4d442f)" : "linear-gradient(135deg, #3b4052, #0e1116)" }}>
                            {(row.name || "DT").split(" ").map(n => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "DT"}
                          </div>
                          <div>
                            <div className="user-name">{row.name}</div>
                            <div className="user-username mono">{row.id}</div>
                          </div>
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
                            <span className="ra-label">Batches</span>
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="table-card-foot">
            <div className="eyebrow">Store rows are physical balances; person and non-store rows are active allocations</div>
            <div className="pager"><span className="mono pager-current">Nested distribution</span></div>
          </div>
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
                  <input placeholder="Search serial, QR, location, assignee, or authority store..." value={search} onChange={e => setSearch(e.target.value)} />
                  {search && <button type="button" className="clear-search" onClick={() => setSearch("")}>x</button>}
                </div>
                <div className="filter-select-group">
                  <div className="chip-filter-label">Status</div>
                  <label className="filter-select-wrap">
                    <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} aria-label="Filter item instances by status">
                      <option value="all">All statuses</option>
                      {statusOptions.map(status => <option key={status} value={status}>{formatItemLabel(status)}</option>)}
                    </select>
                  </label>
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
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Instance</th>
                        <th>QR</th>
                        <th>Status</th>
                        <th>Current Location</th>
                        <th>Allocated To</th>
                        <th>In Charge</th>
                        <th>Authority Store</th>
                        <th>Active</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRecords.length === 0 ? (
                        <EmptyTableRow colSpan={8} message="No item instances match the current filters." />
                      ) : filteredRecords.map(record => (
                        <tr key={record.id} className="clickable-table-row" onClick={() => router.push(`/items/${itemId}/instances/${record.id}`)}>
                          <td className="col-user">
                            <div className="user-cell">
                              <div className="avatar" style={{ width: 32, height: 32, fontSize: 11, background: "linear-gradient(135deg, color-mix(in oklch, var(--primary) 82%, white), var(--primary))" }}>
                                {(record.serial_number || "IN").slice(0, 2).toUpperCase()}
                              </div>
                              <div>
                                <div className="user-name">{record.serial_number}</div>
                                <div className="user-username mono">#{record.id}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <div className="instance-qr-cell">
                              {record.qr_code_image ? <img src={getMediaHref(record.qr_code_image) ?? undefined} alt="" /> : <span className="instance-qr-placeholder">QR</span>}
                              <span className="mono">{record.qr_code ?? "-"}</span>
                            </div>
                          </td>
                          <td><span className="chip">{formatItemLabel(record.status)}</span></td>
                          <td>
                            <div className="login-cell">
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
                            <div className="login-cell">
                              <div>{record.authority_store_name ?? "-"}</div>
                              <div className="login-cell-sub mono">{record.authority_store_code ?? "-"}</div>
                            </div>
                          </td>
                          <td><StatusPill active={record.is_active} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="table-card-foot">
                <div className="eyebrow">Instances are available only for individually tracked items</div>
                <div className="pager"><span className="mono pager-current">Item instances</span></div>
              </div>
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

  return (
    <div data-density={density}>
      <Topbar breadcrumb={["Inventory", "Items", item?.name ?? "Item", "Batches"]} />
      <div className="page">
        {fetchError && (
          <Alert onDismiss={() => setFetchError(null)} action={<button type="button" className="btn btn-xs" onClick={() => load()}>Retry</button>}>
            {fetchError}
          </Alert>
        )}

        <div className="page-head">
          <div className="page-title-group">
            <div className="eyebrow">Item batches</div>
            <h1>{item?.name ?? "Batches"}</h1>
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
              <input placeholder="Search batch, item code, or creator..." value={search} onChange={e => setSearch(e.target.value)} />
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
              <div className="eyebrow">Batch list</div>
              <div className="table-count">
                <span className="mono">{filteredRecords.length}</span>
                <span>of</span>
                <span className="mono">{records.length}</span>
                <span>batches</span>
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
                    <th>Batch</th>
                    <th>Quantity</th>
                    <th>Available</th>
                    <th>Manufactured</th>
                    <th>Expiry</th>
                    <th>Expiry Status</th>
                    <th>Active</th>
                    <th>Created By</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecords.length === 0 ? (
                    <EmptyTableRow colSpan={9} message="No item batches match the current filters." />
                  ) : filteredRecords.map(record => (
                    <tr key={record.id}>
                      <td className="col-user">
                        <div className="user-cell">
                          <div className="avatar" style={{ width: 32, height: 32, fontSize: 11, background: "linear-gradient(135deg, #3b4052, #0e1116)" }}>
                            {(record.batch_number || "BA").slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="user-name">{record.batch_number}</div>
                            <div className="user-username mono">{record.item_code ?? item?.code ?? "-"}</div>
                          </div>
                        </div>
                      </td>
                      <td>{formatQuantity(record.quantity)}</td>
                      <td>{formatQuantity(record.available_quantity)}</td>
                      <td>{formatItemDate(record.manufactured_date)}</td>
                      <td>{formatItemDate(record.expiry_date)}</td>
                      <td>{isExpired(record.expiry_date) ? <StatusPill tone="warning" label="Expired" /> : <StatusPill tone="success" label="Valid" />}</td>
                      <td><StatusPill active={record.is_active} /></td>
                      <td>{record.created_by_name ?? "-"}</td>
                      <td>{formatItemDate(record.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="table-card-foot">
            <div className="eyebrow">Batches are stock group records for perishable quantity items</div>
            <div className="pager"><span className="mono pager-current">Item batches</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
