"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiFetch, type Page } from "@/lib/api";
import { ThemedSelect } from "@/components/ThemedSelect";
import { LOCATION_TYPE_LABELS, locationTagCategoryLabel, locationTypeLabel, type LocationRecord, type LocationTagRecord } from "@/lib/userUiShared";
import { useCopilotForm, type CopilotFormField } from "@/hooks/useCopilotForm";
import { ensureValueInOptions, normalizeCopilotSubmitError } from "@/lib/copilotFormRuntime";
import { focusCopilotFormField } from "@/lib/copilotFocus";
import { buildLocationCopilotValuePatch, type LocationCopilotFormState } from "@/lib/locationCopilotForm";
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

function LocationTagSelect({
  value,
  tags,
  loading,
  error,
  query,
  onQueryChange,
  onToggle,
}: {
  value: string[];
  tags: LocationTagRecord[];
  loading: boolean;
  error: string | null;
  query: string;
  onQueryChange: (value: string) => void;
  onToggle: (tagId: string) => void;
}) {
  const selectedIds = useMemo(() => new Set(value), [value]);
  const selectedTags = useMemo(
    () => value.map(id => tags.find(tag => String(tag.id) === id)).filter((tag): tag is LocationTagRecord => Boolean(tag)),
    [tags, value],
  );
  const normalizedQuery = query.trim().toLowerCase();
  const filteredTags = useMemo(() => {
    const visible = tags.filter(tag => tag.is_active !== false && !selectedIds.has(String(tag.id)));
    if (!normalizedQuery) return visible.slice(0, 20);
    return visible
      .filter(tag => {
        const label = `${tag.name} ${tag.code ?? ""} ${tag.category_display ?? locationTagCategoryLabel(tag.category)}`.toLowerCase();
        return label.includes(normalizedQuery);
      })
      .slice(0, 20);
  }, [normalizedQuery, selectedIds, tags]);

  return (
    <div className="tag-combobox">
      <div className="tag-combobox-control">
        <div className="tag-selected-chips">
          {selectedTags.map(tag => (
            <span className="chip-removable" key={tag.id}>
              {tag.category_display ?? locationTagCategoryLabel(tag.category)}: {tag.name}
              <button type="button" onClick={() => onToggle(String(tag.id))} aria-label={`Remove ${tag.name}`}>×</button>
            </span>
          ))}
          <input
            value={query}
            onChange={event => onQueryChange(event.target.value)}
            placeholder={selectedTags.length > 0 ? "Search tags" : "Search available tags"}
            disabled={loading || Boolean(error)}
          />
        </div>
      </div>
      <div className="tag-combobox-menu">
        <div className="tag-combobox-head">
          <span>{loading ? "Loading tags..." : error ? "Tags failed to load" : `${tags.length} available`}</span>
          <span className="mono">{selectedTags.length} selected</span>
        </div>
        {error ? <div className="tag-combobox-note error">{error}</div> : null}
        {!error && filteredTags.map(tag => (
          <button type="button" className="tag-option" key={tag.id} onClick={() => onToggle(String(tag.id))}>
            <span>
              <strong>{tag.name}</strong>
              <small>{tag.category_display ?? locationTagCategoryLabel(tag.category)}{tag.code ? ` / ${tag.code}` : ""}</small>
            </span>
            <Ic d="M12 5v14M5 12h14" size={13} />
          </button>
        ))}
        {!loading && !error && filteredTags.length === 0 ? (
          <div className="tag-combobox-note">No matching tags.</div>
        ) : null}
      </div>
    </div>
  );
}

type LocationFormState = LocationCopilotFormState;

function emptyForm(): LocationFormState {
  return {
    name: "",
    code: "",
    main_store_name: "",
    parent_location: "",
    tags: [],
    location_type: "",
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
    tags: (location.tags ?? []).map(String),
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
    tags: form.tags.map(Number),
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

function validateLocationForm(
  form: LocationFormState,
  options: { blockedReason?: string | null } = {},
) {
  const errors: Record<string, string> = {};
  if (!form.name.trim()) errors.name = "Location name is required.";
  if (!form.location_type.trim()) errors.location_type = "Location type is required.";
  if (options.blockedReason) errors._form = options.blockedReason;
  return errors;
}

type LocationCreateContext = "default" | "standalone" | "child";

interface LocationModalProps {
  open: boolean;
  mode: "create" | "edit";
  location?: LocationRecord | null;
  createContext?: LocationCreateContext;
  lockedParent?: LocationRecord | null;
  onClose: () => void;
  onSave?: (savedLocation: LocationRecord) => void | Promise<void>;
}

export function LocationModal({ open, mode, location, createContext = "default", lockedParent, onClose, onSave }: LocationModalProps) {
  const [form, setForm] = useState<LocationFormState>(emptyForm);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [parentLocations, setParentLocations] = useState<LocationRecord[]>([]);
  const [parentLoading, setParentLoading] = useState(false);
  const [parentError, setParentError] = useState<string | null>(null);
  const [locationTags, setLocationTags] = useState<LocationTagRecord[]>([]);
  const [tagsLoading, setTagsLoading] = useState(false);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [tagQuery, setTagQuery] = useState("");

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
    setLocationTags([]);
    setTagQuery("");
    const needsParentOptions = mode === "edit" || createContext === "default";
    setParentLoading(needsParentOptions);
    setParentError(null);
    setTagsLoading(true);
    setTagsError(null);

    let cancelled = false;

    if (needsParentOptions) {
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
    }

    apiFetch<LocationTagRecord[] | Page<LocationTagRecord>>("/api/inventory/location-tags/?page_size=500")
      .then(data => {
        if (cancelled) return;
        setLocationTags(Array.isArray(data) ? data : data.results);
      })
      .catch(err => {
        if (cancelled) return;
        setTagsError(err instanceof Error ? err.message : "Failed to load tags.");
      })
      .finally(() => {
        if (!cancelled) setTagsLoading(false);
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
  const saveBlockedReason = parentError
    ? "Parent locations must finish loading before this location can be saved."
    : parentLoading
    ? "Parent locations must finish loading before this location can be saved."
    : createContext === "child" && !lockedParent && !isEditMode
    ? "A parent location is required before creating a sub-location."
    : null;
  const errors = {
    name: touched.has("name") && !form.name.trim() ? "Location name is required." : undefined,
    location_type: touched.has("location_type") && !form.location_type.trim() ? "Location type is required." : undefined,
  };
  const issueCount = Object.values(errors).filter(Boolean).length;

  const canSave = !submitting && !saveBlockedReason;

  const parentSelectOptions = useMemo(() => parentLocations.map(parent => ({
    value: String(parent.id),
    label: parent.name,
    meta: `${parent.code} / ${locationTypeLabel(parent.location_type)}`,
  })), [parentLocations]);

  const locationTypeOptions = useMemo(() => form.create_main_store
    ? [{ value: "STORE", label: "Store" }]
    : Object.entries(LOCATION_TYPE_LABELS).map(([value, label]) => ({ value, label })),
  [form.create_main_store]);

  const loadStatusMessage = useMemo(() => {
    if (!isEditMode && createContext === "standalone") return "A main store will be created automatically for this location.";
    if (canCreateMissingMainStore) return "This standalone location does not currently have a main store.";
    if (!isEditMode && createContext === "child" && lockedParent) return `Creating sub-location under ${lockedParent.name}.`;
    if (parentError) return `Parent locations failed to load: ${parentError}`;
    if (tagsError) return `Tags failed to load: ${tagsError}`;
    if (parentLoading) return "Loading parent locations…";
    if (tagsLoading) return "Loading tags…";
    if (parentLocations.length === 0) return "No parent locations were returned. Root locations can still be saved without a parent.";
    return null;
  }, [canCreateMissingMainStore, createContext, isEditMode, lockedParent, parentError, parentLoading, parentLocations.length, tagsError, tagsLoading]);

  const set = useCallback((patch: Partial<LocationFormState>) => {
    setForm(prev => ({ ...prev, ...patch }));
  }, []);

  const toggleTag = useCallback((tagId: string) => {
    setForm(prev => ({
      ...prev,
      tags: prev.tags.includes(tagId)
        ? prev.tags.filter(id => id !== tagId)
        : [...prev.tags, tagId],
    }));
    setTagQuery("");
  }, []);

  const copilotFields = useMemo<CopilotFormField[]>(() => [
    {
      name: "name",
      label: "Location name",
      type: "string",
      required: true,
      description: "Unique location name shown in location lists and selectors.",
    },
    {
      name: "code",
      label: "Location code",
      type: "string",
      description: "Optional unique code. Leave blank to let the backend generate one.",
    },
    {
      name: "main_store_name",
      label: "Main store name",
      type: "string",
      readOnly: isEditMode || createContext !== "standalone",
      description: "Optional name for the auto-created main store when creating a standalone location.",
    },
    {
      name: "parent_location",
      label: "Parent location",
      type: "select",
      readOnly: !showParentSelector,
      optionSource: "locations.parents",
      resolver: "search_form_options",
      optionsState: parentLoading ? "loading" : parentError ? "error" : undefined,
      options: ensureValueInOptions(
        [
          { value: "", label: "No parent" },
          ...parentSelectOptions.map(option => ({ value: option.value, label: option.label })),
        ],
        lockedParent ? String(lockedParent.id) : null,
        lockedParent?.name,
      ),
      description: "Parent Location id. Empty means a root location when the default hierarchy flow allows it.",
    },
    {
      name: "tags",
      label: "Tags",
      type: "string",
      optionSource: "inventory.location_tags",
      description: "Optional reporting and grouping tags. Tags do not affect hierarchy, filtering, or user permissions.",
    },
    {
      name: "location_type",
      label: "Location type",
      type: "select",
      required: true,
      readOnly: form.create_main_store,
      options: locationTypeOptions,
    },
    {
      name: "create_main_store",
      label: "Create main store",
      type: "boolean",
      readOnly: !canCreateMissingMainStore,
      description: "Only available when creating a missing main store under a standalone location.",
    },
    {
      name: "is_store",
      label: "Store capability",
      type: "boolean",
      readOnly: !canConfigureStoreCapability,
      description: "Enable when this sub-location maintains stock registers and can issue or receive stock.",
    },
    {
      name: "is_active",
      label: "Active state",
      type: "boolean",
    },
    {
      name: "description",
      label: "Description",
      type: "string",
    },
    {
      name: "address",
      label: "Address",
      type: "string",
    },
    {
      name: "in_charge",
      label: "In charge",
      type: "string",
    },
    {
      name: "contact_number",
      label: "Contact number",
      type: "string",
    },
  ], [
    canConfigureStoreCapability,
    canCreateMissingMainStore,
    createContext,
    form.create_main_store,
    isEditMode,
    locationTypeOptions,
    parentError,
    parentLoading,
    parentSelectOptions,
    showParentSelector,
  ]);

  const applyCopilotValues = useCallback((values: Record<string, unknown>) => {
    const patch = buildLocationCopilotValuePatch(values);
    setForm(prev => {
      const next = { ...prev, ...patch };
      if (Object.prototype.hasOwnProperty.call(patch, "create_main_store")) {
        if (patch.create_main_store) {
          next.location_type = "STORE";
          next.is_store = true;
        } else if (prev.create_main_store && next.location_type === "STORE") {
          next.location_type = typeof patch.location_type === "string" ? patch.location_type : "";
          next.is_store = typeof patch.is_store === "boolean" ? patch.is_store : false;
        }
      }
      return next;
    });
    return {
      applied: Object.keys(patch),
      ignored: Object.keys(values).filter((field) => !(field in patch)),
    };
  }, []);

  const validateForCopilot = useCallback(() => {
    setTouched(new Set(["name", "location_type"]));
    const nextErrors = validateLocationForm(form, { blockedReason: saveBlockedReason });
    return {
      ok: Object.keys(nextErrors).length === 0,
      errors: nextErrors,
    };
  }, [form, saveBlockedReason]);

  const submit = async () => {
    const allTouched = new Set(["name", "location_type"]);
    setTouched(allTouched);
    if (!canSave) {
      const message = saveBlockedReason ?? "Please complete the required fields.";
      setSubmitError(message);
      return {
        ok: false,
        errorType: "validation_error",
        message,
        fieldErrors: validateLocationForm(form, { blockedReason: saveBlockedReason }),
      };
    }

    const nextErrors = validateLocationForm(form);
    if (Object.keys(nextErrors).length > 0) {
      return {
        ok: false,
        errorType: "validation_error",
        message: "Resolve highlighted location fields before submitting.",
        fieldErrors: nextErrors,
      };
    }

    setSubmitting(true);
    setSubmitError(null);

    try {
      const body = JSON.stringify(toPayload(form));
      let saved: LocationRecord;
      if (isEditMode && location) {
        saved = await apiFetch<LocationRecord>(`/api/inventory/locations/${location.id}/`, {
          method: "PATCH",
          body,
        });
      } else {
        const createPath = createContext === "standalone"
          ? "/api/inventory/locations/standalone/"
          : createContext === "child" && lockedParent
          ? `/api/inventory/locations/${lockedParent.id}/children/`
          : "/api/inventory/locations/";
        saved = await apiFetch<LocationRecord>(createPath, {
          method: "POST",
          body,
        });
      }

      await onSave?.(saved);
      onClose();
      return {
        ok: true,
        message: isEditMode ? "Location updated successfully." : "Location created successfully.",
        recordId: saved.id,
        redirectTo: `/locations/${saved.id}`,
      };
    } catch (err) {
      const failure = normalizeCopilotSubmitError(err);
      setSubmitError(failure.message || (isEditMode ? "Failed to update location." : "Failed to create location."));
      return failure;
    } finally {
      setSubmitting(false);
    }
  };

  const { submitManually } = useCopilotForm({
    formId: isEditMode && location ? `location-edit-${location.id}` : createContext === "child" ? "sublocation-create" : "location-create",
    title: isEditMode ? "Edit Location" : createContext === "child" ? "Add Sub-Location" : "Create Location",
    description: "Create or edit a location on the Locations page.",
    mode,
    active: open,
    fields: copilotFields,
    values: form as unknown as Record<string, unknown>,
    errors: Object.fromEntries(Object.entries(errors).filter((entry): entry is [string, string] => Boolean(entry[1]))),
    canSetValues: !submitting && !parentLoading && !tagsLoading,
    canValidate: true,
    canSubmit: canSave,
    requirements: {
      setValues: { requiredCapabilities: [{ module: "locations", level: "manage" }] },
      validate: { requiredCapabilities: [{ module: "locations", level: "manage" }] },
      submit: { requiredCapabilities: [{ module: "locations", level: "manage" }] },
    },
    setValues: applyCopilotValues,
    focusField: focusCopilotFormField,
    validate: validateForCopilot,
    submit: () => submit(),
  });

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
                  <Field label="Location name" required error={errors.name} copilotField="name">
                    <input value={form.name} onChange={e => set({ name: e.target.value })} onBlur={() => setTouched(prev => new Set(prev).add("name"))} placeholder="Enter location name" />
                  </Field>
                  <Field label="Location code" hint="Leave blank to let the backend generate one." copilotField="code">
                    <input value={form.code} onChange={e => set({ code: e.target.value.toUpperCase() })} placeholder="Enter location code" />
                  </Field>
                  {!isEditMode && createContext === "standalone" && (
                    <Field label="Main store name" hint="Blank uses the location name followed by Main Store." span={2} copilotField="main_store_name">
                      <input value={form.main_store_name} onChange={e => set({ main_store_name: e.target.value })} placeholder="Optional main store name" />
                    </Field>
                  )}
                  <Field label="Active state" span={2} copilotField="is_active">
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
                    <Field label="Parent location" hint="Leave empty for a root location." copilotField="parent_location">
                      <ThemedSelect
                        value={form.parent_location}
                        onChange={value => set({ parent_location: value })}
                        placeholder="No parent"
                        ariaLabel="Parent location"
                        disabled={parentLoading || Boolean(parentError)}
                        options={parentSelectOptions}
                      />
                    </Field>
                  )}
                  <Field label="Location type" required error={errors.location_type} span={isClassificationOnly ? 2 : 1} copilotField="location_type">
                    <ThemedSelect
                      value={form.location_type}
                      onChange={value => {
                        set({ location_type: value });
                        setTouched(prev => new Set(prev).add("location_type"));
                      }}
                      placeholder="Select location type"
                      ariaLabel="Location type"
                      options={locationTypeOptions}
                      disabled={form.create_main_store}
                    />
                  </Field>
                  <Field label="Tags" hint="Optional reporting dimensions for distribution and reports." span={2} copilotField="tags">
                    <LocationTagSelect
                      value={form.tags}
                      tags={locationTags}
                      loading={tagsLoading}
                      error={tagsError}
                      query={tagQuery}
                      onQueryChange={value => {
                        setTagQuery(value);
                      }}
                      onToggle={toggleTag}
                    />
                  </Field>
                  {canCreateMissingMainStore && (
                    <Field
                      label="Main store"
                      hint="Creates the primary inventory store for this standalone location."
                      span={2}
                      copilotField="create_main_store"
                    >
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={form.create_main_store}
                          onChange={event => set({
                            create_main_store: event.target.checked,
                            location_type: event.target.checked ? "STORE" : "",
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
                      copilotField="is_store"
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
                  <Field label="Description" span={2} copilotField="description">
                    <textarea className="textarea-field" rows={4} value={form.description} onChange={e => set({ description: e.target.value })} placeholder="Optional description" />
                  </Field>
                  <Field label="Address" span={2} copilotField="address">
                    <textarea className="textarea-field" rows={3} value={form.address} onChange={e => set({ address: e.target.value })} placeholder="Optional address" />
                  </Field>
                  <Field label="In charge" copilotField="in_charge">
                    <input value={form.in_charge} onChange={e => set({ in_charge: e.target.value })} placeholder="Optional contact name" />
                  </Field>
                  <Field label="Contact number" copilotField="contact_number">
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
            <Button type="button" variant="outline" size="md" onClick={onClose}>Cancel</Button>
            <Button type="button" size="md" onClick={() => { void submitManually("submit"); }} disabled={!canSave}>{submitting ? "Saving…" : isEditMode ? "Save changes" : "Create location"}</Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
