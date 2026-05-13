"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch, type Page } from "@/lib/api";
import { ThemedSelect } from "@/components/ThemedSelect";
import { LOCATION_TYPE_LABELS, locationTypeLabel, type LocationRecord } from "@/lib/userUiShared";

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

type LocationFormState = {
  name: string;
  code: string;
  main_store_name: string;
  parent_location: string;
  location_type: string;
  create_main_store: boolean;
  is_store: boolean;
  is_active: boolean;
  description: string;
  address: string;
  in_charge: string;
  contact_number: string;
};

function emptyForm(): LocationFormState {
  return {
    name: "",
    code: "",
    main_store_name: "",
    parent_location: "",
    location_type: "DEPARTMENT",
    create_main_store: false,
    is_store: false,
    is_active: true,
    description: "",
    address: "",
    in_charge: "",
    contact_number: "",
  };
}

function formFromLocation(location: LocationRecord | null): LocationFormState {
  if (!location) return emptyForm();

  return {
    name: location.name ?? "",
    code: location.code ?? "",
    main_store_name: "",
    parent_location: location.parent_location == null ? "" : String(location.parent_location),
    location_type: location.location_type === "STORE" ? "OTHER" : location.location_type ?? "DEPARTMENT",
    create_main_store: false,
    is_store: Boolean(location.is_store),
    is_active: Boolean(location.is_active),
    description: location.description ?? "",
    address: location.address ?? "",
    in_charge: location.in_charge ?? "",
    contact_number: location.contact_number ?? "",
  };
}

function toPayload(form: LocationFormState) {
  return {
    name: form.name.trim(),
    code: form.code.trim(),
    main_store_name: form.main_store_name.trim(),
    parent_location: form.parent_location ? Number(form.parent_location) : null,
    location_type: form.create_main_store ? "STORE" : form.location_type,
    create_main_store: form.create_main_store,
    is_store: form.create_main_store ? true : form.is_store,
    is_main_store: form.create_main_store ? true : undefined,
    is_auto_created: form.create_main_store ? true : undefined,
    is_active: form.is_active,
    description: form.description.trim() || null,
    address: form.address.trim() || null,
    in_charge: form.in_charge.trim() || null,
    contact_number: form.contact_number.trim() || null,
  };
}

type LocationCreateContext = "default" | "standalone" | "child";

interface LocationModalProps {
  open: boolean;
  mode: "create" | "edit";
  location?: LocationRecord | null;
  createContext?: LocationCreateContext;
  lockedParent?: LocationRecord | null;
  onClose: () => void;
  onSave?: () => void | Promise<void>;
}

export function LocationModal({ open, mode, location, createContext = "default", lockedParent, onClose, onSave }: LocationModalProps) {
  const [form, setForm] = useState<LocationFormState>(emptyForm);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [parentLocations, setParentLocations] = useState<LocationRecord[]>([]);
  const [parentLoading, setParentLoading] = useState(false);
  const [parentError, setParentError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    const nextForm = formFromLocation(location ?? null);
    if (mode === "create" && createContext === "child" && lockedParent) {
      nextForm.parent_location = String(lockedParent.id);
    }
    setForm(nextForm);
    setTouched(new Set());
    setSubmitting(false);
    setSubmitError(null);
    setParentLocations([]);
    const needsParentOptions = mode === "edit" || createContext === "default";
    setParentLoading(needsParentOptions);
    setParentError(null);

    if (!needsParentOptions) return;

    let cancelled = false;

    apiFetch<LocationRecord[] | Page<LocationRecord>>("/api/inventory/locations/?page_size=500")
      .then(data => {
        if (cancelled) return;
        const records = Array.isArray(data) ? data : data.results;
        const options = location?.id ? records.filter(item => item.id !== location.id) : records;
        setParentLocations(options);
      })
      .catch(err => {
        if (cancelled) return;
        setParentError(err instanceof Error ? err.message : "Failed to load parent locations.");
      })
      .finally(() => {
        if (!cancelled) setParentLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [createContext, lockedParent, mode, open, location]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const isEditMode = mode === "edit";
  const showParentSelector = !isEditMode && createContext === "default";
  const isClassificationOnly = !showParentSelector;
  const canCreateMissingMainStore = !isEditMode && createContext === "child" && Boolean(lockedParent?.is_standalone) && !lockedParent?.main_store_id;
  const canConfigureStoreCapability = !form.create_main_store && (createContext === "child" || (isEditMode && Boolean(location?.parent_location) && !location?.is_standalone));
  const errors = {
    name: touched.has("name") && !form.name.trim() ? "Location name is required." : undefined,
    location_type: touched.has("location_type") && !form.location_type.trim() ? "Location type is required." : undefined,
  };
  const issueCount = Object.values(errors).filter(Boolean).length;

  const canSave = !submitting && !parentLoading && !parentError && !(createContext === "child" && !lockedParent && !isEditMode);

  const loadStatusMessage = useMemo(() => {
    if (!isEditMode && createContext === "standalone") return "A main store will be created automatically for this location.";
    if (canCreateMissingMainStore) return "This standalone location does not currently have a main store.";
    if (!isEditMode && createContext === "child" && lockedParent) return `Creating sub-location under ${lockedParent.name}.`;
    if (parentError) return `Parent locations failed to load: ${parentError}`;
    if (parentLoading) return "Loading parent locations…";
    if (parentLocations.length === 0) return "No parent locations were returned. Root locations can still be saved without a parent.";
    return null;
  }, [canCreateMissingMainStore, createContext, isEditMode, lockedParent, parentError, parentLoading, parentLocations.length]);

  const set = (patch: Partial<LocationFormState>) => setForm(prev => ({ ...prev, ...patch }));

  const submit = async () => {
    const allTouched = new Set(["name", "location_type"]);
    setTouched(allTouched);
    if (!canSave) {
      setSubmitError(parentError ? "Parent locations must finish loading before this location can be saved." : "Please complete the required fields.");
      return;
    }

    const nextErrors = {
      name: !form.name.trim() ? "Location name is required." : undefined,
      location_type: !form.location_type.trim() ? "Location type is required." : undefined,
    };
    if (Object.values(nextErrors).some(Boolean)) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const body = JSON.stringify(toPayload(form));
      if (isEditMode && location) {
        await apiFetch(`/api/inventory/locations/${location.id}/`, {
          method: "PATCH",
          body,
        });
      } else {
        const createPath = createContext === "standalone"
          ? "/api/inventory/locations/standalone/"
          : createContext === "child" && lockedParent
          ? `/api/inventory/locations/${lockedParent.id}/children/`
          : "/api/inventory/locations/";
        await apiFetch(createPath, {
          method: "POST",
          body,
        });
      }

      await onSave?.();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : (isEditMode ? "Failed to update location." : "Failed to create location."));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal modal-lg" role="dialog" aria-modal="true" aria-labelledby="location-modal-title">
        <header className="modal-head">
          <div>
            <div className="eyebrow">Inventory · {isEditMode ? "Edit Record" : "New Record"}</div>
            <h2 id="location-modal-title">{isEditMode ? "Edit Location" : "Create Location"}</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <Ic d="M6 6l12 12M6 18L18 6" />
          </button>
        </header>

        <div className="modal-body">
          <div style={{ paddingTop: 24 }}>
            <div style={{ display: "grid", gap: 16, padding: "0 24px 24px" }}>
              {loadStatusMessage && (
                <div style={{ padding: "10px 14px", background: "var(--warning-weak)", border: "1px solid color-mix(in oklch, var(--warning) 30%, transparent)", borderRadius: "var(--radius)", color: "var(--text-1)", fontSize: 13 }}>
                  {loadStatusMessage}
                </div>
              )}
              {submitError && (
                <div style={{ padding: "10px 14px", background: "var(--danger-weak)", border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)", borderRadius: "var(--radius)", color: "var(--danger)", fontSize: 13 }}>
                  {submitError}
                </div>
              )}

              <Section n={1} title="Identity" sub="Core values that identify the location record.">
                <div className="form-grid cols-2">
                  <Field label="Location name" required error={errors.name}>
                    <input value={form.name} onChange={e => set({ name: e.target.value })} onBlur={() => setTouched(prev => new Set(prev).add("name"))} placeholder="Enter location name" />
                  </Field>
                  <Field label="Location code" hint="Leave blank to let the backend generate one.">
                    <input value={form.code} onChange={e => set({ code: e.target.value.toUpperCase() })} placeholder="Enter location code" />
                  </Field>
                  {!isEditMode && createContext === "standalone" && (
                    <Field label="Main store name" hint="Blank uses the location name followed by Main Store." span={2}>
                      <input value={form.main_store_name} onChange={e => set({ main_store_name: e.target.value })} placeholder="Optional main store name" />
                    </Field>
                  )}
                  <Field label="Active state" span={2}>
                    <div className="seg seg-inline">
                      <button type="button" className={"seg-btn" + (form.is_active ? " active" : "")} onClick={() => set({ is_active: true })}>Active</button>
                      <button type="button" className={"seg-btn" + (!form.is_active ? " active" : "")} onClick={() => set({ is_active: false })}>Disabled</button>
                    </div>
                  </Field>
                </div>
              </Section>

              <Section
                n={2}
                title={isClassificationOnly ? "Classification" : "Hierarchy"}
                sub={isClassificationOnly ? "Choose how this location is categorized." : "Parenting and location classification."}
              >
                <div className="form-grid cols-2">
                  {showParentSelector && (
                    <Field label="Parent location" hint="Leave empty for a root location.">
                      <ThemedSelect
                        value={form.parent_location}
                        onChange={value => set({ parent_location: value })}
                        placeholder="No parent"
                        ariaLabel="Parent location"
                        disabled={parentLoading || Boolean(parentError)}
                        options={parentLocations.map(parent => ({
                          value: String(parent.id),
                          label: parent.name,
                          meta: `${parent.code} · ${locationTypeLabel(parent.location_type)}`,
                        }))}
                      />
                    </Field>
                  )}
                  <Field label="Location type" required error={errors.location_type} span={isClassificationOnly ? 2 : 1}>
                    <ThemedSelect
                      value={form.location_type}
                      onChange={value => {
                        set({ location_type: value });
                        setTouched(prev => new Set(prev).add("location_type"));
                      }}
                      placeholder="Select location type"
                      ariaLabel="Location type"
                      options={form.create_main_store
                        ? [{ value: "STORE", label: "Store" }]
                        : Object.entries(LOCATION_TYPE_LABELS).map(([value, label]) => ({ value, label }))}
                      disabled={form.create_main_store}
                    />
                  </Field>
                  {canCreateMissingMainStore && (
                    <Field
                      label="Main store"
                      hint="Creates the primary inventory store for this standalone location."
                      span={2}
                    >
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={form.create_main_store}
                          onChange={event => set({
                            create_main_store: event.target.checked,
                            location_type: event.target.checked ? "STORE" : "DEPARTMENT",
                            is_store: event.target.checked,
                          })}
                        />
                        <span>Main store location</span>
                      </label>
                    </Field>
                  )}
                  {canConfigureStoreCapability && (
                    <Field
                      label="Store capability"
                      hint="Enable when this sub-location maintains stock registers and can issue or receive stock."
                      span={2}
                    >
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={form.is_store}
                          onChange={event => set({ is_store: event.target.checked })}
                        />
                        <span>Inventory store location</span>
                      </label>
                    </Field>
                  )}
                </div>
              </Section>

              <Section n={3} title="Details" sub="Descriptive information shown in admin views.">
                <div className="form-grid cols-2">
                  <Field label="Description" span={2}>
                    <textarea className="textarea-field" rows={4} value={form.description} onChange={e => set({ description: e.target.value })} placeholder="Optional description" />
                  </Field>
                  <Field label="Address" span={2}>
                    <textarea className="textarea-field" rows={3} value={form.address} onChange={e => set({ address: e.target.value })} placeholder="Optional address" />
                  </Field>
                  <Field label="In charge">
                    <input value={form.in_charge} onChange={e => set({ in_charge: e.target.value })} placeholder="Optional contact name" />
                  </Field>
                  <Field label="Contact number">
                    <input value={form.contact_number} onChange={e => set({ contact_number: e.target.value })} placeholder="Optional contact number" />
                  </Field>
                </div>
              </Section>
            </div>
          </div>
        </div>

        <footer className="modal-foot">
          <div className="modal-foot-meta mono">
            {parentError
              ? <span className="foot-err">{parentError}</span>
              : parentLoading
                ? <span className="foot-err">Loading parent locations…</span>
                : issueCount > 0
                  ? <span className="foot-err">{issueCount} issue{issueCount > 1 ? "s" : ""} to resolve</span>
                  : <span className="foot-ok">{form.create_main_store ? "Main store" : `${locationTypeLabel(form.location_type)}${form.is_store ? " store" : " location"}`} ready</span>}
          </div>
          <div className="modal-foot-actions">
            <button type="button" className="btn btn-md" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-md btn-primary" onClick={submit} disabled={!canSave}>{submitting ? "Saving…" : isEditMode ? "Save changes" : "Create location"}</button>
          </div>
        </footer>
      </div>
    </div>
  );
}
