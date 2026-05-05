"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, type Page } from "@/lib/api";
import type { CategoryRecord } from "@/components/CategoryModal";
import { ItemModal } from "@/components/ItemModuleViews";
import { ThemedSelect } from "@/components/ThemedSelect";
import { formatItemLabel, type ItemRecord } from "@/lib/itemUi";
import {
  buildStageItemsPayload,
  getDefaultFinanceCheckDate,
  getInspectionCentralStoreRegisters,
  getInspectionMainStoreRegisters,
  normalizeStageItems,
  parseInspectionQuantity,
  type StageItemsPayloadMode,
} from "@/lib/inspectionStageForms";
import type {
  InspectionItemOption,
  InspectionItemRecord,
  InspectionRecord,
  InspectionStockRegisterOption,
} from "@/lib/inspectionUi";
import { InspectionIcon } from "./InspectionDialogs";

type StageFormProps = {
  data: InspectionRecord;
  onChange: (data: InspectionRecord) => void;
  readOnly?: boolean;
};

type InspectionLocationDetail = {
  id: number;
  hierarchy_level?: number | null;
  main_store_id?: number | null;
  main_store_display?: string | null;
  root_main_store_id?: number | null;
  root_main_store_display?: string | null;
};

type DepreciationAssetClassOption = {
  id: number;
  name: string;
  code: string;
  current_rate?: string | null;
};

function normalizeApiList<T>(data: Page<T> | T[]) {
  return Array.isArray(data) ? data : data.results;
}

function acceptedItems(items: InspectionItemRecord[]) {
  return items.filter(item => Number(item.accepted_quantity || 0) > 0);
}

function isFixedAssetQuantityItem(item: Pick<InspectionItemRecord, "item_category_type" | "item_tracking_type">) {
  return item.item_category_type === "FIXED_ASSET" && item.item_tracking_type === "QUANTITY";
}

function needsLotNumber(item: Pick<InspectionItemRecord, "item_category_type" | "item_tracking_type">) {
  return item.item_category_type === "PERISHABLE" || isFixedAssetQuantityItem(item);
}

function isFixedAssetInspectionItem(item: Pick<InspectionItemRecord, "item_category_type">) {
  return item.item_category_type === "FIXED_ASSET";
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function getAssetClassLabel(assetClass: DepreciationAssetClassOption) {
  return assetClass.current_rate
    ? `${assetClass.name} (${assetClass.code}) - ${assetClass.current_rate}%`
    : `${assetClass.name} (${assetClass.code})`;
}

function Field({
  label,
  children,
  grow,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  grow?: boolean;
  hint?: string;
}) {
  return (
    <label className={"stage-form-field" + (grow ? " stage-form-field-grow" : "")}>
      <span className="stage-form-label">{label}</span>
      {children}
      {hint ? <span className="stage-form-helper">{hint}</span> : null}
    </label>
  );
}

function SectionIntro({
  icon,
  title,
  copy,
}: {
  icon: React.ReactNode;
  title: string;
  copy: string;
}) {
  return (
    <div className="inspection-active-stage-summary">
      <div className="inspection-active-stage-icon">{icon}</div>
      <div>
        <div className="inspection-action-stage">{title}</div>
        <div className="inspection-action-guidance">{copy}</div>
      </div>
      <span className="pill pill-info">Active form</span>
    </div>
  );
}

function EmptyStage({ children }: { children: React.ReactNode }) {
  return <div className="stage-form-readonly">{children}</div>;
}

function updateItemAt(
  data: InspectionRecord,
  onChange: (data: InspectionRecord) => void,
  index: number,
  patch: Partial<InspectionItemRecord>,
) {
  const items = [...(data.items || [])];
  items[index] = { ...items[index], ...patch };
  onChange({ ...data, items });
}

function getRegisterOptionLabel(register: InspectionStockRegisterOption) {
  return register.store_name || register.location_name
    ? `${register.register_number} - ${register.store_name ?? register.location_name}`
    : register.register_number;
}

function CatalogItemSearchField({
  item,
  options,
  disabled,
  createDisabled,
  onSelect,
  onClear,
  onCreate,
  onPreviewChange,
}: {
  item: Pick<InspectionItemRecord, "item" | "item_name" | "item_code">;
  options: InspectionItemOption[];
  disabled?: boolean;
  createDisabled?: boolean;
  onSelect: (option: InspectionItemOption) => void;
  onClear: () => void;
  onCreate: () => void;
  onPreviewChange: (option: InspectionItemOption | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(item.item_name || "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      setQuery(item.item_name || "");
    }
  }, [item.item, item.item_name, open]);

  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options.slice(0, 8);

    return options
      .filter(option => `${option.name} ${option.code}`.toLowerCase().includes(normalizedQuery))
      .slice(0, 8);
  }, [options, query]);

  const focusSearch = () => {
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      if (item.item_name) inputRef.current?.select();
    });
  };

  return (
    <div
      className={`stage3-catalog-field${open ? " open" : ""}${disabled ? " disabled" : ""}`}
      onBlur={event => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          setOpen(false);
          setQuery(item.item_name || "");
          onPreviewChange(null);
        }
      }}
    >
      <div className="stage3-catalog-toolbar">
        <div className="stage3-catalog-combobox">
          <div
            className="stage3-catalog-trigger"
            onClick={() => {
              if (disabled) return;
              setOpen(true);
              focusSearch();
            }}
          >
            <span className="stage3-catalog-search-icon" aria-hidden="true">
              <InspectionIcon d={<><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>} size={13} />
            </span>
            <input
              ref={inputRef}
              value={query}
              placeholder="Search catalog item"
              disabled={disabled}
              onFocus={() => {
                if (disabled) return;
                setOpen(true);
                onPreviewChange(null);
              }}
              onChange={event => {
                if (!open) setOpen(true);
                setQuery(event.target.value);
                onPreviewChange(null);
              }}
              aria-label="Search catalog item"
            />
            {item.item && !disabled ? (
              <button
                type="button"
                className="stage3-catalog-clear"
                onClick={event => {
                  event.stopPropagation();
                  onClear();
                  onPreviewChange(null);
                  setQuery("");
                  setOpen(true);
                  requestAnimationFrame(() => inputRef.current?.focus());
                }}
                aria-label={`Clear linked catalog item ${item.item_name || ""}`.trim()}
                title="Clear linked item"
              >
                <InspectionIcon d="M18 6L6 18M6 6l12 12" size={11} />
              </button>
            ) : null}
          </div>

          {open && !disabled ? (
            <div className="stage3-catalog-menu" onMouseLeave={() => onPreviewChange(null)}>
              <div className="assignment-list" style={{ maxHeight: 220 }}>
                {filteredOptions.length > 0 ? filteredOptions.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    className={`assignment-row${option.id === item.item ? " selected" : ""}`}
                    onMouseEnter={() => onPreviewChange(option)}
                    onFocus={() => onPreviewChange(option)}
                    onClick={() => {
                      onSelect(option);
                      onPreviewChange(option);
                      setQuery(option.name);
                      setOpen(false);
                    }}
                  >
                    <span className="assignment-name">{option.name}</span>
                    <span className="assignment-code mono">{option.code || "No code"}</span>
                  </button>
                )) : (
                  <div className="scope-empty">No matching catalog items</div>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {!disabled ? (
          <button
            type="button"
            className="btn btn-xs btn-icon stage3-catalog-create-btn"
            onClick={onCreate}
            disabled={createDisabled}
            title="Create new catalog item"
            aria-label="Create new catalog item"
          >
            <InspectionIcon d="M12 5v14M5 12h14" size={12} />
          </button>
        ) : null}
      </div>
    </div>
  );
}

function CatalogItemPreviewCard({
  item,
  preview,
}: {
  item: Pick<InspectionItemRecord, "item_description" | "accepted_quantity">;
  preview: InspectionItemOption | null;
}) {
  if (!preview) {
    return (
      <aside className="stage3-preview-card is-placeholder" aria-live="polite">
        <div className="stage3-preview-eyebrow">Catalog preview</div>
        <div className="stage3-preview-title">No catalog item selected</div>
        <p className="stage3-preview-copy">
          Hover any search result to preview it here. Once linked, this panel will keep showing the linked item details for quick verification.
        </p>
        <div className="stage3-preview-placeholder-block">
          <span className="stage3-preview-placeholder-label">Inspection item</span>
          <strong>{item.item_description || "Unnamed inspection item"}</strong>
          <span>{item.accepted_quantity} accepted for central registry mapping.</span>
        </div>
      </aside>
    );
  }

  const categoryLabel = preview.category_display || formatItemLabel(preview.category_type, "Category pending");
  const trackingLabel = formatItemLabel(preview.tracking_type, "Tracking pending");

  return (
    <aside className="stage3-preview-card" aria-live="polite">
      <div className="stage3-preview-eyebrow">Catalog preview</div>
      <div className="stage3-preview-title-row">
        <div>
          <div className="stage3-preview-title">{preview.name}</div>
          <div className="stage3-preview-code mono">{preview.code || "No code assigned"}</div>
        </div>
      </div>
      <div className="stage3-preview-tags">
        <span className="chip">{categoryLabel}</span>
        <span className="chip">{trackingLabel}</span>
        <span className="chip">{preview.acct_unit?.trim() || "unit"}</span>
      </div>
      <div className="stage3-preview-sections">
        <div className="stage3-preview-section">
          <span className="stage3-preview-section-label">Description</span>
          <p>{preview.description?.trim() || "No catalog description has been added yet."}</p>
        </div>
        <div className="stage3-preview-section">
          <span className="stage3-preview-section-label">Specifications</span>
          <p>{preview.specifications?.trim() || "No technical specifications have been added yet."}</p>
        </div>
      </div>
    </aside>
  );
}

export function Stage1Form({ data, onChange, readOnly }: StageFormProps) {
  const addItem = () => {
    onChange({
      ...data,
      items: [
        ...(data.items || []),
        {
          item: null,
          item_description: "",
          item_specifications: "",
          tendered_quantity: 1,
          accepted_quantity: 0,
          rejected_quantity: 0,
          unit_price: "0.00",
          remarks: "",
          stock_register: null,
          stock_register_no: "",
          stock_register_page_no: "",
          stock_entry_date: "",
          central_register: null,
          central_register_no: "",
          central_register_page_no: "",
          batch_number: "",
          manufactured_date: "",
          expiry_date: "",
          depreciation_asset_class: null,
          capitalization_cost: "",
          capitalization_date: "",
        },
      ],
    });
  };

  const removeItem = (index: number) => {
    if (data.items.length <= 1) return;
    onChange({ ...data, items: data.items.filter((_, itemIndex) => itemIndex !== index) });
  };

  return (
    <div className="stage-form-list">
      <SectionIntro
        icon={<InspectionIcon d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" size={18} />}
        title="Inspection items"
        copy="Capture tendered quantities, accepted quantities, rejections, unit pricing, and line-level remarks before initiating the workflow."
      />

      {(data.items || []).map((item, index) => (
        <div key={item.id ?? `stage-1-${index}`} className="stage-form-row">
          <div className="stage-form-item-head">
            <span className="stage-form-item-index">{index + 1}</span>
            <div className="stage-form-item-text">
              <div className="stage-form-item-name">{item.item_description || `Inspection item ${index + 1}`}</div>
              <div className="stage-form-item-meta">
                <span><strong>{item.tendered_quantity || 0}</strong> tendered</span>
                <span><strong>{item.accepted_quantity || 0}</strong> accepted</span>
                <span><strong>{item.rejected_quantity || 0}</strong> rejected</span>
              </div>
            </div>
            {!readOnly && data.items.length > 1 ? (
              <button type="button" className="btn btn-xs btn-danger-ghost" onClick={() => removeItem(index)}>
                <InspectionIcon d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0l1 12h6l1-12" size={12} />
                Remove
              </button>
            ) : null}
          </div>

          <div className="stage-form-fields stage-form-fields-2">
            <Field label="Item description">
              <input
                value={item.item_description || ""}
                onChange={event => updateItemAt(data, onChange, index, { item_description: event.target.value })}
                disabled={readOnly}
                placeholder="e.g. DELL LATITUDE 5440"
              />
            </Field>
            <Field label="Technical specifications">
              <input
                value={item.item_specifications || ""}
                onChange={event => updateItemAt(data, onChange, index, { item_specifications: event.target.value })}
                disabled={readOnly}
                placeholder="Model, brand, technical specs"
              />
            </Field>
          </div>

          <div className="stage-form-fields stage-form-fields-3">
            <Field label="Tendered quantity">
              <input
                type="number"
                min={1}
                value={item.tendered_quantity}
                onChange={event => updateItemAt(data, onChange, index, { tendered_quantity: parseInspectionQuantity(event.target.value) })}
                disabled={readOnly}
              />
            </Field>
            <Field label="Accepted quantity">
              <input
                type="number"
                min={0}
                value={item.accepted_quantity}
                onChange={event => updateItemAt(data, onChange, index, { accepted_quantity: parseInspectionQuantity(event.target.value) })}
                disabled={readOnly}
              />
            </Field>
            <Field label="Rejected quantity">
              <input
                type="number"
                min={0}
                value={item.rejected_quantity}
                onChange={event => updateItemAt(data, onChange, index, { rejected_quantity: parseInspectionQuantity(event.target.value) })}
                disabled={readOnly}
              />
            </Field>
            <Field label="Unit price (PKR)">
              <input
                type="number"
                min={0}
                step="0.01"
                value={item.unit_price}
                onChange={event => updateItemAt(data, onChange, index, { unit_price: event.target.value })}
                disabled={readOnly}
              />
            </Field>
            <Field label={Number(item.rejected_quantity || 0) > 0 ? "Reason for rejection" : "Line remarks"} grow>
              <input
                value={item.remarks || ""}
                onChange={event => updateItemAt(data, onChange, index, { remarks: event.target.value })}
                disabled={readOnly}
                placeholder={Number(item.rejected_quantity || 0) > 0 ? "Specify why these units were rejected" : "Optional notes for this item"}
              />
            </Field>
          </div>
        </div>
      ))}

      {!readOnly ? (
        <button type="button" className="btn btn-sm" onClick={addItem}>
          <InspectionIcon d="M12 5v14M5 12h14" size={13} />
          Add item
        </button>
      ) : null}
    </div>
  );
}

export function Stage2Form({ data, onChange, readOnly }: StageFormProps) {
  const [registers, setRegisters] = useState<InspectionStockRegisterOption[]>([]);
  const [mainStoreName, setMainStoreName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const seededRecordingDatesRef = useRef(new Set<string>());

  useEffect(() => {
    let ignored = false;
    setLoading(true);
    Promise.all([
      apiFetch<Page<InspectionStockRegisterOption> | InspectionStockRegisterOption[]>("/api/inventory/stock-registers/?page_size=500").then(normalizeApiList),
      data.department
        ? apiFetch<InspectionLocationDetail>(`/api/inventory/locations/${data.department}/`).catch(() => null)
        : Promise.resolve(null),
    ])
      .then(([loadedRegisters, location]) => {
        if (ignored) return;
        setMainStoreName(location?.main_store_display ?? null);
        setRegisters(getInspectionMainStoreRegisters(loadedRegisters, location));
      })
      .catch(() => {
        if (!ignored) setRegisters([]);
      })
      .finally(() => {
        if (!ignored) setLoading(false);
      });
    return () => {
      ignored = true;
    };
  }, [data.department]);

  const rows = acceptedItems(data.items || []);

  useEffect(() => {
    if (readOnly || rows.length === 0) return;

    let changed = false;
    const nextItems = (data.items || []).map((item, index) => {
      if (Number(item.accepted_quantity || 0) <= 0 || item.stock_entry_date) return item;

      const key = String(item.id ?? index);
      if (seededRecordingDatesRef.current.has(key)) return item;

      seededRecordingDatesRef.current.add(key);
      changed = true;
      return {
        ...item,
        stock_entry_date: getDefaultFinanceCheckDate(item.stock_entry_date),
      };
    });

    if (changed) {
      onChange({ ...data, items: nextItems });
    }
  }, [data, onChange, readOnly, rows]);

  if (rows.length === 0) {
    return <EmptyStage>No accepted items are available for department stock-register recording.</EmptyStage>;
  }

  return (
    <div className="stage-form-list">
      {rows.map((item, acceptedIndex) => {
        const sourceIndex = data.items.findIndex(candidate => candidate === item);
        return (
          <div key={item.id ?? `stage-2-${acceptedIndex}`} className="stage-form-row stage-form-register-row">
            <div className="stage-form-item-head">
              <span className="stage-form-item-index">{acceptedIndex + 1}</span>
              <div className="stage-form-item-text">
                <div className="stage-form-item-name">{item.item_description || item.item_name || "Unnamed item"}</div>
                <div className="stage-form-item-meta">
                  <span><strong>{item.accepted_quantity}</strong> accepted</span>
                  {Number(item.rejected_quantity || 0) > 0 ? <span><strong>{item.rejected_quantity}</strong> rejected</span> : null}
                </div>
              </div>
            </div>

            <div className="stage-form-fields stage-form-fields-3 stage-form-register-fields">
              <Field label="Register reference" hint={mainStoreName ? `Showing registers for ${mainStoreName}.` : "Showing registers for this inspection location when available."}>
                <div className="filter-select-wrap stage-select-wrap">
                  <ThemedSelect
                    value={item.stock_register == null ? "" : String(item.stock_register)}
                    onChange={value => {
                      const selectedId = value ? Number(value) : null;
                      const register = registers.find(option => option.id === selectedId);
                      updateItemAt(data, onChange, sourceIndex, {
                        stock_register: selectedId,
                        stock_register_no: register?.register_number ?? "",
                      });
                    }}
                    placeholder="Select register..."
                    ariaLabel="Register reference"
                    size="compact"
                    disabled={readOnly || loading}
                    options={registers.map(register => ({
                      value: String(register.id),
                      label: getRegisterOptionLabel(register),
                    }))}
                  />
                </div>
              </Field>
              <Field label="Page number">
                <input
                  value={item.stock_register_page_no || ""}
                  onChange={event => updateItemAt(data, onChange, sourceIndex, { stock_register_page_no: event.target.value })}
                  disabled={readOnly}
                  placeholder="42"
                />
              </Field>
              <Field label="Recording date" hint="Defaults to today and can still be edited.">
                <input
                  type="date"
                  value={item.stock_entry_date || ""}
                  onChange={event => updateItemAt(data, onChange, sourceIndex, { stock_entry_date: event.target.value })}
                  disabled={readOnly}
                />
              </Field>
            </div>
          </div>
        );
      })}

      <div className="stage-form-helper">Rejected or zero-accepted lines are omitted from department ledger recording.</div>
    </div>
  );
}

export function Stage3Form({ data, onChange, readOnly }: StageFormProps) {
  const [items, setItems] = useState<InspectionItemOption[]>([]);
  const [registers, setRegisters] = useState<InspectionStockRegisterOption[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [createModalRowIndex, setCreateModalRowIndex] = useState<number | null>(null);
  const [previewByIndex, setPreviewByIndex] = useState<Record<number, InspectionItemOption | null>>({});
  const [mainStoreName, setMainStoreName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let ignored = false;
    setLoading(true);
    Promise.all([
      apiFetch<Page<InspectionItemOption> | InspectionItemOption[]>("/api/inventory/items/?page_size=500").then(normalizeApiList),
      apiFetch<Page<InspectionStockRegisterOption> | InspectionStockRegisterOption[]>("/api/inventory/stock-registers/?page_size=500").then(normalizeApiList),
      apiFetch<Page<CategoryRecord> | CategoryRecord[]>("/api/inventory/categories/?page_size=500").then(normalizeApiList),
      data.department
        ? apiFetch<InspectionLocationDetail>(`/api/inventory/locations/${data.department}/`).catch(() => null)
        : Promise.resolve(null),
    ])
      .then(([loadedItems, loadedRegisters, loadedCategories, location]) => {
        if (ignored) return;
        setItems(loadedItems);
        setMainStoreName(location?.root_main_store_display ?? location?.main_store_display ?? null);
        setRegisters(getInspectionCentralStoreRegisters(loadedRegisters, location));
        setCategories(loadedCategories);
      })
      .catch(() => {
        if (ignored) return;
        setItems([]);
        setRegisters([]);
        setCategories([]);
      })
      .finally(() => {
        if (!ignored) setLoading(false);
      });
    return () => {
      ignored = true;
    };
  }, [data.department]);

  const rows = acceptedItems(data.items || []);
  if (rows.length === 0) {
    return <EmptyStage>No accepted items are available for central registry mapping.</EmptyStage>;
  }

  const leafCategories = categories.filter(category => category.parent_category !== null && category.is_active);
  const itemOptions = useMemo(() => {
    const byId = new Map(items.map(option => [option.id, option]));
    rows.forEach(item => {
      if (!item.item || byId.has(item.item)) return;
      byId.set(item.item, {
        id: item.item,
        name: item.item_name || item.item_description || `Item #${item.item}`,
        code: item.item_code || "",
        category_type: item.item_category_type ?? null,
        tracking_type: item.item_tracking_type ?? null,
        description: null,
        acct_unit: null,
        specifications: null,
      });
    });
    return Array.from(byId.values());
  }, [items, rows]);

  const linkInspectionItem = (sourceIndex: number, option: InspectionItemOption) => {
    const currentItem = data.items[sourceIndex];
    const shouldKeepLotNumber = option.category_type === "PERISHABLE" || (option.category_type === "FIXED_ASSET" && option.tracking_type === "QUANTITY");
    updateItemAt(data, onChange, sourceIndex, {
      item: option.id,
      item_name: option.name,
      item_code: option.code,
      item_category_type: option.category_type ?? null,
      item_tracking_type: option.tracking_type ?? null,
      batch_number: shouldKeepLotNumber ? currentItem?.batch_number || "" : "",
      manufactured_date: option.category_type === "PERISHABLE" ? currentItem?.manufactured_date || "" : "",
      expiry_date: option.category_type === "PERISHABLE" ? currentItem?.expiry_date || "" : "",
    });
    setPreviewByIndex(prev => ({ ...prev, [sourceIndex]: option }));
  };

  const unlinkInspectionItem = (sourceIndex: number) => {
    updateItemAt(data, onChange, sourceIndex, {
      item: null,
      item_name: "",
      item_code: "",
      item_category_type: null,
      item_tracking_type: null,
      batch_number: "",
      manufactured_date: "",
      expiry_date: "",
    });
    setPreviewByIndex(prev => ({ ...prev, [sourceIndex]: null }));
  };

  return (
    <div className="stage-form-list">
      <ItemModal
        open={createModalRowIndex !== null}
        mode="create"
        item={null}
        categories={leafCategories}
        provisionalInspectionId={data.id}
        onClose={() => setCreateModalRowIndex(null)}
        onSave={async (savedItem: ItemRecord) => {
          const previewItem: InspectionItemOption = {
            id: savedItem.id,
            name: savedItem.name,
            code: savedItem.code,
            category_display: savedItem.category_display ?? null,
            category_type: savedItem.category_type ?? null,
            tracking_type: savedItem.tracking_type ?? null,
            description: savedItem.description ?? null,
            acct_unit: savedItem.acct_unit ?? null,
            specifications: savedItem.specifications ?? null,
          };

          setItems(prev => [
            previewItem,
            ...prev.filter(option => option.id !== savedItem.id),
          ]);

          if (createModalRowIndex !== null) {
            linkInspectionItem(createModalRowIndex, previewItem);
          }
        }}
      />
      <SectionIntro
        icon={<InspectionIcon d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" size={18} />}
        title="Master catalog linkage"
        copy="Map each accepted item to the master catalog and record the central registry coordinates used for downstream stock control."
      />

      {leafCategories.length === 0 ? (
        <div className="stage-form-error">
          No active category/subcategory is available yet. Create an active subcategory before adding a new catalog item from this stage.
        </div>
      ) : null}

      {rows.map((item, acceptedIndex) => {
        const sourceIndex = data.items.findIndex(candidate => candidate === item);
        const linkedPreview = item.item != null
          ? itemOptions.find(option => option.id === item.item) ?? {
              id: item.item,
              name: item.item_name || item.item_description || `Item #${item.item}`,
              code: item.item_code || "",
              category_type: item.item_category_type ?? null,
              tracking_type: item.item_tracking_type ?? null,
              description: null,
              acct_unit: null,
              specifications: null,
            }
          : null;
        const activePreview = previewByIndex[sourceIndex] ?? linkedPreview;

        return (
          <div key={item.id ?? `stage-3-${acceptedIndex}`} className="stage-form-row stage3-master-row">
            <div className="stage-form-item-head">
              <span className="stage-form-item-index">{acceptedIndex + 1}</span>
              <div className="stage-form-item-text">
                <div className="stage-form-item-name">{item.item_description || "Unnamed inspection item"}</div>
                <div className="stage-form-item-meta">
                  <span><strong>{item.accepted_quantity}</strong> accepted</span>
                  {item.item_name ? <span>Linked: <strong>{item.item_name}</strong></span> : <span>Awaiting catalog link</span>}
                </div>
              </div>
            </div>

            <div className="stage3-master-grid">
              <div className="stage3-master-fields">
                <Field
                  label="Catalog item"
                  hint={item.item_name
                    ? `${item.item_code || "No code"} - ${item.item_name}`
                    : leafCategories.length === 0
                      ? "No active subcategory exists yet. Use + to open the item form; it cannot be saved until a subcategory is available."
                      : "Search by SKU code or item name. Use + to create one if it does not exist."}
                >
                  <CatalogItemSearchField
                    item={item}
                    options={itemOptions}
                    disabled={readOnly || loading}
                    createDisabled={readOnly || loading}
                    onSelect={option => linkInspectionItem(sourceIndex, option)}
                    onClear={() => unlinkInspectionItem(sourceIndex)}
                    onCreate={() => setCreateModalRowIndex(sourceIndex)}
                    onPreviewChange={option => setPreviewByIndex(prev => ({ ...prev, [sourceIndex]: option }))}
                  />
                </Field>

                <div className="stage3-link-grid">
                  <Field label="Central register">
                    <ThemedSelect
                      value={item.central_register == null ? "" : String(item.central_register)}
                      onChange={value => {
                        const selectedId = value ? Number(value) : null;
                        const register = registers.find(option => option.id === selectedId);
                        updateItemAt(data, onChange, sourceIndex, {
                          central_register: selectedId,
                          central_register_no: register?.register_number ?? "",
                        });
                      }}
                      placeholder="Register..."
                      ariaLabel="Central register"
                      size="compact"
                      disabled={readOnly || loading}
                      options={registers.map(register => ({
                        value: String(register.id),
                        label: getRegisterOptionLabel(register),
                      }))}
                    />
                  </Field>
                  <Field label="Central page">
                    <input
                      value={item.central_register_page_no || ""}
                      onChange={event => updateItemAt(data, onChange, sourceIndex, { central_register_page_no: event.target.value })}
                      disabled={readOnly}
                      placeholder="156"
                    />
                  </Field>
                </div>
                <div className="stage-form-helper stage3-register-helper">
                  {mainStoreName ? `Showing registers for ${mainStoreName}.` : "Showing registers for this inspection location when available."}
                </div>
              </div>

              <CatalogItemPreviewCard
                item={item}
                preview={activePreview}
              />
            </div>

            {needsLotNumber(item) ? (
              <div className={`stage-form-fields ${item.item_category_type === "PERISHABLE" ? "stage-form-fields-3" : "stage-form-fields-2"}`}>
                <Field label={isFixedAssetQuantityItem(item) ? "Asset lot number" : "Batch number"}>
                  <input
                    value={item.batch_number || ""}
                    onChange={event => updateItemAt(data, onChange, sourceIndex, { batch_number: event.target.value })}
                    disabled={readOnly}
                    placeholder={isFixedAssetQuantityItem(item) ? "Asset lot number" : "Batch number"}
                  />
                </Field>
                {item.item_category_type === "PERISHABLE" ? (
                  <>
                    <Field label="Manufactured date">
                      <input
                        type="date"
                        value={item.manufactured_date || ""}
                        onChange={event => updateItemAt(data, onChange, sourceIndex, { manufactured_date: event.target.value })}
                        disabled={readOnly}
                      />
                    </Field>
                    <Field label="Expiry date">
                      <input
                        type="date"
                        value={item.expiry_date || ""}
                        onChange={event => updateItemAt(data, onChange, sourceIndex, { expiry_date: event.target.value })}
                        disabled={readOnly}
                      />
                    </Field>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function Stage4Form({ data, onChange, readOnly }: StageFormProps) {
  const fixedAssetRows = (data.items || [])
    .map((item, sourceIndex) => ({ item, sourceIndex }))
    .filter(({ item }) => Number(item.accepted_quantity || 0) > 0 && isFixedAssetInspectionItem(item));
  const [assetClasses, setAssetClasses] = useState<DepreciationAssetClassOption[]>([]);
  const [assetClassError, setAssetClassError] = useState(false);
  const financeDateSeededRef = useRef(false);
  const capitalizationDateSeededRef = useRef(new Set<string>());

  useEffect(() => {
    if (data.finance_check_date) {
      financeDateSeededRef.current = true;
      return;
    }
    if (readOnly || financeDateSeededRef.current) return;
    financeDateSeededRef.current = true;
    onChange({ ...data, finance_check_date: getDefaultFinanceCheckDate(data.finance_check_date) });
  }, [data, onChange, readOnly]);

  useEffect(() => {
    if (readOnly || fixedAssetRows.length === 0) return;

    const seededFinanceDate = data.finance_check_date || getDefaultFinanceCheckDate(null);
    const seededDate = seededFinanceDate || data.date_of_inspection || data.date || getDefaultFinanceCheckDate(null);
    let changed = false;
    const nextItems = (data.items || []).map((item, index) => {
      if (!isFixedAssetInspectionItem(item) || Number(item.accepted_quantity || 0) <= 0 || item.capitalization_date) {
        return item;
      }

      const key = String(item.id ?? index);
      if (capitalizationDateSeededRef.current.has(key)) {
        return item;
      }

      capitalizationDateSeededRef.current.add(key);
      changed = true;
      return {
        ...item,
        capitalization_date: seededDate,
      };
    });

    if (changed) {
      onChange({ ...data, finance_check_date: seededFinanceDate, items: nextItems });
    }
  }, [data, fixedAssetRows, onChange, readOnly]);

  useEffect(() => {
    let active = true;
    if (fixedAssetRows.length === 0) {
      setAssetClassError(false);
      return () => {
        active = false;
      };
    }

    apiFetch<Page<DepreciationAssetClassOption> | DepreciationAssetClassOption[]>("/api/inventory/depreciation/asset-classes/?page_size=500")
      .then(data => {
        if (!active) return;
        setAssetClasses(normalizeApiList(data).filter(assetClass => assetClass.code && assetClass.name));
        setAssetClassError(false);
      })
      .catch(() => {
        if (!active) return;
        setAssetClassError(true);
      });

    return () => {
      active = false;
    };
  }, [fixedAssetRows.length]);

  return (
    <div className="stage-form-list">
      <div className="stage-form-row">
        <div className="stage-form-fields stage-form-fields-2">
          <Field label="Finance check date" hint="Defaults to today and can still be changed before final approval.">
            <input
              type="date"
              value={data.finance_check_date || ""}
              onChange={event => onChange({ ...data, finance_check_date: event.target.value })}
              disabled={readOnly}
            />
          </Field>
        </div>
      </div>

      {fixedAssetRows.length > 0 ? (
        <div className="inspection-finance-stack">
          <div className="inspection-finance-section-head">
            <div>
              <div className="eyebrow">Fixed asset capitalization</div>
              <h3>Review the asset class, capitalization date, and recorded cost for each accepted fixed asset.</h3>
            </div>
            <span className="pill pill-info">{fixedAssetRows.length} lines</span>
          </div>

          <div className="inspection-finance-card-list">
            {fixedAssetRows.map(({ item, sourceIndex }, index) => {
              const qty = Number(item.accepted_quantity || 0);
              const unitPrice = typeof item.unit_price === "number" ? item.unit_price : Number.parseFloat(item.unit_price);
              const safeUnitPrice = Number.isFinite(unitPrice) ? unitPrice : 0;
              const defaultCost = qty * safeUnitPrice;
              const defaultDate = data.finance_check_date || data.date_of_inspection || data.date || getDefaultFinanceCheckDate(null);

              return (
                <div key={item.id ?? `finance-fixed-asset-${index}`} className="inspection-finance-card">
                  <div className="inspection-finance-card-head">
                    <div className="inspection-finance-card-identity">
                      <div className="inspection-finance-card-title">{item.item_name || item.item_description || "Fixed asset"}</div>
                      <div className="inspection-finance-card-sub mono">{item.item_code || "Unlinked"}</div>
                      <div className="inspection-finance-card-tags">
                        <span className="chip">{formatItemLabel(item.item_category_type, "Fixed asset")}</span>
                        <span className="chip">{item.item_tracking_type === "INDIVIDUAL" ? "Instances" : "Asset Lot"}</span>
                      </div>
                    </div>
                    <div className="inspection-finance-card-metrics">
                      <div className="inspection-finance-metric">
                        <span>Accepted qty</span>
                        <strong>{qty}</strong>
                      </div>
                      <div className="inspection-finance-metric">
                        <span>Unit price</span>
                        <strong>{formatCurrency(safeUnitPrice)}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="stage-form-fields stage-form-fields-3 inspection-finance-fields">
                    <Field label="Asset class" hint={assetClassError ? "Asset classes could not be loaded. Default class will be used downstream." : "Choose the matching depreciation profile for this item."}>
                      <div className="inspection-finance-select-wrap">
                        <ThemedSelect
                          value={item.depreciation_asset_class == null ? "" : String(item.depreciation_asset_class)}
                          onChange={value => updateItemAt(data, onChange, sourceIndex, {
                            depreciation_asset_class: value ? Number(value) : null,
                          })}
                          placeholder="Select asset class..."
                          ariaLabel="Depreciation asset class"
                          size="compact"
                          disabled={readOnly || assetClassError}
                          options={assetClasses.map(assetClass => ({
                            value: String(assetClass.id),
                            label: getAssetClassLabel(assetClass),
                          }))}
                        />
                      </div>
                    </Field>
                    <Field label="Capitalization date" hint={`Defaults to ${defaultDate}. You can still change it.`}>
                      <input
                        className="inspection-finance-input"
                        type="date"
                        value={item.capitalization_date || ""}
                        onChange={event => updateItemAt(data, onChange, sourceIndex, { capitalization_date: event.target.value })}
                        disabled={readOnly}
                      />
                    </Field>
                    <Field label="Capitalized cost" hint={`Suggested: ${defaultCost.toFixed(2)}`}>
                      <input
                        className="inspection-finance-input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.capitalization_cost ?? ""}
                        placeholder={defaultCost.toFixed(2)}
                        onChange={event => updateItemAt(data, onChange, sourceIndex, { capitalization_cost: event.target.value })}
                        disabled={readOnly}
                      />
                    </Field>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function getStagePatchPayload(data: InspectionRecord, mode: StageItemsPayloadMode) {
  const payload: Record<string, unknown> = {
    items: buildStageItemsPayload(normalizeStageItems(data.items || []), mode),
  };

  if (mode === "finance") {
    payload.finance_check_date = data.finance_check_date || null;
  } else if (mode === "central" && data.finance_check_date) {
    payload.finance_check_date = data.finance_check_date;
  }

  return payload;
}
