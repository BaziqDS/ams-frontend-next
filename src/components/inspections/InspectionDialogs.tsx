"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { apiFetch, type Page } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import {
  API_BASE,
  formatInspectionDate,
  getCreateInspectionSubmitLabel,
  type InspectionItemOption,
  type InspectionItemRecord,
  type InspectionLocationOption,
  type InspectionRecord,
  type InspectionStage,
  INSPECTION_STAGE_LABELS,
  INSPECTION_STAGE_PILL,
  type InspectionStockRegisterOption,
} from "@/lib/inspectionUi";
import {
  getAutoSelectedInspectionLocation,
  getInspectionQuantityError,
  getInspectionQuantityUpdateError,
  getScopedInspectionLocations,
} from "@/lib/inspectionStageForms";

export const InspectionIcon = ({ d, size = 16 }: { d: React.ReactNode | string; size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0 }}
    aria-hidden="true"
    focusable="false"
  >
    {typeof d === "string" ? <path d={d} /> : d}
  </svg>
);

export function InspectionStagePill({ stage }: { stage: InspectionStage }) {
  return (
    <span className={`pill ${INSPECTION_STAGE_PILL[stage] ?? "pill-neutral"}`}>
      <span className="status-dot" />
      {INSPECTION_STAGE_LABELS[stage] ?? stage}
    </span>
  );
}

function Field({
  label,
  required,
  error,
  hint,
  children,
  span,
}: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
  span?: number;
}) {
  return (
    <div className={"field" + (error ? " has-error" : "")} style={span ? { gridColumn: `span ${span}` } : undefined}>
      <div className="field-label">
        {label}
        {required && <span className="field-req">*</span>}
      </div>
      {children}
      {error ? <div className="field-error">{error}</div> : hint ? <div className="field-hint">{hint}</div> : null}
    </div>
  );
}

function Section({ n, title, sub, children }: { n: number; title: string; sub?: string; children: React.ReactNode }) {
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

function blankItem(): InspectionItemRecord {
  return {
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
  };
}

export function InspectionModal({
  open,
  mode,
  inspection,
  hasStage,
  onClose,
  onSave,
}: {
  open: boolean;
  mode: "create" | "edit";
  inspection: InspectionRecord | null;
  hasStage: (stage: string) => boolean;
  onClose: () => void;
  onSave: () => void | Promise<void>;
}) {
  const { user } = useAuth();
  const [date, setDate] = useState("");
  const [contractNo, setContractNo] = useState("");
  const [contractDate, setContractDate] = useState("");
  const [contractorName, setContractorName] = useState("");
  const [contractorAddress, setContractorAddress] = useState("");
  const [indenter, setIndenter] = useState("");
  const [indentNo, setIndentNo] = useState("");
  const [department, setDepartment] = useState<number | "">("");
  const [dateOfDelivery, setDateOfDelivery] = useState("");
  const [deliveryType, setDeliveryType] = useState<"PART" | "FULL">("FULL");
  const [remarks, setRemarks] = useState("");
  const [inspectedBy, setInspectedBy] = useState("");
  const [dateOfInspection, setDateOfInspection] = useState("");
  const [financeCheckDate, setFinanceCheckDate] = useState("");
  const [consigneeName, setConsigneeName] = useState("");
  const [consigneeDesignation, setConsigneeDesignation] = useState("");
  const [items, setItems] = useState<InspectionItemRecord[]>([blankItem()]);
  const [files, setFiles] = useState<File[]>([]);

  const [locations, setLocations] = useState<InspectionLocationOption[]>([]);
  const [itemOptions, setItemOptions] = useState<InspectionItemOption[]>([]);
  const [stockRegisters, setStockRegisters] = useState<InspectionStockRegisterOption[]>([]);
  const [refsLoading, setRefsLoading] = useState(true);

  const [touched, setTouched] = useState(false);
  const [quantityInputErrors, setQuantityInputErrors] = useState<Record<number, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewFile, setPreviewFile] = useState<{ url: string; type: "image" | "pdf" | "other"; name: string } | null>(null);
  const rootScopedUser = Boolean(user?.is_superuser) || locations.some(location => user?.assigned_locations?.includes(location.id) && location.hierarchy_level === 0);
  const locationScopeHint = rootScopedUser
    ? "Root-level access can create certificates for any standalone location."
    : locations.length === 1
      ? "Your assigned standalone location was selected automatically."
      : "Only your assigned standalone locations are available.";

  const openLocalPreview = (file: File) => {
    const isImage = file.type.startsWith("image/");
    const isPdf = file.type === "application/pdf";
    if (!isImage && !isPdf) return;
    const url = URL.createObjectURL(file);
    if (isPdf) {
      window.open(url, "_blank");
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      return;
    }
    setPreviewFile({ url, type: "image", name: file.name });
  };

  const closePreview = () => {
    if (previewFile) URL.revokeObjectURL(previewFile.url);
    setPreviewFile(null);
  };

  const stage = inspection?.stage ?? "DRAFT";
  const isEditDraft = mode === "edit" && stage === "DRAFT";
  const isEditStage2 = mode === "edit" && stage === "STOCK_DETAILS";
  const isEditStage3 = mode === "edit" && stage === "CENTRAL_REGISTER";
  const isEditStage4 = mode === "edit" && stage === "FINANCE_REVIEW";
  const isReadOnly = mode === "edit" && (stage === "COMPLETED" || stage === "REJECTED");

  const canEditBasic = mode === "create" || isEditDraft;
  const canEditItems = mode === "create" || isEditDraft;
  const canEditStage2 = isEditStage2 && hasStage("fill_stock_details");
  const canEditStage3 = isEditStage3 && hasStage("fill_central_register");
  const canEditStage4 = isEditStage4 && hasStage("review_finance");
  const showStockColumns = mode === "edit" && ["STOCK_DETAILS", "CENTRAL_REGISTER", "FINANCE_REVIEW", "COMPLETED", "REJECTED"].includes(stage);
  const showCentralColumns = mode === "edit" && ["CENTRAL_REGISTER", "FINANCE_REVIEW", "COMPLETED", "REJECTED"].includes(stage);
  const showFinanceSection = mode === "edit" && (isEditStage4 || stage === "COMPLETED" || stage === "REJECTED" || Boolean(inspection?.finance_check_date));
  const documentsSectionNumber = showFinanceSection ? 5 : 4;
  const auditSectionNumber = showFinanceSection ? 6 : 5;
  const selectedDepartmentLevel = mode === "create"
    ? locations.find(location => location.id === department)?.hierarchy_level ?? null
    : inspection?.department_hierarchy_level ?? null;

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && inspection) {
      setDate(inspection.date ?? "");
      setContractNo(inspection.contract_no ?? "");
      setContractDate(inspection.contract_date ?? "");
      setContractorName(inspection.contractor_name ?? "");
      setContractorAddress(inspection.contractor_address ?? "");
      setIndenter(inspection.indenter ?? "");
      setIndentNo(inspection.indent_no ?? "");
      setDepartment(inspection.department ?? "");
      setDateOfDelivery(inspection.date_of_delivery ?? "");
      setDeliveryType(inspection.delivery_type ?? "FULL");
      setRemarks(inspection.remarks ?? "");
      setInspectedBy(inspection.inspected_by ?? "");
      setDateOfInspection(inspection.date_of_inspection ?? "");
      setFinanceCheckDate(inspection.finance_check_date ?? "");
      setConsigneeName(inspection.consignee_name ?? "");
      setConsigneeDesignation(inspection.consignee_designation ?? "");
      setItems(inspection.items.length > 0 ? inspection.items : [blankItem()]);
    } else {
      setDate(new Date().toISOString().slice(0, 10));
      setContractNo("");
      setContractDate("");
      setContractorName("");
      setContractorAddress("");
      setIndenter("");
      setIndentNo("");
      setDepartment("");
      setDateOfDelivery("");
      setDeliveryType("FULL");
      setRemarks("");
      setInspectedBy("");
      setDateOfInspection("");
      setFinanceCheckDate("");
      setConsigneeName("");
      setConsigneeDesignation("");
      setItems([blankItem()]);
    }
    setFiles([]);
    setTouched(false);
    setQuantityInputErrors({});
    setSubmitting(false);
    setSubmitError(null);
  }, [inspection, mode, open]);

  useEffect(() => {
    if (!open) return;
    setRefsLoading(true);
    Promise.all([
      apiFetch<Page<InspectionLocationOption> | InspectionLocationOption[]>("/api/inventory/locations/?page_size=500")
        .then(data => (Array.isArray(data) ? data : data.results)),
      apiFetch<Page<InspectionItemOption> | InspectionItemOption[]>("/api/inventory/items/?page_size=500")
        .then(data => (Array.isArray(data) ? data : data.results)),
      apiFetch<Page<InspectionStockRegisterOption> | InspectionStockRegisterOption[]>("/api/inventory/stock-registers/?page_size=500")
        .then(data => (Array.isArray(data) ? data : data.results)),
    ])
      .then(([loadedLocations, loadedItems, loadedRegisters]) => {
        const standaloneLocations = loadedLocations.filter(location => location.is_standalone);
        const isRootUser = Boolean(user?.is_superuser) || loadedLocations.some(location => user?.assigned_locations?.includes(location.id) && location.hierarchy_level === 0);
        const scopedLocations = mode === "create"
          ? getScopedInspectionLocations(loadedLocations, user?.assigned_locations, isRootUser)
          : standaloneLocations;
        setLocations(scopedLocations);
        if (mode === "create") {
          const nextDepartment = getAutoSelectedInspectionLocation(scopedLocations);
          setDepartment(nextDepartment);
        }
        setItemOptions(loadedItems);
        setStockRegisters(loadedRegisters);
      })
      .catch(() => {})
      .finally(() => setRefsLoading(false));
  }, [mode, open, user?.assigned_locations, user?.is_superuser]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  const updateItem = (idx: number, patch: Partial<InspectionItemRecord>) => {
    setItems(prev => prev.map((item, index) => (index === idx ? { ...item, ...patch } : item)));
  };
  const setQuantityInputError = (idx: number, error: string | null) => {
    setQuantityInputErrors(prev => {
      const next = { ...prev };
      if (error) next[idx] = error;
      else delete next[idx];
      return next;
    });
  };
  const updateItemQuantity = (
    idx: number,
    field: "tendered_quantity" | "accepted_quantity" | "rejected_quantity",
    rawValue: string,
  ) => {
    const nextValue = Number(rawValue);
    if (!Number.isFinite(nextValue)) return;

    const item = items[idx];
    if (!item) return;

    const error = getInspectionQuantityUpdateError(item, { [field]: nextValue });
    if (error) {
      setQuantityInputError(idx, error);
      return;
    }

    setQuantityInputError(idx, null);
    updateItem(idx, { [field]: nextValue });
  };
  const updateItemDescription = (idx: number, value: string, target: HTMLTextAreaElement) => {
    updateItem(idx, { item_description: value });
    target.style.height = "auto";
    target.style.height = `${target.scrollHeight}px`;
  };

  const addItem = () => setItems(prev => [...prev, blankItem()]);

  const removeItem = (idx: number) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, index) => index !== idx));
  };

  const errors: Record<string, string> = {};
  if (canEditBasic) {
    if (!contractNo.trim()) errors.contract_no = "Required";
    if (!contractorName.trim()) errors.contractor_name = "Required";
    if (!indenter.trim()) errors.indenter = "Required";
    if (!indentNo.trim()) errors.indent_no = "Required";
    if (!department) errors.department = "Required";
    if (items.length === 0) errors.items = "At least one item is required";
    items.forEach((item, index) => {
      if (!item.item_description.trim()) errors[`item_${index}_desc`] = "Required";
      const quantityError = getInspectionQuantityError(item);
      if (quantityError) errors[`item_${index}_qty`] = quantityError;
      if (Number(item.rejected_quantity || 0) > 0 && !item.remarks?.trim()) errors[`item_${index}_reject_reason`] = "Enter rejection reason.";
    });
  }

  const issueCount = touched ? Object.keys(errors).length : 0;

  const buildStagePayload = () => {
    const payload: Record<string, unknown> = {
      items: items.map(item => {
        const base: Record<string, unknown> = {
          id: item.id,
          item_description: item.item_description,
          item: item.item || null,
          tendered_quantity: item.tendered_quantity,
          accepted_quantity: item.accepted_quantity,
          rejected_quantity: item.rejected_quantity,
          unit_price: item.unit_price,
          item_specifications: item.item_specifications || null,
          remarks: item.remarks || null,
        };

        if (canEditStage2 || canEditStage3 || canEditStage4 || isReadOnly || stage === "FINANCE_REVIEW") {
          base.stock_register = item.stock_register || null;
          base.stock_register_no = item.stock_register_no || null;
          base.stock_register_page_no = item.stock_register_page_no || null;
          base.stock_entry_date = item.stock_entry_date || null;
        }

        if (canEditStage3 || canEditStage4 || isReadOnly || stage === "FINANCE_REVIEW") {
          base.central_register = item.central_register || null;
          base.central_register_no = item.central_register_no || null;
          base.central_register_page_no = item.central_register_page_no || null;
          base.batch_number = item.batch_number || null;
          base.expiry_date = item.expiry_date || null;
        }

        return base;
      }),
    };

    if (canEditStage4) {
      payload.finance_check_date = financeCheckDate || null;
    }

    return payload;
  };

  const submit = async (saveAsDraft = false) => {
    setTouched(true);
    setSubmitError(null);
    if (Object.keys(errors).length > 0 && canEditBasic) return;

    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {};
      if (canEditBasic) {
        Object.assign(payload, {
          date,
          contract_no: contractNo,
          contract_date: contractDate || null,
          contractor_name: contractorName,
          contractor_address: contractorAddress || null,
          indenter,
          indent_no: indentNo,
          department: department || null,
          date_of_delivery: dateOfDelivery || null,
          delivery_type: deliveryType,
          remarks: remarks || null,
          inspected_by: inspectedBy || null,
          date_of_inspection: dateOfInspection || null,
          consignee_name: consigneeName || null,
          consignee_designation: consigneeDesignation || null,
          is_initiated: mode === "create" && !saveAsDraft,
          items: items.map(item => ({
            ...(item.id ? { id: item.id } : {}),
            item: item.item || null,
            item_description: item.item_description,
            item_specifications: item.item_specifications || null,
            tendered_quantity: item.tendered_quantity,
            accepted_quantity: item.accepted_quantity,
            rejected_quantity: item.rejected_quantity,
            unit_price: item.unit_price,
            remarks: item.remarks || null,
          })),
        });
      } else {
        Object.assign(payload, buildStagePayload());
      }

      if (files.length > 0) {
        const formData = new FormData();
        formData.append("items", JSON.stringify(payload.items));
        for (const [key, value] of Object.entries(payload)) {
          if (key === "items") continue;
          if (value !== null && value !== undefined) formData.append(key, String(value));
        }
        files.forEach((file, index) => formData.append(`documents[${index}]`, file));

        const url = mode === "edit" && inspection
          ? `${API_BASE}/api/inventory/inspections/${inspection.id}/`
          : `${API_BASE}/api/inventory/inspections/`;
        const response = await fetch(url, {
          method: mode === "edit" ? "PATCH" : "POST",
          body: formData,
          credentials: "include",
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.detail ?? `HTTP ${response.status}`);
        }
      } else if (mode === "edit" && inspection) {
        await apiFetch(`/api/inventory/inspections/${inspection.id}/`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/api/inventory/inspections/", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      await onSave();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  const title = mode === "create"
    ? "New Inspection Certificate"
    : `${inspection?.contract_no ?? "Edit"} — ${INSPECTION_STAGE_LABELS[stage]}`;

  const imagePreview = previewFile && previewFile.type === "image" ? (
    <div className="doc-preview-overlay" onClick={closePreview}>
      <div className="doc-preview-inner" onClick={event => event.stopPropagation()}>
        <div className="doc-preview-header">
          <span className="doc-preview-name">{previewFile.name}</span>
          <button type="button" className="modal-close" onClick={closePreview} aria-label="Close preview">
            <InspectionIcon d="M18 6L6 18M6 6l12 12" size={14} />
          </button>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={previewFile.url} alt={previewFile.name} className="doc-preview-img" />
      </div>
    </div>
  ) : null;

  return (
    <>
      {imagePreview}
      <div className="modal-backdrop">
        <div className="modal inspection-modal" role="dialog" aria-modal="true">
          <div className="modal-head">
            <div>
              <div className="eyebrow">Inspection Certificate</div>
              <h2>{title}</h2>
            </div>
            <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
              <InspectionIcon d="M18 6L6 18M6 6l12 12" size={14} />
            </button>
          </div>
          <div className="modal-body">
            {submitError && (
              <div style={{ padding: "10px 14px", background: "var(--danger-weak)", border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)", borderRadius: "var(--radius)", color: "var(--danger)", fontSize: 13, marginBottom: 14 }}>
                {submitError}
              </div>
            )}

            <Section n={1} title="Contract Details" sub="Basic information about the inspection certificate and contract.">
              <div className="form-grid-2">
                <Field label="Certificate Date" required={canEditBasic}>
                  <input type="date" value={date} onChange={event => setDate(event.target.value)} disabled={!canEditBasic} />
                </Field>
                <Field label="Contract Number" required={canEditBasic} error={touched ? errors.contract_no : undefined}>
                  <input value={contractNo} onChange={event => setContractNo(event.target.value)} placeholder="e.g. NED/2026/001" disabled={!canEditBasic} />
                </Field>
                <Field label="Contract Date">
                  <input type="date" value={contractDate} onChange={event => setContractDate(event.target.value)} disabled={!canEditBasic} />
                </Field>
                <Field label="Delivery Type">
                  <div className="seg" style={{ width: "fit-content" }}>
                    <button type="button" className={"seg-btn" + (deliveryType === "FULL" ? " active" : "")} onClick={() => canEditBasic && setDeliveryType("FULL")} disabled={!canEditBasic}>
                      Full
                    </button>
                    <button type="button" className={"seg-btn" + (deliveryType === "PART" ? " active" : "")} onClick={() => canEditBasic && setDeliveryType("PART")} disabled={!canEditBasic}>
                      Part
                    </button>
                  </div>
                </Field>
                <Field label="Contractor Name" required={canEditBasic} error={touched ? errors.contractor_name : undefined}>
                  <input value={contractorName} onChange={event => setContractorName(event.target.value)} placeholder="Contractor name" disabled={!canEditBasic} />
                </Field>
                <Field label="Contractor Address">
                  <input value={contractorAddress} onChange={event => setContractorAddress(event.target.value)} placeholder="Address" disabled={!canEditBasic} />
                </Field>
                <Field label="Indenter" required={canEditBasic} error={touched ? errors.indenter : undefined}>
                  <input value={indenter} onChange={event => setIndenter(event.target.value)} placeholder="Indenter name" disabled={!canEditBasic} />
                </Field>
                <Field label="Indent Number" required={canEditBasic} error={touched ? errors.indent_no : undefined}>
                  <input value={indentNo} onChange={event => setIndentNo(event.target.value)} placeholder="Indent no." disabled={!canEditBasic} />
                </Field>
                <Field label="Department" required={canEditBasic} error={touched ? errors.department : undefined} hint={!touched || !errors.department ? locationScopeHint : undefined}>
                  <select value={department} onChange={event => setDepartment(event.target.value ? Number(event.target.value) : "")} disabled={!canEditBasic || refsLoading}>
                    <option value="">Select department…</option>
                    {locations.map(location => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Date of Delivery">
                  <input type="date" value={dateOfDelivery} onChange={event => setDateOfDelivery(event.target.value)} disabled={!canEditBasic} />
                </Field>
              </div>
            </Section>

            <Section n={2} title="Inspection Details" sub="Information about the inspection process.">
              <div className="form-grid-2">
                <Field label="Inspected By">
                  <input value={inspectedBy} onChange={event => setInspectedBy(event.target.value)} placeholder="Inspector name" disabled={!canEditBasic} />
                </Field>
                <Field label="Date of Inspection">
                  <input type="date" value={dateOfInspection} onChange={event => setDateOfInspection(event.target.value)} disabled={!canEditBasic} />
                </Field>
                <Field label="Consignee Name">
                  <input value={consigneeName} onChange={event => setConsigneeName(event.target.value)} placeholder="Consignee" disabled={!canEditBasic} />
                </Field>
                <Field label="Consignee Designation">
                  <input value={consigneeDesignation} onChange={event => setConsigneeDesignation(event.target.value)} placeholder="Designation" disabled={!canEditBasic} />
                </Field>
                <Field label="Remarks" span={2}>
                  <textarea value={remarks} onChange={event => setRemarks(event.target.value)} placeholder="Any remarks…" rows={2} disabled={!canEditBasic} />
                </Field>
              </div>
            </Section>

            <Section n={3} title="Items" sub={canEditItems ? "Add items received under this inspection." : "Items on this inspection certificate."}>
              <div className="inspection-items-table-wrap">
                <table className="inspection-items-table">
                  <thead>
                    <tr>
                      <th style={{ width: 36 }}>#</th>
                      <th className="inspection-item-description-head">Description</th>
                      <th style={{ width: 84 }}>Tendered</th>
                      <th style={{ width: 84 }}>Accepted</th>
                      <th style={{ width: 84 }}>Rejected</th>
                      <th style={{ width: 150 }}>Unit Price</th>
                      {showStockColumns && (
                        <>
                          <th>Stock Register</th>
                          {showCentralColumns && <th>Central Register</th>}
                        </>
                      )}
                      {showCentralColumns && <th>System Item</th>}
                      {canEditItems && <th style={{ width: 40 }} />}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, index) => {
                      const visibleColumnCount =
                        6 + (showStockColumns ? 1 : 0) + (showCentralColumns ? 2 : 0) + (canEditItems ? 1 : 0);
                      const canEditRejectionReason = canEditItems || canEditStage2 || canEditStage3 || canEditStage4;
                      const showRejectionReason = Number(item.rejected_quantity || 0) > 0;
                      const quantityError = quantityInputErrors[index] || (touched ? errors[`item_${index}_qty`] : "");

                      return (
                        <Fragment key={item.id ?? `new-${index}`}>
                          <tr>
                            <td className="mono" style={{ color: "var(--muted)", fontSize: 12 }}>{index + 1}</td>
                            <td className="inspection-item-description-cell">
                              <textarea
                                className="inspection-item-description-input"
                                rows={1}
                                value={item.item_description}
                                onChange={event => updateItemDescription(index, event.target.value, event.currentTarget)}
                                placeholder="Item description"
                                disabled={!canEditItems}
                              />
                              {touched && errors[`item_${index}_desc`] && <div className="field-error">{errors[`item_${index}_desc`]}</div>}
                            </td>
                            <td><input type="number" min={1} value={item.tendered_quantity} onChange={event => updateItemQuantity(index, "tendered_quantity", event.target.value)} disabled={!canEditItems} /></td>
                            <td><input type="number" min={0} value={item.accepted_quantity} onChange={event => updateItemQuantity(index, "accepted_quantity", event.target.value)} disabled={!canEditRejectionReason} /></td>
                            <td>
                              <input type="number" min={0} value={item.rejected_quantity} onChange={event => updateItemQuantity(index, "rejected_quantity", event.target.value)} disabled={!canEditRejectionReason} />
                              {quantityError ? <div className="field-error">{quantityError}</div> : null}
                            </td>
                            <td><input className="inspection-unit-price-input" type="number" step="0.01" value={item.unit_price} onChange={event => updateItem(index, { unit_price: event.target.value })} disabled={!canEditItems} /></td>
                            {showStockColumns && (
                              <td>
                                <select value={item.stock_register ?? ""} onChange={event => updateItem(index, { stock_register: event.target.value ? Number(event.target.value) : null })} disabled={!canEditStage2 && !canEditStage3 && !canEditStage4}>
                                  <option value="">—</option>
                                  {stockRegisters.map(register => (
                                    <option key={register.id} value={register.id}>
                                      {register.register_number}
                                    </option>
                                  ))}
                                </select>
                                <input value={item.stock_register_page_no} onChange={event => updateItem(index, { stock_register_page_no: event.target.value })} placeholder="Page #" disabled={!canEditStage2 && !canEditStage3 && !canEditStage4} style={{ marginTop: 4 }} />
                              </td>
                            )}
                            {showCentralColumns && (
                              <td>
                                <select value={item.central_register ?? ""} onChange={event => updateItem(index, { central_register: event.target.value ? Number(event.target.value) : null })} disabled={!canEditStage3 && !canEditStage4}>
                                  <option value="">—</option>
                                  {stockRegisters.map(register => (
                                    <option key={register.id} value={register.id}>
                                      {register.register_number}
                                    </option>
                                  ))}
                                </select>
                                <input value={item.central_register_page_no} onChange={event => updateItem(index, { central_register_page_no: event.target.value })} placeholder="Page #" disabled={!canEditStage3 && !canEditStage4} style={{ marginTop: 4 }} />
                              </td>
                            )}
                            {showCentralColumns && (
                              <td>
                                <select value={item.item ?? ""} onChange={event => updateItem(index, { item: event.target.value ? Number(event.target.value) : null })} disabled={!canEditStage3 && !canEditStage4}>
                                  <option value="">—</option>
                                  {itemOptions.map(option => (
                                    <option key={option.id} value={option.id}>
                                      {option.code} — {option.name}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            )}
                            {canEditItems && (
                              <td>
                                <button type="button" className="btn btn-xs btn-danger-ghost" onClick={() => removeItem(index)} disabled={items.length <= 1} title="Remove item">
                                  <InspectionIcon d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0l1 12h6l1-12" size={12} />
                                </button>
                              </td>
                            )}
                          </tr>
                          {showRejectionReason ? (
                            <tr className="inspection-rejection-row">
                              <td colSpan={visibleColumnCount}>
                                <div className="inspection-rejection-reason">
                                  <input
                                    value={item.remarks || ""}
                                    onChange={event => updateItem(index, { remarks: event.target.value })}
                                    placeholder="Reason for rejected quantity"
                                    disabled={!canEditRejectionReason}
                                  />
                                  {touched && errors[`item_${index}_reject_reason`] ? <div className="field-error">{errors[`item_${index}_reject_reason`]}</div> : null}
                                </div>
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {canEditItems && (
                <button type="button" className="btn btn-sm" onClick={addItem} style={{ marginTop: 8 }}>
                  <InspectionIcon d="M12 5v14M5 12h14" size={13} />
                  Add Item
                </button>
              )}
            </Section>

            {showFinanceSection ? (
              <Section n={4} title="Finance Review" sub="Record the finance check date before sign-off.">
                <div className="form-grid-2">
                  <Field label="Finance Check Date">
                    <input type="date" value={financeCheckDate} onChange={event => setFinanceCheckDate(event.target.value)} disabled={!canEditStage4} />
                  </Field>
                </div>
              </Section>
            ) : null}

            <Section n={documentsSectionNumber} title="Documents" sub="Attach supporting documents (PDF, images, DOCX — max 20 MB each).">
              {inspection?.documents && inspection.documents.length > 0 && (
                <div className="inspection-docs-list">
                  {inspection.documents.map(document => (
                    <a key={document.id} href={document.file.startsWith("http") ? document.file : `${API_BASE}${document.file}`} target="_blank" rel="noopener noreferrer" className="inspection-doc-chip">
                      <InspectionIcon d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z" size={13} />
                      {document.label || "Document"}
                    </a>
                  ))}
                </div>
              )}
              {(canEditBasic || canEditStage2 || canEditStage3 || canEditStage4) && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.docx"
                    onChange={event => {
                      const selectedFiles = event.currentTarget.files;
                      if (!selectedFiles) return;
                      setFiles(prev => [...prev, ...Array.from(selectedFiles)]);
                    }}
                    style={{ display: "none" }}
                  />
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                    <button type="button" className="btn btn-sm" onClick={() => fileInputRef.current?.click()}>
                      <InspectionIcon d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" size={13} />
                      Upload Files
                    </button>
                    {files.length > 0 && <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{files.length} file(s) queued</span>}
                  </div>
                  {files.length > 0 && (
                    <div className="inspection-docs-list" style={{ marginTop: 6 }}>
                      {files.map((file, index) => (
                        <span key={`${file.name}-${index}`} className="inspection-doc-chip">
                          <button type="button" className="chip-file-link" onClick={() => openLocalPreview(file)} style={{ background: "transparent", border: 0, padding: 0, color: "inherit", cursor: "pointer" }}>
                            {file.name}
                          </button>
                          <button type="button" className="chip-remove" onClick={() => setFiles(prev => prev.filter((_, fileIndex) => fileIndex !== index))}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </>
              )}
            </Section>

            {mode === "edit" && inspection && (
              <Section n={auditSectionNumber} title="Audit Trail" sub="Stage progression history for this certificate.">
                <div className="inspection-audit-trail">
                  {inspection.initiated_by_name && (
                    <div className="audit-entry">
                      <span className="audit-label">Initiated by</span>
                      <span className="mono">{inspection.initiated_by_name}</span>
                      <span className="audit-date">{formatInspectionDate(inspection.initiated_at)}</span>
                    </div>
                  )}
                  {inspection.stock_filled_by && (
                    <div className="audit-entry">
                      <span className="audit-label">Stock filled by</span>
                      <span className="mono">{inspection.stock_filled_by_name || `User #${inspection.stock_filled_by}`}</span>
                      <span className="audit-date">{formatInspectionDate(inspection.stock_filled_at)}</span>
                    </div>
                  )}
                  {inspection.central_store_filled_by && (
                    <div className="audit-entry">
                      <span className="audit-label">Central register by</span>
                      <span className="mono">{inspection.central_store_filled_by_name || `User #${inspection.central_store_filled_by}`}</span>
                      <span className="audit-date">{formatInspectionDate(inspection.central_store_filled_at)}</span>
                    </div>
                  )}
                  {inspection.finance_reviewed_by && (
                    <div className="audit-entry">
                      <span className="audit-label">Finance reviewed by</span>
                      <span className="mono">{inspection.finance_reviewed_by_name || `User #${inspection.finance_reviewed_by}`}</span>
                      <span className="audit-date">{formatInspectionDate(inspection.finance_reviewed_at)}</span>
                    </div>
                  )}
                  {inspection.rejected_by && (
                    <div className="audit-entry audit-rejected">
                      <span className="audit-label">Rejected by</span>
                      <span className="mono">{inspection.rejected_by_name || `User #${inspection.rejected_by}`}</span>
                      <span className="audit-date">{formatInspectionDate(inspection.rejected_at)}</span>
                      {inspection.rejection_reason && <div className="audit-reason">{inspection.rejection_reason}</div>}
                    </div>
                  )}
                </div>
              </Section>
            )}
          </div>

          <footer className="modal-foot">
            <div className="modal-foot-meta mono">
              {submitError ? (
                <span className="foot-err">{submitError}</span>
              ) : issueCount > 0 ? (
                <span className="foot-err">
                  {issueCount} issue{issueCount > 1 ? "s" : ""} to resolve
                </span>
              ) : (
                <span className="foot-ok">{mode === "create" ? "Ready to create" : `Stage: ${INSPECTION_STAGE_LABELS[stage]}`}</span>
              )}
            </div>
            <div className="modal-foot-actions">
              <button type="button" className="btn btn-md" onClick={onClose}>Cancel</button>
              {!isReadOnly && mode === "create" && (
                <button type="button" className="btn btn-md" onClick={() => submit(true)} disabled={submitting || refsLoading}>
                  {submitting ? "Saving…" : "Save as Draft"}
                </button>
              )}
              {!isReadOnly && (
                <button type="button" className="btn btn-md btn-primary" onClick={() => submit(false)} disabled={submitting || refsLoading}>
                  {submitting
                    ? "Saving…"
                    : mode === "create"
                      ? getCreateInspectionSubmitLabel(selectedDepartmentLevel)
                      : canEditStage4
                        ? "Save Finance Review"
                        : "Save Changes"}
                </button>
              )}
            </div>
          </footer>
        </div>
      </div>
    </>
  );
}

export function RejectInspectionModal({
  open,
  onClose,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason("");
    setTouched(false);
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 420 }}>
        <div className="modal-head">
          <div>
            <div className="eyebrow" style={{ color: "var(--danger)" }}>Reject Inspection</div>
            <h2>Confirm Rejection</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close rejection dialog">
            <InspectionIcon d="M18 6L6 18M6 6l12 12" size={14} />
          </button>
        </div>
        <div className="modal-body">
          <Field label="Rejection Reason" required error={touched && !reason.trim() ? "Required" : undefined}>
            <textarea value={reason} onChange={event => setReason(event.target.value)} onBlur={() => setTouched(true)} placeholder="Explain why this inspection is being rejected…" rows={3} />
          </Field>
        </div>
        <footer className="modal-foot">
          <div />
          <div className="modal-foot-actions">
            <button type="button" className="btn btn-md" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-md btn-danger" onClick={() => { setTouched(true); if (reason.trim()) onConfirm(reason.trim()); }} disabled={!reason.trim()}>
              Reject
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
