"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { ThemedSelect } from "@/components/ThemedSelect";
import { useCopilotForm, type CopilotFormField } from "@/hooks/useCopilotForm";
import { ensureValueInOptions, normalizeCopilotSubmitError } from "@/lib/copilotFormRuntime";
import { Button } from "@/components/ui/button";


const Ic = ({ d, size = 16 }: { d: ReactNode | string; size?: number }) => (
  <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    {typeof d === "string" ? <path d={d} /> : d}
  </svg>
);

function Field({ label, required, error, hint, children, span = 1, copilotField }: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
  span?: number;
  copilotField?: string;
}) {
  return (
    <div className={"field" + (error ? " has-error" : "")} style={{ gridColumn: `span ${span}` }} data-copilot-field={copilotField}>
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
  resolved_category_type?: string | null;
  resolved_tracking_type?: string | null;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
  notes?: string | null;
  can_delete?: boolean;
  delete_blockers?: string[];
};

type CategoryFormState = {
  name: string;
  code: string;
  parent_category: string;
  category_type: string;
  tracking_type: string;
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
    is_active: Boolean(category.is_active),
    notes: category.notes ?? "",
  };
}

function inheritedFormPatch(parent: CategoryRecord): Partial<CategoryFormState> {
  const inheritedType = parent.resolved_category_type ?? parent.category_type ?? "";

  return {
    category_type: inheritedType,
  };
}

function toPayload(form: CategoryFormState) {
  const parentSelected = Boolean(form.parent_category);

  return {
    name: form.name.trim(),
    code: form.code.trim().toUpperCase(),
    parent_category: form.parent_category ? Number(form.parent_category) : null,
    category_type: form.category_type.trim() || null,
    tracking_type: parentSelected ? form.tracking_type.trim() || null : null,
    is_active: form.is_active,
    notes: form.notes.trim(),
  };
}

export function buildCategoryCopilotValuePatch(values: Record<string, unknown>): Partial<CategoryFormState> {
  const patch: Partial<CategoryFormState> = {};

  if ("name" in values) patch.name = String(values.name ?? "");
  if ("code" in values) patch.code = String(values.code ?? "").toUpperCase();
  if ("parent_category" in values) patch.parent_category = values.parent_category == null ? "" : String(values.parent_category);
  if ("category_type" in values) patch.category_type = String(values.category_type ?? "").toUpperCase();
  if ("tracking_type" in values) patch.tracking_type = String(values.tracking_type ?? "").toUpperCase();
  if ("is_active" in values) patch.is_active = Boolean(values.is_active);
  if ("notes" in values) patch.notes = String(values.notes ?? "");

  return patch;
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
  const showTrackingType = parentSelected;
  const categoryTypeLocked = isEditMode;
  const trackingTypeLocked = isEditMode && parentSelected;
  const errors = {
    name: touched.has("name") && !form.name.trim() ? "Category name is required." : undefined,
    category_type: touched.has("category_type") && !parentSelected && !form.category_type.trim() ? "Category type is required for top-level categories." : undefined,
    tracking_type: touched.has("tracking_type") && showTrackingType && !trackingTypeLocked && !form.tracking_type.trim() ? "Tracking type is required for subcategories." : undefined,
  };
  const issueCount = Object.values(errors).filter(Boolean).length;

  const canSave = !submitting && !(createContext === "child" && !lockedParent && !isEditMode);

  const loadStatusMessage = useMemo(() => {
    if (!isEditMode && createContext === "child" && lockedParent) return `Creating subcategory under ${lockedParent.name}.`;
    return null;
  }, [createContext, isEditMode, lockedParent]);

  const set = (patch: Partial<CategoryFormState>) => setForm(prev => ({ ...prev, ...patch }));

  const submit = async () => {
    const touchedFields = new Set(["name", "category_type", "tracking_type"]);
    setTouched(touchedFields);

    if (!canSave) {
      setSubmitError("Please complete the required fields.");
      return {
        ok: false,
        errorType: "validation_error",
        message: "Please complete the required category fields.",
      };
    }

    const nextParentSelected = Boolean(form.parent_category);
    const nextErrors = {
      name: !form.name.trim() ? "Category name is required." : undefined,
      category_type: !nextParentSelected && !form.category_type.trim() ? "Category type is required for top-level categories." : undefined,
      tracking_type: nextParentSelected && !(isEditMode && nextParentSelected) && !form.tracking_type.trim() ? "Tracking type is required for subcategories." : undefined,
    };
    if (Object.values(nextErrors).some(Boolean)) {
      return {
        ok: false,
        errorType: "validation_error",
        message: "Please complete the required category fields.",
        fieldErrors: Object.fromEntries(
          Object.entries(nextErrors).filter((entry): entry is [string, string] => Boolean(entry[1])),
        ),
      };
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const body = JSON.stringify(toPayload(form));
      let savedCategory: unknown;
      if (isEditMode && category) {
        savedCategory = await apiFetch(`/api/inventory/categories/${category.id}/`, {
          method: "PATCH",
          body,
        });
      } else {
        savedCategory = await apiFetch("/api/inventory/categories/", {
          method: "POST",
          body,
        });
      }

      await onSave?.();
      onClose();
      const recordId =
        savedCategory && typeof savedCategory === "object" && "id" in savedCategory
          ? (savedCategory as { id: string | number }).id
          : category?.id;
      return {
        ok: true,
        message: isEditMode ? "Category updated successfully." : "Category created successfully.",
        recordId,
        redirectTo: recordId ? `/categories/${recordId}` : "/categories",
      };
    } catch (err) {
      const failure = normalizeCopilotSubmitError(err);
      setSubmitError(failure.message || (isEditMode ? "Failed to update category." : "Failed to create category."));
      return failure;
    } finally {
      setSubmitting(false);
    }
  };

  const copilotFields = useMemo<CopilotFormField[]>(() => [
    { name: "name", label: "Category name", type: "string", required: true },
    { name: "code", label: "Category code", type: "string", description: "Optional. Leave blank to let the backend generate one." },
    {
      name: "parent_category",
      label: "Parent category",
      type: "select",
      readOnly: Boolean(lockedParent) || isEditMode,
      options: ensureValueInOptions(
        [{ value: "", label: "No parent (top-level)" }],
        lockedParent ? String(lockedParent.id) : null,
        lockedParent?.name,
      ),
    },
    {
      name: "category_type",
      label: "Category type",
      type: "select",
      required: !parentSelected,
      readOnly: categoryTypeLocked,
      options: [
        { value: "FIXED_ASSET", label: "Fixed Asset" },
        { value: "CONSUMABLE", label: "Consumable" },
        { value: "PERISHABLE", label: "Perishable" },
      ],
    },
    {
      name: "tracking_type",
      label: "Tracking type",
      type: "select",
      required: showTrackingType && !trackingTypeLocked,
      readOnly: trackingTypeLocked,
      options: [
        { value: "INDIVIDUAL", label: "Individual Tracking (Serial/QR)" },
        { value: "QUANTITY", label: "Quantity Based Tracking" },
      ],
    },
    { name: "is_active", label: "Active state", type: "boolean" },
    { name: "notes", label: "Notes", type: "string" },
  ], [categoryTypeLocked, isEditMode, lockedParent, parentSelected, showTrackingType, trackingTypeLocked]);

  const validateForCopilot = useCallback(() => {
    setTouched(new Set(["name", "category_type", "tracking_type"]));
    const nextParentSelected = Boolean(form.parent_category);
    const nextErrors: Record<string, string> = {};
    if (!form.name.trim()) nextErrors.name = "Category name is required.";
    if (!nextParentSelected && !form.category_type.trim()) {
      nextErrors.category_type = "Category type is required for top-level categories.";
    }
    if (nextParentSelected && !(isEditMode && nextParentSelected) && !form.tracking_type.trim()) {
      nextErrors.tracking_type = "Tracking type is required for subcategories.";
    }
    return {
      ok: Object.keys(nextErrors).length === 0,
      errors: nextErrors,
    };
  }, [form, isEditMode]);

  const { submitManually } = useCopilotForm({
    formId: isEditMode && category ? `category-edit-${category.id}` : createContext === "child" ? "subcategory-create" : "category-create",
    title: isEditMode ? "Edit Category" : createContext === "child" ? "Create Subcategory" : "Create Category",
    description: "Create or edit an inventory category on the Categories page.",
    mode,
    active: open,
    fields: copilotFields,
    values: form,
    errors: Object.fromEntries(Object.entries(errors).filter((entry): entry is [string, string] => Boolean(entry[1]))),
    canSetValues: !submitting,
    canValidate: true,
    canSubmit: canSave,
    requirements: {
      setValues: { requiredCapabilities: [{ module: "categories", level: "manage" }] },
      validate: { requiredCapabilities: [{ module: "categories", level: "manage" }] },
      submit: { requiredCapabilities: [{ module: "categories", level: "manage" }] },
    },
    setValues: values => {
      set(buildCategoryCopilotValuePatch(values));
      return { updated: Object.keys(values) };
    },
    focusField: field => {
      const escapedField = CSS.escape(field);
      const target = document.querySelector<HTMLElement>(
        `[data-copilot-field="${escapedField}"] input, ` +
        `[data-copilot-field="${escapedField}"] textarea, ` +
        `[data-copilot-field="${escapedField}"] button`,
      );
      target?.focus();
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
      return target ? { ok: true, field } : { ok: false, reason: `Field ${field} is not focusable.` };
    },
    validate: validateForCopilot,
    submit: () => submit(),
  });

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
                  <Field label="Category name" required error={errors.name} copilotField="name">
                    <input value={form.name} onChange={e => set({ name: e.target.value })} onBlur={() => setTouched(prev => new Set(prev).add("name"))} placeholder="Enter category name" />
                  </Field>
                  <Field label="Category code" hint="Leave blank to let the backend generate one." copilotField="code">
                    <input value={form.code} onChange={e => set({ code: e.target.value.toUpperCase() })} placeholder="Enter category code" />
                  </Field>
                  <Field label="Active state" span={2} copilotField="is_active">
                    <div className="seg seg-inline">
                      <button type="button" className={"seg-btn" + (form.is_active ? " active" : "")} onClick={() => set({ is_active: true })}>Active</button>
                      <button type="button" className={"seg-btn" + (!form.is_active ? " active" : "")} onClick={() => set({ is_active: false })}>Disabled</button>
                    </div>
                  </Field>
                </div>
              </Section>

              <Section n={2} title="Classification" sub="Category type and tracking rules.">
                <div className="form-grid cols-2">
                  <Field label="Category type" required={!parentSelected} error={errors.category_type} hint={categoryTypeLocked ? "Category type is locked after creation." : parentSelected ? "Optional for subcategories; inherited from the parent when left blank." : undefined} copilotField="category_type">
                    <ThemedSelect
                      value={form.category_type}
                      onChange={value => {
                        set({ category_type: value });
                        setTouched(prev => new Set(prev).add("category_type"));
                      }}
                      placeholder="Select category type"
                      ariaLabel="Category type"
                      disabled={categoryTypeLocked}
                      options={[
                        { value: "FIXED_ASSET", label: "Fixed Asset" },
                        { value: "CONSUMABLE", label: "Consumable" },
                        { value: "PERISHABLE", label: "Perishable" },
                      ]}
                    />
                  </Field>
                  {showTrackingType && (
                    <Field label="Tracking type" required={!trackingTypeLocked} error={errors.tracking_type} hint={trackingTypeLocked ? "Tracking type is locked after subcategory creation." : "Required for subcategories."} copilotField="tracking_type">
                      <ThemedSelect
                        value={form.tracking_type}
                        onChange={value => {
                          set({ tracking_type: value });
                          setTouched(prev => new Set(prev).add("tracking_type"));
                        }}
                        placeholder="Select tracking type"
                        ariaLabel="Tracking type"
                        disabled={trackingTypeLocked}
                        options={[
                          { value: "INDIVIDUAL", label: "Individual Tracking (Serial/QR)" },
                          { value: "QUANTITY", label: "Quantity Based Tracking" },
                        ]}
                      />
                    </Field>
                  )}
                </div>
              </Section>

              <Section n={3} title="Notes" sub="Optional audit text passed through to the backend on save.">
                <div className="form-grid cols-1">
                  <Field label="Notes" span={1} copilotField="notes">
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
            <Button type="button" variant="outline" size="md" onClick={onClose}>Cancel</Button>
            <Button type="button" size="md" onClick={() => { void submitManually("submit"); }} disabled={!canSave}>{submitting ? "Saving…" : isEditMode ? "Save changes" : "Create category"}</Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
