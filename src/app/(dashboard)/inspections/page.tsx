"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import {
  InspectionIcon,
  InspectionModal,
  InspectionStagePill,
  RejectInspectionModal,
} from "@/components/inspections/InspectionDialogs";
import { apiFetch, ApiError } from "@/lib/api";
import { useCapabilities } from "@/contexts/CapabilitiesContext";
import {
  API_BASE,
  formatInspectionDateShort,
  type InspectionRecord,
  type InspectionStage,
  INSPECTION_STAGE_LABELS,
  normalizeInspectionList,
  relTime,
} from "@/lib/inspectionUi";

const busyActionStyle = { opacity: 0.75, cursor: "wait" } as const;
const unavailableActionStyle = { opacity: 0.55, cursor: "not-allowed" } as const;

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
  canManage,
  canFull,
  busy,
  onReject,
  onDelete,
  onViewPdf,
}: {
  inspection: InspectionRecord;
  canManage: boolean;
  canFull: boolean;
  busy: boolean;
  onReject: () => void;
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
            {canManage && !["COMPLETED", "REJECTED", "DRAFT"].includes(inspection.stage) ? (
              <button type="button" className="row-menu-item danger" onClick={() => { closeMenu(); onReject(); }} disabled={busy}>
                Reject certificate
              </button>
            ) : (
              <button type="button" className="row-menu-item" disabled style={unavailableActionStyle}>
                Reject unavailable
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
  canManage,
  canFull,
  busy,
  onReject,
  onDelete,
  onViewPdf,
}: {
  inspection: InspectionRecord;
  canManage: boolean;
  canFull: boolean;
  busy: boolean;
  onReject: () => void;
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
          <div className="avatar" style={{ width: 34, height: 34, fontSize: 11, background: "linear-gradient(135deg, color-mix(in oklch, var(--primary) 80%, white), var(--primary))" }}>
            IC
          </div>
          <div>
            <div className="user-name">{inspection.contract_no}</div>
          </div>
        </div>
      </td>
      <td>
        <div className="user-name mono">{inspection.indent_no || "—"}</div>
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
          <InspectionStagePill stage={inspection.stage} />
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
          canManage={canManage}
          canFull={canFull}
          busy={busy}
          onReject={onReject}
          onDelete={onDelete}
          onViewPdf={onViewPdf}
        />
      </td>
    </tr>
  );
}

export default function InspectionsPage() {
  const router = useRouter();
  const { can, hasInspectionStage, isLoading: capsLoading } = useCapabilities();

  const canView = can("inspections", "view");
  const canManage = can("inspections", "manage");
  const canFull = can("inspections", "full");

  const [inspections, setInspections] = useState<InspectionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [density, setDensity] = useState<"compact" | "balanced" | "comfortable">("balanced");
  const [createOpen, setCreateOpen] = useState(false);
  const [editingInspection, setEditingInspection] = useState<InspectionRecord | null>(null);
  const [rejectTarget, setRejectTarget] = useState<InspectionRecord | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const loadInspections = useCallback(async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
    if (showLoading) setLoading(true);
    setFetchError(null);
    try {
      const data = await apiFetch<InspectionRecord[] | { count: number; next: string | null; previous: string | null; results: InspectionRecord[] }>("/api/inventory/inspections/");
      setInspections(normalizeInspectionList(data));
      return true;
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load inspections");
      return false;
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (capsLoading) return;
    if (!canView) {
      router.replace("/403");
      return;
    }
    loadInspections();
  }, [capsLoading, canView, loadInspections, router]);

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

  const handleRejectConfirm = useCallback(async (reason: string) => {
    if (!rejectTarget) return;
    setBusyId(rejectTarget.id);
    setActionError(null);
    try {
      await apiFetch(`/api/inventory/inspections/${rejectTarget.id}/reject/`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      await loadInspections({ showLoading: false });
      setRejectTarget(null);
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : "Reject failed");
    } finally {
      setBusyId(null);
    }
  }, [loadInspections, rejectTarget]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return inspections.filter(inspection => {
      if (stageFilter !== "all" && inspection.stage !== stageFilter) return false;
      if (!query) return true;
      const haystack = `${inspection.contract_no} ${inspection.indent_no} ${inspection.contractor_name} ${inspection.department_name}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [inspections, search, stageFilter]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    inspections.forEach(inspection => {
      counts[inspection.stage] = (counts[inspection.stage] ?? 0) + 1;
    });
    return counts;
  }, [inspections]);

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
        open={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        onConfirm={handleRejectConfirm}
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
            <div className="chip-filter-group">
              <div className="chip-filter-label">Stage</div>
              <div className="chip-filter">
                <button type="button" className={"chip-filter-btn" + (stageFilter === "all" ? " active" : "")} onClick={() => setStageFilter("all")}>
                  All
                </button>
                {(["DRAFT", "STOCK_DETAILS", "CENTRAL_REGISTER", "FINANCE_REVIEW", "COMPLETED", "REJECTED"] as InspectionStage[]).map(stage => (
                  <button key={stage} type="button" className={"chip-filter-btn" + (stageFilter === stage ? " active" : "")} onClick={() => setStageFilter(stageFilter === stage ? "all" : stage)}>
                    {INSPECTION_STAGE_LABELS[stage]}
                    {stageCounts[stage] ? <span className="chip-filter-count">{stageCounts[stage]}</span> : null}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="filter-bar-right">
            <DensityToggle density={density} setDensity={setDensity} />
            {canManage && (
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
                    <td colSpan={8}>
                      <div style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>Loading inspections…</div>
                    </td>
                  </tr>
                ) : filtered.length > 0 ? (
                  filtered.map(inspection => (
                    <InspectionRow
                      key={inspection.id}
                      inspection={inspection}
                      canManage={canManage}
                      canFull={canFull}
                      busy={busyId === inspection.id}
                      onReject={() => setRejectTarget(inspection)}
                      onDelete={() => handleDelete(inspection)}
                      onViewPdf={() => openPdf(inspection)}
                    />
                  ))
                ) : (
                  <tr>
                    <td colSpan={8}>
                      <div style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>No inspection certificates match the current filters.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="table-card-foot">
            <div className="eyebrow">Showing {filtered.length} rows</div>
            <div className="pager">
              <button type="button" className="btn btn-xs" disabled title="Pagination is not implemented" style={unavailableActionStyle}>‹ Prev</button>
              <span className="mono pager-current">1 / 1</span>
              <button type="button" className="btn btn-xs" disabled title="Pagination is not implemented" style={unavailableActionStyle}>Next ›</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
