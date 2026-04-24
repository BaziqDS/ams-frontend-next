"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { CategoryModal } from "@/components/CategoryModal";
import { apiFetch, type Page } from "@/lib/api";
import { useCan, useCapabilities } from "@/contexts/CapabilitiesContext";

const Ic = ({ d, size = 16 }: { d: React.ReactNode | string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true" focusable="false">
    {typeof d === "string" ? <path d={d} /> : d}
  </svg>
);

interface Category {
  id: number;
  name: string;
  code: string;
  parent_category: number | null;
  parent_category_display?: string | null;
  category_type: string;
  tracking_type: string;
  default_depreciation_rate: string | number | null;
  resolved_category_type?: string | null;
  resolved_tracking_type?: string | null;
  resolved_depreciation_rate?: string | number | null;
  is_active: boolean;
  created_at?: string | null;
  updated_at?: string | null;
}

function formatLabel(value: string | null | undefined, fallback = "—") {
  if (!value) return fallback;
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function formatRate(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return String(value);
  return `${num.toFixed(2)}%`;
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

function CategoryActions() {
  return <span className="muted-note mono">No actions</span>;
}

function RowActions({ onEdit, onDelete, canEdit, canDelete, disabled = false, deleteBusy = false }: { onEdit?: () => void; onDelete?: () => void; canEdit: boolean; canDelete: boolean; disabled?: boolean; deleteBusy?: boolean }) {
  const canRenderEdit = canEdit && Boolean(onEdit);
  const canRenderDelete = canDelete && Boolean(onDelete);

  if (!canRenderEdit && !canRenderDelete) return <CategoryActions />;

  return (
    <div className="row-actions">
      {canRenderEdit && (
        <button type="button" className="btn btn-xs btn-ghost row-action" onClick={onEdit} title="Edit category" disabled={disabled}>
          <Ic d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" size={13} />
          <span className="ra-label">Edit</span>
        </button>
      )}
      {canRenderDelete && (
        <button type="button" className="btn btn-xs btn-danger-ghost row-action" onClick={onDelete} title="Delete category" disabled={disabled}>
          <Ic d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0l1 12h6l1-12" size={13} />
          <span className="ra-label">{deleteBusy ? "Deleting…" : "Delete"}</span>
        </button>
      )}
    </div>
  );
}

function CategoryRow({ category, canEdit, canDelete, onEdit, onDelete, disabled = false, deleteBusy = false }: { category: Category; canEdit: boolean; canDelete: boolean; onEdit?: () => void; onDelete?: () => void; disabled?: boolean; deleteBusy?: boolean }) {
  const resolvedType = category.resolved_category_type ?? category.category_type;
  const resolvedTracking = category.resolved_tracking_type ?? category.tracking_type;
  const resolvedRate = category.resolved_depreciation_rate ?? category.default_depreciation_rate;

  return (
    <tr>
      <td className="col-user">
        <div className="user-cell">
          <div className="avatar" style={{ width: 32, height: 32, fontSize: 11, background: "linear-gradient(135deg, color-mix(in oklch, var(--primary) 82%, white), var(--primary))" }}>
            {(category.name || "CA").split(" ").map(n => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "CA"}
          </div>
          <div>
            <div className="user-name">{category.name}</div>
            <div className="user-username mono">{category.code}</div>
          </div>
        </div>
      </td>
      <td><span className="chip chip-loc mono">{category.code}</span></td>
      <td>
        {category.parent_category_display
          ? <span className="chip chip-loc">{category.parent_category_display}</span>
          : <span className="muted-note">Root category</span>}
      </td>
      <td>
        <div className="group-cell">
          <span className="chip">{formatLabel(resolvedType)}</span>
          {resolvedType !== category.category_type && <span className="muted-note mono">Raw: {formatLabel(category.category_type)}</span>}
        </div>
      </td>
      <td>
        <div className="group-cell">
          <span className="chip">{formatLabel(resolvedTracking)}</span>
          {resolvedTracking !== category.tracking_type && <span className="muted-note mono">Raw: {formatLabel(category.tracking_type)}</span>}
        </div>
      </td>
      <td>
        <div className="login-cell">
          <div>{formatRate(resolvedRate)}</div>
          {resolvedRate !== category.default_depreciation_rate && (
            <div className="login-cell-sub mono">Default {formatRate(category.default_depreciation_rate)}</div>
          )}
        </div>
      </td>
      <td><StatusPill active={category.is_active} /></td>
      <td className="col-actions">
        <RowActions canEdit={canEdit} canDelete={canDelete} onEdit={onEdit} onDelete={onDelete} disabled={disabled} deleteBusy={deleteBusy} />
      </td>
    </tr>
  );
}

export default function CategoriesPage() {
  const router = useRouter();
  const { isLoading: capsLoading } = useCapabilities();
  const canViewCategories = useCan("categories");
  const canManageCategories = useCan("categories", "manage");
  const canDeleteCategories = useCan("categories", "full");
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [density, setDensity] = useState<"compact" | "balanced" | "comfortable">("balanced");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [busyAction, setBusyAction] = useState<{ kind: "delete"; categoryId: number } | null>(null);

  const clearFetchError = useCallback(() => setFetchError(null), []);
  const clearActionError = useCallback(() => setActionError(null), []);

  const loadCategories = useCallback(async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
    if (showLoading) setIsLoading(true);
    setFetchError(null);
    try {
      const data = await apiFetch<Page<Category> | Category[]>('/api/inventory/categories/?page_size=500');
      setCategories(Array.isArray(data) ? data : data.results);
      return true;
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load categories");
      return false;
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (capsLoading) return;
    if (!canViewCategories) {
      router.replace("/403");
      return;
    }
    loadCategories();
  }, [capsLoading, canViewCategories, loadCategories, router]);

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    return categories.filter(category => {
      if (q) {
        const hay = [
          category.name,
          category.code,
          category.parent_category_display ?? "",
          category.category_type,
          category.tracking_type,
          category.resolved_category_type ?? "",
          category.resolved_tracking_type ?? "",
        ].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }

      if (typeFilter !== "all" && category.category_type !== typeFilter) return false;
      if (statusFilter === "active" && !category.is_active) return false;
      if (statusFilter === "inactive" && category.is_active) return false;
      return true;
    });
  }, [categories, search, typeFilter, statusFilter]);

  const typeOptions = useMemo(() => {
    const values = new Set<string>();
    categories.forEach(category => {
      if (category.category_type) values.add(category.category_type);
    });
    return Array.from(values).sort();
  }, [categories]);

  const openCreateModal = useCallback(() => {
    setEditingCategory(null);
    setModalOpen(true);
  }, []);

  const openEditModal = useCallback((category: Category) => {
    setEditingCategory(category);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setEditingCategory(null);
  }, []);

  const handleSave = useCallback(async () => {
    const refreshed = await loadCategories({ showLoading: false });
    if (!refreshed) {
      setActionError("Category saved, but the list could not be refreshed. Reload to resync the list.");
    }
  }, [loadCategories]);

  const handleDelete = useCallback(async (category: Category) => {
    if (!canDeleteCategories) {
      setActionError("You do not have permission to delete categories.");
      return;
    }

    if (busyAction) return;
    const confirmed = window.confirm(`Delete ${category.name}? This cannot be undone.`);
    if (!confirmed) return;

    setBusyAction({ kind: "delete", categoryId: category.id });
    clearActionError();

    try {
      await apiFetch(`/api/inventory/categories/${category.id}/`, {
        method: "DELETE",
      });
      setCategories(prev => prev.filter(item => item.id !== category.id));
      const refreshed = await loadCategories({ showLoading: false });
      if (!refreshed) {
        setActionError("Category deleted, but the list could not be refreshed. The row has been removed locally; reload to resync the list.");
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete category");
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, canDeleteCategories, clearActionError, loadCategories]);

  const pageBusy = busyAction !== null;
  const deleteBusyCategoryId = busyAction?.kind === "delete" ? busyAction.categoryId : null;

  return (
    <div data-density={density}>
      <Topbar breadcrumb={["Inventory", "Categories"]} />

      <div className="page">
        {fetchError && (
          <div style={{ padding: "12px 16px", background: "var(--danger-weak)", border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)", borderRadius: "var(--radius)", color: "var(--danger)", fontSize: 13, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span>{fetchError}</span>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn btn-xs" onClick={() => loadCategories()}>
                Retry
              </button>
              <button type="button" className="btn btn-xs btn-ghost" onClick={clearFetchError}>
                Dismiss
              </button>
            </div>
          </div>
        )}

        {actionError && (
          <div style={{ padding: "12px 16px", background: "var(--danger-weak)", border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)", borderRadius: "var(--radius)", color: "var(--danger)", fontSize: 13, marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <span>{actionError}</span>
            <button type="button" className="btn btn-xs btn-ghost" onClick={clearActionError}>
              Dismiss
            </button>
          </div>
        )}

        <div className="page-head">
          <div className="page-title-group">
            <div className="eyebrow">Inventory</div>
            <h1>Categories</h1>
            <div className="page-sub">Browse and filter the inventory category catalog.</div>
          </div>
          <div className="page-head-actions" />
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
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} aria-label="Filter categories by type">
                  <option value="all">All types</option>
                  {typeOptions.map(type => (
                    <option key={type} value={type}>
                      {formatLabel(type)}
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
            {canManageCategories && (
              <button type="button" className="btn btn-sm btn-primary" onClick={openCreateModal}>
                <Ic d="M12 5v14M5 12h14" size={14} />
                Add Category
              </button>
            )}
          </div>
        </div>

        <div className="table-card">
          <div className="table-card-head">
            <div className="table-card-head-left">
              <div className="eyebrow">Categories list</div>
              <div className="table-count">
                <span className="mono">{filteredCategories.length}</span>
                <span>of</span>
                <span className="mono">{categories.length}</span>
                <span>categories</span>
              </div>
            </div>
          </div>

          {isLoading ? (
            <div style={{ padding: 32, textAlign: "center", color: "var(--muted)", borderTop: "1px solid var(--hairline)" }}>
              Loading categories…
            </div>
          ) : (
            <div className="h-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Code</th>
                    <th>Parent</th>
                    <th>Type</th>
                    <th>Tracking</th>
                    <th>Depreciation</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCategories.length === 0 ? (
                    <tr>
                    <td colSpan={8}>
                        <div style={{ padding: "32px 12px", textAlign: "center", color: "var(--text-2)", fontSize: 13 }}>
                          No categories match the current filters.
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredCategories.map(category => (
                      <CategoryRow
                        key={category.id}
                        category={category}
                        canEdit={canManageCategories}
                        canDelete={canDeleteCategories}
                        onEdit={canManageCategories ? () => openEditModal(category) : undefined}
                        onDelete={canDeleteCategories ? () => handleDelete(category) : undefined}
                        disabled={isLoading || pageBusy}
                        deleteBusy={deleteBusyCategoryId === category.id}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="table-card-foot">
            <div className="eyebrow">Showing {filteredCategories.length} rows</div>
            <div className="pager">
              <span className="mono pager-current">Listing view</span>
            </div>
          </div>
        </div>

        <CategoryModal
          open={modalOpen}
          mode={editingCategory ? "edit" : "create"}
          category={editingCategory}
          onClose={closeModal}
          onSave={handleSave}
        />
      </div>
    </div>
  );
}
