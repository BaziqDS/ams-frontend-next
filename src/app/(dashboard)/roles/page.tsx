"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { apiFetch, type Page } from "@/lib/api";
import { relTime } from "@/lib/userUiShared";
import { useCapabilities, type CapabilityLevel, type ModuleDependencies } from "@/contexts/CapabilitiesContext";

export type { ModuleDependencies };

const Ic = ({ d, size = 16 }: { d: React.ReactNode | string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true" focusable="false">
    {typeof d === "string" ? <path d={d} /> : d}
  </svg>
);

interface PermissionDetail {
  id: number;
  name: string;
  codename: string;
  model: string;
}

type ModuleSelections = Record<string, CapabilityLevel | null>;
type DependencyMinimums = Record<string, CapabilityLevel>;

interface Role {
  id: number;
  name: string;
  permissions: number[];
  permissions_details?: PermissionDetail[];
  module_selections?: ModuleSelections;
  created_at?: string | null;
}

type RoleViewItem = {
  role: Role;
  permissions: PermissionDetail[];
  selections: ModuleSelections;
};

const MODULE_LABELS: Record<string, string> = {
  users: "User Accounts",
  roles: "Roles",
  locations: "Locations",
  categories: "Categories",
  items: "Items",
  "stock-entries": "Stock Entries",
  "stock-registers": "Stock Registers",
  inspections: "Inspections",
};

const LEVEL_DESCRIPTIONS: Record<CapabilityLevel, string> = {
  view: "Read-only access",
  manage: "Create and edit",
  full: "Create, edit, and delete",
};

const LEVEL_COLUMNS: Array<{
  key: CapabilityLevel | null;
  label: string;
  cellLabel: string;
  description: string;
}> = [
  { key: null, label: "None", cellLabel: "No access", description: "No access" },
  { key: "view", label: "View", cellLabel: "View", description: "Read-only access" },
  { key: "manage", label: "Manage", cellLabel: "Create and edit", description: "Create and edit" },
  { key: "full", label: "Full", cellLabel: "Create, edit, and delete", description: "Create, edit, and delete" },
];

const LEVEL_RANK: Record<CapabilityLevel, number> = { view: 1, manage: 2, full: 3 };
const LOCK_ICON_PATH = "M7 11V8a5 5 0 0 1 10 0v3M6 11h12v9H6z";

function formatModule(key: string) {
  return MODULE_LABELS[key] ?? key.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function formatLevel(level: CapabilityLevel | null | undefined) {
  if (!level) return "None";
  return level.charAt(0).toUpperCase() + level.slice(1);
}

export function getDependencyMinimums(
  selections: ModuleSelections,
  dependencies: ModuleDependencies,
): DependencyMinimums {
  const minimums: DependencyMinimums = {};
  for (const [module, level] of Object.entries(selections)) {
    if (!level) continue;
    const reads = dependencies[module]?.[level] ?? [];
    for (const dep of reads) {
      const existing = minimums[dep];
      if (!existing || LEVEL_RANK.view > LEVEL_RANK[existing]) {
        minimums[dep] = "view";
      }
    }
  }
  return minimums;
}

function getDependencySources(
  selections: ModuleSelections,
  dependencies: ModuleDependencies,
): Record<string, string[]> {
  const sources: Record<string, string[]> = {};
  for (const [module, level] of Object.entries(selections)) {
    if (!level) continue;
    const reads = dependencies[module]?.[level] ?? [];
    for (const dep of reads) {
      sources[dep] = [...(sources[dep] ?? []), module];
    }
  }
  return sources;
}

export function canSelectDependencyLevel(
  module: string,
  level: CapabilityLevel | null,
  minimums: DependencyMinimums,
) {
  const minimum = minimums[module];
  if (!minimum) return true;
  if (!level) return false;
  return LEVEL_RANK[level] >= LEVEL_RANK[minimum];
}

export function normalizeSelectionsForDependencies(
  selections: ModuleSelections,
  dependencies: ModuleDependencies,
): ModuleSelections {
  const next = { ...selections };
  const minimums = getDependencyMinimums(next, dependencies);
  for (const [module, minimum] of Object.entries(minimums)) {
    if (!canSelectDependencyLevel(module, next[module] ?? null, minimums)) {
      next[module] = minimum;
    }
  }
  return next;
}

function initialsFromName(name: string, fallback = "RO") {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return initials || fallback;
}

function Field({ label, required, error, hint, children }: {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={"field" + (error ? " has-error" : "")}>
      <div className="field-label">{label}{required && <span className="field-req">*</span>}</div>
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

function compactList(items: string[], max = 2) {
  const shown = items.slice(0, max);
  return { shown, rest: items.length - shown.length };
}

function csvEscape(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildRoleCsv(rows: RoleViewItem[]) {
  const headers = ["Role ID", "Role Name", "Module Assignments", "Permissions Count", "Permissions", "Codenames"];
  const lines = [headers.map(csvEscape).join(",")];

  rows.forEach(({ role, permissions, selections }) => {
    const moduleSummary = Object.entries(selections)
      .filter(([, level]) => !!level)
      .map(([module, level]) => `${formatModule(module)}: ${formatLevel(level)}`);
    const permissionNames = permissions.map(permission => permission.name);
    const codenames = permissions.map(permission => permission.codename);

    lines.push(
      [
        role.id,
        role.name,
        moduleSummary.join(" | "),
        permissions.length,
        permissionNames.join(" | "),
        codenames.join(" | "),
      ].map(csvEscape).join(","),
    );
  });

  return `\uFEFF${lines.join("\r\n")}`;
}

function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function ModuleSelectionSummary({ selections }: { selections: ModuleSelections }) {
  const assigned = Object.entries(selections).filter(([, level]) => !!level) as [string, CapabilityLevel][];
  if (assigned.length === 0) return <span className="muted-note">No modules granted</span>;
  const labels = assigned.map(([module, level]) => `${formatModule(module)} · ${formatLevel(level)}`);
  const { shown, rest } = compactList(labels);
  return (
    <div className="group-cell">
      {shown.map(label => <span key={label} className="chip">{label}</span>)}
      {rest > 0 && <span className="loc-more">+{rest}</span>}
    </div>
  );
}

function TimestampCell({ value, fallback }: { value: string | null | undefined; fallback: string }) {
  if (!value) {
    return <div className="login-cell"><div>{fallback}</div></div>;
  }

  return (
    <div className="login-cell">
      <div>{relTime(value)}</div>
      <div className="login-cell-sub mono">{new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</div>
    </div>
  );
}

function DensityToggle({ density, setDensity }: { density: "compact" | "balanced" | "comfortable"; setDensity: (density: "compact" | "balanced" | "comfortable") => void }) {
  return (
    <div className="seg">
      {(["compact", "balanced", "comfortable"] as const).map(option => (
        <button type="button" key={option} className={"seg-btn" + (density === option ? " active" : "")} onClick={() => setDensity(option)}>
          {option.charAt(0).toUpperCase() + option.slice(1)}
        </button>
      ))}
    </div>
  );
}

function RoleActions({
  onEdit,
  onDelete,
  canEdit,
  canDelete,
  disabled = false,
}: {
  onEdit: () => void;
  onDelete: () => void;
  canEdit: boolean;
  canDelete: boolean;
  disabled?: boolean;
}) {
  if (!canEdit && !canDelete) {
    return <span className="muted-note mono">No actions</span>;
  }

  return (
    <div className="row-actions">
      {canEdit && (
        <button type="button" className="btn btn-xs btn-ghost row-action" onClick={onEdit} title="Edit role" disabled={disabled}>
          <Ic d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" size={13} />
          <span className="ra-label">Edit</span>
        </button>
      )}
      {canDelete && (
        <button type="button" className="btn btn-xs btn-danger-ghost row-action" onClick={onDelete} title="Delete role" disabled={disabled}>
          <Ic d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0l1 12h6l1-12" size={13} />
          <span className="ra-label">Delete</span>
        </button>
      )}
    </div>
  );
}

function emptySelections(manifest: Record<string, CapabilityLevel[]>): ModuleSelections {
  return Object.fromEntries(Object.keys(manifest).map(module => [module, null]));
}

function mergeSelections(
  manifest: Record<string, CapabilityLevel[]>,
  roleSelections: ModuleSelections | undefined,
): ModuleSelections {
  const base = emptySelections(manifest);
  if (!roleSelections) return base;
  for (const [module, level] of Object.entries(roleSelections)) {
    if (module in base) base[module] = level ?? null;
  }
  return base;
}

function RoleModal({
  open,
  mode,
  role,
  manifest,
  dependencies,
  canAssignPermissions,
  onClose,
  onSave,
}: {
  open: boolean;
  mode: "create" | "edit";
  role: Role | null;
  manifest: Record<string, CapabilityLevel[]>;
  dependencies: ModuleDependencies;
  canAssignPermissions: boolean;
  onClose: () => void;
  onSave: () => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [selections, setSelections] = useState<ModuleSelections>({});
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(role?.name ?? "");
    setSelections(normalizeSelectionsForDependencies(
      mergeSelections(manifest, role?.module_selections),
      dependencies,
    ));
    setTouched(false);
    setSubmitting(false);
    setSubmitError(null);
  }, [open, role, manifest, dependencies]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const canSave = !!name.trim() && !submitting;
  const nameError = touched && !name.trim() ? "Role name is required." : null;
  const grantedCount = Object.values(selections).filter(Boolean).length;
  const moduleKeys = useMemo(() => Object.keys(manifest), [manifest]);
  const dependencyMinimums = useMemo(
    () => getDependencyMinimums(selections, dependencies),
    [selections, dependencies],
  );
  const dependencySources = useMemo(
    () => getDependencySources(selections, dependencies),
    [selections, dependencies],
  );
  const readyNote = canAssignPermissions
    ? moduleKeys.length === 0
      ? "No modules available in capability manifest."
      : grantedCount > 0
        ? `${grantedCount} module${grantedCount === 1 ? "" : "s"} granted`
        : "No modules granted"
    : mode === "edit"
      ? "Permission editing is unavailable for your account."
      : "Creating a name-only role.";

  const setModuleLevel = (module: string, level: CapabilityLevel | null) => {
    setSelections(prev => normalizeSelectionsForDependencies(
      { ...prev, [module]: level },
      dependencies,
    ));
  };

  const submit = async () => {
    setTouched(true);
    setSubmitError(null);
    if (!name.trim()) return;

    setSubmitting(true);
    try {
      const payload: { name: string; module_selections?: ModuleSelections } = { name: name.trim() };
      if (canAssignPermissions) {
        payload.module_selections = selections;
      }
      const body = JSON.stringify(payload);
      if (mode === "edit" && role) {
        await apiFetch(`/api/users/groups/${role.id}/`, { method: "PATCH", body });
      } else {
        await apiFetch("/api/users/groups/", { method: "POST", body });
      }
      await onSave();
      onClose();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save role");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal modal-lg">
        <div className="modal-head">
          <div>
            <div className="eyebrow">Administration</div>
            <h2>{mode === "edit" ? "Edit Role" : "Create Role"}</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close modal">
            <Ic d="M18 6L6 18M6 6l12 12" size={14} />
          </button>
        </div>
        <div className="modal-body">
          <Section n={1} title="Role Details" sub="Use a clear reusable label such as Department Editor or Procurement Viewer.">
            <Field label="Role name" required error={nameError ?? undefined}>
              <input value={name} onChange={e => setName(e.target.value)} onBlur={() => setTouched(true)} placeholder="Enter role name" />
            </Field>
          </Section>

          {canAssignPermissions ? (
            <Section n={2} title="Module Access" sub="Pick one level per module. Cross-module reads (e.g. locations when granting user management) are applied automatically.">
              {moduleKeys.length === 0 ? (
                <div style={{ color: "var(--muted)", fontSize: 13, padding: "8px 0" }}>No modules available in the capability manifest.</div>
              ) : (
                <div className="module-access-table-wrap">
                  <div className="h-scroll module-access-table-scroll">
                    <table className="module-access-table" role="grid">
                      <thead>
                        <tr>
                          <th scope="col" className="module-access-module-col">Module</th>
                          {LEVEL_COLUMNS.map(column => (
                            <th key={column.label} scope="col" className="module-access-level-col">
                              <div className="module-access-head-cell">
                                <span>{column.label}</span>
                                <span
                                  className="module-access-tooltip-trigger"
                                  tabIndex={0}
                                  aria-label={`${column.label}: ${column.description}`}
                                >
                                  <Ic d={<><circle cx="12" cy="12" r="8.5" /><path d="M12 10.5v5" /><path d="M12 7.3h.01" /></>} size={12} />
                                  <span className="module-access-tooltip" role="tooltip">{column.description}</span>
                                </span>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {moduleKeys.map(module => {
                          const levels = manifest[module];
                          const current = selections[module] ?? null;
                          const dependencyMinimum = dependencyMinimums[module];
                          const dependencySourceLabels = (dependencySources[module] ?? []).map(formatModule);
                          const dependencyTitle = dependencyMinimum
                            ? `${formatModule(module)} must stay at ${formatLevel(dependencyMinimum)} or higher because it is required by ${dependencySourceLabels.join(", ")}.`
                            : undefined;
                          return (
                            <tr key={module}>
                              <th scope="row" className="module-access-module-cell">
                                <div className="module-access-module-inline">
                                  <div className="module-access-module-name">{formatModule(module)}</div>
                                  <span className="module-access-module-key mono">{module}</span>
                                  {dependencyMinimum && (
                                    <span className="module-access-dependency-note" title={dependencyTitle}>
                                      <Ic d={LOCK_ICON_PATH} size={11} />
                                      Required by {dependencySourceLabels.join(", ")}
                                    </span>
                                  )}
                                </div>
                              </th>
                              {LEVEL_COLUMNS.map(column => {
                                const level = column.key;
                                const available = level === null || levels.includes(level);
                                const allowedByDependency = canSelectDependencyLevel(module, level, dependencyMinimums);
                                const checked = current === level;
                                const id = `mod-${module}-${level ?? "none"}`;

                                return (
                                  <td key={id} className="module-access-option-cell">
                                    {available ? (
                                      <label
                                        htmlFor={id}
                                        className={
                                          "module-access-option"
                                          + (checked ? " selected" : "")
                                          + (!allowedByDependency ? " dependency-locked" : "")
                                        }
                                        title={!allowedByDependency ? dependencyTitle : undefined}
                                      >
                                        <input
                                          id={id}
                                          type="radio"
                                          name={`module-${module}`}
                                          checked={checked}
                                          disabled={!allowedByDependency}
                                          onChange={() => setModuleLevel(module, level)}
                                          aria-label={`${formatModule(module)} ${column.label}`}
                                        />
                                        <span className="module-access-option-label">{column.cellLabel}</span>
                                      </label>
                                    ) : (
                                      <div className="module-access-option unavailable" aria-hidden="true">
                                        <span className="module-access-option-na">—</span>
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Section>
          ) : (
            <Section n={2} title="Module Access" sub="Permission assignment is unavailable for your account.">
              <div style={{ color: "var(--muted)", fontSize: 13 }}>This role will be saved without a permission set.</div>
            </Section>
          )}
        </div>
        <footer className="modal-foot">
          <div className="modal-foot-meta mono">{submitError ? <span className="foot-err">{submitError}</span> : <span className="foot-ok">{readyNote}</span>}</div>
          <div className="modal-foot-actions">
            <button type="button" className="btn btn-md" onClick={onClose}>Cancel</button>
            <button type="button" className="btn btn-md btn-primary" onClick={submit} disabled={!canSave}>{submitting ? "Saving…" : mode === "edit" ? "Save changes" : "Create role"}</button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default function RolesPage() {
  const router = useRouter();
  const { can, manifest, dependencies, isLoading: capsLoading } = useCapabilities();

  const canViewRoles = can("roles", "view");
  const canAddRole = can("roles", "manage");
  const canChangeRole = can("roles", "manage");
  const canDeleteRole = can("roles", "full");
  const canAssignPermissions = can("roles", "manage");

  const [roles, setRoles] = useState<Role[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [density, setDensity] = useState<"compact" | "balanced" | "comfortable">("balanced");
  const [mode, setMode] = useState<"table" | "grid">("table");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [busyRoleId, setBusyRoleId] = useState<number | null>(null);

  const loadRoles = useCallback(async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
    if (showLoading) setIsLoading(true);
    setFetchError(null);
    try {
      const data = await apiFetch<Page<Role> | Role[]>("/api/users/groups/");
      setRoles(Array.isArray(data) ? data : data.results);
      return true;
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load roles");
      return false;
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (capsLoading) return;
    if (!canViewRoles) {
      router.replace("/403");
      return;
    }
    loadRoles();
  }, [capsLoading, canViewRoles, router, loadRoles]);

  const handleSave = useCallback(async () => {
    const refreshed = await loadRoles({ showLoading: false });
    if (!refreshed) {
      setActionError("Role saved, but the list could not be refreshed. Reload to resync the list.");
    }
  }, [loadRoles]);

  const handleDelete = useCallback(async (role: Role) => {
    if (busyRoleId !== null) return;
    const confirmed = window.confirm(`Delete ${role.name}? This cannot be undone.`);
    if (!confirmed) return;

    setBusyRoleId(role.id);
    setActionError(null);
    try {
      await apiFetch(`/api/users/groups/${role.id}/`, { method: "DELETE" });
      setRoles(prev => prev.filter(item => item.id !== role.id));
      const refreshed = await loadRoles({ showLoading: false });
      if (!refreshed) {
        setActionError("Role deleted, but the list could not be refreshed. The row has been removed locally; reload to resync.");
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete role");
    } finally {
      setBusyRoleId(null);
    }
  }, [busyRoleId, loadRoles]);

  const filteredRoleItems = useMemo<RoleViewItem[]>(() => {
    const q = search.trim().toLowerCase();
    return roles
      .map(role => ({
        role,
        permissions: role.permissions_details ?? [],
        selections: mergeSelections(manifest, role.module_selections),
      }))
      .filter(({ role, permissions, selections }) => {
        if (!q) return true;
        const moduleText = Object.entries(selections)
          .filter(([, level]) => !!level)
          .map(([module, level]) => `${formatModule(module)} ${module} ${formatLevel(level)}`)
          .join(" ");
        const permissionText = permissions.map(permission => `${permission.name} ${permission.codename} ${permission.model}`).join(" ");
        const hay = `${role.name} ${moduleText} ${permissionText}`.toLowerCase();
        return hay.includes(q);
      });
  }, [manifest, roles, search]);

  const handleExport = useCallback(() => {
    downloadCsv("roles-export.csv", buildRoleCsv(filteredRoleItems));
  }, [filteredRoleItems]);

  return (
    <div data-density={density}>
      <RoleModal
        open={modalOpen || editingRole !== null}
        mode={editingRole ? "edit" : "create"}
        role={editingRole}
        manifest={manifest}
        dependencies={dependencies}
        canAssignPermissions={canAssignPermissions}
        onClose={() => { setModalOpen(false); setEditingRole(null); }}
        onSave={handleSave}
      />
      <Topbar breadcrumb={["Administration", "Role Management"]} />
      <div className="page">
        {fetchError && <div style={{ padding: "12px 16px", background: "var(--danger-weak)", border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)", borderRadius: "var(--radius)", color: "var(--danger)", fontSize: 13, marginBottom: 16 }}>{fetchError}</div>}
        {actionError && <div style={{ padding: "12px 16px", background: "var(--danger-weak)", border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)", borderRadius: "var(--radius)", color: "var(--danger)", fontSize: 13, marginBottom: 16 }}>{actionError}</div>}
        {isLoading && <div style={{ padding: "32px 0", textAlign: "center", color: "var(--muted)", fontSize: 13 }}>Loading roles…</div>}

        <div className="page-head">
          <div className="page-title-group">
            <div className="eyebrow">Administration</div>
            <h1>Role Management</h1>
            <div className="page-sub">Create reusable permission bundles, search them quickly, and keep access rules aligned with the dashboard.</div>
          </div>
        </div>

        <div className="filter-bar">
          <div className="filter-bar-left">
            <div className="search-input">
              <Ic d={<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>} size={14} />
              <input placeholder="Search roles or module assignments…" value={search} onChange={e => setSearch(e.target.value)} />
              {search && <button type="button" className="clear-search" onClick={() => setSearch("")}>×</button>}
            </div>
          </div>
          <div className="filter-bar-right">
            <DensityToggle density={density} setDensity={setDensity} />
            <div className="seg" title="View mode">
              <button type="button" className={"seg-btn icon-only" + (mode === "table" ? " active" : "")} onClick={() => setMode("table")} title="Table">
                <Ic d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" size={14} />
              </button>
              <button type="button" className={"seg-btn icon-only" + (mode === "grid" ? " active" : "")} onClick={() => setMode("grid")} title="Grid">
                <Ic d={<><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></>} size={14} />
              </button>
            </div>
            <button type="button" className="btn btn-sm" onClick={handleExport}>
              <Ic d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" size={13} />
              Export
            </button>
              {canAddRole && (
                <button type="button" className="btn btn-sm btn-primary" onClick={() => setModalOpen(true)}>
                  <Ic d="M12 5v14M5 12h14" size={14} />
                  Add Role
                </button>
              )}
          </div>
        </div>

        {mode === "table" ? (
          <div className="table-card">
            <div className="table-card-head">
              <div className="table-card-head-left">
                <div className="eyebrow">Roles list</div>
                <div className="table-count"><span className="mono">{filteredRoleItems.length}</span><span>of</span><span className="mono">{roles.length}</span><span>roles</span></div>
              </div>
            </div>
            <div className="h-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Modules</th>
                    <th>Created At</th>
                    <th>Module Assignments</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRoleItems.length > 0 ? filteredRoleItems.map(({ role, selections }) => {
                    const grantedCount = Object.values(selections).filter(Boolean).length;
                    return (
                      <tr key={role.id}>
                        <td>
                          <div className="user-cell">
                            <div className="avatar" style={{ width: 32, height: 32, fontSize: 11, background: "linear-gradient(135deg, color-mix(in oklch, var(--primary) 82%, white), var(--primary))" }}>
                              {initialsFromName(role.name)}
                            </div>
                            <div>
                              <div className="user-name">{role.name}</div>
                              <div className="user-username mono">ID {role.id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="mono">{grantedCount}</td>
                        <td><TimestampCell value={role.created_at} fallback="—" /></td>
                        <td><ModuleSelectionSummary selections={selections} /></td>
                        <td className="col-actions">
                          <RoleActions
                            onEdit={() => { if (canChangeRole) setEditingRole(role); }}
                            onDelete={() => { if (canDeleteRole) handleDelete(role); }}
                            canEdit={canChangeRole}
                            canDelete={canDeleteRole}
                            disabled={busyRoleId !== null}
                          />
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={5}>
                        <div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>{isLoading ? "Loading roles…" : "No roles match your search."}</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="table-card-foot">
              <div className="eyebrow">{roles.length} total roles</div>
              <div className="pager"><span className="mono pager-current">Grouped by module</span></div>
            </div>
          </div>
        ) : filteredRoleItems.length > 0 ? (
          <div className="users-grid">
            {filteredRoleItems.map(({ role, selections }) => {
              const grantedCount = Object.values(selections).filter(Boolean).length;
              return (
                <div key={role.id} className="user-card">
                  <div className="user-card-head">
                    <div className="user-cell">
                      <div className="avatar" style={{ width: 44, height: 44, fontSize: 12, background: "linear-gradient(135deg, color-mix(in oklch, var(--primary) 82%, white), var(--primary))" }}>
                        {initialsFromName(role.name)}
                      </div>
                      <div>
                        <div className="user-name">{role.name}</div>
                        <div className="user-username mono">ID {role.id}</div>
                      </div>
                    </div>
                    <span className="pill pill-neutral">
                      <span className="status-dot" />
                      <span className="mono">{grantedCount}</span> modules
                    </span>
                  </div>
                  <div className="user-card-section">
                    <div className="eyebrow">Created At</div>
                    <TimestampCell value={role.created_at} fallback="—" />
                  </div>
                  <div className="user-card-section">
                    <div className="eyebrow">Module Assignments</div>
                    <ModuleSelectionSummary selections={selections} />
                  </div>
                  <div className="user-card-foot">
                    <div>
                      <div className="eyebrow">Module count</div>
                      <div className="user-card-last mono">{grantedCount} granted</div>
                    </div>
                    <RoleActions
                      onEdit={() => { if (canChangeRole) setEditingRole(role); }}
                      onDelete={() => { if (canDeleteRole) handleDelete(role); }}
                      canEdit={canChangeRole}
                      canDelete={canDeleteRole}
                      disabled={busyRoleId !== null}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="table-card">
            <div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>{isLoading ? "Loading roles…" : "No roles match your search."}</div>
          </div>
        )}
      </div>
    </div>
  );
}
