"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ListPagination } from "@/components/ListPagination";
import { ThemedSelect } from "@/components/ThemedSelect";
import { Topbar } from "@/components/Topbar";
import { CategoryModal, type CategoryRecord } from "@/components/CategoryModal";
import { apiFetch, type Page } from "@/lib/api";
import { useCan, useCapabilities } from "@/contexts/CapabilitiesContext";
import { useClientPagination } from "@/lib/listPagination";
import { relTime } from "@/lib/userUiShared";

const Ic = ({ d, size = 16 }: { d: React.ReactNode | string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true" focusable="false">
    {typeof d === "string" ? <path d={d} /> : d}
  </svg>
);

type CategoryListVariant = "root" | "children";

const CATEGORIES_PAGE_SIZE = 15;

interface CategoryListViewProps {
  variant: CategoryListVariant;
  parentId?: string;
}

function formatLabel(value: string | null | undefined, fallback = "—") {
  if (!value) return fallback;
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, c => c.toUpperCase());
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

function compactList(items: string[], max = 1) {
  const shown = items.slice(0, max);
  return { shown, rest: items.length - shown.length };
}

function SubcategorySummary({ names }: { names: string[] }) {
  if (names.length === 0) return <span className="muted-note">No subcategories</span>;
  const { shown, rest } = compactList(names, 1);
  return (
    <div className="group-cell">
      {shown.map(name => <span key={name} className="chip">{name}</span>)}
      {rest > 0 ? <span className="loc-more">+{rest}</span> : null}
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
        <button type="button" className="btn btn-xs btn-ghost row-action" onClick={event => { event.stopPropagation(); onEdit?.(); }} title="Edit category" disabled={disabled}>
          <Ic d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" size={13} />
          <span className="ra-label">Edit</span>
        </button>
      )}
      {canRenderDelete && (
        <button type="button" className="btn btn-xs btn-danger-ghost row-action" onClick={event => { event.stopPropagation(); onDelete?.(); }} title="Delete category" disabled={disabled}>
          <Ic d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0l1 12h6l1-12" size={13} />
          <span className="ra-label">{deleteBusy ? "Deleting…" : "Delete"}</span>
        </button>
      )}
    </div>
  );
}

function CategoryRow({ category, isChildrenView, childCount, childNames, trackingSummary, canEdit, canDelete, onOpen, onEdit, onDelete, disabled = false, deleteBusy = false }: { category: CategoryRecord; isChildrenView: boolean; childCount: number; childNames: string[]; trackingSummary: string; canEdit: boolean; canDelete: boolean; onOpen?: () => void; onEdit?: () => void; onDelete?: () => void; disabled?: boolean; deleteBusy?: boolean }) {
  const resolvedType = category.resolved_category_type ?? category.category_type;
  const resolvedTracking = category.resolved_tracking_type ?? category.tracking_type;

  return (
    <tr onClick={onOpen} style={onOpen ? { cursor: "pointer" } : undefined}>
      <td className="col-user">
        <div className="user-cell">
          <div>
            <div className="user-name">{category.name}</div>
            <div className="user-username mono">{category.code}</div>
          </div>
        </div>
      </td>
      <td><span className="chip chip-loc mono">{category.code}</span></td>
      <td>
        <div className="group-cell">
          <span className="chip">{formatLabel(resolvedType)}</span>
          {resolvedType !== category.category_type && <span className="muted-note mono">Raw: {formatLabel(category.category_type)}</span>}
        </div>
      </td>
      {isChildrenView ? (
        <td>
          <div className="group-cell">
            <span className="chip">{formatLabel(resolvedTracking)}</span>
            {resolvedTracking !== category.tracking_type && <span className="muted-note mono">Raw: {formatLabel(category.tracking_type)}</span>}
          </div>
        </td>
      ) : (
        <>
          <td><SubcategorySummary names={childNames} /></td>
          <td><span className="chip">{trackingSummary}</span></td>
        </>
      )}
      {isChildrenView && <td>{category.parent_category_display ?? "Root category"}</td>}
      <td><StatusPill active={category.is_active} /></td>
      <td className="col-login">
        <div className="login-cell">
          <div>{category.updated_at ? relTime(category.updated_at) : "Unknown"}</div>
        </div>
      </td>
      <td className="col-actions">
        <RowActions canEdit={canEdit} canDelete={canDelete} onEdit={onEdit} onDelete={onDelete} disabled={disabled} deleteBusy={deleteBusy} />
      </td>
    </tr>
  );
}

function CategoryCard({ category, childCount, childNames, trackingSummary, canEdit, canDelete, pageBusy, deleteBusy, onOpen, onEdit, onDelete }: { category: CategoryRecord; childCount: number; childNames: string[]; trackingSummary: string; canEdit: boolean; canDelete: boolean; pageBusy: boolean; deleteBusy: boolean; onOpen?: () => void; onEdit: () => void; onDelete: () => void }) {
  const resolvedType = category.resolved_category_type ?? category.category_type;
  const resolvedTracking = category.resolved_tracking_type ?? category.tracking_type;

  return (
    <div className="user-card" onClick={onOpen} style={onOpen ? { cursor: "pointer" } : undefined}>
      <div className="user-card-head">
        <StatusPill active={category.is_active} />
      </div>
      <div className="user-card-name">{category.name}</div>
      <div className="user-card-meta mono">{category.code}</div>
      <div className="user-card-section">
        <div className="eyebrow">Classification</div>
        <div className="group-cell">
          <span className="chip">{formatLabel(resolvedType)}</span>
          {resolvedTracking ? <span className="chip">{formatLabel(resolvedTracking)}</span> : <span className="chip">{trackingSummary}</span>}
        </div>
      </div>
      <div className="user-card-section">
        <div className="eyebrow">Structure</div>
        {category.parent_category_display ? (
          <div style={{ fontSize: 13, color: "var(--text-1)" }}>{category.parent_category_display}</div>
        ) : (
          <div style={{ display: "grid", gap: 6 }}>
            <SubcategorySummary names={childNames} />
            <div className="muted-note mono">{childCount} direct subcategories</div>
          </div>
        )}
      </div>
      <div className="user-card-foot">
        <div>
          <div className="eyebrow">Updated</div>
          <div className="user-card-last mono">{category.updated_at ? relTime(category.updated_at) : "Unknown"}</div>
        </div>
        <RowActions
          canEdit={canEdit}
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

export function CategoryListView({ variant, parentId }: CategoryListViewProps) {
  const router = useRouter();
  const { isLoading: capsLoading } = useCapabilities();
  const canViewCategories = useCan("categories");
  const canManageCategories = useCan("categories", "manage");
  const canDeleteCategories = useCan("categories", "full");
  const [allCategories, setAllCategories] = useState<CategoryRecord[]>([]);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [parentCategory, setParentCategory] = useState<CategoryRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [density, setDensity] = useState<"compact" | "balanced" | "comfortable">("balanced");
  const [mode, setMode] = useState<"table" | "grid">("table");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryRecord | null>(null);
  const [busyAction, setBusyAction] = useState<{ kind: "delete"; categoryId: number } | null>(null);

  const clearFetchError = useCallback(() => setFetchError(null), []);
  const clearActionError = useCallback(() => setActionError(null), []);

  const applyCategoryScope = useCallback((records: CategoryRecord[]) => {
    if (variant === "children") {
      const id = Number(parentId);
      const parent = records.find(category => category.id === id) ?? null;
      setParentCategory(parent);
      setCategories(records.filter(category => category.parent_category === id));
      if (!parent && parentId) {
        setFetchError("Parent category could not be found.");
      }
      return;
    }

    setParentCategory(null);
    setCategories(records.filter(category => category.parent_category === null));
  }, [parentId, variant]);

  const loadCategories = useCallback(async ({ showLoading = true }: { showLoading?: boolean } = {}) => {
    if (variant === "children" && !parentId) return false;
    if (showLoading) setIsLoading(true);
    setFetchError(null);
    try {
      const data = await apiFetch<Page<CategoryRecord> | CategoryRecord[]>("/api/inventory/categories/?page_size=500");
      const records = Array.isArray(data) ? data : data.results;
      setAllCategories(records);
      applyCategoryScope(records);
      return true;
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to load categories");
      return false;
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }, [applyCategoryScope, parentId, variant]);

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
          category.category_type ?? "",
          category.tracking_type ?? "",
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

  const childCountByCategory = useMemo(() => {
    const counts = new Map<number, number>();
    allCategories.forEach(category => {
      if (category.parent_category != null) {
        counts.set(category.parent_category, (counts.get(category.parent_category) ?? 0) + 1);
      }
    });
    return counts;
  }, [allCategories]);

  const childNamesByCategory = useMemo(() => {
    const grouped = new Map<number, string[]>();
    allCategories
      .filter(category => category.parent_category != null)
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach(category => {
        const parentKey = category.parent_category;
        if (parentKey == null) return;
        const current = grouped.get(parentKey) ?? [];
        current.push(category.name);
        grouped.set(parentKey, current);
      });
    return grouped;
  }, [allCategories]);

  const trackingSummaryByCategory = useMemo(() => {
    const summary = new Map<number, string>();
    allCategories
      .filter(category => category.parent_category != null)
      .forEach(category => {
        const parentId = category.parent_category;
        if (parentId == null) return;
        const tracking = formatLabel(category.resolved_tracking_type ?? category.tracking_type, "Unassigned");
        const existing = summary.get(parentId);
        if (!existing) {
          summary.set(parentId, tracking);
        } else if (!existing.split(" / ").includes(tracking)) {
          summary.set(parentId, `${existing} / ${tracking}`);
        }
      });
    return summary;
  }, [allCategories]);

  const {
    page,
    totalPages,
    pageItems: pagedCategories,
    pageStart,
    pageEnd,
    setPage,
  } = useClientPagination(filteredCategories, CATEGORIES_PAGE_SIZE, [search, typeFilter, statusFilter, variant, parentId]);

  const openCreateModal = useCallback(() => {
    setEditingCategory(null);
    setModalOpen(true);
  }, []);

  const openEditModal = useCallback((category: CategoryRecord) => {
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

  const handleDelete = useCallback(async (category: CategoryRecord) => {
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
      const nextRecords = allCategories.filter(item => item.id !== category.id);
      setAllCategories(nextRecords);
      applyCategoryScope(nextRecords);
      const refreshed = await loadCategories({ showLoading: false });
      if (!refreshed) {
        setActionError("Category deleted, but the list could not be refreshed. The row has been removed locally; reload to resync the list.");
      }
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to delete category");
    } finally {
      setBusyAction(null);
    }
  }, [allCategories, applyCategoryScope, busyAction, canDeleteCategories, clearActionError, loadCategories]);

  const pageBusy = busyAction !== null;
  const deleteBusyCategoryId = busyAction?.kind === "delete" ? busyAction.categoryId : null;
  const isChildrenView = variant === "children";
  const title = isChildrenView ? (parentCategory?.name ?? "Category") : "Categories";
  const subtitle = isChildrenView
    ? "Manage the immediate subcategories for this category."
    : "Browse top-level inventory categories and open one to manage its subcategories.";
  const tableLabel = isChildrenView ? "Subcategories list" : "Categories list";
  const createLabel = isChildrenView ? "Add Subcategory" : "Add Category";
  const emptyMessage = isChildrenView ? "No subcategories match the current filters." : "No categories match the current filters.";
  const footerLabel = isChildrenView ? "Direct subcategories" : "Top-level categories";
  const openCategory = isChildrenView ? undefined : (category: CategoryRecord) => router.push(`/categories/${category.id}`);
  const showTrackingColumn = isChildrenView;

  return (
    <div data-density={density}>
      <Topbar breadcrumb={isChildrenView ? ["Inventory", "Categories", parentCategory?.name ?? "Details"] : ["Inventory", "Categories"]} />

      <div className="page">
        {isChildrenView ? (
          <Link className="detail-page-back" href="/categories">
            <Ic d="M19 12H5M12 19l-7-7 7-7" size={12} />
            Back to Categories
          </Link>
        ) : null}
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
            <h1>{title}</h1>
            <div className="page-sub">{subtitle}</div>
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
              <div className="filter-select-wrap">
                <ThemedSelect
                  value={typeFilter}
                  onChange={setTypeFilter}
                  size="compact"
                  ariaLabel="Filter categories by type"
                  options={[
                    { value: "all", label: "All types" },
                    ...typeOptions.map(type => ({ value: type, label: formatLabel(type) })),
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
                  ariaLabel="Filter categories by status"
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
            {canManageCategories && (
              <button type="button" className="btn btn-sm btn-primary" onClick={openCreateModal} disabled={pageBusy || (isChildrenView && !parentCategory)}>
                <Ic d="M12 5v14M5 12h14" size={14} />
                {createLabel}
              </button>
            )}
          </div>
        </div>

        {mode === "table" ? (
        <div className="table-card">
          <div className="table-card-head">
            <div className="table-card-head-left">
              <div className="eyebrow">{tableLabel}</div>
              <div className="table-count">
                <span className="mono">{filteredCategories.length}</span>
                <span>of</span>
                <span className="mono">{categories.length}</span>
                <span>{isChildrenView ? "subcategories" : "categories"}</span>
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
                    <th>Type</th>
                    {showTrackingColumn ? <th>Tracking</th> : <th>Subcategories</th>}
                    {showTrackingColumn ? <th>Parent</th> : <th>Tracking Profile</th>}
                    <th>Status</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCategories.length === 0 ? (
                    <tr>
                      <td colSpan={8}>
                        <div style={{ padding: "32px 12px", textAlign: "center", color: "var(--text-2)", fontSize: 13 }}>
                          {emptyMessage}
                        </div>
                      </td>
                    </tr>
                  ) : (
                    pagedCategories.map(category => (
                      <CategoryRow
                        key={category.id}
                        category={category}
                        isChildrenView={isChildrenView}
                        childCount={childCountByCategory.get(category.id) ?? 0}
                        childNames={childNamesByCategory.get(category.id) ?? []}
                        trackingSummary={trackingSummaryByCategory.get(category.id) ?? "No subcategories"}
                        canEdit={canManageCategories}
                        canDelete={canDeleteCategories}
                        onOpen={openCategory ? () => openCategory(category) : undefined}
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

          <ListPagination
            summary={filteredCategories.length === 0 ? `Showing 0 ${isChildrenView ? "subcategories" : "categories"}` : `Showing ${pageStart}-${pageEnd} of ${filteredCategories.length} ${isChildrenView ? "subcategories" : "categories"}`}
            page={page}
            totalPages={totalPages}
            onPrev={() => setPage(current => Math.max(1, current - 1))}
            onNext={() => setPage(current => Math.min(totalPages, current + 1))}
          />
        </div>
        ) : filteredCategories.length > 0 ? (
          <div className="users-grid">
            {pagedCategories.map(category => (
              <CategoryCard
                key={category.id}
                category={category}
                childCount={childCountByCategory.get(category.id) ?? 0}
                childNames={childNamesByCategory.get(category.id) ?? []}
                trackingSummary={trackingSummaryByCategory.get(category.id) ?? "No subcategories"}
                canEdit={canManageCategories}
                canDelete={canDeleteCategories}
                pageBusy={pageBusy}
                deleteBusy={deleteBusyCategoryId === category.id}
                onOpen={openCategory ? () => openCategory(category) : undefined}
                onEdit={() => openEditModal(category)}
                onDelete={() => handleDelete(category)}
              />
            ))}
          </div>
        ) : (
          <div className="table-card">
            <div style={{ padding: 24, textAlign: "center", color: "var(--muted)" }}>
              {emptyMessage}
            </div>
          </div>
        )}
        {mode === "grid" && filteredCategories.length > 0 ? (
          <ListPagination
            summary={`Showing ${pageStart}-${pageEnd} of ${filteredCategories.length} ${isChildrenView ? "subcategories" : "categories"}`}
            page={page}
            totalPages={totalPages}
            onPrev={() => setPage(current => Math.max(1, current - 1))}
            onNext={() => setPage(current => Math.min(totalPages, current + 1))}
            standalone
          />
        ) : null}

        <CategoryModal
          open={modalOpen}
          mode={editingCategory ? "edit" : "create"}
          category={editingCategory}
          createContext={editingCategory ? "edit" : isChildrenView ? "child" : "root"}
          lockedParent={editingCategory ? null : parentCategory}
          onClose={closeModal}
          onSave={handleSave}
        />
      </div>
    </div>
  );
}
