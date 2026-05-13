"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ListPagination } from "@/components/ListPagination";
import { ThemedSelect } from "@/components/ThemedSelect";
import { Topbar } from "@/components/Topbar";
import { StockRegisterModal } from "@/components/StockRegisterModal";
import { useAuth } from "@/contexts/AuthContext";
import { useCan, useCapabilities } from "@/contexts/CapabilitiesContext";
import { apiFetch, type Page } from "@/lib/api";
import { useClientPagination } from "@/lib/listPagination";
import { filterStockRegisters, getCreatableStockRegisterStoreOptions } from "@/lib/stockRegisterUi";
import { relTime, type LocationRecord, type StockRegisterRecord } from "@/lib/userUiShared";

const STOCK_REGISTERS_PAGE_SIZE = 12;

const Ic = ({ d, size = 16 }: { d: React.ReactNode | string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true" focusable="false">
    {typeof d === "string" ? <path d={d} /> : d}
  </svg>
);

function ModalField({
  label,
  hint,
  children,
  span = 1,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  span?: number;
}) {
  return (
    <div className="field" style={{ gridColumn: `span ${span}` }}>
      <div className="field-label">{label}</div>
      {children}
      {hint ? <div className="field-hint">{hint}</div> : null}
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

function DensityToggle({ density, setDensity }: { density: "compact" | "balanced" | "comfortable"; setDensity: (density: "compact" | "balanced" | "comfortable") => void }) {
  return (
    <div className="seg">
      {(["compact", "balanced", "comfortable"] as const).map((option) => (
        <button type="button" key={option} className={"seg-btn" + (density === option ? " active" : "")} onClick={() => setDensity(option)}>
          {option.charAt(0).toUpperCase() + option.slice(1)}
        </button>
      ))}
    </div>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span className={"pill " + (active ? "pill-success" : "pill-neutral")}>
      <span className={"status-dot " + (active ? "active" : "inactive")} />
      {active ? "Active" : "Closed"}
    </span>
  );
}

function formatDateTime(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function RowActions({
  onEdit,
  onDelete,
  onClose,
  onReopen,
  canEdit,
  canDelete,
  disabled = false,
  deleteBusy = false,
}: {
  onEdit?: () => void;
  onDelete?: () => void;
  onClose?: () => void;
  onReopen?: () => void;
  canEdit: boolean;
  canDelete: boolean;
  disabled?: boolean;
  deleteBusy?: boolean;
}) {
  const canRenderEdit = canEdit && Boolean(onEdit);
  const canRenderDelete = canDelete && Boolean(onDelete);
  const canRenderClose = canEdit && Boolean(onClose);
  const canRenderReopen = canEdit && Boolean(onReopen);

  if (!canRenderEdit && !canRenderDelete && !canRenderClose && !canRenderReopen) {
    return <span className="muted-note mono">No actions</span>;
  }

  return (
    <div className="row-actions">
      {canRenderEdit && (
        <button type="button" className="btn btn-xs btn-ghost row-action" onClick={(event) => { event.stopPropagation(); onEdit?.(); }} title="Edit stock register" disabled={disabled}>
          <Ic d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" size={13} />
          <span className="ra-label">Edit</span>
        </button>
      )}
      {canRenderClose && (
        <button type="button" className="btn btn-xs btn-ghost row-action" onClick={(event) => { event.stopPropagation(); onClose?.(); }} title="Close stock register" disabled={disabled}>
          <Ic d="M19 7L10 16l-5-5" size={13} />
          <span className="ra-label">Close</span>
        </button>
      )}
      {canRenderReopen && (
        <button type="button" className="btn btn-xs btn-ghost row-action" onClick={(event) => { event.stopPropagation(); onReopen?.(); }} title="Reopen stock register" disabled={disabled}>
          <Ic d="M3 12a9 9 0 101.8-5.4M3 4v5h5" size={13} />
          <span className="ra-label">Reopen</span>
        </button>
      )}
      {canRenderDelete && (
        <button type="button" className="btn btn-xs btn-danger-ghost row-action" onClick={(event) => { event.stopPropagation(); onDelete?.(); }} title="Delete stock register" disabled={disabled}>
          <Ic d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0l1 12h6l1-12" size={13} />
          <span className="ra-label">{deleteBusy ? "Deleting…" : "Delete"}</span>
        </button>
      )}
    </div>
  );
}

function StockRegisterRow({
  register,
  canEdit,
  canDelete,
  pageBusy,
  deleteBusy,
  onEdit,
  onDelete,
  onClose,
  onReopen,
}: {
  register: StockRegisterRecord;
  canEdit: boolean;
  canDelete: boolean;
  pageBusy: boolean;
  deleteBusy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
  onReopen: () => void;
}) {
  return (
    <tr>
      <td className="col-user">
        <div className="user-cell">
          <div>
            <div className="user-name">{register.register_number}</div>
            <div className="user-username mono">{register.store_name ?? "Unknown store"}</div>
          </div>
        </div>
      </td>
      <td><span className="chip">{register.register_type === "CSR" ? "Consumable" : "Dead Stock"}</span></td>
      <td><span className="chip chip-loc">{register.store_name ?? "Unknown store"}</span></td>
      <td><StatusPill active={register.is_active} /></td>
      <td className="col-login"><TimestampCell value={register.updated_at} fallback="Unknown" /></td>
      <td className="col-actions">
        <RowActions
          canEdit={canEdit}
          canDelete={canDelete}
          disabled={pageBusy}
          deleteBusy={deleteBusy}
          onEdit={onEdit}
          onDelete={onDelete}
          onClose={register.is_active ? onClose : undefined}
          onReopen={!register.is_active ? onReopen : undefined}
        />
      </td>
    </tr>
  );
}

function StockRegisterCard({
  register,
  canEdit,
  canDelete,
  pageBusy,
  deleteBusy,
  onEdit,
  onDelete,
  onClose,
  onReopen,
}: {
  register: StockRegisterRecord;
  canEdit: boolean;
  canDelete: boolean;
  pageBusy: boolean;
  deleteBusy: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
  onReopen: () => void;
}) {
  return (
    <div className="user-card">
      <div className="user-card-head">
        <StatusPill active={register.is_active} />
      </div>
      <div className="user-card-name">{register.register_number}</div>
      <div className="user-card-meta mono">{register.register_type === "CSR" ? "Consumable Stock Register" : "Dead Stock Register"}</div>
      <div className="user-card-section">
        <div className="eyebrow">Store</div>
        <div style={{ fontSize: 13, color: "var(--text-1)" }}>{register.store_name ?? "Unknown store"}</div>
      </div>
      <div className="user-card-section">
        <div className="eyebrow">Created By</div>
        <div className="mono" style={{ fontSize: 13, color: "var(--text-1)" }}>{register.created_by_name ?? "Unknown"}</div>
      </div>
      <div className="user-card-foot">
        <div>
          <div className="eyebrow">Updated</div>
          <div className="user-card-last mono">{relTime(register.updated_at)}</div>
        </div>
        <RowActions
          canEdit={canEdit}
          canDelete={canDelete}
          disabled={pageBusy}
          deleteBusy={deleteBusy}
          onEdit={onEdit}
          onDelete={onDelete}
          onClose={register.is_active ? onClose : undefined}
          onReopen={!register.is_active ? onReopen : undefined}
        />
      </div>
    </div>
  );
}

function RegisterLifecycleModal({
  open,
  mode,
  register,
  actorName,
  submitting,
  submitError,
  onClose,
  onConfirm,
}: {
  open: boolean;
  mode: "close" | "reopen";
  register: StockRegisterRecord | null;
  actorName: string;
  submitting: boolean;
  submitError: string | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [effectiveAt, setEffectiveAt] = useState(() => new Date());

  useEffect(() => {
    if (!open) return;
    setReason(register?.closed_reason ?? "");
    setEffectiveAt(new Date());
  }, [open, register]);

  if (!open || !register) return null;

  const isClose = mode === "close";
  const title = isClose ? "Close Stock Register" : "Reopen Stock Register";
  const actorLabel = isClose ? "Closed by" : "Reopened by";
  const timeLabel = isClose ? "Closing at" : "Reopening at";
  const reasonLabel = isClose ? "Closing reason" : "Reopening reason";
  const reasonHint = isClose
    ? "Optional. Leave blank if no reason needs to be recorded."
    : "Optional. Record why this register is being brought back into use.";

  return (
    <div className="modal-backdrop">
      <div className="modal modal-lg" role="dialog" aria-modal="true" aria-labelledby="stock-register-lifecycle-title">
        <header className="modal-head">
          <div>
            <div className="eyebrow">Operations · Stock Registers</div>
            <h2 id="stock-register-lifecycle-title">{title}</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            <Ic d="M6 6l12 12M6 18L18 6" />
          </button>
        </header>
        <div className="modal-body">
          <div style={{ paddingTop: 24 }}>
            <div style={{ display: "grid", gap: 16, padding: "0 24px 24px" }}>
              {submitError && (
                <div style={{ padding: "10px 14px", background: "var(--danger-weak)", border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)", borderRadius: "var(--radius)", color: "var(--danger)", fontSize: 13 }}>
                  {submitError}
                </div>
              )}

              <Section n={1} title="Register Context" sub="Confirm which register is being updated before saving this lifecycle action.">
                <div className="form-grid cols-2">
                  <ModalField label="Register">
                    <input value={register.register_number} readOnly />
                  </ModalField>
                  <ModalField label="Store">
                    <input value={register.store_name ?? "Unknown store"} readOnly />
                  </ModalField>
                </div>
              </Section>

              <Section n={2} title={isClose ? "Close Details" : "Reopen Details"} sub={isClose ? "This action will hide the register from active operational dropdowns." : "This action will make the register active and selectable again."}>
                <div className="form-grid cols-2">
                  <ModalField label={timeLabel}>
                    <input value={formatDateTime(effectiveAt)} readOnly />
                  </ModalField>
                  <ModalField label={actorLabel}>
                    <input value={actorName} readOnly />
                  </ModalField>
                  {!isClose && register.closed_at && (
                    <ModalField label="Previously closed at">
                      <input value={formatDateTime(register.closed_at)} readOnly />
                    </ModalField>
                  )}
                  {!isClose && (
                    <ModalField label="Previously closed by">
                      <input value={register.closed_by_name ?? "Unknown user"} readOnly />
                    </ModalField>
                  )}
                  <ModalField label={reasonLabel} hint={reasonHint} span={2}>
                    <textarea
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder={isClose ? "Optional reason for closing this register" : "Optional reason for reopening this register"}
                      rows={4}
                    />
                  </ModalField>
                </div>
              </Section>
            </div>
          </div>
        </div>
        <footer className="modal-foot">
          <div className="modal-foot-meta mono">
            {isClose ? "Closed registers are hidden from active stock-register dropdowns." : "Reopened registers return to active stock-register dropdowns."}
          </div>
          <div className="modal-foot-actions">
            <button type="button" className="btn btn-md" onClick={onClose} disabled={submitting}>Cancel</button>
            <button type="button" className="btn btn-md btn-primary" onClick={() => onConfirm(reason)} disabled={submitting}>
              {submitting ? (isClose ? "Closing…" : "Reopening…") : (isClose ? "Close register" : "Reopen register")}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export function StockRegisterListView() {
  const router = useRouter();
  const { user } = useAuth();
  const { isLoading: capsLoading } = useCapabilities();
  const canViewRegisters = useCan("stock-registers");
  const canManageRegisters = useCan("stock-registers", "manage");
  const canDeleteRegisters = useCan("stock-registers", "full");

  const [registers, setRegisters] = useState<StockRegisterRecord[]>([]);
  const [locations, setLocations] = useState<LocationRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [storesLoading, setStoresLoading] = useState(true);
  const [storesError, setStoresError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [density, setDensity] = useState<"compact" | "balanced" | "comfortable">("balanced");
  const [mode, setMode] = useState<"table" | "grid">("table");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRegister, setEditingRegister] = useState<StockRegisterRecord | null>(null);
  const [statusModal, setStatusModal] = useState<{ mode: "close" | "reopen"; register: StockRegisterRecord } | null>(null);
  const [busyAction, setBusyAction] = useState<{ kind: "delete" | "close" | "reopen"; registerId: number } | null>(null);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);

  const clearActionError = useCallback(() => setActionError(null), []);

  const loadRegisters = useCallback(async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
    if (showLoading) setIsLoading(true);
    setFetchError(null);
    try {
      const data = await apiFetch<Page<StockRegisterRecord> | StockRegisterRecord[]>("/api/inventory/stock-registers/?page_size=500");
      setRegisters(Array.isArray(data) ? data : data.results);
      return true;
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load stock registers");
      return false;
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, []);

  const loadStores = useCallback(async () => {
    setStoresLoading(true);
    setStoresError(null);
    try {
      const data = await apiFetch<Page<LocationRecord> | LocationRecord[]>("/api/inventory/locations/?page_size=500");
      setLocations(Array.isArray(data) ? data : data.results);
    } catch (err) {
      setStoresError(err instanceof Error ? err.message : "Failed to load stores");
      setLocations([]);
    } finally {
      setStoresLoading(false);
    }
  }, []);

  useEffect(() => {
    if (capsLoading) return;
    if (!canViewRegisters) {
      router.replace("/403");
      return;
    }
    loadRegisters();
    loadStores();
  }, [capsLoading, canViewRegisters, loadRegisters, loadStores, router]);

  const handleSave = useCallback(async () => {
    const refreshed = await loadRegisters({ showLoading: false });
    if (!refreshed) {
      setActionError("Register saved, but the list could not be refreshed. Reload to resync the list.");
    }
  }, [loadRegisters]);

  const handleDelete = useCallback(async (register: StockRegisterRecord) => {
    if (busyAction) return;
    if (register.can_delete === false) {
      setActionError(register.delete_blockers?.join(" ") || "This stock register cannot be deleted because it is linked to existing records.");
      return;
    }
    const confirmed = window.confirm(`Delete ${register.register_number}? This cannot be undone.`);
    if (!confirmed) return;

    setBusyAction({ kind: "delete", registerId: register.id });
    setLifecycleError(null);
    clearActionError();
    try {
      await apiFetch(`/api/inventory/stock-registers/${register.id}/`, {
        method: "DELETE",
      });
      setRegisters((prev) => prev.filter((item) => item.id !== register.id));
      const refreshed = await loadRegisters({ showLoading: false });
      if (!refreshed) {
        setActionError("Register deleted, but the list could not be refreshed. The row has been removed locally; reload to resync.");
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete stock register");
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, clearActionError, loadRegisters]);

  const handleLifecycle = useCallback(async (reason: string) => {
    if (!statusModal || busyAction) return;

    const { mode: lifecycleMode, register } = statusModal;
    setBusyAction({ kind: lifecycleMode, registerId: register.id });
    setLifecycleError(null);
    clearActionError();
    try {
      await apiFetch(`/api/inventory/stock-registers/${register.id}/${lifecycleMode}/`, {
        method: "POST",
        body: JSON.stringify(lifecycleMode === "close" ? { reason } : {}),
      });
      const refreshed = await loadRegisters({ showLoading: false });
      if (!refreshed) {
        setActionError(`Register ${lifecycleMode}d, but the list could not be refreshed. Reload to resync.`);
      }
      setStatusModal(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to ${lifecycleMode} stock register`;
      setLifecycleError(message);
      setActionError(message);
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, clearActionError, loadRegisters, statusModal]);

  const filteredRegisters = useMemo(
    () => filterStockRegisters(registers, { search, typeFilter, statusFilter }),
    [registers, search, typeFilter, statusFilter],
  );

  const {
    page,
    totalPages,
    pageItems: pagedRegisters,
    pageStart,
    pageEnd,
    setPage,
  } = useClientPagination(filteredRegisters, STOCK_REGISTERS_PAGE_SIZE, [search, typeFilter, statusFilter]);

  const storeOptions = useMemo(
    () => getCreatableStockRegisterStoreOptions(locations, user?.assigned_locations),
    [locations, user?.assigned_locations],
  );
  const pageBusy = busyAction !== null;
  const deleteBusyRegisterId = busyAction?.kind === "delete" ? busyAction.registerId : null;

  return (
    <div data-density={density}>
      <Topbar breadcrumb={["Operations", "Stock Registers"]} />

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
            Loading stock registers…
          </div>
        )}

        <div className="page-head">
          <div className="page-title-group">
            <div className="eyebrow">Operations</div>
            <h1>Stock Registers</h1>
            <div className="page-sub">Manage stock-register ledgers for the stores within your current operational scope.</div>
          </div>
        </div>

        <div className="filter-bar">
          <div className="filter-bar-left">
            <div className="search-input">
              <Ic d={<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>} size={14} />
              <input placeholder="Search by register number, type, or store…" value={search} onChange={(e) => setSearch(e.target.value)} />
              {search && <button type="button" className="clear-search" onClick={() => setSearch("")}>×</button>}
            </div>

            <div className="filter-select-group">
              <div className="chip-filter-label">Type</div>
              <div className="filter-select-wrap">
                <ThemedSelect
                  value={typeFilter}
                  onChange={setTypeFilter}
                  size="compact"
                  ariaLabel="Filter stock registers by type"
                  options={[
                    { value: "all", label: "All types" },
                    { value: "CSR", label: "Consumable" },
                    { value: "DSR", label: "Dead Stock" },
                  ]}
                />
              </div>
            </div>

            <div className="filter-select-group">
              <div className="chip-filter-label">Status</div>
              <div className="filter-select-wrap">
                <ThemedSelect
                  value={statusFilter}
                  onChange={setStatusFilter}
                  size="compact"
                  ariaLabel="Filter stock registers by status"
                  options={[
                    { value: "all", label: "All statuses" },
                    { value: "active", label: "Active" },
                    { value: "inactive", label: "Disabled" },
                  ]}
                />
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
            {canManageRegisters && (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => { setEditingRegister(null); setModalOpen(true); }} disabled={pageBusy}>
                <Ic d="M12 5v14M5 12h14" size={14} />
                Add Register
              </button>
            )}
          </div>
        </div>

        {mode === "table" ? (
          <div className="table-card">
            <div className="table-card-head">
              <div className="table-card-head-left">
                <div className="eyebrow">Registers list</div>
                <div className="table-count">
                  <span className="mono">{filteredRegisters.length}</span>
                  <span>of</span>
                  <span className="mono">{registers.length}</span>
                  <span>registers</span>
                </div>
              </div>
            </div>
            <div className="h-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Register</th>
                    <th>Type</th>
                    <th>Store</th>
                    <th>Status</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRegisters.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <div style={{ padding: "32px 12px", textAlign: "center", color: "var(--text-2)", fontSize: 13 }}>
                          No stock registers match the current filters.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    pagedRegisters.map((register) => (
                      <StockRegisterRow
                        key={register.id}
                        register={register}
                        canEdit={canManageRegisters}
                        canDelete={canDeleteRegisters && register.can_delete !== false}
                        pageBusy={pageBusy}
                        deleteBusy={deleteBusyRegisterId === register.id}
                        onEdit={() => { setEditingRegister(register); setModalOpen(true); }}
                        onDelete={() => handleDelete(register)}
                        onClose={() => { setLifecycleError(null); setStatusModal({ mode: "close", register }); }}
                        onReopen={() => { setLifecycleError(null); setStatusModal({ mode: "reopen", register }); }}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <ListPagination
              summary={filteredRegisters.length === 0 ? "Showing 0 stock registers" : `Showing ${pageStart}-${pageEnd} of ${filteredRegisters.length} stock registers`}
              page={page}
              totalPages={totalPages}
              onPrev={() => setPage(current => Math.max(1, current - 1))}
              onNext={() => setPage(current => Math.min(totalPages, current + 1))}
            />
          </div>
        ) : filteredRegisters.length > 0 ? (
          <div className="users-grid">
            {pagedRegisters.map((register) => (
              <StockRegisterCard
                key={register.id}
                register={register}
                canEdit={canManageRegisters}
                canDelete={canDeleteRegisters && register.can_delete !== false}
                pageBusy={pageBusy}
                deleteBusy={deleteBusyRegisterId === register.id}
                onEdit={() => { setEditingRegister(register); setModalOpen(true); }}
                onDelete={() => handleDelete(register)}
                onClose={() => { setLifecycleError(null); setStatusModal({ mode: "close", register }); }}
                onReopen={() => { setLifecycleError(null); setStatusModal({ mode: "reopen", register }); }}
              />
            ))}
          </div>
        ) : (
          <div className="table-card">
            <div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
              No stock registers match the current filters.
            </div>
          </div>
        )}
        {mode === "grid" && filteredRegisters.length > 0 ? (
          <ListPagination
            summary={`Showing ${pageStart}-${pageEnd} of ${filteredRegisters.length} stock registers`}
            page={page}
            totalPages={totalPages}
            onPrev={() => setPage(current => Math.max(1, current - 1))}
            onNext={() => setPage(current => Math.min(totalPages, current + 1))}
            standalone
          />
        ) : null}

        <StockRegisterModal
          open={modalOpen}
          mode={editingRegister ? "edit" : "create"}
          register={editingRegister}
          stores={storeOptions}
          storesLoading={storesLoading}
          storesError={storesError}
          onClose={() => { setModalOpen(false); setEditingRegister(null); }}
          onSave={handleSave}
        />
        <RegisterLifecycleModal
          open={statusModal !== null}
          mode={statusModal?.mode ?? "close"}
          register={statusModal?.register ?? null}
          actorName={user ? `${user.first_name} ${user.last_name}`.trim() || user.username : "Current user"}
          submitting={busyAction?.kind === "close" || busyAction?.kind === "reopen"}
          submitError={lifecycleError}
          onClose={() => { if (!busyAction) { setLifecycleError(null); setStatusModal(null); } }}
          onConfirm={handleLifecycle}
        />
      </div>
    </div>
  );
}
