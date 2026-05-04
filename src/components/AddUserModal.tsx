"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { apiFetch, type Page } from "@/lib/api";
import { type Location, type User } from "@/lib/userUiShared";
import { useAuth } from "@/contexts/AuthContext";

// ── Backend API types ─────────────────────────────────────────────────────────

interface ApiLocation {
  id: number;
  name: string;
  code: string;
  parent_location: number | null;
  location_type: string;
  hierarchy_level: number;
  is_active: boolean;
  is_standalone: boolean;
  is_store: boolean;
}

interface ApiGroup {
  id: number;
  name: string;
  permissions: number[];
  permissions_details: { id: number; name: string; codename: string; model: string }[];
}

interface UserManagementDetail extends User {
  assigned_locations?: number[];
  groups?: number[];
}

interface AssignableLocation extends Location {
  is_standalone: boolean;
  is_store: boolean;
}

// Map backend location -> frontend Location shape for assignment controls
function mapLocation(l: ApiLocation): AssignableLocation {
  const kindMap: Record<string, string> = {
    DEPARTMENT: "Dept", BUILDING: "Bldg", STORE: "Store",
    ROOM: "Room", LAB: "Lab", JUNKYARD: "Junkyard",
    OFFICE: "Office", AV_HALL: "AV Hall", AUDITORIUM: "Auditorium", OTHER: "Other",
  };
  return {
    id: l.id,
    name: l.name,
    code: l.code,
    kind: kindMap[l.location_type] ?? l.location_type,
    parent_id: l.parent_location,
    depth: l.hierarchy_level,
    asset_count: 0,
    item_count: 0,
    custodian: "",
    is_active: l.is_active,
    is_standalone: l.is_standalone,
    is_store: l.is_store,
  };
}

// ── Tiny icon helper ──────────────────────────────────────────────────────────

const Ic = ({ d, size = 16 }: { d: React.ReactNode | string; size?: number }) => (
  <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    {typeof d === "string" ? <path d={d} /> : d}
  </svg>
);

// ── Sub-components ────────────────────────────────────────────────────────────

function Field({ label, required, error, hint, children, span = 1 }: {
  label: string; required?: boolean; error?: string; hint?: string;
  children: React.ReactNode; span?: number;
}) {
  return (
    <div className={"field" + (error ? " has-error" : "")} style={{ gridColumn: `span ${span}` }}>
      <div className="field-label">
        {label}{required && <span className="field-req">*</span>}
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

function LocationScopePicker({
  locations,
  value,
  onChange,
  readOnly = false,
  autoSelectSingleStandalone = false,
}: {
  locations: AssignableLocation[];
  value: number[];
  onChange: (v: number[]) => void;
  readOnly?: boolean;
  autoSelectSingleStandalone?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const byId = useMemo(() => new Map(locations.map(location => [location.id, location])), [locations]);
  const hasRootScope = useMemo(
    () => locations.some(location => location.parent_id === null && location.depth === 0),
    [locations]
  );
  const standaloneLocations = useMemo(
    () =>
      [...locations.filter(location => location.is_standalone)].sort((a, b) => {
        if (a.depth !== b.depth) return a.depth - b.depth;
        return a.name.localeCompare(b.name);
      }),
    [locations]
  );
  const standaloneFixed = !hasRootScope && standaloneLocations.length === 1;

  const isDescendantOf = (location: AssignableLocation, standaloneId: number) => {
    let parentId = location.parent_id;
    while (parentId) {
      if (parentId === standaloneId) return true;
      parentId = byId.get(parentId)?.parent_id ?? null;
    }
    return false;
  };

  const descendantsByStandalone = useMemo(() => {
    const map = new Map<number, AssignableLocation[]>();
    standaloneLocations.forEach(standalone => {
      const isRootStandalone = standalone.parent_id === null && standalone.depth === 0;
      map.set(
        standalone.id,
        locations.filter(
          location =>
            location.id !== standalone.id &&
            !location.is_standalone &&
            (isRootStandalone
              ? location.parent_id === standalone.id
              : isDescendantOf(location, standalone.id))
        )
      );
    });
    return map;
  }, [byId, locations, standaloneLocations]);

  const valueSet = useMemo(() => new Set(value), [value]);
  const selectedStandaloneIds = useMemo(() => {
    const ids = standaloneLocations
      .filter(standalone => {
        if (valueSet.has(standalone.id)) return true;
        return (descendantsByStandalone.get(standalone.id) ?? []).some(location => valueSet.has(location.id));
      })
      .map(standalone => standalone.id);
    if (standaloneFixed && standaloneLocations[0] && !ids.includes(standaloneLocations[0].id)) {
      ids.unshift(standaloneLocations[0].id);
    }
    return ids;
  }, [descendantsByStandalone, standaloneFixed, standaloneLocations, valueSet]);

  useEffect(() => {
    if (
      autoSelectSingleStandalone &&
      !readOnly &&
      standaloneFixed &&
      standaloneLocations[0] &&
      value.length === 0
    ) {
      onChange([standaloneLocations[0].id]);
    }
  }, [autoSelectSingleStandalone, onChange, readOnly, standaloneFixed, standaloneLocations, value.length]);

  useEffect(() => {
    if (!open) return;
    const closeDropdown = () => {
      setOpen(false);
      setQuery("");
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && rootRef.current?.contains(target)) return;
      closeDropdown();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDropdown();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const matchesQuery = (location: AssignableLocation) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      location.name.toLowerCase().includes(q) ||
      location.code.toLowerCase().includes(q) ||
      location.kind.toLowerCase().includes(q)
    );
  };

  const toggleStandalone = (standalone: AssignableLocation) => {
    if (readOnly || (standaloneFixed && standaloneLocations[0]?.id === standalone.id)) return;
    const nextSet = new Set(value);
    if (nextSet.has(standalone.id)) {
      nextSet.delete(standalone.id);
      (descendantsByStandalone.get(standalone.id) ?? []).forEach(location => nextSet.delete(location.id));
    } else {
      nextSet.add(standalone.id);
    }
    onChange(Array.from(nextSet));
  };

  const toggleSubLocation = (location: AssignableLocation) => {
    if (readOnly) return;
    const nextSet = new Set(value);
    nextSet.has(location.id) ? nextSet.delete(location.id) : nextSet.add(location.id);
    onChange(Array.from(nextSet));
  };

  const selectedLocations = value
    .map(id => byId.get(id))
    .filter(Boolean) as AssignableLocation[];
  const selectedSummary = (() => {
    if (selectedLocations.length === 0) return "Select assigned locations";
    const names = selectedLocations.map(location => location.name);
    const shown = names.slice(0, 2).join(", ");
    return names.length > 2 ? `${shown} +${names.length - 2}` : shown;
  })();
  const visibleStandaloneRows = standaloneLocations
    .map(standalone => {
      const children = descendantsByStandalone.get(standalone.id) ?? [];
      const expanded = selectedStandaloneIds.includes(standalone.id);
      const q = query.trim();
      const visibleChildren = expanded
        ? children.filter(child => !q || matchesQuery(standalone) || matchesQuery(child))
        : [];
      if (!q || matchesQuery(standalone) || visibleChildren.length > 0) {
        return { standalone, visibleChildren };
      }
      return null;
    })
    .filter(Boolean) as { standalone: AssignableLocation; visibleChildren: AssignableLocation[] }[];

  return (
    <div className={"location-scope-picker" + (readOnly ? " read-only" : "")}>
      <div ref={rootRef} className={"assignment-dropdown" + (open ? " open" : "") + (readOnly ? " disabled" : "")}>
        <div
          className="assignment-trigger"
          onClick={() => {
            if (readOnly) return;
            setOpen(true);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
        >
          <Ic d={<><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>} size={13} />
          <input
            ref={inputRef}
            value={open ? query : (selectedLocations.length > 0 ? selectedSummary : "")}
            placeholder={open ? "Search standalone locations..." : "Search assigned locations..."}
            disabled={readOnly}
            onFocus={() => {
              if (readOnly) return;
              setOpen(true);
            }}
            onChange={e => {
              if (!open) setOpen(true);
              setQuery(e.target.value);
            }}
          />
          {open && query ? (
            <button
              type="button"
              className="assignment-trigger-clear"
              onClick={e => {
                e.stopPropagation();
                setQuery("");
                requestAnimationFrame(() => inputRef.current?.focus());
              }}
              aria-label="Clear search"
            >
              ×
            </button>
          ) : null}
          <button
            type="button"
            className="assignment-trigger-toggle"
            onClick={e => {
              e.stopPropagation();
              if (readOnly) return;
              setOpen(prev => !prev);
              requestAnimationFrame(() => inputRef.current?.focus());
            }}
            disabled={readOnly}
            aria-label={open ? "Close locations" : "Open locations"}
          >
            <Ic d={open ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} size={13} />
          </button>
        </div>

        {open && !readOnly && (
          <div className="assignment-menu">
            <div className="assignment-list">
              {visibleStandaloneRows.length > 0 ? visibleStandaloneRows.map(({ standalone, visibleChildren }) => {
                const standaloneChecked = valueSet.has(standalone.id);
                const fixedStandalone = standaloneFixed && standaloneLocations[0]?.id === standalone.id;
                return (
                  <div key={standalone.id} className="assignment-group">
                    <button
                      type="button"
                      className={"assignment-row standalone" + (standaloneChecked ? " selected" : "") + (fixedStandalone ? " locked" : "")}
                      onClick={() => toggleStandalone(standalone)}
                      disabled={fixedStandalone}
                    >
                      <span className="assignment-check">{standaloneChecked ? "✓" : ""}</span>
                      <span className="assignment-name">{standalone.name}</span>
                      <span className="assignment-kind mono">{standalone.kind}</span>
                      <span className="assignment-code mono">{standalone.code}</span>
                    </button>
                    {selectedStandaloneIds.includes(standalone.id) && visibleChildren.length > 0 && (
                      <div className="assignment-children">
                        {visibleChildren.map(child => {
                          const checked = valueSet.has(child.id);
                          return (
                            <button
                              key={child.id}
                              type="button"
                              className={"assignment-row child" + (checked ? " selected" : "")}
                              onClick={() => toggleSubLocation(child)}
                            >
                              <span className="assignment-check">{checked ? "✓" : ""}</span>
                              <span className="assignment-name">{child.name}</span>
                              <span className="assignment-kind mono">{child.kind}</span>
                              <span className="assignment-code mono">{child.code}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }) : (
                <div className="scope-empty">No matching standalone locations.</div>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="field-hint assignment-help">
        {readOnly
          ? "Your own assigned locations are locked."
          : standaloneFixed
            ? "Fixed to your assigned standalone location. Select optional sub-locations below it."
            : "Select a standalone location to reveal its sub-locations."}
      </div>
    </div>
  );
}

// ── Validation ────────────────────────────────────────────────────────────────

interface FormState {
  first_name: string; last_name: string; username: string; email: string;
  password: string; locations: number[];
  groups: number[]; is_active: boolean;
}

function emptyForm(): FormState {
  return { first_name: "", last_name: "", username: "", email: "", password: "", locations: [], groups: [], is_active: true };
}

function formFromUser(user: UserManagementDetail): FormState {
  return {
    first_name: user.first_name,
    last_name: user.last_name,
    username: user.username,
    email: user.email,
    password: "",
    locations: user.assigned_locations ?? [],
    groups: user.groups ?? [],
    is_active: user.is_active,
  };
}

function validate(
  f: FormState,
  touched: Set<string>,
  isEditMode: boolean,
  options: { requireLocation?: boolean; requireStockEntryStore?: boolean; hasAssignedStore?: boolean } = {},
): Record<string, string> {
  const e: Record<string, string> = {};
  if (touched.has("first_name") && !f.first_name.trim()) e.first_name = "First name is required.";
  if (touched.has("last_name") && !f.last_name.trim()) e.last_name = "Last name is required.";
  if (touched.has("username")) {
    if (!f.username.trim()) e.username = "Username is required.";
    else if (!/^[a-z0-9._-]{3,}$/i.test(f.username)) e.username = "Use letters, digits, dot, underscore, dash (min 3).";
  }
  if (touched.has("email")) {
    if (!f.email.trim()) e.email = "Email is required.";
  }
  if (touched.has("password") && !isEditMode && !f.password.length) {
    e.password = "Password is required.";
  }
  if (touched.has("groups") && f.groups.length === 0)
    e.groups = "Assign at least one role / group.";
  if (touched.has("locations")) {
    if (options.requireStockEntryStore && !options.hasAssignedStore) {
      e.locations = "Select at least one store because the selected role can create stock entries.";
    } else if (options.requireLocation && f.locations.length === 0) {
      e.locations = "Select at least one location within your assigned scope.";
    }
  }
  return e;
}

// ── Main component ────────────────────────────────────────────────────────────

interface AddUserModalProps {
  open: boolean;
  onClose: () => void;
  onSave?: () => void | Promise<void>;
  mode?: "create" | "edit";
  user?: UserManagementDetail | null;
  canAssignRoles?: boolean;
  canAssignLocations?: boolean;
}

export function AddUserModal({
  open,
  onClose,
  onSave,
  mode = "create",
  user = null,
  canAssignRoles = false,
  canAssignLocations = false,
}: AddUserModalProps) {
  const { user: currentUser } = useAuth();
  const editingSelf =
    mode === "edit" &&
    !!currentUser &&
    !!user &&
    user.id === currentUser.id &&
    !currentUser.is_superuser;
  const selfAssignmentLocked = editingSelf;
  const [form, setForm] = useState<FormState>(emptyForm);
  const [touched, setTouched] = useState<Set<string>>(() => new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [userLoadError, setUserLoadError] = useState<string | null>(null);
  const [userLoading, setUserLoading] = useState(false);

  // Real data from API
  const [groups, setGroups] = useState<ApiGroup[]>([]);
  const [locations, setLocations] = useState<AssignableLocation[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [locationsLoading, setLocationsLoading] = useState(false);
  const [dataLoadError, setDataLoadError] = useState<{ groups: string | null; locations: string | null }>({ groups: null, locations: null });

  useEffect(() => {
    if (!open) return;
    setDataLoadError({ groups: null, locations: null });
    setGroups([]);
    setLocations([]);

    let cancelled = false;

    if (canAssignRoles) {
      setGroupsLoading(true);
      apiFetch<ApiGroup[] | Page<ApiGroup>>("/api/users/groups/")
        .then(groupData => {
          if (cancelled) return;
          const groupList = Array.isArray(groupData) ? groupData : groupData.results;
          setGroups(groupList);
        })
        .catch(err => {
          if (cancelled) return;
          setDataLoadError(prev => ({
            ...prev,
            groups: err instanceof Error ? err.message : "Failed to load groups.",
          }));
        })
        .finally(() => {
          if (!cancelled) setGroupsLoading(false);
        });
    }

    if (canAssignLocations) {
      setLocationsLoading(true);
      apiFetch<ApiLocation[] | Page<ApiLocation>>("/api/inventory/locations/assignable/")
        .then(locData => {
          if (cancelled) return;
          const locList = (Array.isArray(locData) ? locData : locData.results)
            .filter(l => l.is_active)
            .map(mapLocation);
          setLocations(locList);
        })
        .catch(err => {
          if (cancelled) return;
          setDataLoadError(prev => ({
            ...prev,
            locations: err instanceof Error ? err.message : "Failed to load locations.",
          }));
        })
        .finally(() => {
          if (!cancelled) setLocationsLoading(false);
        });
    }

    return () => { cancelled = true; };
  }, [open, canAssignLocations, canAssignRoles]);

  useEffect(() => {
    if (!open) return;
    setTouched(new Set());
    setSubmitting(false);
    setSubmitError(null);
    setUserLoadError(null);
    setUserLoading(false);
    setForm(mode === "edit" && user ? formFromUser(user) : emptyForm());
  }, [open, mode, user]);

  useEffect(() => {
    if (!open || mode !== "edit" || !user) return;

    let cancelled = false;
    setUserLoading(true);
    setUserLoadError(null);

    apiFetch<UserManagementDetail>(`/api/users/management/${user.id}/`)
      .then(detail => {
        if (cancelled) return;
        setForm(formFromUser(detail));
      })
      .catch(err => {
        if (cancelled) return;
        setUserLoadError(err instanceof Error ? err.message : "Failed to load user details.");
      })
      .finally(() => {
        if (!cancelled) setUserLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, mode, user]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const isEditMode = mode === "edit";
  const showRolesSection = isEditMode || canAssignRoles;
  const showLocationsSection = isEditMode || canAssignLocations;
  const groupsAvailable = !canAssignRoles || groups.length > 0;
  const locationsAvailable = !canAssignLocations || locations.length > 0;
  const canCreateGlobalLocationScope =
    !!currentUser?.is_superuser ||
    locations.some(location => location.parent_id === null && location.depth === 0);
  const requireLocationAssignment = (
    mode === "create"
      ? canAssignLocations && !selfAssignmentLocked
      : canAssignLocations && !canCreateGlobalLocationScope && !selfAssignmentLocked
  );
  const selectedGroups = useMemo(
    () => groups.filter(group => form.groups.includes(group.id)),
    [form.groups, groups],
  );
  const requiresStockEntryStoreAssignment = selectedGroups.some(group =>
    group.permissions_details.some(permission => permission.codename === "create_stock_entries")
  );
  const assignedLocationById = useMemo(
    () => new Map(locations.map(location => [location.id, location])),
    [locations],
  );
  const hasAssignedStore = form.locations.some(locationId => assignedLocationById.get(locationId)?.is_store);
  const errors = validate(form, touched, isEditMode, {
    requireLocation: requireLocationAssignment,
    requireStockEntryStore: requiresStockEntryStoreAssignment,
    hasAssignedStore,
  });
  const set = (patch: Partial<FormState>) => setForm(f => ({ ...f, ...patch }));
  const blur = (k: string) => setTouched(t => new Set(t).add(k));
  const canSave = !submitting && !userLoading && !userLoadError;
  const loadStatusMessage = (() => {
    if (userLoadError) return `User details failed to load: ${userLoadError}`;
    if (userLoading) return "Loading user details…";
    if (canAssignRoles) {
      if (dataLoadError.groups) return `Roles / groups failed to load: ${dataLoadError.groups} You can still save this user without role assignments.`;
      if (groupsLoading) return "Loading groups…";
      if (!groupsAvailable) return "No groups are available right now. You can still save this user without role assignments.";
    }
    if (canAssignLocations) {
      if (dataLoadError.locations) return `Locations failed to load: ${dataLoadError.locations} Existing assignments can still be saved unchanged.`;
      if (locationsLoading) return "Loading locations…";
      if (!locationsAvailable) return "No locations are available right now.";
    }
    return null;
  })();

  const suggestUsername = () => {
    if (touched.has("username")) return;
    const fn = form.first_name.trim().toLowerCase();
    const ln = form.last_name.trim().toLowerCase();
    if (fn && ln) set({ username: `${fn[0]}.${ln}` });
  };

  const submit = async () => {
    if (!canSave) return;
    const allTouched = new Set(["first_name","last_name","username","email","password"]);
    if (canAssignLocations) allTouched.add("locations");
    if (canAssignRoles) allTouched.add("groups");
    setTouched(allTouched);
    const errs = validate(form, allTouched, isEditMode, {
      requireLocation: requireLocationAssignment,
      requireStockEntryStore: requiresStockEntryStoreAssignment,
      hasAssignedStore,
    });
    if (Object.keys(errs).length > 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: Record<string, unknown> = {
        username: form.username,
        email: form.email,
        first_name: form.first_name,
        last_name: form.last_name,
        is_active: form.is_active,
      };

      if (canAssignLocations) {
        payload.assigned_locations = form.locations;
      }

      if (canAssignRoles) {
        payload.groups = form.groups;
      }

      if (!isEditMode || form.password.length > 0) {
        payload.password = form.password;
      }

      if (isEditMode && user) {
        await apiFetch(`/api/users/management/${user.id}/`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await apiFetch("/api/users/management/", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      await onSave?.();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : (isEditMode ? "Failed to update user." : "Failed to create user."));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal modal-lg" role="dialog" aria-modal="true" aria-labelledby="user-modal-title">
        {/* Header */}
        <header className="modal-head">
          <div>
            <div className="eyebrow">User Management · {isEditMode ? "Edit Record" : "New Record"}</div>
            <h2 id="user-modal-title">{isEditMode ? "Edit User" : "Add User"}</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <Ic d="M6 6l12 12M6 18L18 6" />
          </button>
        </header>

        {/* Body */}
        <div className="modal-body">
          {loadStatusMessage && (
            <div style={{ padding: "10px 14px", background: "var(--warning-weak)", border: "1px solid color-mix(in oklch, var(--warning) 30%, transparent)", borderRadius: "var(--radius)", color: "var(--text-1)", fontSize: 13, marginBottom: 16 }}>
              {loadStatusMessage}
            </div>
          )}
          {submitError && (
            <div style={{ padding: "10px 14px", background: "var(--danger-weak)", border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)", borderRadius: "var(--radius)", color: "var(--danger)", fontSize: 13, marginBottom: 16 }}>
              {submitError}
            </div>
          )}

          {/* 01 Identity */}
          <Section n={1} title="Identity" sub="Basic profile details for the account.">
            <div className="form-grid cols-2">
              <Field label="First name" required error={errors.first_name}>
                <input value={form.first_name} onChange={e => set({ first_name: e.target.value })} onBlur={() => { blur("first_name"); suggestUsername(); }} />
              </Field>
              <Field label="Last name" required error={errors.last_name}>
                <input value={form.last_name} onChange={e => set({ last_name: e.target.value })} onBlur={() => { blur("last_name"); suggestUsername(); }} />
              </Field>
              <Field label="Username" required error={errors.username} hint="Lowercase, dot-separated. Used for sign-in.">
                <div className="input-wrap">
                  <span className="input-prefix mono">@</span>
                  <input className="input-with-prefix" value={form.username} onChange={e => set({ username: e.target.value.toLowerCase() })} onBlur={() => blur("username")} />
                </div>
              </Field>
              <Field label="Password" required={!isEditMode} error={errors.password} hint={isEditMode ? "Leave blank to keep current password." : undefined}>
                <input
                  type="password"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={e => set({ password: e.target.value })}
                  onBlur={() => blur("password")}
                />
              </Field>
              <Field label="Email" required error={errors.email} span={2}>
                <input type="email" placeholder="name@example.com" value={form.email} onChange={e => set({ email: e.target.value })} onBlur={() => blur("email")} />
              </Field>
              <Field label="Account status" span={2}>
                <div className="seg seg-inline">
                  <button type="button" className={"seg-btn" + (form.is_active ? " active" : "")} onClick={() => set({ is_active: true })}>Active</button>
                  <button type="button" className={"seg-btn" + (!form.is_active ? " active" : "")} onClick={() => set({ is_active: false })}>Disabled</button>
                </div>
              </Field>
            </div>
          </Section>

          {/* 02 Select location */}
          {showLocationsSection && (
            <Section
              n={2}
              title="Select location"
              sub={canCreateGlobalLocationScope ? "Root scope can assign users anywhere." : "Assignments are limited to your location scope."}
            >
              <div className="location-section-layout" style={{ marginBottom: 14 }}>
                <div className="field location-section-intro" style={{ marginBottom: 0 }}>
                  <div className="field-label">Location assignment</div>
                  <div className="field-hint">
                    {selfAssignmentLocked
                      ? "Your own location assignments are locked."
                      : canAssignLocations
                      ? mode === "create"
                        ? "Select at least one standalone location, then choose any optional sub-locations under it."
                        : canCreateGlobalLocationScope
                          ? "Select standalone locations and optional sub-locations."
                          : "Select the standalone location first, then choose optional sub-locations under it."
                      : "You can view this user's assigned locations, but you need location-assignment permission to change them."}
                  </div>
                </div>
                {!canAssignLocations ? (
                  <div className="location-section-panel" style={{ padding: "12px 14px", border: "1px solid color-mix(in oklch, var(--border) 70%, transparent)", borderRadius: "var(--radius)", background: "var(--panel)", color: "var(--text-1)", fontSize: 13 }}>
                    {form.locations.length > 0
                      ? `${form.locations.length} location${form.locations.length === 1 ? "" : "s"} assigned.`
                      : "No locations assigned."}
                  </div>
                ) : dataLoadError.locations ? (
                  <div className="location-section-panel" style={{ padding: "12px 14px", border: "1px solid color-mix(in oklch, var(--warning) 30%, transparent)", borderRadius: "var(--radius)", background: "var(--warning-weak)", color: "var(--text-1)", fontSize: 13 }}>
                    Location options are unavailable right now. Existing assignments can still be saved unchanged.
                  </div>
                ) : locationsLoading ? (
                  <div className="location-section-panel" style={{ color: "var(--text-2)", fontSize: 13, padding: "12px 0" }}>Loading locations…</div>
                ) : !locationsAvailable ? (
                  <div className="location-section-panel" style={{ padding: "12px 14px", border: "1px solid color-mix(in oklch, var(--warning) 30%, transparent)", borderRadius: "var(--radius)", background: "var(--warning-weak)", color: "var(--text-1)", fontSize: 13 }}>
                    No locations are available right now.
                  </div>
                ) : (
                  <div className="location-section-panel">
                    <LocationScopePicker
                      locations={locations}
                      value={form.locations}
                      onChange={v => { set({ locations: v }); blur("locations"); }}
                      readOnly={selfAssignmentLocked}
                      autoSelectSingleStandalone={!isEditMode}
                    />
                    {requiresStockEntryStoreAssignment && !selfAssignmentLocked && (
                      <div className="field-hint" style={{ marginTop: 8 }}>
                        The selected stock-entry role requires a directly assigned store.
                      </div>
                    )}
                    {errors.locations && <div className="field-error" style={{ marginTop: 8 }}>{errors.locations}</div>}
                  </div>
                )}
              </div>
            </Section>
          )}

          {/* 03 Groups */}
          {showRolesSection && (
            <Section
              n={showLocationsSection ? 3 : 2}
              title="Roles / Groups"
              sub={selfAssignmentLocked ? "Your own assigned roles are locked." : "Pick one or more role bundles. Permissions accumulate across groups."}
            >
              {!canAssignRoles ? (
                <div style={{ padding: "12px 14px", border: "1px solid color-mix(in oklch, var(--border) 70%, transparent)", borderRadius: "var(--radius)", background: "var(--panel)", color: "var(--text-1)", fontSize: 13 }}>
                  {groups.length > 0
                    ? `${groups.filter(g => form.groups.includes(g.id)).length} role${groups.filter(g => form.groups.includes(g.id)).length === 1 ? "" : "s"} assigned.`
                    : form.groups.length > 0
                      ? `${form.groups.length} role${form.groups.length === 1 ? "" : "s"} assigned.`
                      : "No roles assigned."}
                </div>
              ) : dataLoadError.groups ? (
                <div style={{ padding: "12px 14px", border: "1px solid color-mix(in oklch, var(--warning) 30%, transparent)", borderRadius: "var(--radius)", background: "var(--warning-weak)", color: "var(--text-1)", fontSize: 13 }}>
                  Roles / groups are unavailable right now, so the user can still be saved without role assignments.
                </div>
              ) : groupsLoading ? (
                <div style={{ color: "var(--text-2)", fontSize: 13, padding: "12px 0" }}>Loading groups…</div>
              ) : !groupsAvailable ? (
                <div style={{ padding: "12px 14px", border: "1px solid color-mix(in oklch, var(--warning) 30%, transparent)", borderRadius: "var(--radius)", background: "var(--warning-weak)", color: "var(--text-1)", fontSize: 13 }}>
                  No groups are available right now. Leave roles empty to continue.
                </div>
              ) : (
                <div className={"group-grid" + (errors.groups ? " has-error" : "")}>
                  {groups.map(g => {
                    const checked = form.groups.includes(g.id);
                    const disabled = selfAssignmentLocked;
                    return (
                      <label key={g.id} className={"group-card" + (checked ? " selected" : "") + (disabled ? " disabled" : "")}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled}
                          onChange={e => {
                            if (disabled) return;
                            set({ groups: e.target.checked ? [...form.groups, g.id] : form.groups.filter(x => x !== g.id) });
                            blur("groups");
                          }}
                        />
                        <div className="group-card-body">
                          <div className="group-card-head">
                            <span className="group-card-name">{g.name}</span>
                            <span className="group-card-tier mono" style={{ fontSize: 11, color: "var(--text-2)" }}>
                              {g.permissions_details.length} perm{g.permissions_details.length !== 1 ? "s" : ""}
                            </span>
                          </div>
                          <div className="group-card-desc">
                            {g.permissions_details.slice(0, 3).map(p => p.name).join(" · ") || "No permissions assigned"}
                            {g.permissions_details.length > 3 && ` · +${g.permissions_details.length - 3} more`}
                          </div>
                        </div>
                      </label>
                    );
                  })}
                  {groups.length === 0 && (
                    <div style={{ color: "var(--text-2)", fontSize: 13, padding: "4px 0" }}>No groups found.</div>
                  )}
                </div>
              )}
              {errors.groups && <div className="field-error" style={{ marginTop: 8 }}>{errors.groups}</div>}
            </Section>
          )}
        </div>

        {/* Footer */}
        <footer className="modal-foot">
          <div className="modal-foot-meta mono">
            {userLoadError
              ? <span className="foot-err">Required data failed to load</span>
              : (canAssignRoles && dataLoadError.groups)
                ? <span className="foot-err">Role assignments unavailable</span>
                : canAssignRoles && groupsLoading
                  ? <span className="foot-err">Loading groups…</span>
                  : (canAssignLocations && dataLoadError.locations)
                    ? <span className="foot-err">Location assignments unavailable</span>
                    : canAssignLocations && locationsLoading
                      ? <span className="foot-err">Loading locations…</span>
                      : Object.keys(errors).length > 0
                          ? <span className="foot-err">{Object.keys(errors).length} issue{Object.keys(errors).length > 1 ? "s" : ""} to resolve</span>
                          : <span className="foot-ok">Ready to save</span>}
          </div>
          <div className="modal-foot-actions">
            <button type="button" className="btn btn-md" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-md btn-primary" onClick={submit} disabled={!canSave}>
              {submitting ? "Saving…" : isEditMode ? "Save changes" : "Save user"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
