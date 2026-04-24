"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { LocationModal } from "@/components/LocationModal";
import { apiFetch, type Page } from "@/lib/api";
import { LOCATION_TYPE_LABELS, locationTypeLabel, relTime, type LocationRecord } from "@/lib/userUiShared";
import { useCan, useCapabilities } from "@/contexts/CapabilitiesContext";

const Ic = ({ d, size = 16 }: { d: React.ReactNode | string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true" focusable="false">
    {typeof d === "string" ? <path d={d} /> : d}
  </svg>
);

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

function StatusPill({ active }: { active: boolean }) {
  return (
    <span className={"pill " + (active ? "pill-success" : "pill-neutral")}>
      <span className={"status-dot " + (active ? "active" : "inactive")} />
      {active ? "Active" : "Disabled"}
    </span>
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

function LocationActions({
  onEdit,
  onDelete,
  canChange,
  canDelete,
  disabled = false,
  deleteBusy = false,
}: {
  onEdit?: () => void;
  onDelete?: () => void;
  canChange: boolean;
  canDelete: boolean;
  disabled?: boolean;
  deleteBusy?: boolean;
}) {
  const canRenderEdit = canChange && Boolean(onEdit);
  const canRenderDelete = canDelete && Boolean(onDelete);

  if (!canRenderEdit && !canRenderDelete) {
    return <span className="muted-note mono">No actions</span>;
  }

  return (
    <div className="row-actions">
      {canRenderEdit && (
        <button type="button" className="btn btn-xs btn-ghost row-action" onClick={onEdit} title="Edit location" disabled={disabled}>
          <Ic d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" size={13} />
          <span className="ra-label">Edit</span>
        </button>
      )}
      {canRenderDelete && (
        <button type="button" className="btn btn-xs btn-danger-ghost row-action" onClick={onDelete} title="Delete location" disabled={disabled}>
          <Ic d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0l1 12h6l1-12" size={13} />
          <span className="ra-label">{deleteBusy ? "Deleting…" : "Delete"}</span>
        </button>
      )}
    </div>
  );
}

function LocationAvatar({ name, type }: { name: string; type: string }) {
  const initials = name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase() || "LC";
  const bg = type === "DEPARTMENT" || type === "BUILDING"
    ? "linear-gradient(135deg, color-mix(in oklch, var(--primary) 82%, white), var(--primary))"
    : type === "LAB" || type === "ROOM"
    ? "linear-gradient(135deg, #3b4052, #0e1116)"
    : "linear-gradient(135deg, #8a7b60, #4d442f)";
  return (
    <div className="avatar" style={{ width: 44, height: 44, background: bg, fontSize: 12 }}>
      {initials}
    </div>
  );
}

function LocationCard({
  location,
  canChange,
  canDelete,
  pageBusy,
  deleteBusy,
  onEdit,
  onDelete,
}: {
  location: LocationRecord;
  canChange: boolean;
  canDelete: boolean;
  pageBusy: boolean;
  deleteBusy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="user-card">
      <div className="user-card-head">
        <LocationAvatar name={location.name} type={location.location_type} />
        <StatusPill active={location.is_active} />
      </div>
      <div className="user-card-name">{location.name}</div>
      <div className="user-card-meta mono">{location.code}</div>
      <div className="user-card-eid mono">{locationTypeLabel(location.location_type)}</div>
      <div className="user-card-section">
        <div className="eyebrow">Parent Location</div>
        <div style={{ fontSize: 13, color: "var(--text-1)" }}>{location.parent_location_display ?? "Root location"}</div>
      </div>
      <div className="user-card-section">
        <div className="eyebrow">Hierarchy Level</div>
        <div className="mono" style={{ fontSize: 13, color: "var(--text-1)" }}>{location.hierarchy_level}</div>
      </div>
      <div className="user-card-foot">
        <div>
          <div className="eyebrow">Updated</div>
          <div className="user-card-last mono">{relTime(location.updated_at)}</div>
        </div>
        <LocationActions
          canChange={canChange}
          canDelete={canDelete}
          disabled={pageBusy}
          deleteBusy={deleteBusy}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </div>
    </div>
  );
}

function LocationTableAvatar({ name, type }: { name: string; type: string }) {
  const initials = name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase() || "LC";
  const bg = type === "DEPARTMENT" || type === "BUILDING"
    ? "linear-gradient(135deg, color-mix(in oklch, var(--primary) 82%, white), var(--primary))"
    : type === "LAB" || type === "ROOM"
    ? "linear-gradient(135deg, #3b4052, #0e1116)"
    : "linear-gradient(135deg, #8a7b60, #4d442f)";
  return (
    <div className="avatar" style={{ width: 32, height: 32, background: bg, fontSize: 11 }}>
      {initials}
    </div>
  );
}

function LocationRow({
  location,
  canChange,
  canDelete,
  pageBusy,
  deleteBusy,
  onEdit,
  onDelete,
}: {
  location: LocationRecord;
  canChange: boolean;
  canDelete: boolean;
  pageBusy: boolean;
  deleteBusy: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <tr>
      <td className="col-user">
        <div className="user-cell">
          <LocationTableAvatar name={location.name} type={location.location_type} />
          <div>
            <div className="user-name">{location.name}</div>
            <div className="user-username mono">{location.code}</div>
          </div>
        </div>
      </td>
      <td><span className="chip">{locationTypeLabel(location.location_type)}</span></td>
      <td>
        {location.parent_location_display
          ? <span className="chip chip-loc">{location.parent_location_display}</span>
          : <span className="muted-note">—</span>}
      </td>
      <td className="mono">{location.hierarchy_level}</td>
      <td><StatusPill active={location.is_active} /></td>
      <td className="col-login"><TimestampCell value={location.updated_at} fallback="Unknown" /></td>
      <td className="col-actions">
        <LocationActions
          canChange={canChange}
          canDelete={canDelete}
          disabled={pageBusy}
          deleteBusy={deleteBusy}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </td>
    </tr>
  );
}

export default function LocationsPage() {
  const router = useRouter();
  const { isLoading: capsLoading } = useCapabilities();
  const canViewLocations = useCan("locations");
  const canAddLocation = useCan("locations", "manage");
  const canChangeLocation = useCan("locations", "manage");
  const canDeleteLocation = useCan("locations", "full");

  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [density, setDensity] = useState<"compact" | "balanced" | "comfortable">("balanced");
  const [mode, setMode] = useState<"table" | "grid">("table");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<LocationRecord | null>(null);
  const [busyAction, setBusyAction] = useState<{ kind: "delete"; locationId: number } | null>(null);

  const clearActionError = useCallback(() => setActionError(null), []);

  const loadLocations = useCallback(async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
    if (showLoading) setIsLoading(true);
    setFetchError(null);
    try {
      const data = await apiFetch<Page<LocationRecord> | LocationRecord[]>("/api/inventory/locations/?page_size=500");
      setLocations(Array.isArray(data) ? data : data.results);
      return true;
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load locations");
      return false;
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (capsLoading) return;
    if (!canViewLocations) {
      router.replace("/403");
      return;
    }
    loadLocations();
  }, [capsLoading, canViewLocations, loadLocations, router]);

  const handleSave = useCallback(async () => {
    const refreshed = await loadLocations({ showLoading: false });
    if (!refreshed) {
      setActionError("Location saved, but the list could not be refreshed. Reload to resync the list.");
    }
  }, [loadLocations]);

  const handleDelete = useCallback(async (location: LocationRecord) => {
    if (busyAction !== null) return;
    const confirmed = window.confirm(`Delete ${location.name}? This cannot be undone.`);
    if (!confirmed) return;

    setBusyAction({ kind: "delete", locationId: location.id });
    clearActionError();
    try {
      await apiFetch(`/api/inventory/locations/${location.id}/`, {
        method: "DELETE",
      });
      setLocations(prev => prev.filter(item => item.id !== location.id));
      const refreshed = await loadLocations({ showLoading: false });
      if (!refreshed) {
        setActionError("Location deleted, but the list could not be refreshed. The row has been removed locally; reload to resync.");
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete location");
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, clearActionError, loadLocations]);

  const filteredLocations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return locations.filter(location => {
      if (q) {
        const hay = `${location.name} ${location.code} ${location.parent_location_display ?? ""} ${location.location_type}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (typeFilter !== "all" && location.location_type !== typeFilter) return false;
      if (statusFilter === "active" && !location.is_active) return false;
      if (statusFilter === "inactive" && location.is_active) return false;
      return true;
    });
  }, [locations, search, typeFilter, statusFilter]);

  const typeOptions = useMemo(() => {
    const values = new Set<string>(Object.keys(LOCATION_TYPE_LABELS));
    locations.forEach(location => {
      values.add(location.location_type);
    });
    return Array.from(values).sort();
  }, [locations]);

  const pageBusy = busyAction !== null;
  const deleteBusyLocationId = busyAction?.kind === "delete" ? busyAction.locationId : null;

  return (
    <div data-density={density}>
      <LocationModal
        open={modalOpen || editingLocation !== null}
        mode={editingLocation ? "edit" : "create"}
        location={editingLocation}
        onClose={() => { setModalOpen(false); setEditingLocation(null); }}
        onSave={handleSave}
      />

      <Topbar breadcrumb={["Inventory", "Locations"]} />

      <div className="page">
        {fetchError && (
          <div style={{ padding: "12px 16px", background: "var(--danger-weak)", border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)", borderRadius: "var(--radius)", color: "var(--danger)", fontSize: 13, marginBottom: 16 }}>
            {fetchError}
          </div>
        )}
        {actionError && (
          <div style={{ padding: "12px 16px", background: "var(--danger-weak)", border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)", borderRadius: "var(--radius)", color: "var(--danger)", fontSize: 13, marginBottom: 16 }}>
            {actionError}
          </div>
        )}
        {isLoading && (
          <div style={{ padding: "32px 0", textAlign: "center", color: "var(--text-2)", fontSize: 13 }}>
            Loading locations…
          </div>
        )}

        <div className="page-head">
          <div className="page-title-group">
            <div className="eyebrow">Inventory</div>
            <h1>Locations</h1>
            <div className="page-sub">Manage the location catalog with the same admin workflow used by users and roles.</div>
          </div>
        </div>

        <div className="filter-bar">
          <div className="filter-bar-left">
            <div className="search-input">
              <Ic d={<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>} size={14} />
              <input
                placeholder="Search by name, code, parent, or type…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && <button type="button" className="clear-search" onClick={() => setSearch("")}>×</button>}
            </div>

            <div className="filter-select-group">
              <div className="chip-filter-label">Type</div>
              <label className="filter-select-wrap">
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} aria-label="Filter locations by type">
                  <option value="all">All types</option>
                  {typeOptions.map(type => (
                    <option key={type} value={type}>
                      {locationTypeLabel(type)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="chip-filter-group">
              <div className="chip-filter-label">Status</div>
              <div className="chip-filter">
                {[{ k: "all", label: "All" }, { k: "active", label: "Active" }, { k: "inactive", label: "Disabled" }].map(option => (
                  <button key={option.k} type="button" className={"chip-filter-btn" + (statusFilter === option.k ? " active" : "")} onClick={() => setStatusFilter(option.k)}>
                    {option.label}
                  </button>
                ))}
              </div>
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
            {canAddLocation && (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setModalOpen(true)} disabled={pageBusy}>
                <Ic d="M12 5v14M5 12h14" size={14} />
                Add Location
              </button>
            )}
          </div>
        </div>

        {mode === "table" ? (
          <div className="table-card">
            <div className="table-card-head">
              <div className="table-card-head-left">
                <div className="eyebrow">Locations list</div>
                <div className="table-count">
                  <span className="mono">{filteredLocations.length}</span>
                  <span>of</span>
                  <span className="mono">{locations.length}</span>
                  <span>locations</span>
                </div>
              </div>
            </div>
            <div className="h-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Location</th>
                    <th>Type</th>
                    <th>Parent</th>
                    <th>Level</th>
                    <th>Status</th>
                    <th>Updated At</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLocations.length === 0 ? (
                    <tr>
                      <td colSpan={7}>
                        <div style={{ padding: "32px 12px", textAlign: "center", color: "var(--text-2)", fontSize: 13 }}>
                          No locations match the current filters.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredLocations.map(location => (
                      <LocationRow
                        key={location.id}
                        location={location}
                        canChange={canChangeLocation}
                        canDelete={canDeleteLocation}
                        pageBusy={pageBusy}
                        deleteBusy={deleteBusyLocationId === location.id}
                        onEdit={() => setEditingLocation(location)}
                        onDelete={() => handleDelete(location)}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <div className="table-card-foot">
              <div className="eyebrow">Showing {filteredLocations.length} rows</div>
              <div className="pager">
                <span className="mono pager-current">Grouped by hierarchy</span>
              </div>
            </div>
          </div>
        ) : filteredLocations.length > 0 ? (
          <div className="users-grid">
            {filteredLocations.map(location => (
              <LocationCard
                key={location.id}
                location={location}
                canChange={canChangeLocation}
                canDelete={canDeleteLocation}
                pageBusy={pageBusy}
                deleteBusy={deleteBusyLocationId === location.id}
                onEdit={() => setEditingLocation(location)}
                onDelete={() => handleDelete(location)}
              />
            ))}
          </div>
        ) : (
          <div className="table-card">
            <div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
              No locations match the current filters.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
