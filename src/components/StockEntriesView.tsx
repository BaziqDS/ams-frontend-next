"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { apiFetch, type Page } from "@/lib/api";
import { getAllocatableTargetLocations, getAllocatableTargetPersons, getAllocatedReturnLocations, getAllocatedReturnPersons, getTransferDestinationStores, getUserAssignedStores, type StockAllocationRecord } from "@/lib/stockEntryLocationRules";
import { getIssueAvailableQuantity, getIssueBatchOptions, getIssueInstanceOptions, getIssueItemOptions, getReturnBatchOptions, getReturnInstanceOptions, getReturnItemOptions, getReturnQuantityLimit, type StockEntryItemInstance, type StockEntryStockRecord, type StockEntryReturnTarget } from "@/lib/stockEntryItemRules";
import { buildStockEntryPayload, validateStockEntryForm, type CreatableStockEntryType, type StockEntryFormItem, type StockEntryFormState } from "@/lib/stockEntryFormRules";
import { useCan, useCapabilities } from "@/contexts/CapabilitiesContext";
import { useAuth } from "@/contexts/AuthContext";
import { relTime, type LocationRecord } from "@/lib/userUiShared";

type Density = "compact" | "balanced" | "comfortable";
type EntryType = "RECEIPT" | "ISSUE" | "RETURN";
type EntryStatus = "DRAFT" | "PENDING_ACK" | "COMPLETED" | "REJECTED" | "CANCELLED";
type CorrectionStatus = "REQUESTED" | "APPROVED" | "APPLIED" | "REJECTED" | "BLOCKED";

interface ItemRecord {
  id: number;
  name: string;
  code: string;
  category_display?: string | null;
  category_type?: string | null;
  tracking_type?: string | null;
  is_active: boolean;
}

interface ItemBatchRecord {
  id: number;
  item: number;
  batch_number: string;
  is_active: boolean;
}

interface StockRegisterRecord {
  id: number;
  register_number: string;
  register_type: string;
  store: number;
  store_name?: string | null;
  is_active: boolean;
}

interface PersonRecord {
  id: number;
  name: string;
  designation?: string | null;
  department?: string | null;
  standalone_locations?: number[];
  standalone_locations_display?: string[];
  is_active: boolean;
}

interface StockEntryItemRecord {
  id?: number;
  item: number;
  item_name?: string | null;
  batch: number | null;
  batch_number?: string | null;
  quantity: number;
  instances: number[];
  stock_register: number | null;
  stock_register_name?: string | null;
  page_number: number | null;
  ack_stock_register: number | null;
  ack_stock_register_name?: string | null;
  ack_page_number: number | null;
}

interface StockEntryRecord {
  id: number;
  entry_type: EntryType;
  entry_number: string;
  entry_date: string;
  from_location: number | null;
  from_location_name?: string | null;
  to_location: number | null;
  to_location_name?: string | null;
  issued_to: number | null;
  issued_to_name?: string | null;
  status: EntryStatus;
  remarks: string | null;
  purpose: string | null;
  items: StockEntryItemRecord[];
  cancellation_reason?: string | null;
  cancelled_by_name?: string | null;
  cancelled_at?: string | null;
  created_by_name?: string | null;
  created_at: string;
  can_acknowledge?: boolean;
  active_correction?: {
    id: number;
    original_entry?: number;
    status: CorrectionStatus;
    resolution_type: string;
    reason: string;
    message?: string | null;
  } | null;
  correction_status?: CorrectionStatus | null;
}

interface ReferenceData {
  items: ItemRecord[];
  batches: ItemBatchRecord[];
  locations: LocationRecord[];
  persons: PersonRecord[];
  registers: StockRegisterRecord[];
  allocations: StockAllocationRecord[];
  stockRecords: StockEntryStockRecord[];
  instances: StockEntryItemInstance[];
}

const Ic = ({ d, size = 16 }: { d: ReactNode | string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true" focusable="false">
    {typeof d === "string" ? <path d={d} /> : d}
  </svg>
);

function normalizeList<T>(data: Page<T> | T[]): T[] {
  return Array.isArray(data) ? data : data.results;
}

function formatLabel(value: string | null | undefined, fallback = "—") {
  if (!value) return fallback;
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function entryTone(status: EntryStatus) {
  if (status === "COMPLETED") return "pill-success";
  if (status === "CANCELLED" || status === "REJECTED") return "pill-neutral";
  return "pill-warning";
}

function StatusPill({ status }: { status: EntryStatus }) {
  return (
    <span className={`pill ${entryTone(status)}`}>
      <span className={`status-dot ${status === "COMPLETED" ? "active" : "inactive"}`} />
      {formatLabel(status)}
    </span>
  );
}

function CorrectionPill({ entry }: { entry: StockEntryRecord }) {
  const status = entry.active_correction?.status ?? entry.correction_status;
  if (!status || status === "APPLIED" || status === "REJECTED") return null;

  const label = status === "REQUESTED" ? "Correction requested" : `Correction ${formatLabel(status)}`;
  return (
    <span className={`pill ${status === "BLOCKED" ? "pill-danger" : "pill-warning"}`}>
      {label}
    </span>
  );
}

function DensityToggle({ density, setDensity }: { density: Density; setDensity: (density: Density) => void }) {
  return (
    <div className="seg">
      {(["compact", "balanced", "comfortable"] as const).map(option => (
        <button type="button" key={option} className={"seg-btn" + (density === option ? " active" : "")} onClick={() => setDensity(option)}>
          {formatLabel(option)}
        </button>
      ))}
    </div>
  );
}

function Alert({ children, action, onDismiss }: { children: ReactNode; action?: ReactNode; onDismiss?: () => void }) {
  return (
    <div style={{ padding: "12px 16px", background: "var(--danger-weak)", border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)", borderRadius: "var(--radius)", color: "var(--danger)", fontSize: 13, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <span>{children}</span>
      <div style={{ display: "flex", gap: 8 }}>
        {action}
        {onDismiss && <button type="button" className="btn btn-xs btn-ghost" onClick={onDismiss}>Dismiss</button>}
      </div>
    </div>
  );
}

function Field({ label, required, error, hint, children, span = 1 }: { label: string; required?: boolean; error?: string; hint?: string; children: ReactNode; span?: number }) {
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

interface SearchableSelectOption {
  value: string;
  label: string;
  meta?: string;
}

function SearchableSelect({ value, options, onChange, placeholder, searchPlaceholder, emptyLabel = "No matching options", disabled = false }: { value: string; options: SearchableSelectOption[]; onChange: (value: string) => void; placeholder: string; searchPlaceholder?: string; emptyLabel?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find(option => option.value === value) ?? null;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter(option => `${option.label} ${option.meta ?? ""}`.toLowerCase().includes(normalizedQuery))
    : options;

  const focusInput = () => requestAnimationFrame(() => inputRef.current?.focus());
  const openMenu = () => {
    if (disabled) return;
    setOpen(true);
    focusInput();
  };

  return (
    <div
      className={"assignment-dropdown" + (open ? " open" : "") + (disabled ? " disabled" : "")}
      onBlur={event => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          setOpen(false);
          setQuery("");
        }
      }}
    >
      <div className="assignment-trigger" onClick={openMenu} aria-expanded={open}>
        <Ic d={<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>} size={13} />
        <input
          ref={inputRef}
          value={open ? query : selected?.label ?? ""}
          placeholder={open ? searchPlaceholder ?? placeholder : placeholder}
          disabled={disabled}
          onFocus={() => {
            if (disabled) return;
            setOpen(true);
          }}
          onChange={event => {
            if (!open) setOpen(true);
            setQuery(event.target.value);
          }}
        />
        {open && query ? (
          <button
            type="button"
            className="assignment-trigger-clear"
            onClick={event => {
              event.stopPropagation();
              setQuery("");
              focusInput();
            }}
            aria-label="Clear search"
          >
            ×
          </button>
        ) : null}
        <button
          type="button"
          className="assignment-trigger-toggle"
          onClick={event => {
            event.stopPropagation();
            if (disabled) return;
            setOpen(prev => !prev);
            focusInput();
          }}
          disabled={disabled}
          aria-label={open ? "Close options" : "Open options"}
        >
          <Ic d={open ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} size={13} />
        </button>
      </div>

      {open && !disabled ? (
        <div className="assignment-menu">
          <div className="assignment-list" style={{ maxHeight: 190 }}>
            {filteredOptions.length > 0 ? filteredOptions.map(option => (
              <button
                key={option.value}
                type="button"
                className={"assignment-row" + (option.value === value ? " selected" : "")}
                onClick={() => {
                  onChange(option.value);
                  setQuery("");
                  setOpen(false);
                }}
              >
                <span className="assignment-name">{option.label}</span>
                {option.meta ? <span className="assignment-code mono">{option.meta}</span> : null}
              </button>
            )) : (
              <div className="scope-empty">{emptyLabel}</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function InstanceMultiSelect({ value, options, onChange, placeholder, searchPlaceholder, emptyLabel = "No matching instances", disabled = false }: { value: string[]; options: SearchableSelectOption[]; onChange: (value: string[]) => void; placeholder: string; searchPlaceholder?: string; emptyLabel?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const valueSet = new Set(value);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter(option => `${option.label} ${option.meta ?? ""}`.toLowerCase().includes(normalizedQuery))
    : options;
  const selectedLabels = options.filter(option => valueSet.has(option.value)).map(option => option.label);
  const summary = selectedLabels.length === 0
    ? ""
    : selectedLabels.length > 2
    ? `${selectedLabels.slice(0, 2).join(", ")} +${selectedLabels.length - 2}`
    : selectedLabels.join(", ");
  const focusInput = () => requestAnimationFrame(() => inputRef.current?.focus());

  const toggleValue = (nextValue: string) => {
    const next = new Set(value);
    next.has(nextValue) ? next.delete(nextValue) : next.add(nextValue);
    onChange(Array.from(next));
  };

  return (
    <div
      className={"assignment-dropdown" + (open ? " open" : "") + (disabled ? " disabled" : "")}
      onBlur={event => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          setOpen(false);
          setQuery("");
        }
      }}
    >
      <div
        className="assignment-trigger"
        onClick={() => {
          if (disabled) return;
          setOpen(true);
          focusInput();
        }}
        aria-expanded={open}
      >
        <Ic d={<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>} size={13} />
        <input
          ref={inputRef}
          value={open ? query : summary}
          placeholder={open ? searchPlaceholder ?? placeholder : placeholder}
          disabled={disabled}
          onFocus={() => {
            if (disabled) return;
            setOpen(true);
          }}
          onChange={event => {
            if (!open) setOpen(true);
            setQuery(event.target.value);
          }}
        />
        {open && query ? (
          <button
            type="button"
            className="assignment-trigger-clear"
            onClick={event => {
              event.stopPropagation();
              setQuery("");
              focusInput();
            }}
            aria-label="Clear search"
          >
            ×
          </button>
        ) : null}
        <button
          type="button"
          className="assignment-trigger-toggle"
          onClick={event => {
            event.stopPropagation();
            if (disabled) return;
            setOpen(prev => !prev);
            focusInput();
          }}
          disabled={disabled}
          aria-label={open ? "Close instances" : "Open instances"}
        >
          <Ic d={open ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} size={13} />
        </button>
      </div>

      {open && !disabled ? (
        <div className="assignment-menu">
          <div className="assignment-list" style={{ maxHeight: 190 }}>
            {filteredOptions.length > 0 ? filteredOptions.map(option => (
              <button
                key={option.value}
                type="button"
                className={"assignment-row" + (valueSet.has(option.value) ? " selected" : "")}
                onClick={() => toggleValue(option.value)}
              >
                <input type="checkbox" checked={valueSet.has(option.value)} readOnly tabIndex={-1} style={{ width: 14, height: 14, flexShrink: 0 }} />
                <span className="assignment-name">{option.label}</span>
                {option.meta ? <span className="assignment-code mono">{option.meta}</span> : null}
              </button>
            )) : (
              <div className="scope-empty">{emptyLabel}</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function locationOption(location: { id: number; name: string; code?: string | null; location_type?: string | null }): SearchableSelectOption {
  return {
    value: String(location.id),
    label: location.name,
    meta: [location.code, location.location_type].filter(Boolean).join(" - "),
  };
}

function personOption(person: PersonRecord): SearchableSelectOption {
  return {
    value: String(person.id),
    label: person.name,
    meta: [person.designation, person.department].filter(Boolean).join(" - "),
  };
}

function instanceOption(instance: StockEntryItemInstance): SearchableSelectOption {
  const fallback = `Instance ${instance.id}`;
  return {
    value: String(instance.id),
    label: instance.serial_number || instance.qr_code || fallback,
    meta: instance.qr_code && instance.serial_number ? instance.qr_code : undefined,
  };
}

function isIndividualTracking(item: ItemRecord | undefined) {
  return item?.tracking_type === "INDIVIDUAL";
}

function isConsumableQuantityItem(item: ItemRecord | undefined) {
  return item?.tracking_type === "QUANTITY" && item?.category_type === "CONSUMABLE";
}

function blankItem(): StockEntryFormItem {
  return { item: "", batch: "", quantity: "1", instances: [], stock_register: "", page_number: "" };
}

function emptyForm(): StockEntryFormState {
  return {
    entry_type: "ISSUE",
    issue_target: "STORE",
    return_source: "PERSON",
    from_location: "",
    to_location: "",
    issued_to: "",
    status: "PENDING_ACK",
    purpose: "",
    remarks: "",
    items: [blankItem()],
  };
}

function formFromEntry(entry: StockEntryRecord | null, locations: LocationRecord[] = []): StockEntryFormState {
  if (!entry) return emptyForm();
  const targetLocation = entry.to_location == null ? null : locations.find(location => location.id === entry.to_location);
  const sourceLocation = entry.from_location == null ? null : locations.find(location => location.id === entry.from_location);
  const issueTarget = entry.issued_to ? "PERSON" : targetLocation && !targetLocation.is_store ? "LOCATION" : "STORE";
  const returnSource = entry.issued_to ? "PERSON" : sourceLocation && !sourceLocation.is_store ? "LOCATION" : "PERSON";
  return {
    entry_type: entry.entry_type === "RETURN" ? "RECEIPT" : entry.entry_type,
    issue_target: issueTarget,
    return_source: returnSource,
    from_location: entry.from_location == null ? "" : String(entry.from_location),
    to_location: entry.to_location == null ? "" : String(entry.to_location),
    issued_to: entry.issued_to == null ? "" : String(entry.issued_to),
    status: entry.status === "COMPLETED" ? "COMPLETED" : entry.status === "PENDING_ACK" ? "PENDING_ACK" : "DRAFT",
    purpose: entry.purpose ?? "",
    remarks: entry.remarks ?? "",
    items: entry.items.length
      ? entry.items.map(item => ({
          item: String(item.item),
          batch: item.batch == null ? "" : String(item.batch),
          quantity: String(item.quantity),
          instances: (item.instances ?? []).map(String),
          stock_register: item.stock_register == null ? "" : String(item.stock_register),
          page_number: item.page_number == null ? "" : String(item.page_number),
        }))
      : [blankItem()],
  };
}

function entryTarget(entry: StockEntryRecord) {
  if (entry.issued_to_name) return entry.issued_to_name;
  return entry.to_location_name ?? "—";
}

function StockEntryModal({ open, mode, entry, refs, refsLoading, assignedLocationIds, onClose, onSave }: { open: boolean; mode: "create" | "edit"; entry: StockEntryRecord | null; refs: ReferenceData; refsLoading: boolean; assignedLocationIds?: number[]; onClose: () => void; onSave: () => void | Promise<void> }) {
  const [form, setForm] = useState<StockEntryFormState>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const storeOptions = useMemo(() => refs.locations.filter(location => location.is_store && location.is_active), [refs.locations]);
  const assignedStoreOptions = useMemo(() => getUserAssignedStores(assignedLocationIds, refs.locations), [assignedLocationIds, refs.locations]);
  const selectableStoreOptions = assignedStoreOptions.length > 0 ? assignedStoreOptions : storeOptions;
  const singleAssignedStore = mode === "create" && assignedStoreOptions.length === 1 ? assignedStoreOptions[0] : null;

  useEffect(() => {
    if (!open) return;
    const nextForm = formFromEntry(entry, refs.locations);
    if (mode === "create" && entry) {
      nextForm.status = "DRAFT";
      nextForm.remarks = `Replacement for ${entry.entry_number}`;
      nextForm.items = nextForm.items.map(item => ({ ...item, instances: [] }));
    }
    setForm(nextForm);
    setErrors({});
    setSubmitError(null);
    setSubmitting(false);
  }, [entry, mode, open, refs.locations]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  useEffect(() => {
    if (!open || !singleAssignedStore) return;
    const storeId = String(singleAssignedStore.id);
    setForm(prev => {
      if (prev.entry_type === "RECEIPT" && prev.to_location !== storeId) {
        return { ...prev, to_location: storeId, from_location: "", issued_to: "" };
      }
      if (prev.entry_type === "ISSUE" && prev.from_location !== storeId) {
        return { ...prev, from_location: storeId, to_location: "", issued_to: "" };
      }
      return prev;
    });
    setErrors(prev => {
      const next = { ...prev };
      delete next.from_location;
      delete next.to_location;
      delete next.issued_to;
      return next;
    });
  }, [form.entry_type, open, singleAssignedStore]);

  if (!open) return null;

  const issueStoreOptions = getTransferDestinationStores(form.from_location, refs.locations);
  const issueNonStoreOptions = getAllocatableTargetLocations(form.from_location, refs.locations);
  const issuePersonOptions = getAllocatableTargetPersons(form.from_location, refs.locations, refs.persons);
  const receiptNonStoreOptions = getAllocatedReturnLocations(form.to_location, refs.locations, refs.allocations);
  const receiptPersonOptions = getAllocatedReturnPersons(form.to_location, refs.persons, refs.allocations);
  const returnTarget: StockEntryReturnTarget = form.return_source === "PERSON"
    ? { type: "PERSON", id: form.issued_to }
    : { type: "LOCATION", id: form.from_location };
  const itemContextReady = form.entry_type === "ISSUE"
    ? Boolean(form.from_location)
    : Boolean(form.to_location && (form.return_source === "PERSON" ? form.issued_to : form.from_location));
  const itemContextPlaceholder = form.entry_type === "ISSUE"
    ? "Select source store first"
    : form.to_location
    ? "Select return source first"
    : "Select receiving store first";
  const getItemOptions = () => form.entry_type === "ISSUE"
    ? getIssueItemOptions(form.from_location, refs.items, refs.stockRecords)
    : getReturnItemOptions(form.to_location, returnTarget, refs.items, refs.allocations);
  const getBatchOptions = (row: StockEntryFormItem) => form.entry_type === "ISSUE"
    ? getIssueBatchOptions(form.from_location, row.item, refs.batches, refs.stockRecords)
    : getReturnBatchOptions(form.to_location, returnTarget, row.item, refs.batches, refs.allocations);
  const getQuantityLimit = (row: StockEntryFormItem) => form.entry_type === "ISSUE"
    ? getIssueAvailableQuantity(form.from_location, row.item, row.batch, refs.stockRecords)
    : getReturnQuantityLimit(form.to_location, returnTarget, row.item, row.batch, refs.allocations);
  const getInstanceOptions = (row: StockEntryFormItem) => form.entry_type === "ISSUE"
    ? getIssueInstanceOptions(form.from_location, row.item, refs.instances)
    : getReturnInstanceOptions(form.to_location, returnTarget, row.item, refs.allocations, refs.instances);
  const selectedSourceStoreId = form.entry_type === "ISSUE" ? form.from_location : "";
  const sourceRegisterOptions = refs.registers.filter(
    register =>
      register.is_active &&
      selectedSourceStoreId &&
      String(register.store) === selectedSourceStoreId
  );

  const update = <K extends keyof StockEntryFormState>(key: K, value: StockEntryFormState[K]) => {
    setForm(prev => {
      if (key === "entry_type") {
        return { ...prev, entry_type: value as CreatableStockEntryType, from_location: "", to_location: "", issued_to: "", items: [blankItem()] };
      }
      if (key === "from_location" && prev.entry_type === "ISSUE") {
        return { ...prev, from_location: value as string, to_location: "", issued_to: "", items: [blankItem()] };
      }
      if (key === "from_location" && prev.entry_type === "RECEIPT") {
        return { ...prev, from_location: value as string, issued_to: "", items: [blankItem()] };
      }
      if (key === "to_location" && prev.entry_type === "RECEIPT") {
        return { ...prev, to_location: value as string, from_location: "", issued_to: "", items: [blankItem()] };
      }
      if (key === "issue_target" || key === "return_source") {
        return { ...prev, [key]: value, from_location: key === "return_source" ? "" : prev.from_location, to_location: key === "issue_target" ? "" : prev.to_location, issued_to: "", items: [blankItem()] };
      }
      if (key === "issued_to" && prev.entry_type === "RECEIPT") {
        return { ...prev, issued_to: value as string, from_location: "", items: [blankItem()] };
      }
      return { ...prev, [key]: value };
    });
    setErrors(prev => {
      const next = { ...prev };
      delete next[String(key)];
      if (key === "entry_type" || key === "from_location" || key === "to_location" || key === "issue_target" || key === "return_source") {
        delete next.from_location;
        delete next.to_location;
        delete next.issued_to;
      }
      return next;
    });
  };

  const updateRow = (index: number, patch: Partial<StockEntryFormItem>) => {
    setForm(prev => ({
      ...prev,
      items: prev.items.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row),
    }));
    setErrors(prev => {
      const next = { ...prev };
      Object.keys(patch).forEach(key => delete next[`items.${index}.${key}`]);
      return next;
    });
  };

  const addRow = () => setForm(prev => ({ ...prev, items: [...prev.items, blankItem()] }));
  const removeRow = (index: number) => setForm(prev => ({ ...prev, items: prev.items.length === 1 ? prev.items : prev.items.filter((_, rowIndex) => rowIndex !== index) }));

  const submit = async () => {
    const nextErrors = validateStockEntryForm(form);
    const itemOptions = getItemOptions();
    form.items.forEach((row, index) => {
      if (!row.item) return;
      const selectedItem = refs.items.find(item => String(item.id) === row.item);
      if (!itemOptions.some(item => String(item.id) === row.item)) {
        nextErrors[`items.${index}.item`] = form.entry_type === "ISSUE"
          ? "This item is not available in the selected source store."
          : "This item is not allocated to the selected return source.";
        return;
      }

      if (isIndividualTracking(selectedItem)) {
        const instanceOptions = getInstanceOptions(row);
        const validInstanceIds = new Set(instanceOptions.map(instance => String(instance.id)));
        const selectedInstanceIds = row.instances ?? [];
        if (!selectedInstanceIds.length) {
          nextErrors[`items.${index}.instances`] = "Select the item instances.";
        } else if (selectedInstanceIds.some(instanceId => !validInstanceIds.has(instanceId))) {
          nextErrors[`items.${index}.instances`] = "Selected instances are not available for this movement.";
        } else if (selectedInstanceIds.length !== Number(row.quantity)) {
          nextErrors[`items.${index}.quantity`] = "Quantity must match the selected instance count.";
        }
      } else {
        const batchOptions = getBatchOptions(row);
        const requiresExplicitBatch = !(form.entry_type === "ISSUE" && isConsumableQuantityItem(selectedItem));
        if (requiresExplicitBatch && batchOptions.length > 0 && !row.batch) {
          nextErrors[`items.${index}.batch`] = "Choose the batch.";
        }
        const limit = getQuantityLimit(row);
        if (Number(row.quantity) > limit) {
          nextErrors[`items.${index}.quantity`] = `Only ${limit} available for this selection.`;
        }
      }
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload = buildStockEntryPayload(form) as ReturnType<typeof buildStockEntryPayload> & { reference_entry?: number; reference_purpose?: string };
      if (mode === "create" && entry) {
        payload.reference_entry = entry.id;
        payload.reference_purpose = "REPLACEMENT";
      }
      await apiFetch(mode === "edit" && entry ? `/api/inventory/stock-entries/${entry.id}/` : "/api/inventory/stock-entries/", {
        method: mode === "edit" ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      await onSave();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save stock entry");
    } finally {
      setSubmitting(false);
    }
  };

  const issueLocationOptions = form.issue_target === "LOCATION" ? issueNonStoreOptions : issueStoreOptions;
  const selectedItemIds = new Set(form.items.map(row => row.item).filter(Boolean));
  const canSubmit = !refsLoading && !submitting;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal modal-lg" role="dialog" aria-modal="true" aria-labelledby="stock-entry-modal-title">
        <div className="modal-head">
          <div>
            <div className="eyebrow">Stock operation</div>
            <h2 id="stock-entry-modal-title">{mode === "edit" ? "Edit Stock Entry" : entry ? "Create Replacement Entry" : "Create Stock Entry"}</h2>
            <p>{mode === "edit" ? "Draft entries can be revised before stock movement is committed." : entry ? "Create a normal stock entry linked to the original record." : "Record a transfer/allocation or receipt with line items."}</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close stock entry modal">×</button>
        </div>

        <div className="modal-body">
          {submitError && <Alert onDismiss={() => setSubmitError(null)}>{submitError}</Alert>}
          {refsLoading && <div style={{ padding: 16, color: "var(--muted)", fontSize: 13 }}>Loading dropdown data…</div>}

          <Section n={1} title="Movement" sub={form.entry_type === "ISSUE" ? "Choose the store sending stock, then choose who or where receives it." : "Choose the store receiving returned stock, then choose who or where it is returning from."}>
            <div className="form-grid cols-2">
              <Field label="Entry Type" required>
                <select value={form.entry_type} onChange={event => update("entry_type", event.target.value as CreatableStockEntryType)}>
                  <option value="ISSUE">Transfer / Allocation</option>
                  <option value="RECEIPT">Return Receipt</option>
                </select>
              </Field>
              {form.entry_type === "ISSUE" ? (
                <>
                  <Field label="Issue To" required>
                    <div className="seg seg-inline">
                      {(["STORE", "LOCATION", "PERSON"] as const).map(option => (
                        <button key={option} type="button" className={"seg-btn" + (form.issue_target === option ? " active" : "")} onClick={() => update("issue_target", option)}>{option === "LOCATION" ? "Non-store" : formatLabel(option)}</button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Source Store" required error={errors.from_location} hint="Only stores can send stock.">
                    <SearchableSelect
                      value={form.from_location}
                      options={selectableStoreOptions.map(locationOption)}
                      onChange={value => update("from_location", value)}
                      placeholder="Select source store"
                      searchPlaceholder="Search source stores..."
                      emptyLabel="No source stores available"
                      disabled={Boolean(singleAssignedStore)}
                    />
                  </Field>
                  {form.issue_target === "PERSON" ? (
                    <Field label="Receiving Person" required error={errors.issued_to}>
                      <SearchableSelect
                        value={form.issued_to}
                        options={issuePersonOptions.map(personOption)}
                        onChange={value => update("issued_to", value)}
                        placeholder={form.from_location ? "Select person" : "Select source store first"}
                        searchPlaceholder="Search people..."
                        emptyLabel="No people available in this store scope"
                        disabled={!form.from_location}
                      />
                    </Field>
                  ) : (
                    <Field label={form.issue_target === "LOCATION" ? "Destination Non-store" : "Destination Store"} required error={errors.to_location}>
                      <SearchableSelect
                        value={form.to_location}
                        options={issueLocationOptions.map(locationOption)}
                        onChange={value => update("to_location", value)}
                        placeholder={form.from_location ? "Select destination" : "Select source store first"}
                        searchPlaceholder="Search destinations..."
                        emptyLabel="No destinations available for this source store"
                        disabled={!form.from_location}
                      />
                    </Field>
                  )}
                </>
              ) : (
                <>
                  <Field label="Return From" required>
                    <div className="seg seg-inline">
                      {(["PERSON", "LOCATION"] as const).map(option => (
                        <button key={option} type="button" className={"seg-btn" + (form.return_source === option ? " active" : "")} onClick={() => update("return_source", option)}>{option === "LOCATION" ? "Non-store" : "Person"}</button>
                      ))}
                    </div>
                  </Field>
                  <Field label="Receiving Store" required error={errors.to_location} hint={singleAssignedStore ? "The only store assigned to this account is selected automatically." : "Returned stock is received back into this store."}>
                    <SearchableSelect
                      value={form.to_location}
                      options={selectableStoreOptions.map(locationOption)}
                      onChange={value => update("to_location", value)}
                      placeholder="Select receiving store"
                      searchPlaceholder="Search receiving stores..."
                      emptyLabel="No receiving stores available"
                      disabled={Boolean(singleAssignedStore)}
                    />
                  </Field>
                  {form.return_source === "PERSON" ? (
                    <Field label="Returning Person" required error={errors.issued_to}>
                      <SearchableSelect
                        value={form.issued_to}
                        options={receiptPersonOptions.map(personOption)}
                        onChange={value => update("issued_to", value)}
                        placeholder={form.to_location ? "Select person" : "Select receiving store first"}
                        searchPlaceholder="Search people with active allocations..."
                        emptyLabel="No active person allocations from this store"
                        disabled={!form.to_location}
                      />
                    </Field>
                  ) : (
                    <Field label="Returning Non-store" required error={errors.from_location}>
                      <SearchableSelect
                        value={form.from_location}
                        options={receiptNonStoreOptions.map(locationOption)}
                        onChange={value => update("from_location", value)}
                        placeholder={form.to_location ? "Select non-store location" : "Select receiving store first"}
                        searchPlaceholder="Search non-stores with active allocations..."
                        emptyLabel="No active non-store allocations from this store"
                        disabled={!form.to_location}
                      />
                    </Field>
                  )}
                </>
              )}
              <Field label="Purpose" span={2}>
                <input className="input" value={form.purpose} onChange={event => update("purpose", event.target.value)} placeholder="Lab allocation, inter-store transfer, inspection receipt…" />
              </Field>
              <Field label="Remarks" span={2}>
                <textarea className="textarea-field" value={form.remarks} onChange={event => update("remarks", event.target.value)} placeholder="Optional movement notes" rows={3} />
              </Field>
            </div>
          </Section>

          <Section n={2} title="Line Items" sub="Add each item, quantity, and source register page when applicable.">
            <div style={{ display: "grid", gap: 12 }}>
              {form.items.map((row, index) => {
                const itemOptions = getItemOptions();
                const selectedItem = refs.items.find(item => String(item.id) === row.item);
                const rowBatchOptions = getBatchOptions(row);
                const rowInstanceOptions = getInstanceOptions(row);
                const rowQuantityLimit = isIndividualTracking(selectedItem) ? rowInstanceOptions.length : getQuantityLimit(row);
                const itemDisabled = !itemContextReady;
                const individual = isIndividualTracking(selectedItem);
                const autoAssignConsumableBatch = form.entry_type === "ISSUE" && isConsumableQuantityItem(selectedItem);
                const duplicate = row.item && selectedItemIds.has(row.item) && form.items.filter(item => item.item === row.item).length > 1;
                return (
                  <div key={index} style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius)", padding: 12, background: "var(--surface-2)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div className="eyebrow">Item {index + 1}{duplicate ? " · Duplicate item" : ""}</div>
                      <button type="button" className="btn btn-xs btn-ghost" onClick={() => removeRow(index)} disabled={form.items.length === 1}>Remove</button>
                    </div>
                    <div className="form-grid cols-2">
                      <Field label="Item" required error={errors[`items.${index}.item`]}>
                        <SearchableSelect
                          value={row.item}
                          options={itemOptions.map(item => ({
                            value: String(item.id),
                            label: item.name,
                            meta: [item.code, item.tracking_type ? formatLabel(item.tracking_type) : null].filter(Boolean).join(" - "),
                          }))}
                          onChange={value => updateRow(index, { item: value, batch: "", quantity: "1", instances: [] })}
                          placeholder={itemDisabled ? itemContextPlaceholder : "Select item"}
                          searchPlaceholder="Search available items..."
                          emptyLabel={itemDisabled ? itemContextPlaceholder : "No matching stock is available"}
                          disabled={itemDisabled}
                        />
                      </Field>
                      {individual ? (
                        <Field label="Instances" required error={errors[`items.${index}.instances`]} hint={row.item ? `${rowInstanceOptions.length} instance${rowInstanceOptions.length === 1 ? "" : "s"} available for this movement.` : "Select an individual-tracked item first."}>
                          <InstanceMultiSelect
                            value={row.instances ?? []}
                            options={rowInstanceOptions.map(instanceOption)}
                            onChange={values => updateRow(index, {
                              instances: values,
                              quantity: String(Math.max(1, values.length)),
                              batch: "",
                            })}
                            placeholder={row.item ? "Select instances" : "Select item first"}
                            searchPlaceholder="Search instance number..."
                            emptyLabel="No instances available for this selection"
                            disabled={!row.item}
                          />
                        </Field>
                      ) : (
                        autoAssignConsumableBatch ? (
                          <Field
                            label="Batch"
                            hint={row.item ? "Assigned automatically from source stock to preserve inspection batch traceability." : "Select a consumable item first."}
                          >
                            <input
                              className="input"
                              value={row.item ? "Assigned automatically" : "Select item first"}
                              readOnly
                              disabled
                            />
                          </Field>
                        ) : (
                          <Field label="Batch" error={errors[`items.${index}.batch`]} hint={selectedItem?.tracking_type ? `Tracking: ${formatLabel(selectedItem.tracking_type)}` : undefined}>
                            <SearchableSelect
                              value={row.batch}
                              options={rowBatchOptions.map(batch => ({
                                value: String(batch.id),
                                label: batch.batch_number,
                                meta: selectedItem?.code,
                              }))}
                              onChange={value => updateRow(index, { batch: value })}
                              placeholder={row.item ? "Select batch" : "Select item first"}
                              searchPlaceholder="Search batches..."
                              emptyLabel="No available batches for this item"
                              disabled={!row.item || rowBatchOptions.length === 0}
                            />
                          </Field>
                        )
                      )}
                      <Field label={individual ? "Quantity / Auto Select" : "Quantity"} required error={errors[`items.${index}.quantity`]} hint={row.item ? `Limit: ${rowQuantityLimit}` : undefined}>
                        <input
                          className="input"
                          type="number"
                          min="1"
                          max={rowQuantityLimit || undefined}
                          value={row.quantity}
                          onChange={event => {
                            const value = event.target.value;
                            if (individual) {
                              const count = Math.max(0, Number(value) || 0);
                              const selectedInstances = rowInstanceOptions.slice(0, count).map(instance => String(instance.id));
                              updateRow(index, {
                                quantity: value,
                                instances: selectedInstances,
                                batch: "",
                              });
                              return;
                            }
                            updateRow(index, { quantity: value });
                          }}
                          disabled={!row.item}
                        />
                      </Field>
                      <Field label="Source Register">
                        <select
                          value={row.stock_register}
                          onChange={event => updateRow(index, { stock_register: event.target.value })}
                          disabled={!selectedSourceStoreId || sourceRegisterOptions.length === 0}
                        >
                          <option value="">No register</option>
                          {sourceRegisterOptions.map(register => <option key={register.id} value={register.id}>{register.register_number} — {register.store_name}</option>)}
                        </select>
                      </Field>
                      <Field label="Page Number">
                        <input className="input" type="number" min="1" value={row.page_number} onChange={event => updateRow(index, { page_number: event.target.value })} placeholder="Optional" />
                      </Field>
                    </div>
                  </div>
                );
              })}
              <button type="button" className="btn btn-sm btn-ghost" onClick={addRow}>
                <Ic d="M12 5v14M5 12h14" size={14} /> Add line item
              </button>
            </div>
          </Section>
        </div>

        <div className="modal-foot">
          <div className="modal-foot-meta">Backend scoping still enforces which source and destination rows you can use.</div>
          <div className="modal-foot-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={submitting}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={submit} disabled={!canSubmit}>{submitting ? "Saving…" : mode === "edit" ? "Save Changes" : "Create Entry"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RowActions({ entry, canEdit, canDelete, pageBusy, deleteBusy, ackBusy, onEdit, onDelete, onAcknowledge }: { entry: StockEntryRecord; canEdit: boolean; canDelete: boolean; pageBusy: boolean; deleteBusy: boolean; ackBusy: boolean; onEdit: () => void; onDelete: () => void; onAcknowledge: () => void }) {
  const showAcknowledge = Boolean(entry.can_acknowledge) && entry.status === "PENDING_ACK";
  const showEdit = canEdit && entry.status === "DRAFT";
  const showDelete = canDelete && entry.status === "DRAFT";
  if (!showAcknowledge && !showEdit && !showDelete) return <span className="muted-note mono">No actions</span>;
  return (
    <div className="row-actions">
      {showAcknowledge && <button type="button" className="btn btn-xs btn-primary row-action ack-action" onClick={event => { event.stopPropagation(); onAcknowledge(); }} disabled={pageBusy}><Ic d="M20 6L9 17l-5-5" size={13} /><span className="ra-label">{ackBusy ? "Acknowledging…" : "Acknowledge"}</span></button>}
      {showEdit && <button type="button" className="btn btn-xs btn-ghost row-action" onClick={event => { event.stopPropagation(); onEdit(); }} disabled={pageBusy}><Ic d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" size={13} /><span className="ra-label">Edit</span></button>}
      {showDelete && <button type="button" className="btn btn-xs btn-danger-ghost row-action" onClick={event => { event.stopPropagation(); onDelete(); }} disabled={pageBusy}><Ic d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0l1 12h6l1-12" size={13} /><span className="ra-label">{deleteBusy ? "Deleting…" : "Delete"}</span></button>}
    </div>
  );
}

export function StockEntriesView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { isLoading: capsLoading } = useCapabilities();
  const canView = useCan("stock-entries");
  const canManage = useCan("stock-entries", "manage");
  const canDelete = useCan("stock-entries", "full");

  const [entries, setEntries] = useState<StockEntryRecord[]>([]);
  const [refs, setRefs] = useState<ReferenceData>({ items: [], batches: [], locations: [], persons: [], registers: [], allocations: [], stockRecords: [], instances: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [refsLoading, setRefsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [density, setDensity] = useState<Density>("balanced");
  const [mode, setMode] = useState<"table" | "grid">("table");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingEntry, setEditingEntry] = useState<StockEntryRecord | null>(null);
  const [busyAction, setBusyAction] = useState<{ kind: "delete" | "acknowledge"; entryId: number } | null>(null);
  const refsLoadedRef = useRef(false);
  const refsPromiseRef = useRef<Promise<boolean> | null>(null);
  const replacementOpenedRef = useRef<string | null>(null);

  const loadRefs = useCallback(async () => {
    if (!canManage) return true;
    if (refsLoadedRef.current) return true;
    if (refsPromiseRef.current) return refsPromiseRef.current;
    setRefsLoading(true);
    const promise = (async () => {
      try {
        const [itemsData, batchesData, locationsData, personsData, registersData, allocationsData, stockRecordsData, instancesData] = await Promise.all([
          apiFetch<Page<ItemRecord> | ItemRecord[]>("/api/inventory/items/?page_size=500"),
          apiFetch<Page<ItemBatchRecord> | ItemBatchRecord[]>("/api/inventory/item-batches/?page_size=500"),
          apiFetch<Page<LocationRecord> | LocationRecord[]>("/api/inventory/locations/?page_size=500"),
          apiFetch<Page<PersonRecord> | PersonRecord[]>("/api/inventory/persons/?page_size=500"),
          apiFetch<Page<StockRegisterRecord> | StockRegisterRecord[]>("/api/inventory/stock-registers/?page_size=500"),
          apiFetch<Page<StockAllocationRecord> | StockAllocationRecord[]>("/api/inventory/stock-allocations/?status=ALLOCATED&page_size=500"),
          apiFetch<Page<StockEntryStockRecord> | StockEntryStockRecord[]>("/api/inventory/distribution/?page_size=1000"),
          apiFetch<Page<StockEntryItemInstance> | StockEntryItemInstance[]>("/api/inventory/item-instances/?page_size=1000"),
        ]);
        setRefs({
          items: normalizeList(itemsData),
          batches: normalizeList(batchesData),
          locations: normalizeList(locationsData),
          persons: normalizeList(personsData),
          registers: normalizeList(registersData),
          allocations: normalizeList(allocationsData),
          stockRecords: normalizeList(stockRecordsData),
          instances: normalizeList(instancesData),
        });
        refsLoadedRef.current = true;
        return true;
      } catch (err) {
        setFetchError(err instanceof Error ? err.message : "Failed to load stock entry dropdown data");
        refsLoadedRef.current = false;
        return false;
      } finally {
        refsPromiseRef.current = null;
        setRefsLoading(false);
      }
    })();
    refsPromiseRef.current = promise;
    return promise;
  }, [canManage]);

  const loadEntries = useCallback(async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
    if (showLoading) setIsLoading(true);
    setFetchError(null);
    try {
      const data = await apiFetch<Page<StockEntryRecord> | StockEntryRecord[]>("/api/inventory/stock-entries/?page_size=500");
      setEntries(normalizeList(data));
      return true;
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load stock entries");
      return false;
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (capsLoading) return;
    if (!canView) {
      router.replace("/403");
      return;
    }
    loadEntries();
    loadRefs();
  }, [canView, capsLoading, loadEntries, loadRefs, router]);

  useEffect(() => {
    const replacementFor = searchParams.get("replacement_for");
    if (!replacementFor || !canManage || isLoading || replacementOpenedRef.current === replacementFor) return;
    const source = entries.find(entry => String(entry.id) === replacementFor);
    if (!source) return;
    replacementOpenedRef.current = replacementFor;
    setModalMode("create");
    setEditingEntry(source);
    setModalOpen(true);
    void loadRefs();
    router.replace("/stock-entries");
  }, [canManage, entries, isLoading, loadRefs, router, searchParams]);

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter(entry => {
      if (q) {
        const hay = [entry.entry_number, entry.from_location_name ?? "", entry.to_location_name ?? "", entry.issued_to_name ?? "", entry.purpose ?? "", entry.remarks ?? "", ...entry.items.map(item => item.item_name ?? "")].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (typeFilter !== "all" && entry.entry_type !== typeFilter) return false;
      if (statusFilter !== "all" && entry.status !== statusFilter) return false;
      return true;
    });
  }, [entries, search, statusFilter, typeFilter]);

  const stats = useMemo(() => ({
    draft: entries.filter(entry => entry.status === "DRAFT").length,
    pending: entries.filter(entry => entry.status === "PENDING_ACK").length,
    completed: entries.filter(entry => entry.status === "COMPLETED").length,
  }), [entries]);

  const openCreateModal = async () => {
    setModalMode("create");
    setEditingEntry(null);
    setModalOpen(true);
    void loadRefs();
  };
  const openEditModal = async (entry: StockEntryRecord) => {
    setModalMode("edit");
    setEditingEntry(entry);
    setModalOpen(true);
    void loadRefs();
  };
  const closeModal = () => {
    setModalOpen(false);
    setModalMode("create");
    setEditingEntry(null);
  };

  const handleSave = async () => {
    const refreshed = await loadEntries({ showLoading: false });
    if (!refreshed) setActionError("Stock entry saved, but the list could not be refreshed. Reload to resync the table.");
  };

  const handleDelete = async (entry: StockEntryRecord) => {
    if (!canDelete || busyAction) return;
    const confirmed = window.confirm(`Delete draft ${entry.entry_number}? This cannot be undone.`);
    if (!confirmed) return;
    setBusyAction({ kind: "delete", entryId: entry.id });
    setActionError(null);
    try {
      await apiFetch(`/api/inventory/stock-entries/${entry.id}/`, { method: "DELETE" });
      setEntries(prev => prev.filter(record => record.id !== entry.id));
      const refreshed = await loadEntries({ showLoading: false });
      if (!refreshed) setActionError("Stock entry deleted, but the list could not be refreshed. Reload to resync.");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete stock entry");
    } finally {
      setBusyAction(null);
    }
  };

  const handleAcknowledge = async (entry: StockEntryRecord) => {
    if (!entry.can_acknowledge || busyAction) return;
    const confirmed = window.confirm(`Acknowledge receipt ${entry.entry_number}? This will complete the stock movement.`);
    if (!confirmed) return;
    setBusyAction({ kind: "acknowledge", entryId: entry.id });
    setActionError(null);
    try {
      await apiFetch(`/api/inventory/stock-entries/${entry.id}/acknowledge/`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      const refreshed = await loadEntries({ showLoading: false });
      if (!refreshed) setActionError("Entry acknowledged, but the list could not be refreshed. Reload to resync.");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to acknowledge stock entry");
    } finally {
      setBusyAction(null);
    }
  };

  const pageBusy = busyAction !== null;
  const deleteBusyId = busyAction?.kind === "delete" ? busyAction.entryId : null;
  const ackBusyId = busyAction?.kind === "acknowledge" ? busyAction.entryId : null;

  return (
    <div data-density={density}>
      <StockEntryModal open={modalOpen} mode={modalMode} entry={editingEntry} refs={refs} refsLoading={refsLoading} assignedLocationIds={user?.assigned_locations} onClose={closeModal} onSave={handleSave} />
      <Topbar breadcrumb={["Operations", "Stock Entries"]} />
      <div className="page">
        {fetchError && <Alert action={<button type="button" className="btn btn-xs" onClick={() => { loadEntries(); loadRefs(); }}>Retry</button>} onDismiss={() => setFetchError(null)}>{fetchError}</Alert>}
        {actionError && <Alert onDismiss={() => setActionError(null)}>{actionError}</Alert>}

        <div className="page-head">
          <div className="page-title-group">
            <div className="eyebrow">Operations</div>
            <h1>Stock Entries</h1>
            <div className="page-sub">Create transfers, allocations, and receipts while backend scoping keeps rows tied to assigned stores and standalone locations.</div>
          </div>
        </div>

        <div className="filter-bar">
          <div className="filter-bar-left">
            <div className="search-input">
              <Ic d={<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>} size={14} />
              <input placeholder="Search entry number, item, location, person, or purpose…" value={search} onChange={event => setSearch(event.target.value)} />
              {search && <button type="button" className="clear-search" onClick={() => setSearch("")}>×</button>}
            </div>
            <div className="filter-select-group">
              <div className="chip-filter-label">Type</div>
              <label className="filter-select-wrap">
                <select value={typeFilter} onChange={event => setTypeFilter(event.target.value)} aria-label="Filter stock entries by type">
                  <option value="all">All types</option>
                  <option value="ISSUE">Transfer / Allocation</option>
                  <option value="RECEIPT">Receipt</option>
                  <option value="RETURN">Return</option>
                </select>
              </label>
            </div>
            <div className="filter-select-group">
              <div className="chip-filter-label">Status</div>
              <label className="filter-select-wrap">
                <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} aria-label="Filter stock entries by status">
                  <option value="all">All statuses</option>
                  <option value="DRAFT">Draft</option>
                  <option value="PENDING_ACK">Pending Ack</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </label>
            </div>
          </div>
          <div className="filter-bar-right">
            <div className="chip-filter">
              <span className="chip">Draft {stats.draft}</span>
              <span className="chip">Pending {stats.pending}</span>
              <span className="chip">Done {stats.completed}</span>
            </div>
            <DensityToggle density={density} setDensity={setDensity} />
            <div className="seg" title="View mode">
              <button type="button" className={"seg-btn icon-only" + (mode === "table" ? " active" : "")} onClick={() => setMode("table")} title="Table"><Ic d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" size={14} /></button>
              <button type="button" className={"seg-btn icon-only" + (mode === "grid" ? " active" : "")} onClick={() => setMode("grid")} title="Grid"><Ic d={<><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>} size={14} /></button>
            </div>
            {canManage && <button type="button" className="btn btn-sm btn-primary" onClick={openCreateModal} disabled={pageBusy}><Ic d="M12 5v14M5 12h14" size={14} /> New Entry</button>}
          </div>
        </div>

        {mode === "table" ? (
          <div className="table-card">
            <div className="table-card-head">
              <div className="table-card-head-left">
                <div className="eyebrow">Stock movement ledger</div>
                <div className="table-count"><span className="mono">{filteredEntries.length}</span><span>of</span><span className="mono">{entries.length}</span><span>entries</span></div>
              </div>
            </div>
            {isLoading ? <div style={{ padding: 32, textAlign: "center", color: "var(--muted)", borderTop: "1px solid var(--hairline)" }}>Loading stock entries…</div> : (
              <div className="h-scroll">
                <table className="data-table">
                  <thead><tr><th>Entry</th><th>Type</th><th>Source</th><th>Destination</th><th>Items</th><th>Status</th><th>Created</th><th>Actions</th></tr></thead>
                  <tbody>
                    {filteredEntries.length === 0 ? <tr><td colSpan={8}><div style={{ padding: "32px 12px", textAlign: "center", color: "var(--text-2)", fontSize: 13 }}>No stock entries match the current filters.</div></td></tr> : filteredEntries.map(entry => (
                      <tr key={entry.id} onClick={() => router.push(`/stock-entries/${entry.id}`)} style={{ cursor: "pointer" }}>
                        <td><div className="user-cell"><div className="avatar" style={{ width: 32, height: 32, fontSize: 11, background: "linear-gradient(135deg, color-mix(in oklch, var(--primary) 82%, white), var(--primary))" }}>{entry.entry_type.slice(0, 2)}</div><div><div className="user-name">{entry.entry_number}</div><div className="user-username mono">{formatDate(entry.entry_date)}</div></div></div></td>
                        <td><span className="chip">{formatLabel(entry.entry_type)}</span></td>
                        <td>{entry.from_location_name ?? "System / inspection"}</td>
                        <td>{entryTarget(entry)}</td>
                        <td><div className="group-cell">{entry.items.slice(0, 2).map(item => <span key={`${entry.id}-${item.id ?? item.item}`} className="chip">{item.item_name ?? `Item ${item.item}`} × {item.quantity}</span>)}{entry.items.length > 2 && <span className="muted-note mono">+{entry.items.length - 2} more</span>}</div></td>
                        <td>
                          <div className="group-cell">
                            <StatusPill status={entry.status} />
                            <CorrectionPill entry={entry} />
                          </div>
                        </td>
                        <td><div className="login-cell"><div>{relTime(entry.created_at)}</div><div className="login-cell-sub mono">{entry.created_by_name ?? "Unknown"}</div></div></td>
                        <td className="col-actions"><RowActions entry={entry} canEdit={canManage} canDelete={canDelete} pageBusy={pageBusy} deleteBusy={deleteBusyId === entry.id} ackBusy={ackBusyId === entry.id} onEdit={() => openEditModal(entry)} onDelete={() => handleDelete(entry)} onAcknowledge={() => handleAcknowledge(entry)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="table-card-foot"><div className="eyebrow">Showing {filteredEntries.length} rows</div><div className="pager"><span className="mono pager-current">Scoped stock entries</span></div></div>
          </div>
        ) : filteredEntries.length > 0 ? (
          <div className="users-grid">
            {filteredEntries.map(entry => (
              <div className="user-card" key={entry.id} onClick={() => router.push(`/stock-entries/${entry.id}`)} style={{ cursor: "pointer" }}>
                <div className="user-card-head">
                  <div className="avatar" style={{ width: 44, height: 44, fontSize: 12, background: "linear-gradient(135deg, color-mix(in oklch, var(--primary) 82%, white), var(--primary))" }}>{entry.entry_type.slice(0, 2)}</div>
                  <div className="group-cell" style={{ justifyContent: "flex-end" }}>
                    <StatusPill status={entry.status} />
                    <CorrectionPill entry={entry} />
                  </div>
                </div>
                <div className="user-card-name">{entry.entry_number}</div>
                <div className="user-card-meta mono">{formatDate(entry.entry_date)}</div>
                <div className="user-card-section"><div className="eyebrow">Movement</div><div style={{ fontSize: 13, color: "var(--text-1)" }}>{entry.from_location_name ?? "System"} → {entryTarget(entry)}</div></div>
                <div className="user-card-section"><div className="eyebrow">Line Items</div><div className="group-cell">{entry.items.slice(0, 3).map(item => <span key={`${entry.id}-card-${item.id ?? item.item}`} className="chip">{item.item_name ?? `Item ${item.item}`} × {item.quantity}</span>)}</div></div>
                <div className="user-card-foot"><div><div className="eyebrow">Created</div><div className="user-card-last mono">{relTime(entry.created_at)}</div></div><RowActions entry={entry} canEdit={canManage} canDelete={canDelete} pageBusy={pageBusy} deleteBusy={deleteBusyId === entry.id} ackBusy={ackBusyId === entry.id} onEdit={() => openEditModal(entry)} onDelete={() => handleDelete(entry)} onAcknowledge={() => handleAcknowledge(entry)} /></div>
              </div>
            ))}
          </div>
        ) : <div className="table-card"><div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>No stock entries match the current filters.</div></div>}
      </div>
    </div>
  );
}
