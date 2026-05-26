"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { LocationScopePicker } from "@/components/AddUserModal";
import { ListPagination } from "@/components/ListPagination";
import { ThemedSelect } from "@/components/ThemedSelect";
import { apiFetch, type Page } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { ADMIN_PERMISSIONS } from "@/lib/adminPermissions";
import { useClientPagination } from "@/lib/listPagination";

type Density = "compact" | "balanced" | "comfortable";
type ViewMode = "table" | "grid";

interface LocationOption {
  id: number;
  name: string;
  code: string;
  kind: string;
  parent_id: number | null;
  depth: number;
  asset_count: number;
  item_count: number;
  custodian: string;
  is_active: boolean;
  is_standalone: boolean;
  is_store: boolean;
}

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

interface Employee {
  id: number;
  perse_number: string | null;
  name: string;
  designation: string | null;
  department: string | null;
  standalone_locations: number[];
  standalone_locations_display: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

type EmployeeForm = {
  perse_number: string;
  name: string;
  designation: string;
  standalone_locations: number[];
  is_active: boolean;
};

const EMPTY_FORM: EmployeeForm = {
  perse_number: "",
  name: "",
  designation: "",
  standalone_locations: [],
  is_active: true,
};

const PAGE_SIZE = 12;

function getFixedStandaloneLocationIds(locations: LocationOption[]): number[] {
  const hasRootScope = locations.some(location => location.parent_id === null && location.depth === 0);
  const standaloneLocations = locations.filter(location => location.is_standalone);
  if (!hasRootScope && standaloneLocations.length === 1) {
    return [standaloneLocations[0].id];
  }
  return [];
}

export function buildEmployeeForm(employee: Employee | null, locations: LocationOption[]): EmployeeForm {
  if (employee) {
    return {
      perse_number: employee.perse_number ?? "",
      name: employee.name ?? "",
      designation: employee.designation ?? "",
      standalone_locations: employee.standalone_locations ?? [],
      is_active: employee.is_active,
    };
  }

  return {
    ...EMPTY_FORM,
    standalone_locations: getFixedStandaloneLocationIds(locations),
  };
}

const Ic = ({ d, size = 16 }: { d: React.ReactNode | string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true" focusable="false">
    {typeof d === "string" ? <path d={d} /> : d}
  </svg>
);

function normalizeList<T>(payload: Page<T> | T[]): T[] {
  return Array.isArray(payload) ? payload : payload.results ?? [];
}

function mapLocation(location: ApiLocation): LocationOption {
  const kindMap: Record<string, string> = {
    DEPARTMENT: "Dept", BUILDING: "Bldg", STORE: "Store",
    ROOM: "Room", LAB: "Lab", JUNKYARD: "Junkyard",
    OFFICE: "Office", AV_HALL: "AV Hall", AUDITORIUM: "Auditorium", OTHER: "Other",
  };
  return {
    id: location.id,
    name: location.name,
    code: location.code,
    kind: kindMap[location.location_type] ?? location.location_type,
    parent_id: location.parent_location,
    depth: location.hierarchy_level,
    asset_count: 0,
    item_count: 0,
    custodian: "",
    is_active: location.is_active,
    is_standalone: location.is_standalone,
    is_store: location.is_store,
  };
}

function DensityToggle({ density, setDensity }: { density: Density; setDensity: (value: Density) => void }) {
  return (
    <div className="seg">
      {(["compact", "balanced", "comfortable"] as const).map(value => (
        <button key={value} type="button" className={"seg-btn" + (density === value ? " active" : "")} onClick={() => setDensity(value)}>
          {value.charAt(0).toUpperCase() + value.slice(1)}
        </button>
      ))}
    </div>
  );
}

function ViewToggle({ viewMode, setViewMode }: { viewMode: ViewMode; setViewMode: (value: ViewMode) => void }) {
  return (
    <div className="seg">
      <button type="button" className={"seg-btn icon-only" + (viewMode === "table" ? " active" : "")} onClick={() => setViewMode("table")} title="Table view" aria-label="Table view">
        <Ic d="M4 6h16M4 12h16M4 18h16" size={14} />
      </button>
      <button type="button" className={"seg-btn icon-only" + (viewMode === "grid" ? " active" : "")} onClick={() => setViewMode("grid")} title="Grid view" aria-label="Grid view">
        <Ic d={<><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/></>} size={14} />
      </button>
    </div>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span className={"pill " + (active ? "pill-success" : "pill-neutral")}>
      <span className={"status-dot " + (active ? "active" : "inactive")} />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function LocationChips({ labels, max = 2 }: { labels: string[]; max?: number }) {
  if (!labels.length) return <span className="muted-note">No assigned unit</span>;
  const shown = labels.slice(0, max);
  const rest = labels.length - shown.length;
  return (
    <div className="loc-chips">
      {shown.map(label => <span key={label} className="chip chip-loc">{label}</span>)}
      {rest > 0 ? <span className="loc-more">+{rest}</span> : null}
    </div>
  );
}

function EmployeeModal({
  employee,
  locations,
  isOpen,
  isSaving,
  error,
  onClose,
  onSave,
}: {
  employee: Employee | null;
  locations: LocationOption[];
  isOpen: boolean;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (form: EmployeeForm) => Promise<void>;
}) {
  const [form, setForm] = useState<EmployeeForm>(EMPTY_FORM);

  useEffect(() => {
    if (!isOpen) return;
    setForm(buildEmployeeForm(employee, locations));
  }, [employee, isOpen, locations]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isSaving) onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, isSaving, onClose]);

  if (!isOpen) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    await onSave(form);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !isSaving) onClose(); }}>
      <form className="modal modal-lg" onSubmit={submit}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">{employee ? "Edit employee" : "New employee"}</div>
            <h2>{employee ? employee.name : "Add Employee"}</h2>
          </div>
          <button type="button" className="btn btn-sm btn-ghost" onClick={onClose} disabled={isSaving} aria-label="Close">
            <Ic d="M18 6L6 18M6 6l12 12" />
          </button>
        </div>
        <div className="modal-body">
          {error ? <div className="error-banner">{error}</div> : null}
          <section className="form-section">
            <div className="form-section-head">
              <span className="form-section-n">01</span>
              <div>
                <h3>Employee identity</h3>
                <p className="form-section-sub">Record the university employee who can receive issued assets.</p>
              </div>
            </div>
            <div className="form-section-body form-grid cols-2">
              <label className="field">
                <span className="field-label">Name</span>
                <input value={form.name} onChange={event => setForm(prev => ({ ...prev, name: event.target.value }))} required placeholder="Dr. Ahmed Khan" />
              </label>
              <label className="field">
                <span className="field-label">PERSE Number</span>
                <input value={form.perse_number} onChange={event => setForm(prev => ({ ...prev, perse_number: event.target.value }))} required placeholder="PERSE-000123" />
              </label>
              <label className="field">
                <span className="field-label">Designation</span>
                <input value={form.designation} onChange={event => setForm(prev => ({ ...prev, designation: event.target.value }))} placeholder="Professor" />
              </label>
              <label className="field employee-check-field">
                <span className="field-label">Status</span>
                <span className="employee-switch-row">
                  <input type="checkbox" checked={form.is_active} onChange={event => setForm(prev => ({ ...prev, is_active: event.target.checked }))} />
                  <span>Active employee record</span>
                </span>
              </label>
            </div>
          </section>
          <section className="form-section">
            <div className="form-section-head">
              <span className="form-section-n">02</span>
              <div>
                <h3>Location scope</h3>
                <p className="form-section-sub">Employees are visible only through their standalone unit assignments.</p>
              </div>
            </div>
            <div className="form-section-body">
              <LocationScopePicker
                locations={locations}
                value={form.standalone_locations}
                onChange={next => setForm(prev => ({ ...prev, standalone_locations: next }))}
                autoSelectSingleStandalone
              />
            </div>
          </section>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn" onClick={onClose} disabled={isSaving}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={isSaving || !form.name.trim() || !form.perse_number.trim()}>
            {isSaving ? "Saving..." : employee ? "Save Changes" : "Create Employee"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function EmployeesPage() {
  const router = useRouter();
  const { can, isLoading: authLoading } = useAuth();
  const canView = can(ADMIN_PERMISSIONS.employees.view);
  const canAdd = can(ADMIN_PERMISSIONS.employees.add);
  const canChange = can(ADMIN_PERMISSIONS.employees.change);
  const canDelete = can(ADMIN_PERMISSIONS.employees.delete);

  const [employees, setEmployees] = useState<Employee[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalEmployee, setModalEmployee] = useState<Employee | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [density, setDensity] = useState<Density>("balanced");
  const [viewMode, setViewMode] = useState<ViewMode>("table");

  useEffect(() => {
    if (!authLoading && !canView) router.replace("/403");
  }, [authLoading, canView, router]);

  const load = useCallback(async () => {
    if (!canView) return;
    setIsLoading(true);
    setFetchError(null);
    try {
      const [employeePayload, locationPayload] = await Promise.all([
        apiFetch<Page<Employee> | Employee[]>("/api/inventory/employees/?page_size=500"),
        apiFetch<Page<ApiLocation> | ApiLocation[]>("/api/inventory/locations/assignable/"),
      ]);
      setEmployees(normalizeList(employeePayload));
      setLocations(
        normalizeList(locationPayload)
          .filter(location => location.is_active && location.is_standalone)
          .map(mapLocation)
      );
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : "Unable to load employees.");
    } finally {
      setIsLoading(false);
    }
  }, [canView]);

  useEffect(() => {
    if (!authLoading) void load();
  }, [authLoading, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return employees.filter(employee => {
      if (statusFilter === "active" && !employee.is_active) return false;
      if (statusFilter === "inactive" && employee.is_active) return false;
      if (!q) return true;
      const hay = [
        employee.name,
        employee.perse_number,
        employee.designation,
        employee.department,
        ...(employee.standalone_locations_display ?? []),
      ].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [employees, search, statusFilter]);

  const pager = useClientPagination(filtered, PAGE_SIZE);

  const openCreate = () => {
    setModalError(null);
    setModalEmployee(null);
    setIsModalOpen(true);
  };

  const openEdit = (employee: Employee) => {
    setModalError(null);
    setModalEmployee(employee);
    setIsModalOpen(true);
  };

  const saveEmployee = async (form: EmployeeForm) => {
    setIsSaving(true);
    setModalError(null);
    const payload = {
      ...form,
      perse_number: form.perse_number.trim(),
      designation: form.designation.trim() || null,
    };
    try {
      let saved: Employee;
      if (modalEmployee) {
        saved = await apiFetch<Employee>(`/api/inventory/employees/${modalEmployee.id}/`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        saved = await apiFetch<Employee>("/api/inventory/employees/", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setEmployees(prev => [
        saved,
        ...prev.filter(employee => employee.id !== saved.id),
      ]);
      setSearch("");
      setStatusFilter("all");
      setIsModalOpen(false);
      await load();
    } catch (error) {
      setModalError(error instanceof Error ? error.message : "Unable to save employee.");
    } finally {
      setIsSaving(false);
    }
  };

  const deleteEmployee = async (employee: Employee) => {
    if (!window.confirm(`Delete employee record for ${employee.name}?`)) return;
    setBusyId(employee.id);
    setActionError(null);
    try {
      await apiFetch<void>(`/api/inventory/employees/${employee.id}/`, { method: "DELETE" });
      await load();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to delete employee.");
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (employee: Employee) => {
    setBusyId(employee.id);
    setActionError(null);
    try {
      await apiFetch<Employee>(`/api/inventory/employees/${employee.id}/`, {
        method: "PATCH",
        body: JSON.stringify({ is_active: !employee.is_active }),
      });
      await load();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Unable to update employee.");
    } finally {
      setBusyId(null);
    }
  };

  if (authLoading || (!canView && !authLoading)) {
    return (
      <>
        <Topbar breadcrumb={["Administration", "Employees"]} />
        <main className="page"><div className="empty-state">Checking access...</div></main>
      </>
    );
  }

  return (
    <>
      <Topbar breadcrumb={["Administration", "Employees"]} />
      <main className="page" data-density={density}>
        {(fetchError || actionError) ? <div className="error-banner">{fetchError ?? actionError}</div> : null}
        <div className="page-head">
          <div className="page-title-group">
            <div className="eyebrow">Administration</div>
            <h1>Employees</h1>
            <p className="page-sub">Maintain the university employees who can receive issued inventory items.</p>
          </div>
        </div>

        <div className="filter-bar employees-filter-bar">
          <div className="filter-bar-left">
            <div className="search-input employees-search-input">
              <Ic d={<><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>} size={14} />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by name, PERSE number, designation, or unit..." />
              {search && <button type="button" className="clear-search" onClick={() => setSearch("")}>x</button>}
            </div>
            <div className="filter-select-group">
              <div className="chip-filter-label">Status</div>
              <div className="filter-select-wrap">
                <ThemedSelect
                  value={statusFilter}
                  onChange={setStatusFilter}
                  size="compact"
                  ariaLabel="Filter employees by status"
                  options={[
                    { value: "all", label: "All statuses" },
                    { value: "active", label: "Active" },
                    { value: "inactive", label: "Inactive" },
                  ]}
                />
              </div>
            </div>
          </div>
          <div className="filter-bar-right">
            <DensityToggle density={density} setDensity={setDensity} />
            <ViewToggle viewMode={viewMode} setViewMode={setViewMode} />
            <button type="button" className="btn btn-sm" disabled title="Export unavailable in this build" style={{ opacity: 0.55, cursor: "not-allowed" }}>
              <Ic d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" size={13} />
              Export
            </button>
            {canAdd ? (
              <button type="button" className="btn btn-sm btn-primary" onClick={openCreate}>
                <Ic d="M12 5v14M5 12h14" size={14} />
                Add Employee
              </button>
            ) : null}
          </div>
        </div>

        {viewMode === "table" ? (
          <div className="table-card">
            <div className="table-card-head">
              <div className="table-card-head-left">
                <div className="eyebrow">Employees list</div>
                <div className="table-count">
                  <span className="mono">{filtered.length}</span>
                  <span>of</span>
                  <span className="mono">{employees.length}</span>
                  <span>employees</span>
                </div>
              </div>
            </div>
            <div className="h-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>PERSE Number</th>
                    <th>Designation</th>
                    <th>Department</th>
                    <th>Assigned Units</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={7}><div className="empty-state">Loading employees...</div></td></tr>
                  ) : pager.pageItems.length === 0 ? (
                    <tr><td colSpan={7}><div className="empty-state">No employees found.</div></td></tr>
                  ) : pager.pageItems.map(employee => (
                    <tr key={employee.id}>
                      <td className="col-user">
                        <div className="user-cell">
                          <div>
                            <div className="user-name">{employee.name}</div>
                            <div className="user-username mono">#{employee.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="mono">{employee.perse_number || <span className="muted-note">Missing</span>}</td>
                      <td>{employee.designation || <span className="muted-note">Not set</span>}</td>
                      <td>{employee.department || <span className="muted-note">Not set</span>}</td>
                      <td><LocationChips labels={employee.standalone_locations_display ?? []} /></td>
                      <td><StatusPill active={employee.is_active} /></td>
                      <td className="col-actions">
                        <div className="row-actions">
                          {canChange ? (
                            <button type="button" className="btn btn-xs btn-ghost row-action" onClick={() => openEdit(employee)} disabled={busyId === employee.id}>
                              <Ic d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" size={13} />
                              <span className="ra-label">Edit</span>
                            </button>
                          ) : null}
                          {canChange ? (
                            <button type="button" className="btn btn-xs btn-ghost row-action" onClick={() => toggleActive(employee)} disabled={busyId === employee.id}>
                              <Ic d="M18.36 6.64A9 9 0 015.64 19.36M23 12a11 11 0 11-22 0 11 11 0 0122 0z" size={13} />
                              <span className="ra-label">{employee.is_active ? "Disable" : "Enable"}</span>
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button type="button" className="btn btn-xs btn-ghost row-action btn-danger-ghost" onClick={() => deleteEmployee(employee)} disabled={busyId === employee.id}>
                              <Ic d="M3 6h18M8 6V4h8v2M10 11v6M14 11v6M5 6l1 16h12l1-16" size={13} />
                              <span className="ra-label">Delete</span>
                            </button>
                          ) : null}
                          {!canChange && !canDelete ? <span className="muted-note mono">No actions</span> : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ListPagination
              summary={filtered.length === 0 ? "Showing 0 employees" : `Showing ${pager.pageStart}-${pager.pageEnd} of ${filtered.length} employees`}
              page={pager.page}
              totalPages={pager.totalPages}
              onPrev={() => pager.setPage(current => Math.max(1, current - 1))}
              onNext={() => pager.setPage(current => Math.min(pager.totalPages, current + 1))}
            />
          </div>
        ) : (
          <div className="users-grid">
            {isLoading ? <div className="empty-state">Loading employees...</div> : null}
            {!isLoading && pager.pageItems.length === 0 ? <div className="empty-state">No employees found.</div> : null}
            {pager.pageItems.map(employee => (
              <article key={employee.id} className="user-card">
                <div className="user-card-head">
                  <div>
                    <div className="user-card-name">{employee.name}</div>
                    <div className="user-card-eid mono">{employee.perse_number || "Missing PERSE number"}</div>
                  </div>
                  <StatusPill active={employee.is_active} />
                </div>
                <div className="user-card-section">
                  <div className="eyebrow">Department</div>
                  <div className="user-card-last">{employee.department || "No department recorded"}</div>
                </div>
                <div className="user-card-section">
                  <div className="eyebrow">Assigned units</div>
                  <LocationChips labels={employee.standalone_locations_display ?? []} max={3} />
                </div>
                <div className="user-card-foot">
                  <div className="muted-note mono">{employee.designation || "No designation"}</div>
                  <div className="row-actions">
                    {canChange ? <button type="button" className="btn btn-xs btn-ghost row-action" onClick={() => openEdit(employee)} disabled={busyId === employee.id}>Edit</button> : null}
                    {canDelete ? <button type="button" className="btn btn-xs btn-ghost row-action btn-danger-ghost" onClick={() => deleteEmployee(employee)} disabled={busyId === employee.id}>Delete</button> : null}
                  </div>
                </div>
              </article>
            ))}
            {!isLoading && pager.pageItems.length > 0 ? (
              <ListPagination
                summary={`Showing ${pager.pageStart}-${pager.pageEnd} of ${filtered.length} employees`}
                page={pager.page}
                totalPages={pager.totalPages}
                onPrev={() => pager.setPage(current => Math.max(1, current - 1))}
                onNext={() => pager.setPage(current => Math.min(pager.totalPages, current + 1))}
                standalone
              />
            ) : null}
          </div>
        )}
      </main>
      <EmployeeModal
        employee={modalEmployee}
        locations={locations}
        isOpen={isModalOpen}
        isSaving={isSaving}
        error={modalError}
        onClose={() => setIsModalOpen(false)}
        onSave={saveEmployee}
      />
    </>
  );
}
