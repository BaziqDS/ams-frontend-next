"use client";

import { useEffect, useState } from "react";
import { apiFetch, type Page } from "@/lib/api";
import type { CategoryRecord } from "@/components/CategoryModal";
import { ItemModal } from "@/components/ItemModuleViews";
import type { ItemRecord } from "@/lib/itemUi";
import {
  buildStageItemsPayload,
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
  main_store_id?: number | null;
  main_store_display?: string | null;
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
                <span className="filter-select-wrap stage-select-wrap">
                  <select
                    value={item.stock_register ?? ""}
                    onChange={event => {
                      const selectedId = event.target.value ? Number(event.target.value) : null;
                      const register = registers.find(option => option.id === selectedId);
                      updateItemAt(data, onChange, sourceIndex, {
                        stock_register: selectedId,
                        stock_register_no: register?.register_number ?? "",
                      });
                    }}
                    disabled={readOnly || loading}
                  >
                    <option value="">Select register...</option>
                    {registers.map(register => (
                      <option key={register.id} value={register.id}>{getRegisterOptionLabel(register)}</option>
                    ))}
                  </select>
                </span>
              </Field>
              <Field label="Page number">
                <input
                  value={item.stock_register_page_no || ""}
                  onChange={event => updateItemAt(data, onChange, sourceIndex, { stock_register_page_no: event.target.value })}
                  disabled={readOnly}
                  placeholder="42"
                />
              </Field>
              <Field label="Recording date">
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
  const [searchByIndex, setSearchByIndex] = useState<Record<number, string>>({});
  const [createModalRowIndex, setCreateModalRowIndex] = useState<number | null>(null);
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
        setMainStoreName(location?.main_store_display ?? null);
        setRegisters(getInspectionMainStoreRegisters(loadedRegisters, location));
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

  const linkInspectionItem = (
    sourceIndex: number,
    option: Pick<InspectionItemOption, "id" | "name" | "code" | "category_type" | "tracking_type">,
  ) => {
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
    setSearchByIndex(prev => ({ ...prev, [sourceIndex]: "" }));
  };

  return (
    <div className="stage-form-list">
      <ItemModal
        open={createModalRowIndex !== null}
        mode="create"
        item={null}
        categories={leafCategories}
        onClose={() => setCreateModalRowIndex(null)}
        onSave={async (savedItem: ItemRecord) => {
          setItems(prev => [
            {
              id: savedItem.id,
              name: savedItem.name,
              code: savedItem.code,
              category_type: savedItem.category_type ?? null,
              tracking_type: savedItem.tracking_type ?? null,
            },
            ...prev.filter(option => option.id !== savedItem.id),
          ]);

          if (createModalRowIndex !== null) {
            linkInspectionItem(createModalRowIndex, {
              id: savedItem.id,
              name: savedItem.name,
              code: savedItem.code,
              category_type: savedItem.category_type ?? null,
              tracking_type: savedItem.tracking_type ?? null,
            });
          }
        }}
      />
      <SectionIntro
        icon={<InspectionIcon d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" size={18} />}
        title="Master catalog linkage"
        copy="Map each accepted item to the master catalog and record the central registry coordinates used for downstream stock control."
      />

      {rows.map((item, acceptedIndex) => {
        const sourceIndex = data.items.findIndex(candidate => candidate === item);
        const search = searchByIndex[sourceIndex] ?? "";
        const searchResults = search.length < 2
          ? []
          : items.filter(option => `${option.name} ${option.code}`.toLowerCase().includes(search.toLowerCase())).slice(0, 8);

        return (
          <div key={item.id ?? `stage-3-${acceptedIndex}`} className="stage-form-row">
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

            <div className="stage-form-fields stage-form-fields-2">
              <Field label="Catalog item search" hint={item.item_name ? `${item.item_code || "No code"} - ${item.item_name}` : "Search by SKU code or item name."}>
                <div style={{ display: "grid", gap: 10 }}>
                  {item.item && item.item_name ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "12px 14px", border: "1px solid var(--hairline)", borderRadius: "var(--radius)", background: "var(--panel)" }}>
                      <div style={{ display: "grid", gap: 2 }}>
                        <span className="stage-form-helper" style={{ margin: 0 }}>Linked item</span>
                        <strong>{item.item_name}</strong>
                        <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{item.item_code || "No code"}</span>
                      </div>
                      {!readOnly ? (
                        <button
                          type="button"
                          className="btn btn-xs"
                          onClick={() => updateItemAt(data, onChange, sourceIndex, {
                            item: null,
                            item_name: "",
                            item_code: "",
                            item_category_type: null,
                            item_tracking_type: null,
                            batch_number: "",
                            manufactured_date: "",
                            expiry_date: "",
                          })}
                        >
                          Reset
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    <>
                      <div className="stage-form-inline">
                        <input
                          value={search}
                          onChange={event => setSearchByIndex(prev => ({ ...prev, [sourceIndex]: event.target.value }))}
                          disabled={readOnly}
                          placeholder="Search items"
                        />
                        {!readOnly ? (
                          <button
                            type="button"
                            className="btn btn-xs"
                            onClick={() => setCreateModalRowIndex(sourceIndex)}
                            disabled={leafCategories.length === 0}
                          >
                            Create new item and link
                          </button>
                        ) : null}
                      </div>
                      {!readOnly && search.length >= 2 && searchResults.length === 0 ? (
                        <div className="stage-form-helper" style={{ marginTop: -4 }}>
                          No matching item found. Use <strong>Create new item and link</strong> to add it to the catalog.
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              </Field>
              <Field label="Central register" hint={mainStoreName ? `Showing registers for ${mainStoreName}.` : "Showing registers for this inspection location when available."}>
                <select
                  value={item.central_register ?? ""}
                  onChange={event => {
                    const selectedId = event.target.value ? Number(event.target.value) : null;
                    const register = registers.find(option => option.id === selectedId);
                    updateItemAt(data, onChange, sourceIndex, {
                      central_register: selectedId,
                      central_register_no: register?.register_number ?? "",
                    });
                  }}
                  disabled={readOnly || loading}
                >
                  <option value="">Select register...</option>
                  {registers.map(register => (
                    <option key={register.id} value={register.id}>{getRegisterOptionLabel(register)}</option>
                  ))}
                </select>
              </Field>
            </div>

            {searchResults.length > 0 && !readOnly ? (
              <div className="detail-linked-list">
                {searchResults.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    className="detail-linked-row"
                    onClick={() => linkInspectionItem(sourceIndex, option)}
                  >
                    <span className="detail-linked-main">
                      <span className="detail-linked-title">{option.name}</span>
                      <span className="detail-linked-sub">{option.code}</span>
                    </span>
                    <span className="detail-doc-arrow">Select</span>
                  </button>
                ))}
              </div>
            ) : null}

            <div className="stage-form-fields stage-form-fields-3">
              <Field label="Central page">
                <input
                  value={item.central_register_page_no || ""}
                  onChange={event => updateItemAt(data, onChange, sourceIndex, { central_register_page_no: event.target.value })}
                  disabled={readOnly}
                  placeholder="156"
                />
              </Field>
              {needsLotNumber(item) ? (
                <>
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
                </>
              ) : (
                <div />
              )}
            </div>
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
          <Field label="Finance settlement check date" hint="Required before final approval.">
            <input
              type="date"
              value={data.finance_check_date || ""}
              onChange={event => onChange({ ...data, finance_check_date: event.target.value })}
              disabled={readOnly}
            />
          </Field>
          <Field label="Finance readiness">
            <input value="Stock details and central registry mappings are ready for finance clearance." disabled />
          </Field>
        </div>
      </div>

      {fixedAssetRows.length > 0 ? (
        <div className="table-card">
          <div className="table-card-head">
            <div className="table-card-head-left">
              <div className="eyebrow">Fixed asset capitalization</div>
              <div className="table-count">
                <span className="mono">{fixedAssetRows.length}</span>
                <span>lines</span>
              </div>
            </div>
          </div>
          <div className="h-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Tracking</th>
                  <th>Qty</th>
                  <th>Unit price</th>
                  <th>Asset class</th>
                  <th>Capitalization date</th>
                  <th>Capitalized cost</th>
                  <th>Lot / Serial basis</th>
                </tr>
              </thead>
              <tbody>
                {fixedAssetRows.map(({ item, sourceIndex }, index) => {
                  const qty = Number(item.accepted_quantity || 0);
                  const unitPrice = typeof item.unit_price === "number" ? item.unit_price : Number.parseFloat(item.unit_price);
                  const defaultCost = qty * (Number.isFinite(unitPrice) ? unitPrice : 0);
                  const defaultDate = data.finance_check_date || data.date_of_inspection || data.date || "";
                  return (
                    <tr key={item.id ?? `finance-fixed-asset-${index}`}>
                      <td>
                        <div className="login-cell">
                          <div>{item.item_name || item.item_description || "Fixed asset"}</div>
                          <div className="login-cell-sub mono">{item.item_code || "Unlinked"}</div>
                        </div>
                      </td>
                      <td><span className="chip">{item.item_tracking_type === "INDIVIDUAL" ? "Instances" : "Asset Lot"}</span></td>
                      <td>{qty}</td>
                      <td>{formatCurrency(Number.isFinite(unitPrice) ? unitPrice : 0)}</td>
                      <td>
                        <select
                          value={item.depreciation_asset_class ?? ""}
                          onChange={event => updateItemAt(data, onChange, sourceIndex, {
                            depreciation_asset_class: event.target.value ? Number(event.target.value) : null,
                          })}
                          disabled={readOnly || assetClassError}
                        >
                          <option value="">Default class</option>
                          {assetClasses.map(assetClass => (
                            <option key={assetClass.id} value={assetClass.id}>{getAssetClassLabel(assetClass)}</option>
                          ))}
                        </select>
                        {assetClassError ? <div className="login-cell-sub">Default class will be used.</div> : null}
                      </td>
                      <td>
                        <input
                          type="date"
                          value={item.capitalization_date || ""}
                          onChange={event => updateItemAt(data, onChange, sourceIndex, { capitalization_date: event.target.value })}
                          disabled={readOnly}
                        />
                        {!item.capitalization_date && defaultDate ? <div className="login-cell-sub">Default {defaultDate}</div> : null}
                      </td>
                      <td>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.capitalization_cost ?? ""}
                          placeholder={defaultCost.toFixed(2)}
                          onChange={event => updateItemAt(data, onChange, sourceIndex, { capitalization_cost: event.target.value })}
                          disabled={readOnly}
                        />
                      </td>
                      <td>{item.item_tracking_type === "QUANTITY" ? (item.batch_number || "Lot number pending") : `${qty} register entries`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
