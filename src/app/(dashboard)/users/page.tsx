"use client";

import { useState, useMemo, useEffect, useCallback, useLayoutEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { AddUserModal } from "@/components/AddUserModal";
import { ListPagination } from "@/components/ListPagination";
import { ThemedSelect } from "@/components/ThemedSelect";
import { tierMeta, relTime, type User } from "@/lib/userUiShared";
import { useClientPagination } from "@/lib/listPagination";
import { shouldLoadUserAssignmentSelectors } from "@/lib/userAssignmentSelectors";
import { apiFetch, type Page } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { ADMIN_PERMISSIONS } from "@/lib/adminPermissions";

// ── Tiny icon ─────────────────────────────────────────────────────────────────

const Ic = ({ d, size = 16 }: { d: React.ReactNode | string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true" focusable="false">
    {typeof d === "string" ? <path d={d} /> : d}
  </svg>
);

// ── Shared sub-components ─────────────────────────────────────────────────────

function Avatar({ name, tone = 0, size = 32 }: { name: string; tone?: number; size?: number }) {
  const initials = name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase();
  const bg = tone === 0
    ? "linear-gradient(135deg, color-mix(in oklch, var(--primary) 82%, white), var(--primary))"
    : tone === 1
    ? "linear-gradient(135deg, #3b4052, #0e1116)"
    : "linear-gradient(135deg, #8a7b60, #4d442f)";
  return (
    <div className="avatar" style={{ width: size, height: size, background: bg, fontSize: size <= 30 ? 11 : 12 }}>
      {initials}
    </div>
  );
}

function TierChip({ level }: { level: number }) {
  const m = tierMeta(level);
  return (
    <span className="tier-chip" style={{ ["--tier-c" as string]: m.color }}>
      <span className="tier-dot sm" style={{ background: m.color }} />
      {m.label}
    </span>
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

function LocationChips({ locs, power_level, max = 2 }: { locs: string[]; power_level: number; max?: number }) {
  if (power_level === 0) return <span className="muted-note mono">ALL UNIVERSITY</span>;
  if (!locs || locs.length === 0) return <span className="muted-note">Personal scope</span>;
  const shown = locs.slice(0, max);
  const rest = locs.length - max;
  return (
    <div className="loc-chips">
      {shown.map((l) => <span key={l} className="chip chip-loc">{l}</span>)}
      {rest > 0 && <span className="loc-more">+{rest}</span>}
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

const unavailableActionStyle = { opacity: 0.55, cursor: "not-allowed" } as const;
const busyActionStyle = { opacity: 0.75, cursor: "wait" } as const;
const USERS_PAGE_SIZE = 12;

function RowActions({
  onEdit,
  onToggleActive,
  onDelete,
  canChange,
  canDelete,
  active,
  pageBusy = false,
  toggleBusy = false,
  deleteBusy = false,
}: {
  onEdit?: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  canChange: boolean;
  canDelete: boolean;
  active: boolean;
  pageBusy?: boolean;
  toggleBusy?: boolean;
  deleteBusy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const rowBusy = toggleBusy || deleteBusy;
  const supportedLocked = pageBusy || rowBusy;
  const canRenderEdit = canChange && Boolean(onEdit);
  const canRenderToggle = canChange;
  const canRenderDelete = canDelete;
  const hasVisibleActions = canRenderEdit || canRenderToggle || canRenderDelete;
  const editDisabled = !canRenderEdit || supportedLocked;
  const toggleDisabled = !canRenderToggle || supportedLocked;
  const deleteDisabled = !canRenderDelete || supportedLocked;

  const editTitle = canRenderEdit ? "Edit user" : "Requires change user permission";
  const toggleTitle = toggleBusy ? (active ? "Disabling user…" : "Enabling user…") : (active ? "Disable user" : "Enable user");
  const deleteTitle = deleteBusy ? "Deleting user…" : "Delete user";

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
    if (supportedLocked) closeMenu();
  }, [supportedLocked, closeMenu]);

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

  if (!hasVisibleActions) {
    return <span className="muted-note mono">No actions</span>;
  }

  return (
    <div className="row-actions">
      {canRenderEdit && (
        <button
          type="button"
          className="btn btn-xs btn-ghost row-action"
          onClick={onEdit}
          title={editTitle}
          disabled={editDisabled}
          style={editDisabled ? busyActionStyle : undefined}
        >
          <Ic d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" size={13} />
          <span className="ra-label">Edit</span>
        </button>
      )}
      {canRenderToggle && (
        <button
          type="button"
          className="btn btn-xs btn-ghost row-action"
          onClick={onToggleActive}
          title={toggleTitle}
          disabled={toggleDisabled}
          style={toggleDisabled ? busyActionStyle : undefined}
        >
          <Ic d="M18.36 6.64A9 9 0 015.64 19.36M23 12a11 11 0 11-22 0 11 11 0 0122 0z" size={13} />
          <span className="ra-label">{toggleBusy ? (active ? "Disabling…" : "Enabling…") : (active ? "Disable" : "Enable")}</span>
        </button>
      )}
      {canRenderDelete && (
        <div className="row-action-more" ref={moreRef}>
          <button type="button" className="btn btn-xs btn-ghost" onClick={() => setOpen(prev => !prev)} disabled={supportedLocked} style={supportedLocked ? busyActionStyle : undefined}>
            <Ic d={<><circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="19" r="1" fill="currentColor"/></>} size={14} />
          </button>
          {open && (
            <div ref={menuRef} className={"row-menu" + (openUp ? " row-menu-up" : "")}>
              <button type="button" className="row-menu-item" disabled style={unavailableActionStyle} title="View profile unavailable in this build">View profile</button>
              <button type="button" className="row-menu-item" disabled style={unavailableActionStyle} title="Audit history unavailable in this build">Audit history</button>
              <button
                type="button"
                className="row-menu-item danger"
                onClick={() => { closeMenu(); onDelete(); }}
                disabled={deleteDisabled}
                title={deleteTitle}
                style={deleteDisabled ? busyActionStyle : undefined}
              >
                {deleteBusy ? "Deleting…" : "Delete user"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Density toggle ────────────────────────────────────────────────────────────

function DensityToggle({ density, setDensity }: { density: string; setDensity: (d: string) => void }) {
  return (
    <div className="seg">
      {(["compact","balanced","comfortable"] as const).map(d => (
        <button type="button" key={d} className={"seg-btn" + (density === d ? " active" : "")} onClick={() => setDensity(d)}>
          {d.charAt(0).toUpperCase() + d.slice(1)}
        </button>
      ))}
    </div>
  );
}

// ── Users page ────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const router = useRouter();
  const { can, isLoading: authLoading } = useAuth();

  const canViewUsers = can(ADMIN_PERMISSIONS.users.view);
  const canViewRoles = can(ADMIN_PERMISSIONS.roles.view);
  const canAddUser = can(ADMIN_PERMISSIONS.users.add);
  const canChangeUser = can(ADMIN_PERMISSIONS.users.change);
  const canDeleteUser = can(ADMIN_PERMISSIONS.users.delete);

  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [density, setDensity] = useState("balanced");
  const [mode, setMode] = useState<"table" | "grid">("table");
  const [addOpen, setAddOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [busyAction, setBusyAction] = useState<{ kind: "toggle" | "delete"; userId: number } | null>(null);
  const pageBusy = busyAction !== null;
  const canAssignUserRoles = shouldLoadUserAssignmentSelectors(editUser ? "edit" : "create", canAddUser, canChangeUser);
  const canAssignUserLocations = canAssignUserRoles;

  const clearActionError = useCallback(() => setActionError(null), []);
  const updateUserInList = useCallback((userId: number, updater: (user: User) => User) => {
    setAllUsers(prev => prev.map(user => (user.id === userId ? updater(user) : user)));
  }, []);

  const removeUserFromList = useCallback((userId: number) => {
    setAllUsers(prev => prev.filter(user => user.id !== userId));
  }, []);

  const loadUsers = useCallback(async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
    if (showLoading) setIsLoading(true);
    setFetchError(null);
    try {
      const data = await apiFetch<Page<User> | User[]>("/api/users/management/");
      setAllUsers(Array.isArray(data) ? data : data.results);
      return true;
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load users");
      return false;
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!canViewUsers) {
      router.replace("/403");
      return;
    }
    loadUsers();
  }, [authLoading, canViewUsers, router, loadUsers]);

  const handleCreateSave = useCallback(async () => {
    const refreshed = await loadUsers({ showLoading: false });
    if (!refreshed) {
      setActionError("User created, but the list could not be refreshed. Reload to resync the list.");
    }
  }, [loadUsers]);

  const handleEditSave = useCallback(async () => {
    const refreshed = await loadUsers({ showLoading: false });
    if (!refreshed) {
      setActionError("User updated, but the list could not be refreshed. Reload to resync the list.");
    }
  }, [loadUsers]);

  const updateUser = useCallback(async (user: User, updates: Partial<Pick<User, "is_active">>, errorFallback: string) => {
    if (busyAction) return;
    const previous = user;
    const next = { ...user, ...updates };
    setBusyAction({ kind: "toggle", userId: user.id });
    clearActionError();
    updateUserInList(user.id, () => next);
    try {
      await apiFetch(`/api/users/management/${user.id}/`, {
        method: "PATCH",
        body: JSON.stringify(updates),
      });
      const refreshed = await loadUsers({ showLoading: false });
      if (!refreshed) {
        setActionError("User updated, but the list could not be refreshed. The row was updated locally; reload to resync.");
      }
    } catch (err) {
      updateUserInList(user.id, () => previous);
      setActionError(err instanceof Error ? err.message : errorFallback);
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, clearActionError, loadUsers, updateUserInList]);

  const handleToggleActive = useCallback(async (user: User) => {
    await updateUser(
      user,
      { is_active: !user.is_active },
      `Failed to ${user.is_active ? "disable" : "enable"} user`,
    );
  }, [updateUser]);

  const handleDelete = useCallback(async (user: User) => {
    if (busyAction) return;
    const confirmed = window.confirm(`Delete ${user.first_name} ${user.last_name}? This cannot be undone.`);
    if (!confirmed) return;

    setBusyAction({ kind: "delete", userId: user.id });
    clearActionError();
    try {
      await apiFetch(`/api/users/management/${user.id}/`, {
        method: "DELETE",
      });
      removeUserFromList(user.id);
      const refreshed = await loadUsers({ showLoading: false });
      if (!refreshed) {
        setActionError("User deleted, but the list could not be refreshed. The row has been removed locally; reload to resync the list.");
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete user");
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, clearActionError, loadUsers, removeUserFromList]);

  // PRESERVED: filtering logic matching backend field names
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allUsers.filter((u: User) => {
      if (q) {
        const hay = `${u.first_name} ${u.last_name} ${u.username} ${u.email} ${u.employee_id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (tierFilter !== "all" && String(u.power_level) !== tierFilter) return false;
      if (statusFilter === "active" && !u.is_active) return false;
      if (statusFilter === "inactive" && u.is_active) return false;
      return true;
    });
  }, [allUsers, search, tierFilter, statusFilter]);

  const {
    page,
    totalPages,
    pageItems: pagedUsers,
    pageStart,
    pageEnd,
    setPage,
  } = useClientPagination(filtered, USERS_PAGE_SIZE, [search, tierFilter, statusFilter]);

  return (
    <div data-density={density}>
      <AddUserModal
        open={addOpen || editUser !== null}
        mode={editUser ? "edit" : "create"}
        user={editUser}
        canAssignRoles={canAssignUserRoles}
        canAssignLocations={canAssignUserLocations}
        onClose={() => { setAddOpen(false); setEditUser(null); }}
        onSave={editUser ? handleEditSave : handleCreateSave}
      />
      <Topbar breadcrumb={["Administration", "User Management"]} />
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
            Loading users…
          </div>
        )}
        {/* Page header */}
        <div className="page-head">
          <div className="page-title-group">
            <div className="eyebrow">Administration</div>
            <h1>User Management</h1>
            <div className="page-sub">Manage user accounts, roles and location assignments across the university.</div>
          </div>
          <div className="page-head-actions">
            <button type="button" className="btn btn-sm" disabled title="Persons Module unavailable in this build" style={unavailableActionStyle}>
              <Ic d={<><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="7" r="2.6"/><path d="M21 19c0-2.7-1.8-5-4.5-5"/></>} size={13} />
              Persons Module
            </button>
            {canViewRoles && (
              <Link href="/roles" className="btn btn-sm">
                <Ic d={<><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></>} size={13} />
                Manage Roles
              </Link>
            )}
          </div>
        </div>

        {/* Filter bar */}
        <div className="filter-bar">
          <div className="filter-bar-left">
            {/* Search */}
            <div className="search-input">
              <Ic d={<><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>} size={14} />
              <input
                placeholder="Search by name, username, employee ID or email…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && <button type="button" className="clear-search" onClick={() => setSearch("")}>×</button>}
            </div>

            {/* Tier filter */}
            <div className="filter-select-group">
              <div className="chip-filter-label">Tier</div>
              <div className="filter-select-wrap">
                <ThemedSelect
                  value={tierFilter}
                  onChange={setTierFilter}
                  size="compact"
                  ariaLabel="Filter users by tier"
                  options={[
                    { value: "all", label: "All tiers" },
                    { value: "0", label: "Global" },
                    { value: "1", label: "Scoped" },
                    { value: "3", label: "Personal" },
                  ]}
                />
              </div>
            </div>

            {/* Status filter */}
            <div className="filter-select-group">
              <div className="chip-filter-label">Status</div>
              <div className="filter-select-wrap">
                <ThemedSelect
                  value={statusFilter}
                  onChange={setStatusFilter}
                  size="compact"
                  ariaLabel="Filter users by status"
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
              {/* View toggle */}
            <div className="seg" title="View mode">
              <button type="button" className={"seg-btn icon-only" + (mode === "table" ? " active" : "")} onClick={() => setMode("table")} title="Table">
                <Ic d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" size={14} />
              </button>
              <button type="button" className={"seg-btn icon-only" + (mode === "grid" ? " active" : "")} onClick={() => setMode("grid")} title="Grid">
                <Ic d={<><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></>} size={14} />
              </button>
            </div>
            <button type="button" className="btn btn-sm" disabled title="Export unavailable in this build" style={unavailableActionStyle}>
              <Ic d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" size={13} />
              Export
            </button>
            {canAddUser && (
              <button type="button" className="btn btn-sm btn-primary" onClick={() => setAddOpen(true)}>
                <Ic d="M12 5v14M5 12h14" size={14} />
                Add User
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        {mode === "table" ? (
          <div className="table-card">
            <div className="table-card-head">
              <div className="table-card-head-left">
                <div className="eyebrow">Users list</div>
                <div className="table-count">
                  <span className="mono">{filtered.length}</span>
                  <span>of</span>
                  <span className="mono">{allUsers.length}</span>
                  <span>accounts</span>
                </div>
              </div>
            </div>
            <div className="h-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Employee ID</th>
                    <th>Created At</th>
                    <th>Assigned Locations</th>
                    <th>Roles</th>
                    <th>Last Login</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
              {pagedUsers.map(u => (
                  <UserRow
                    key={u.id}
                    u={u}
                    pageBusy={pageBusy}
                    toggleBusy={busyAction?.kind === "toggle" && busyAction.userId === u.id}
                    deleteBusy={busyAction?.kind === "delete" && busyAction.userId === u.id}
                    onEdit={() => { if (canChangeUser) { setAddOpen(false); setEditUser(u); } }}
                    onToggleActive={() => { if (canChangeUser) { handleToggleActive(u); } }}
                    onDelete={() => { if (canDeleteUser) { handleDelete(u); } }}
                    canChangeUser={canChangeUser}
                    canDeleteUser={canDeleteUser}
                  />
              ))}
                </tbody>
              </table>
            </div>
            <ListPagination
              summary={filtered.length === 0 ? "Showing 0 users" : `Showing ${pageStart}-${pageEnd} of ${filtered.length} users`}
              page={page}
              totalPages={totalPages}
              onPrev={() => setPage(current => Math.max(1, current - 1))}
              onNext={() => setPage(current => Math.min(totalPages, current + 1))}
            />
          </div>
        ) : (
          <div className="users-grid">
            {pagedUsers.map(u => (
                <UserCard
                  key={u.id}
                  u={u}
                  pageBusy={pageBusy}
                  toggleBusy={busyAction?.kind === "toggle" && busyAction.userId === u.id}
                  deleteBusy={busyAction?.kind === "delete" && busyAction.userId === u.id}
                  onEdit={() => { if (canChangeUser) { setAddOpen(false); setEditUser(u); } }}
                  onToggleActive={() => { if (canChangeUser) { handleToggleActive(u); } }}
                  onDelete={() => { if (canDeleteUser) { handleDelete(u); } }}
                  canChangeUser={canChangeUser}
                  canDeleteUser={canDeleteUser}
                />
              ))}
          </div>
        )}
        {mode === "grid" && filtered.length > 0 ? (
          <ListPagination
            summary={`Showing ${pageStart}-${pageEnd} of ${filtered.length} users`}
            page={page}
            totalPages={totalPages}
            onPrev={() => setPage(current => Math.max(1, current - 1))}
            onNext={() => setPage(current => Math.min(totalPages, current + 1))}
            standalone
          />
        ) : null}
      </div>
    </div>
  );
}

// ── Table row ─────────────────────────────────────────────────────────────────

function UserRow({
  u,
  pageBusy,
  toggleBusy,
  deleteBusy,
  onEdit,
  onToggleActive,
  onDelete,
  canChangeUser,
  canDeleteUser,
}: {
  u: User;
  pageBusy: boolean;
  toggleBusy: boolean;
  deleteBusy: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  canChangeUser: boolean;
  canDeleteUser: boolean;
}) {
  return (
    <tr>
      <td className="col-user">
        <div className="user-cell">
          <Avatar name={`${u.first_name} ${u.last_name}`} tone={u.power_level === 0 ? 0 : u.power_level === 1 ? 0 : 2} />
          <div>
            <div className="user-name">{u.first_name} {u.last_name}</div>
            <div className="user-username mono">@{u.username}</div>
          </div>
        </div>
      </td>
      <td className="col-eid mono">{u.employee_id}</td>
      <td><TimestampCell value={u.created_at} fallback="—" /></td>
      <td className="users-location-cell"><LocationChips locs={u.assigned_locations_display} power_level={u.power_level} max={1} /></td>
      <td>
        <div className="group-cell">
          {(u.groups_display || []).slice(0, 2).map((g) => <span key={g} className="chip">{g}</span>)}
        </div>
      </td>
      <td className="col-login">
        <TimestampCell value={u.last_login} fallback="Never" />
      </td>
      <td><StatusPill active={u.is_active} /></td>
      <td className="col-actions">
        <RowActions
          onEdit={onEdit}
          onToggleActive={onToggleActive}
          onDelete={onDelete}
          canChange={canChangeUser}
          canDelete={canDeleteUser}
          active={u.is_active}
          pageBusy={pageBusy}
          toggleBusy={toggleBusy}
          deleteBusy={deleteBusy}
        />
      </td>
    </tr>
  );
}

// ── Grid card ─────────────────────────────────────────────────────────────────

function UserCard({
  u,
  pageBusy,
  toggleBusy,
  deleteBusy,
  onEdit,
  onToggleActive,
  onDelete,
  canChangeUser,
  canDeleteUser,
}: {
  u: User;
  pageBusy: boolean;
  toggleBusy: boolean;
  deleteBusy: boolean;
  onEdit: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  canChangeUser: boolean;
  canDeleteUser: boolean;
}) {
  return (
    <div className="user-card">
      <div className="user-card-head">
        <Avatar name={`${u.first_name} ${u.last_name}`} size={44} tone={u.power_level === 0 ? 0 : u.power_level === 1 ? 0 : 2} />
        <StatusPill active={u.is_active} />
      </div>
      <div className="user-card-name">{u.first_name} {u.last_name}</div>
      <div className="user-card-meta mono">@{u.username}</div>
      <div className="user-card-eid mono">{u.employee_id}</div>
      <div className="user-card-section">
        <div className="eyebrow">Created At</div>
        <TimestampCell value={u.created_at} fallback="—" />
      </div>
      <div className="user-card-section">
        <div className="eyebrow">Locations</div>
        <LocationChips locs={u.assigned_locations_display} power_level={u.power_level} max={4} />
      </div>
      <div className="user-card-foot">
        <div>
          <div className="eyebrow">Last active</div>
          <div className="user-card-last mono">{relTime(u.last_login)}</div>
        </div>
        <RowActions
          onEdit={onEdit}
          onToggleActive={onToggleActive}
          onDelete={onDelete}
          canChange={canChangeUser}
          canDelete={canDeleteUser}
          active={u.is_active}
          pageBusy={pageBusy}
          toggleBusy={toggleBusy}
          deleteBusy={deleteBusy}
        />
      </div>
    </div>
  );
}
