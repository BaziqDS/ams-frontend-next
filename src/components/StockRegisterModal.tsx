"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { ThemedSelect } from "@/components/ThemedSelect";
import type { LocationRecord, StockRegisterRecord } from "@/lib/userUiShared";

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

type StockRegisterFormState = {
  register_number: string;
  register_type: "CSR" | "DSR" | "";
  store: string;
  is_active: boolean;
};

function emptyForm(): StockRegisterFormState {
  return {
    register_number: "",
    register_type: "CSR",
    store: "",
    is_active: true,
  };
}

function formFromRegister(register: StockRegisterRecord | null | undefined): StockRegisterFormState {
  if (!register) return emptyForm();
  return {
    register_number: register.register_number ?? "",
    register_type: register.register_type ?? "CSR",
    store: register.store ? String(register.store) : "",
    is_active: Boolean(register.is_active),
  };
}

function toPayload(form: StockRegisterFormState) {
  return {
    register_number: form.register_number.trim(),
    register_type: form.register_type,
    store: Number(form.store),
    is_active: form.is_active,
  };
}

interface StockRegisterModalProps {
  open: boolean;
  mode: "create" | "edit";
  register?: StockRegisterRecord | null;
  stores: LocationRecord[];
  storesLoading?: boolean;
  storesError?: string | null;
  onClose: () => void;
  onSave?: () => void | Promise<void>;
}

export function StockRegisterModal({ open, mode, register, stores, storesLoading = false, storesError = null, onClose, onSave }: StockRegisterModalProps) {
  const isEditMode = mode === "edit";
  const [form, setForm] = useState<StockRegisterFormState>(emptyForm);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(formFromRegister(register));
    setTouched(new Set());
    setSubmitting(false);
    setSubmitError(null);
  }, [open, register]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const errors = {
    register_number: touched.has("register_number") && !form.register_number.trim() ? "Register number is required." : undefined,
    register_type: touched.has("register_type") && !form.register_type ? "Register type is required." : undefined,
    store: touched.has("store") && !form.store ? "Store is required." : undefined,
  };
  const issueCount = Object.values(errors).filter(Boolean).length;
  const canSave = !submitting && !storesLoading && !storesError && stores.length > 0;
  const statusMessage = useMemo(() => {
    if (storesLoading) return "Loading stores before save becomes available.";
    if (storesError) return storesError;
    if (stores.length === 0) return "No stores are available in your stock-register creation scope.";
    return null;
  }, [storesLoading, storesError, stores.length]);

  const set = (patch: Partial<StockRegisterFormState>) => setForm((prev) => ({ ...prev, ...patch }));

  const submit = async () => {
    setTouched(new Set(["register_number", "register_type", "store"]));
    if (!form.register_number.trim() || !form.register_type || !form.store || !canSave) {
      if (!canSave) setSubmitError("Resolve store loading before saving this register.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const body = JSON.stringify(toPayload(form));
      if (isEditMode && register) {
        await apiFetch(`/api/inventory/stock-registers/${register.id}/`, {
          method: "PATCH",
          body,
        });
      } else {
        await apiFetch("/api/inventory/stock-registers/", {
          method: "POST",
          body,
        });
      }

      await onSave?.();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : (isEditMode ? "Failed to update stock register." : "Failed to create stock register."));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal modal-lg" role="dialog" aria-modal="true" aria-labelledby="stock-register-modal-title">
        <header className="modal-head">
          <div>
            <div className="eyebrow">Operations · {isEditMode ? "Edit Record" : "New Record"}</div>
            <h2 id="stock-register-modal-title">{isEditMode ? "Edit Stock Register" : "Create Stock Register"}</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <Ic d="M6 6l12 12M6 18L18 6" />
          </button>
        </header>

        <div className="modal-body">
          <div style={{ paddingTop: 24 }}>
            <div style={{ display: "grid", gap: 16, padding: "0 24px 24px" }}>
              {statusMessage && (
                <div style={{ padding: "10px 14px", background: storesError ? "var(--danger-weak)" : "var(--warning-weak)", border: `1px solid ${storesError ? "color-mix(in oklch, var(--danger) 30%, transparent)" : "color-mix(in oklch, var(--warn) 30%, transparent)"}`, borderRadius: "var(--radius)", color: storesError ? "var(--danger)" : "var(--text-1)", fontSize: 13 }}>
                  {statusMessage}
                </div>
              )}
              {submitError && (
                <div style={{ padding: "10px 14px", background: "var(--danger-weak)", border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)", borderRadius: "var(--radius)", color: "var(--danger)", fontSize: 13 }}>
                  {submitError}
                </div>
              )}

              <Section n={1} title="Register Details" sub="Reference number and register classification for the store ledger.">
                <div className="form-grid cols-2">
                  <Field label="Register number" required error={errors.register_number}>
                    <input value={form.register_number} onChange={(e) => set({ register_number: e.target.value })} onBlur={() => setTouched((prev) => new Set(prev).add("register_number"))} placeholder="Enter register number" />
                  </Field>
                  <Field label="Register type" required error={errors.register_type}>
                    <ThemedSelect
                      value={form.register_type}
                      onChange={(value) => {
                        set({ register_type: value as "CSR" | "DSR" | "" });
                        setTouched((prev) => new Set(prev).add("register_type"));
                      }}
                      placeholder="Select register type"
                      ariaLabel="Register type"
                      options={[
                        { value: "CSR", label: "Consumable Stock Register" },
                        { value: "DSR", label: "Dead Stock Register" },
                      ]}
                    />
                  </Field>
                </div>
              </Section>

              <Section n={2} title="Store Assignment" sub="Registers must belong to a store inside your current creation scope.">
                <div className="form-grid cols-2">
                  <Field label="Store" required error={errors.store} span={2}>
                    <ThemedSelect
                      value={form.store}
                      onChange={(value) => {
                        set({ store: value });
                        setTouched((prev) => new Set(prev).add("store"));
                      }}
                      placeholder="Select store"
                      ariaLabel="Store"
                      disabled={storesLoading || !!storesError || stores.length === 0}
                      options={stores.map((store) => ({ value: String(store.id), label: store.name }))}
                    />
                  </Field>
                  <Field
                    label="Status"
                    span={2}
                    hint={isEditMode
                      ? "Use the Close or Reopen action from the stock-register list to change register availability."
                      : "New registers are created as active and can be closed later from the list page."}
                  >
                    <input value={form.is_active ? "Active" : "Closed"} readOnly />
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
              : <span className="foot-ok">Register ready to save</span>}
          </div>
          <div className="modal-foot-actions">
            <button type="button" className="btn btn-md" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-md btn-primary" onClick={submit} disabled={!canSave}>{submitting ? "Saving…" : isEditMode ? "Save changes" : "Create register"}</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
