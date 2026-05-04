"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ListPagination } from "@/components/ListPagination";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { ThemedSelect } from "@/components/ThemedSelect";
import { Topbar } from "@/components/Topbar";
import {
  InspectionIcon,
  InspectionModal,
  InspectionStagePill,
  RejectInspectionModal,
} from "@/components/inspections/InspectionDialogs";
import { apiFetch, ApiError } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useClientPagination } from "@/lib/listPagination";
import { useCapabilities } from "@/contexts/CapabilitiesContext";
import {
  API_BASE,
  formatInspectionDate,
  formatInspectionDateShort,
  type InspectionRecord,
  type InspectionLocationOption,
  type InspectionStage,
  INSPECTION_STAGE_LABELS,
  normalizeInspectionList,
  relTime,
} from "@/lib/inspectionUi";

const busyActionStyle = { opacity: 0.75, cursor: "wait" } as const;
const unavailableActionStyle = { opacity: 0.55, cursor: "not-allowed" } as const;
const INSPECTIONS_PAGE_SIZE = 12;

function DensityToggle({
  density,
  setDensity,
}: {
  density: "compact" | "balanced" | "comfortable";
  setDensity: (density: "compact" | "balanced" | "comfortable") => void;
}) {
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

function InspectionRowActions({
  inspection,
  canCancel,
  canFull,
  busy,
  onCancel,
  onDelete,
  onViewPdf,
}: {
  inspection: InspectionRecord;
  canCancel: boolean;
  canFull: boolean;
  busy: boolean;
  onCancel: () => void;
  onDelete: () => void;
  onViewPdf: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const canDelete = canFull && inspection.stage === "DRAFT";

  const closeMenu = useCallback(() => {
    setOpen(false);
    setOpenUp(false);
  }, []);

  const updateMenuDirection = useCallback(() => {
    const wrapper = moreRef.current;
    const menu = menuRef.current;
    if (!wrapper || !menu) return;

    const wrapperRect = wrapper.getBoundingClientRect();
    const card = wrapper.closest(".table-card");
    const cardRect = card instanceof HTMLElement ? card.getBoundingClientRect() : null;
    const boundaryTop = cardRect?.top ?? 0;
    const boundaryBottom = cardRect?.bottom ?? window.innerHeight;
    const spaceBelow = boundaryBottom - wrapperRect.bottom;
    const spaceAbove = wrapperRect.top - boundaryTop;
    const menuHeight = menu.offsetHeight || menu.scrollHeight;

    setOpenUp(spaceBelow < menuHeight + 8 && spaceAbove > spaceBelow);
  }, []);

  useEffect(() => {
    if (busy) closeMenu();
  }, [busy, closeMenu]);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuDirection();

    const handlePosition = () => updateMenuDirection();
    window.addEventListener("resize", handlePosition);
    window.addEventListener("scroll", handlePosition, true);

    return () => {
      window.removeEventListener("resize", handlePosition);
      window.removeEventListener("scroll", handlePosition, true);
    };
  }, [open, updateMenuDirection]);

  return (
    <div className="row-actions" onClick={event => event.stopPropagation()}>
      <div className="row-action-more" ref={moreRef}>
        <button type="button" className="btn btn-xs btn-ghost" onClick={() => setOpen(prev => !prev)} disabled={busy} style={busy ? busyActionStyle : undefined}>
          <InspectionIcon d={<><circle cx="12" cy="5" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="19" r="1" fill="currentColor" /></>} size={14} />
        </button>
        {open && (
          <div ref={menuRef} className={"row-menu" + (openUp ? " row-menu-up" : "")}>
            <button type="button" className="row-menu-item" onClick={() => { closeMenu(); onViewPdf(); }}>
              Open PDF
            </button>
            {canCancel && !["COMPLETED", "REJECTED", "DRAFT"].includes(inspection.stage) ? (
              <button type="button" className="row-menu-item danger" onClick={() => { closeMenu(); onCancel(); }} disabled={busy}>
                Cancel certificate
              </button>
            ) : (
              <button type="button" className="row-menu-item" disabled style={unavailableActionStyle}>
                Cancel unavailable
              </button>
            )}
            {canDelete ? (
              <button type="button" className="row-menu-item danger" onClick={() => { closeMenu(); onDelete(); }} disabled={busy}>
                Delete draft
              </button>
            ) : (
              <button type="button" className="row-menu-item" disabled style={unavailableActionStyle}>
                Delete unavailable
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InspectionRow({
  inspection,
  canCancel,
  canFull,
  busy,
  onCancel,
  onDelete,
  onViewPdf,
}: {
  inspection: InspectionRecord;
  canCancel: boolean;
  canFull: boolean;
  busy: boolean;
  onCancel: () => void;
  onDelete: () => void;
  onViewPdf: () => void;
}) {
  const router = useRouter();

  return (
    <tr
      className="clickable-table-row"
      onClick={() => router.push(`/inspections/${inspection.id}`)}
      style={busy ? { opacity: 0.55, pointerEvents: "none" } : undefined}
    >
      <td className="col-user">
        <div className="user-cell">
          <div>
            <div className="user-name">{inspection.contract_no}</div>
          </div>
        </div>
      </td>
      <td>
        <div className="user-name mono">{inspection.indent_no || "—"}</div>
      </td>
      <td style={{ textAlign: "center" }}>
        <div className="user-name mono">{formatInspectionDate(inspection.contract_date)}</div>
      </td>
      <td>
        <div className="user-name">{inspection.contractor_name || "—"}</div>
      </td>
      <td className="inspection-table-location-cell">
        <div className="inspection-table-centered-cell">
          <div className="inspection-location-name">{inspection.department_name}</div>
        </div>
      </td>
      <td className="inspection-table-status-cell">
        <div className="inspection-table-centered-cell">
          <InspectionStagePill stage={inspection.stage} status={inspection.status} />
        </div>
      </td>
      <td className="col-login">
        <div className="login-cell">
          <div>{relTime(inspection.created_at)}</div>
          <div className="login-cell-sub mono">{formatInspectionDateShort(inspection.created_at)}</div>
        </div>
      </td>
      <td className="col-login">
        <div className="login-cell">
          <div>{relTime(inspection.updated_at)}</div>
          <div className="login-cell-sub mono">{formatInspectionDateShort(inspection.updated_at)}</div>
        </div>
      </td>
      <td className="col-actions">
        <InspectionRowActions
          inspection={inspection}
          canCancel={canCancel}
          canFull={canFull}
          busy={busy}
          onCancel={onCancel}
          onDelete={onDelete}
          onViewPdf={onViewPdf}
        />
      </td>
    </tr>
  );
}

export default function InspectionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { can, hasInspectionStage, isLoading: capsLoading, isSuperuser } = useCapabilities();

  const canView = can("inspections", "view");
  const canFull = can("inspections", "full");
  const canInitiateInspection = hasInspectionStage("initiate_inspection");
  const canCancelInspection = isSuperuser || hasInspectionStage("review_finance");

  const [inspections, setInspections] = useState<InspectionRecord[]>([]);
  const [locationOptions, setLocationOptions] = useState<InspectionLocationOption[]>([]);
  const [selectedLocationIds, setSelectedLocationIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>(() => {
    const stageParam = searchParams.get("stage");
    return stageParam && ["DRAFT", "STOCK_DETAILS", "CENTRAL_REGISTER", "FINANCE_REVIEW", "COMPLETED", "REJECTED"].includes(stageParam)
      ? stageParam
      : "all";
  });
  const [density, setDensity] = useState<"compact" | "balanced" | "comfortable">("balanced");
  const [createOpen, setCreateOpen] = useState(false);
  const [editingInspection, setEditingInspection] = useState<InspectionRecord | null>(null);
  const [cancelTarget, setCancelTarget] = useState<InspectionRecord | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadInspections = useCallback(async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
    if (showLoading) setLoading(true);
    setFetchError(null);
    try {
      const locationQuery = selectedLocationIds.map(id => `location=${encodeURIComponent(id)}`).join("&");
      const [data, locationsData] = await Promise.all([
        apiFetch<InspectionRecord[] | { count: number; next: string | null; previous: string | null; results: InspectionRecord[] }>(`/api/inventory/inspections/${locationQuery ? `?${locationQuery}` : ""}`),
        apiFetch<InspectionLocationOption[] | { count: number; next: string | null; previous: string | null; results: InspectionLocationOption[] }>("/api/inventory/locations/?page_size=500"),
      ]);
      setInspections(normalizeInspectionList(data));
      setLocationOptions((Array.isArray(locationsData) ? locationsData : locationsData.results).filter(location => location.is_standalone));
      return true;
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load inspections");
      return false;
    } finally {
      if (showLoading) setLoading(false);
    }
  }, [selectedLocationIds]);

  useEffect(() => {
    if (capsLoading) return;
    if (!canView) {
      router.replace("/403");
      return;
    }
    loadInspections();
  }, [capsLoading, canView, loadInspections, router]);

  useEffect(() => {
    const stageParam = searchParams.get("stage");
    if (stageParam && ["DRAFT", "STOCK_DETAILS", "CENTRAL_REGISTER", "FINANCE_REVIEW", "COMPLETED", "REJECTED"].includes(stageParam)) {
      setStageFilter(stageParam);
      return;
    }
    setStageFilter("all");
  }, [searchParams]);

  const handleSave = useCallback(async () => {
    await loadInspections({ showLoading: false });
  }, [loadInspections]);

  const handleDelete = useCallback(async (inspection: InspectionRecord) => {
    if (!window.confirm(`Delete inspection ${inspection.contract_no}? This cannot be undone.`)) return;
    setBusyId(inspection.id);
    setActionError(null);
    try {
      await apiFetch(`/api/inventory/inspections/${inspection.id}/`, { method: "DELETE" });
      setInspections(prev => prev.filter(candidate => candidate.id !== inspection.id));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }, []);

  const handleCancelConfirm = useCallback(async (reason: string) => {
    if (!cancelTarget) return;
    setBusyId(cancelTarget.id);
    setActionError(null);
    try {
      await apiFetch(`/api/inventory/inspections/${cancelTarget.id}/cancel/`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      await loadInspections({ showLoading: false });
      setCancelTarget(null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Cancellation failed");
    } finally {
      setBusyId(null);
    }
  }, [cancelTarget, loadInspections]);

  const canFilterByLocation = useMemo(() => {
    if (user?.is_superuser) return true;
    const assigned = new Set((user?.assigned_locations ?? []).map(id => Number(id)));
    return locationOptions.some(location => location.hierarchy_level === 0 && assigned.has(location.id));
  }, [locationOptions, user?.assigned_locations, user?.is_superuser]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return inspections.filter(inspection => {
      if (stageFilter !== "all" && inspection.stage !== stageFilter) return false;
      if (!query) return true;
      const haystack = `${inspection.contract_no} ${inspection.indent_no} ${inspection.contractor_name} ${inspection.department_name}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [inspections, search, stageFilter]);

  const {
    page,
    totalPages,
    pageItems: pagedInspections,
    pageStart,
    pageEnd,
    setPage,
  } = useClientPagination(filtered, INSPECTIONS_PAGE_SIZE, [search, stageFilter]);

  const openPdf = (inspection: InspectionRecord) => {
    window.open(`${API_BASE}/api/inventory/inspections/${inspection.id}/view_pdf/`, "_blank");
  };

  return (
    <div data-density={density}>
      <InspectionModal
        open={createOpen || editingInspection !== null}
        mode={editingInspection ? "edit" : "create"}
        inspection={editingInspection}
        hasStage={hasInspectionStage}
        onClose={() => {
          setCreateOpen(false);
          setEditingInspection(null);
        }}
        onSave={handleSave}
      />
      <RejectInspectionModal
        open={cancelTarget !== null}
        onClose={() => setCancelTarget(null)}
        onConfirm={handleCancelConfirm}
      />

      <Topbar breadcrumb={["Operations", "Inspection Certificates"]} />

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

        <div className="page-head">
          <div className="page-title-group">
            <div className="eyebrow">Operations</div>
            <h1>Inspection Certificates</h1>
            <div className="page-sub">Track each certificate from draft to completion, then open the detail page to continue the staged workflow and review the full register trail.</div>
          </div>
        </div>

        <div className="filter-bar">
          <div className="filter-bar-left">
            <div className="search-input">
              <InspectionIcon d={<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>} size={14} />
              <input placeholder="Search by contract, indent, contractor or location…" value={search} onChange={event => setSearch(event.target.value)} />
              {search && <button type="button" className="clear-search" onClick={() => setSearch("")}>×</button>}
            </div>
            <div className="filter-select-group">
              <div className="chip-filter-label">Stage</div>
              <div className="filter-select-wrap">
                <ThemedSelect
                  value={stageFilter}
                  onChange={setStageFilter}
                  size="compact"
                  ariaLabel="Filter inspection certificates by stage"
                  options={[
                    { value: "all", label: "All stages" },
                    ...(["DRAFT", "STOCK_DETAILS", "CENTRAL_REGISTER", "FINANCE_REVIEW", "COMPLETED", "REJECTED"] as InspectionStage[]).map(stage => ({ value: stage, label: stage === "REJECTED" ? "Rejected / Cancelled" : INSPECTION_STAGE_LABELS[stage] })),
                  ]}
                />
              </div>
            </div>
            {canFilterByLocation ? (
              <div className="filter-select-group">
                <div className="chip-filter-label">Location</div>
                <MultiSelectFilter
                  options={locationOptions.map(location => ({
                    id: String(location.id),
                    label: location.name,
                    meta: location.hierarchy_level === 0 ? "Root" : "Standalone",
                  }))}
                  value={selectedLocationIds}
                  onChange={tokens => setSelectedLocationIds(tokens.filter(token => token !== "all"))}
                  placeholder="All locations"
                  searchPlaceholder="Search locations..."
                  minWidth={280}
                />
              </div>
            ) : null}
          </div>

          <div className="filter-bar-right">
            <DensityToggle density={density} setDensity={setDensity} />
            {canInitiateInspection && (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setCreateOpen(true)}>
                <InspectionIcon d="M12 5v14M5 12h14" size={14} />
                New Certificate
              </button>
            )}
          </div>
        </div>

        <div className="table-card">
          <div className="table-card-head">
            <div className="table-card-head-left">
              <div className="eyebrow">Inspection register</div>
              <div className="table-count">
                <span className="mono">{filtered.length}</span>
                <span>of</span>
                <span className="mono">{inspections.length}</span>
                <span>certificates</span>
              </div>
            </div>
          </div>
          <div className="h-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice / Contract No</th>
                  <th>Indent Number</th>
                  <th style={{ textAlign: "center" }}>Contract Date</th>
                  <th>Contractor</th>
                  <th>Location</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Updated at</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9}>
                      <div style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>Loading inspections…</div>
                    </td>
                  </tr>
                ) : filtered.length > 0 ? (
                  pagedInspections.map(inspection => (
                    <InspectionRow
                      key={inspection.id}
                      inspection={inspection}
                      canCancel={canCancelInspection}
                      canFull={canFull}
                      busy={busyId === inspection.id}
                      onCancel={() => setCancelTarget(inspection)}
                      onDelete={() => handleDelete(inspection)}
                      onViewPdf={() => openPdf(inspection)}
                    />
                  ))
                ) : (
                  <tr>
                    <td colSpan={9}>
                      <div style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>No inspection certificates match the current filters.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <ListPagination
            summary={filtered.length === 0 ? "Showing 0 inspections" : `Showing ${pageStart}-${pageEnd} of ${filtered.length} inspections`}
            page={page}
            totalPages={totalPages}
            onPrev={() => setPage(current => Math.max(1, current - 1))}
            onNext={() => setPage(current => Math.min(totalPages, current + 1))}
          />
        </div>
      </div>
    </div>
  );
}
