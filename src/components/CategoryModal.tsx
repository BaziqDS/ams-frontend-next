"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";

const Ic = ({ d, size = 16 }: { d: ReactNode | string; size?: number }) => (
  <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    {typeof d === "string" ? <path d={d} /> : d}
  </svg>
);

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

export type CategoryRecord = {
  id: number;
  name: string;
  code: string;
  parent_category: number | null;
  parent_category_display?: string | null;
  category_type: string | null;
  tracking_type: string | null;
  default_depreciation_rate: string | number | null;
  resolved_category_type?: string | null;
  resolved_tracking_type?: string | null;
  resolved_depreciation_rate?: string | number | null;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  notes?: string | null;
};

type CategoryFormState = {
  name: string;
  code: string;
  parent_category: string;
  category_type: string;
  tracking_type: string;
  default_depreciation_rate: string;
  is_active: boolean;
  notes: string;
};

function emptyForm(): CategoryFormState {
  return {
    name: "",
    code: "",
    parent_category: "",
    category_type: "",
    tracking_type: "",
    default_depreciation_rate: "",
    is_active: true,
    notes: "",
  };
}

function formFromCategory(category: CategoryRecord | null): CategoryFormState {
  if (!category) return emptyForm();

  return {
    name: category.name ?? "",
    code: category.code ?? "",
    parent_category: category.parent_category == null ? "" : String(category.parent_category),
    category_type: category.category_type ?? "",
    tracking_type: category.tracking_type ?? "",
    default_depreciation_rate: category.default_depreciation_rate == null ? "" : String(category.default_depreciation_rate),
    is_active: Boolean(category.is_active),
    notes: category.notes ?? "",
  };
}

function inheritedFormPatch(parent: CategoryRecord): Partial<CategoryFormState> {
  const inheritedType = parent.resolved_category_type ?? parent.category_type ?? "";
  const inheritedRate = parent.resolved_depreciation_rate ?? parent.default_depreciation_rate;

  return {
    category_type: inheritedType,
    default_depreciation_rate: inheritedType === "FIXED_ASSET" && inheritedRate != null ? String(inheritedRate) : "",
  };
}

function toPayload(form: CategoryFormState) {
  const depreciation = form.default_depreciation_rate.trim();
  const isFixedAsset = form.category_type === "FIXED_ASSET";
  const parentSelected = Boolean(form.parent_category);

  return {
    name: form.name.trim(),
    code: form.code.trim().toUpperCase(),
    parent_category: form.parent_category ? Number(form.parent_category) : null,
    category_type: form.category_type.trim() || null,
    tracking_type: parentSelected ? form.tracking_type.trim() || null : null,
    default_depreciation_rate: isFixedAsset && depreciation !== "" ? Number(depreciation) : null,
    is_active: form.is_active,
    notes: form.notes.trim(),
  };
}

type CategoryCreateContext = "root" | "child" | "edit";

interface CategoryModalProps {
  open: boolean;
  mode: "create" | "edit";
  category?: CategoryRecord | null;
  createContext?: CategoryCreateContext;
  lockedParent?: CategoryRecord | null;
  onClose: () => void;
  onSave?: () => void | Promise<void>;
}

export function CategoryModal({ open, mode, category, createContext = "root", lockedParent, onClose, onSave }: CategoryModalProps) {
  const isEditMode = mode === "edit";
  const [form, setForm] = useState<CategoryFormState>(emptyForm);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    const nextForm = formFromCategory(category ?? null);
    if (!isEditMode && createContext === "child" && lockedParent) {
      nextForm.parent_category = String(lockedParent.id);
      Object.assign(nextForm, inheritedFormPatch(lockedParent));
    }
    setForm(nextForm);
    setTouched(new Set());
    setSubmitting(false);
    setSubmitError(null);
  }, [open, category, createContext, isEditMode, lockedParent]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const parentSelected = Boolean(form.parent_category);
  const isFixedAsset = form.category_type === "FIXED_ASSET";
  const showTrackingType = parentSelected;
  const trackingTypeLocked = isEditMode && parentSelected;
  const errors = {
    name: touched.has("name") && !form.name.trim() ? "Category name is required." : undefined,
    category_type: touched.has("category_type") && !parentSelected && !form.category_type.trim() ? "Category type is required for top-level categories." : undefined,
    tracking_type: touched.has("tracking_type") && showTrackingType && !trackingTypeLocked && !form.tracking_type.trim() ? "Tracking type is required for subcategories." : undefined,
    default_depreciation_rate: touched.has("default_depreciation_rate") && isFixedAsset && form.default_depreciation_rate.trim() !== "" && !Number.isFinite(Number(form.default_depreciation_rate)) ? "Enter a valid depreciation rate." : undefined,
  };
  const issueCount = Object.values(errors).filter(Boolean).length;

  const canSave = !submitting && !(createContext === "child" && !lockedParent && !isEditMode);

  const loadStatusMessage = useMemo(() => {
    if (!isEditMode && createContext === "child" && lockedParent) return `Creating subcategory under ${lockedParent.name}.`;
    return null;
  }, [createContext, isEditMode, lockedParent]);

  const set = (patch: Partial<CategoryFormState>) => setForm(prev => ({ ...prev, ...patch }));

  const submit = async () => {
    const touchedFields = new Set(["name", "category_type", "tracking_type", "default_depreciation_rate"]);
    setTouched(touchedFields);

    if (!canSave) {
      setSubmitError("Please complete the required fields.");
      return;
    }

    const nextParentSelected = Boolean(form.parent_category);
    const nextIsFixedAsset = form.category_type === "FIXED_ASSET";
    const nextErrors = {
      name: !form.name.trim() ? "Category name is required." : undefined,
      category_type: !nextParentSelected && !form.category_type.trim() ? "Category type is required for top-level categories." : undefined,
      tracking_type: nextParentSelected && !(isEditMode && nextParentSelected) && !form.tracking_type.trim() ? "Tracking type is required for subcategories." : undefined,
      default_depreciation_rate: nextIsFixedAsset && form.default_depreciation_rate.trim() !== "" && !Number.isFinite(Number(form.default_depreciation_rate)) ? "Enter a valid depreciation rate." : undefined,
    };
    if (Object.values(nextErrors).some(Boolean)) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const body = JSON.stringify(toPayload(form));
      if (isEditMode && category) {
        await apiFetch(`/api/inventory/categories/${category.id}/`, {
          method: "PATCH",
          body,
        });
      } else {
        await apiFetch("/api/inventory/categories/", {
          method: "POST",
          body,
        });
      }

      await onSave?.();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : (isEditMode ? "Failed to update category." : "Failed to create category."));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal modal-lg" role="dialog" aria-modal="true" aria-labelledby="category-modal-title">
        <header className="modal-head">
          <div>
            <div className="eyebrow">Inventory · {isEditMode ? "Edit Record" : "New Record"}</div>
            <h2 id="category-modal-title">{isEditMode ? "Edit Category" : "Create Category"}</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <Ic d="M6 6l12 12M6 18L18 6" />
          </button>
        </header>

        <div className="modal-body">
          <div style={{ paddingTop: 24 }}>
            <div style={{ display: "grid", gap: 16, padding: "0 24px 24px" }}>
              {loadStatusMessage && (
                <div style={{ padding: "10px 14px", background: "var(--warning-weak)", border: "1px solid color-mix(in oklch, var(--warn) 30%, transparent)", borderRadius: "var(--radius)", color: "var(--text-1)", fontSize: 13 }}>
                  {loadStatusMessage}
                </div>
              )}
              {submitError && (
                <div style={{ padding: "10px 14px", background: "var(--danger-weak)", border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)", borderRadius: "var(--radius)", color: "var(--danger)", fontSize: 13 }}>
                  {submitError}
                </div>
              )}

              <Section n={1} title="Identity" sub="Core details used for navigation, labels, and lookups.">
                <div className="form-grid cols-2">
                  <Field label="Category name" required error={errors.name}>
                    <input value={form.name} onChange={e => set({ name: e.target.value })} onBlur={() => setTouched(prev => new Set(prev).add("name"))} placeholder="Enter category name" />
                  </Field>
                  <Field label="Category code" hint="Leave blank to let the backend generate one.">
                    <input value={form.code} onChange={e => set({ code: e.target.value.toUpperCase() })} placeholder="Enter category code" />
                  </Field>
                  <Field label="Active state" span={2}>
                    <div className="seg seg-inline">
                      <button type="button" className={"seg-btn" + (form.is_active ? " active" : "")} onClick={() => set({ is_active: true })}>Active</button>
                      <button type="button" className={"seg-btn" + (!form.is_active ? " active" : "")} onClick={() => set({ is_active: false })}>Disabled</button>
                    </div>
                  </Field>
                </div>
              </Section>

              <Section n={2} title="Classification" sub="Category type and tracking rules.">
                <div className="form-grid cols-2">
                  <Field label="Category type" required={!parentSelected} error={errors.category_type} hint={parentSelected ? "Optional for subcategories; inherited from the parent when left blank." : undefined}>
                    <select
                      value={form.category_type}
                      onChange={e => {
                        const categoryType = e.target.value;
                        set({
                          category_type: categoryType,
                          default_depreciation_rate: categoryType === "FIXED_ASSET" ? form.default_depreciation_rate : "",
                        });
                      }}
                      onBlur={() => setTouched(prev => new Set(prev).add("category_type"))}
                    >
                      <option value="">Select category type</option>
                      <option value="FIXED_ASSET">Fixed Asset</option>
                      <option value="CONSUMABLE">Consumable</option>
                      <option value="PERISHABLE">Perishable</option>
                    </select>
                  </Field>
                  {showTrackingType && (
                    <Field label="Tracking type" required={!trackingTypeLocked} error={errors.tracking_type} hint={trackingTypeLocked ? "Tracking type is locked after subcategory creation." : "Required for subcategories."}>
                      <select value={form.tracking_type} onChange={e => set({ tracking_type: e.target.value })} onBlur={() => setTouched(prev => new Set(prev).add("tracking_type"))} disabled={trackingTypeLocked}>
                        <option value="">Select tracking type</option>
                        <option value="INDIVIDUAL">Individual Tracking (Serial/QR)</option>
                        <option value="QUANTITY">Quantity Based Tracking</option>
                      </select>
                    </Field>
                  )}
                  {isFixedAsset && (
                    <Field label="Default depreciation rate" error={errors.default_depreciation_rate} hint="Use a percentage value such as 25 or 25.00.">
                      <input value={form.default_depreciation_rate} onChange={e => set({ default_depreciation_rate: e.target.value })} onBlur={() => setTouched(prev => new Set(prev).add("default_depreciation_rate"))} placeholder="Enter depreciation rate" inputMode="decimal" />
                    </Field>
                  )}
                </div>
              </Section>

              <Section n={3} title="Notes" sub="Optional audit text passed through to the backend on save.">
                <div className="form-grid cols-1">
                  <Field label="Notes" span={1}>
                    <textarea className="textarea-field" rows={4} value={form.notes} onChange={e => set({ notes: e.target.value })} placeholder="Optional notes" />
                  </Field>
                </div>
              </Section>
            </div>
          </div>
        </div>

        <footer className="modal-foot">
          <div className="modal-foot-meta mono">
            {issueCount > 0
              ? <span className="foot-err">{issueCount} issue{issueCount > 1 ? "s" : ""} to resolve</span>
              : <span className="foot-ok">{form.parent_category ? "Subcategory ready" : "Top-level category ready"}</span>}
          </div>
          <div className="modal-foot-actions">
            <button type="button" className="btn btn-md" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-md btn-primary" onClick={submit} disabled={!canSave}>{submitting ? "Saving…" : isEditMode ? "Save changes" : "Create category"}</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
