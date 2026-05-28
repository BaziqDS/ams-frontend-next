"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  BadgeCheck,
  Boxes,
  CircleSlash,
  Clock,
  ClipboardCheck,
  Fingerprint,
  Layers,
  PackageOpen,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import type { CategoryRecord } from "@/components/CategoryModal";
import { useCan, useCapabilities } from "@/contexts/CapabilitiesContext";
import { useCopilotReadable } from "@/hooks/useCopilotReadable";
import { apiFetch, type Page } from "@/lib/api";
import { buildCopilotDetailContext } from "@/lib/copilotPageContext";
import {
  buildItemsWorkspaceHref,
  normalizeItemsWorkspaceState,
  parseItemsWorkspaceSearch,
  type ItemsWorkspaceTab,
} from "@/lib/itemsWorkspaceState";
import {
  canShowBatches,
  canShowInstances,
  formatItemDate,
  formatItemLabel,
  formatQuantity,
  isLowStock,
  toNumber,
  type ItemDistributionAllocation,
  type ItemDistributionStore,
  type ItemDistributionUnit,
  type ItemRecord,
  type ItemScopeOption,
} from "@/lib/itemUi";
import {
  Alert,
  Ic,
  ItemModal,
  WorkspaceBatchesTab,
  WorkspaceInstancesTab,
  batchLabelForItem,
  buildCategoryPath,
  formatMoneyValue,
  isFixedAssetItem,
  isFixedAssetLotItem,
  normalizeList,
  scopeFilterOptions,
  useItemDistribution,
  workspaceLastUpdate,
  workspaceLocationIcon,
  workspaceTrackingTone,
} from "@/components/ItemModuleViews";
import { ItemDistributionPanel, ItemDistributionStats } from "@/components/ItemDistributionView";
import styles from "./ItemDetailDossier.module.css";
import { Button } from "@/components/ui/button";


type SectionKey = "distribution" | "instances" | "batches" | "info" | "activity";

export interface DistributionPanelRow {
  id: string;
  name: string;
  kind?: "unit" | "store" | "location" | "person";
  allocated: number;
  available: number;
  inTransit: number;
  total: number;
  badge?: string;
}

const TAB_TO_SECTION: Record<ItemsWorkspaceTab, SectionKey> = {
  distribution: "distribution",
  instances: "instances",
  batches: "batches",
  info: "info",
  activity: "activity",
};

const SECTION_TO_TAB: Record<SectionKey, ItemsWorkspaceTab> = {
  distribution: "distribution",
  instances: "instances",
  batches: "batches",
  info: "info",
  activity: "activity",
};

export function ItemDetailDossierView({ itemId }: { itemId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoading: capsLoading } = useCapabilities();
  const canViewItems = useCan("items");
  const canManageItems = useCan("items", "manage");

  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemRecord | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [selectedScopeTokens, setSelectedScopeTokens] = useState<string[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<number | null>(null);
  const [highlightStoreId, setHighlightStoreId] = useState<number | null>(null);
  const [locateOpen, setLocateOpen] = useState(false);

  const workspaceState = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("item", itemId);
    return parseItemsWorkspaceSearch(params);
  }, [itemId, searchParams]);

  const initialSection = TAB_TO_SECTION[workspaceState.tab] ?? "distribution";
  const [section, setSection] = useState<SectionKey>(initialSection);
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(workspaceState.locationId);

  const {
    item,
    units,
    scopeOptions,
    defaultScopeTokens,
    isLoading,
    fetchError,
    setFetchError,
    load,
  } = useItemDistribution(itemId, selectedScopeTokens);

  const effectiveScopeTokens = selectedScopeTokens.length ? selectedScopeTokens : defaultScopeTokens;

  const leafCategories = useMemo(
    () => categories.filter(category => category.parent_category !== null && category.is_active),
    [categories],
  );

  const loadCategories = useCallback(async () => {
    if (!canManageItems) {
      setCategories([]);
      return;
    }
    try {
      const data = await apiFetch<Page<CategoryRecord> | CategoryRecord[]>("/api/inventory/categories/?page_size=500");
      setCategories(normalizeList(data));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to load item categories.");
    }
  }, [canManageItems]);

  useEffect(() => {
    if (capsLoading) return;
    if (!canViewItems) {
      router.replace("/403");
      return;
    }
    loadCategories();
  }, [canViewItems, capsLoading, loadCategories, router]);

  useEffect(() => {
    load();
  }, [load, refreshToken]);

  useEffect(() => {
    setSelectedLocationId(workspaceState.locationId ?? null);
    if (workspaceState.tab && TAB_TO_SECTION[workspaceState.tab]) {
      setSection(TAB_TO_SECTION[workspaceState.tab]);
    }
  }, [itemId]); // eslint-disable-line react-hooks/exhaustive-deps

  // pick the first unit by default once data loads
  useEffect(() => {
    if (selectedUnitId == null && units.length) {
      setSelectedUnitId(units[0].id);
    }
    if (selectedUnitId != null && !units.some(u => u.id === selectedUnitId)) {
      setSelectedUnitId(units[0]?.id ?? null);
    }
  }, [units, selectedUnitId]);

  // normalize tab if the item doesn't support it
  useEffect(() => {
    if (!item) return;
    const normalized = normalizeItemsWorkspaceState(
      { itemId, tab: SECTION_TO_TAB[section], locationId: selectedLocationId },
      {
        canShowInstances: canShowInstances(item.tracking_type),
        canShowBatches: canShowBatches(item.tracking_type, item.category_type),
      },
    );
    const normalizedSection = TAB_TO_SECTION[normalized.tab] ?? "distribution";
    if (normalizedSection !== section) setSection(normalizedSection);
    if (normalized.locationId !== selectedLocationId) setSelectedLocationId(normalized.locationId);
  }, [item, itemId, section, selectedLocationId]);

  // sync URL when section / location changes
  const setWorkspace = useCallback((next: { section?: SectionKey; locationId?: string | null }) => {
    const nextSection = next.section ?? section;
    const nextLocation = next.locationId !== undefined ? next.locationId : selectedLocationId;
    router.replace(
      buildItemsWorkspaceHref({
        itemId,
        tab: SECTION_TO_TAB[nextSection],
        locationId: nextSection === "distribution" ? nextLocation : null,
      }),
      { scroll: false },
    );
  }, [itemId, router, section, selectedLocationId]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (item) {
          event.preventDefault();
          setLocateOpen(true);
        }
        return;
      }
      if (event.key === "Escape") {
        setLocateOpen(c => (c ? false : c));
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item]);

  const itemDetailReadable = useMemo(() => buildCopilotDetailContext({
    route: `/items/${itemId}`,
    entity: "item",
    selectedRecord: item
      ? {
          id: item.id,
          name: item.name,
          code: item.code,
          category: item.category,
          category_display: buildCategoryPath(item.category, categories, item.category_display) ?? item.category_display,
          category_type: item.category_type,
          tracking_type: item.tracking_type,
          description: item.description,
          specifications: item.specifications,
          acct_unit: item.acct_unit,
          is_active: item.is_active,
          is_low_stock: isLowStock(item),
          low_stock_threshold: toNumber(item.low_stock_threshold),
          total_quantity: toNumber(item.total_quantity),
          available_quantity: toNumber(item.available_quantity),
          in_transit_quantity: toNumber(item.in_transit_quantity),
          created_by_name: item.created_by_name,
          created_at: item.created_at,
          updated_at: item.updated_at,
          depreciation_summary: item.depreciation_summary ?? null,
        }
      : null,
    actions: {
      edit: canManageItems && Boolean(item),
      view_instances: Boolean(item && canShowInstances(item.tracking_type)),
      view_batches: Boolean(item && canShowBatches(item.tracking_type, item.category_type)),
    },
    extra: {
      loading: isLoading,
      fetch_error: fetchError,
      current_section: section,
      selected_location_id: selectedLocationId,
      selected_scope_tokens: effectiveScopeTokens,
      distribution_unit_count: units.length,
      distribution_units_truncated: units.length > 40,
      distribution_units: units.slice(0, 40).map(unit => ({
        id: unit.id,
        name: unit.name,
        code: unit.code,
        total_quantity: unit.totalQuantity,
        available_quantity: unit.availableQuantity,
        in_transit_quantity: unit.inTransitQuantity,
        allocated_quantity: unit.allocatedQuantity,
        stores_truncated: unit.stores.length > 10,
        stores: unit.stores.slice(0, 10).map(store => ({
          id: store.id,
          location_id: store.locationId,
          location_name: store.locationName,
          is_store: store.isStore,
          batch_number: store.batchNumber,
          batch_id: store.batchId,
          quantity: store.quantity,
          available_quantity: store.availableQuantity,
          in_transit_quantity: store.inTransitQuantity,
          allocated_total: store.allocatedTotal,
          last_updated: store.lastUpdated,
        })),
        allocations_truncated: unit.allocations.length > 10,
        allocations: unit.allocations.slice(0, 10).map(allocation => ({
          id: allocation.id,
          target_name: allocation.targetName,
          target_type: allocation.targetType,
          target_location_id: allocation.targetLocationId,
          source_store_id: allocation.sourceStoreId,
          source_store_name: allocation.sourceStoreName,
          batch_number: allocation.batchNumber,
          batch_id: allocation.batchId,
          quantity: allocation.quantity,
          allocated_at: allocation.allocatedAt,
          stock_entry_ids: allocation.stockEntryIds,
          location_id: allocation.locationId,
        })),
      })),
    },
  }), [
    canManageItems,
    categories,
    effectiveScopeTokens,
    fetchError,
    isLoading,
    item,
    itemId,
    section,
    selectedLocationId,
    units,
  ]);

  useCopilotReadable({
    description:
      "Item detail page contract. Use selected_record for the current item and distribution_units for stock by location/store/allocation before SQL.",
    value: itemDetailReadable,
  });

  const closeModal = () => {
    setModalOpen(false);
    setEditingItem(null);
  };

  const openEditModal = (rec: ItemRecord) => {
    setEditingItem(rec);
    setModalOpen(true);
  };

  const handleSave = async () => {
    setRefreshToken(c => c + 1);
  };

  if (capsLoading) {
    return (
      <div>
        <Topbar breadcrumb={["Inventory", "Items", "Item detail"]} />
        <div className={styles.shell}>
          <Link className="detail-page-back" href="/items">
            <Ic d="M19 12H5M12 19l-7-7 7-7" size={12} />
            Back to Items
          </Link>
          <div className={styles.loading}>Loading item permissions…</div>
        </div>
      </div>
    );
  }

  if (!canViewItems) return null;

  if (isLoading && !item) {
    return (
      <div>
        <Topbar breadcrumb={["Inventory", "Items", "Item detail"]} />
        <div className={styles.shell}>
          <Link className="detail-page-back" href="/items">
            <Ic d="M19 12H5M12 19l-7-7 7-7" size={12} />
            Back to Items
          </Link>
          <div className={styles.loading}>Compiling item dossier…</div>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div>
        <Topbar breadcrumb={["Inventory", "Items", "Item detail"]} />
        <div className={styles.shell}>
          <Link className="detail-page-back" href="/items">
            <Ic d="M19 12H5M12 19l-7-7 7-7" size={12} />
            Back to Items
          </Link>
          <div className={styles.loading}>This item is no longer available in your current permission scope.</div>
        </div>
      </div>
    );
  }

  const totalQuantity = toNumber(item.total_quantity);
  const availableQuantity = toNumber(item.available_quantity);
  const inTransitQuantity = toNumber(item.in_transit_quantity);
  const issuedQuantity = Math.max(totalQuantity - availableQuantity - inTransitQuantity, 0);
  const lowStockThreshold = toNumber(item.low_stock_threshold);
  const lowFlag = isLowStock(item);
  const outFlag = totalQuantity <= 0;
  const acctUnit = item.acct_unit ?? "unit";
  const categoryPath = buildCategoryPath(item.category, categories, item.category_display);

  const trackingLabel =
    item.tracking_type === "INDIVIDUAL"
      ? "Individual tracking"
      : isFixedAssetLotItem(item)
        ? "Asset lot tracking"
        : item.tracking_type === "QUANTITY"
          ? "Quantity tracking"
          : "Perishable batches";

  const showInstances = canShowInstances(item.tracking_type);
  const showBatches = canShowBatches(item.tracking_type, item.category_type);
  const batchSectionLabel = batchLabelForItem(item);

  const sectionList: { key: SectionKey; num: string; label: string; count?: number }[] = [
    { key: "distribution", num: "01", label: "Distribution", count: units.length },
    ...(showInstances ? [{ key: "instances" as SectionKey, num: "02", label: "Instances", count: totalQuantity }] : []),
    ...(showBatches ? [{ key: "batches" as SectionKey, num: showInstances ? "03" : "02", label: batchSectionLabel }] : []),
    {
      key: "info" as SectionKey,
      num: showInstances && showBatches ? "04" : showInstances || showBatches ? "03" : "02",
      label: "Identity & specs",
    },
    {
      key: "activity" as SectionKey,
      num: showInstances && showBatches ? "05" : showInstances || showBatches ? "04" : "03",
      label: "Activity",
    },
  ];

  const onPickSection = (next: SectionKey) => {
    setSection(next);
    setWorkspace({ section: next });
  };

  const onPickUnit = (unitId: number, storeId?: number) => {
    setSelectedUnitId(unitId);
    if (storeId != null) setHighlightStoreId(storeId);
    const unit = units.find(u => u.id === unitId);
    if (unit) {
      setSelectedLocationId(String(unit.id));
      setWorkspace({ section: "distribution", locationId: String(unit.id) });
    }
  };

  const selectedUnit = units.find(u => u.id === selectedUnitId) ?? null;
  const maxQty = Math.max(1, ...units.map(u => toNumber(u.totalQuantity)));

  return (
    <div>
      <ItemModal
        open={modalOpen}
        mode={editingItem ? "edit" : "create"}
        item={editingItem}
        categories={leafCategories}
        onClose={closeModal}
        onSave={handleSave}
      />
      <Topbar breadcrumb={["Inventory", "Items", item.name]} />

      <div className={styles.shell}>
        {actionError ? (
          <div style={{ marginBottom: 14 }}>
            <Alert onDismiss={() => setActionError(null)}>{actionError}</Alert>
          </div>
        ) : null}
        {fetchError ? (
          <div style={{ marginBottom: 14 }}>
            <Alert onDismiss={() => setFetchError(null)} action={<Button type="button" variant="outline" size="xs" onClick={() => load()}>Retry</Button>}>
              {fetchError}
            </Alert>
          </div>
        ) : null}

        <ItemOverviewLayout
          item={item}
          units={units}
          categoryPath={categoryPath}
          trackingLabel={trackingLabel}
          totalQuantity={totalQuantity}
          availableQuantity={availableQuantity}
          allocatedQuantity={Math.max(totalQuantity - availableQuantity - inTransitQuantity, 0)}
          inTransitQuantity={inTransitQuantity}
          lowStockThreshold={lowStockThreshold}
          acctUnit={acctUnit}
          lowFlag={lowFlag}
          outFlag={outFlag}
          canManageItems={canManageItems}
          scopeOptions={scopeOptions}
          selectedScopeTokens={selectedScopeTokens}
          defaultScopeTokens={defaultScopeTokens}
          isDistributionLoading={isLoading}
          onScopeTokensChange={setSelectedScopeTokens}
          onBack={() => router.push("/items")}
          onEdit={() => openEditModal(item)}
          onShowInstances={() => router.push(`/items/${itemId}/instances`)}
          onShowBatches={() => router.push(`/items/${itemId}/batches`)}
          showInstances={showInstances}
          showBatches={showBatches}
        />
      </div>

      {locateOpen ? (
        <LocatePalette
          item={item}
          units={units}
          onClose={() => setLocateOpen(false)}
          onJump={target => {
            setSection("distribution");
            onPickUnit(target.unitId, target.storeId);
            setLocateOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function ItemOverviewLayout({
  item,
  units,
  categoryPath,
  trackingLabel,
  totalQuantity,
  availableQuantity,
  allocatedQuantity,
  inTransitQuantity,
  lowStockThreshold,
  acctUnit,
  lowFlag,
  outFlag,
  canManageItems,
  scopeOptions,
  selectedScopeTokens,
  defaultScopeTokens,
  isDistributionLoading,
  onScopeTokensChange,
  onBack,
  onEdit,
  onShowInstances,
  onShowBatches,
  showInstances,
  showBatches,
}: {
  item: ItemRecord;
  units: ItemDistributionUnit[];
  categoryPath: string | null;
  trackingLabel: string;
  totalQuantity: number;
  availableQuantity: number;
  allocatedQuantity: number;
  inTransitQuantity: number;
  lowStockThreshold: number;
  acctUnit: string;
  lowFlag: boolean;
  outFlag: boolean;
  canManageItems: boolean;
  scopeOptions: ItemScopeOption[];
  selectedScopeTokens: string[];
  defaultScopeTokens: string[];
  isDistributionLoading: boolean;
  onScopeTokensChange: (tokens: string[]) => void;
  onBack: () => void;
  onEdit: () => void;
  onShowInstances: () => void;
  onShowBatches: () => void;
  showInstances: boolean;
  showBatches: boolean;
}) {
  const allocatedPct = totalQuantity > 0 ? Math.round((allocatedQuantity / totalQuantity) * 100) : 0;
  const availablePct = totalQuantity > 0 ? Math.round((availableQuantity / totalQuantity) * 100) : 0;
  const lastUpdated = formatItemDateTime(item.updated_at ?? item.created_at);
  const stockTone = outFlag ? "danger" : lowFlag ? "warn" : "ok";

  return (
    <div className={styles.dossierPage}>
      <div className={`${styles.detailHead} page-head-detail`}>
        <div className="page-title-group">
          <div className="eyebrow">{categoryPath ?? item.category_display ?? "Item"}</div>
          <h1>{item.name}</h1>
          <div className="page-sub">
            {item.description?.trim() || "No description has been added for this item."}
          </div>
          <div className="page-id-row">
            <span className="doc-no">{item.code}</span>
            <TrackingBadge trackingType={item.tracking_type} label={trackingLabel} />
            <StatusBadge tone={stockTone} outFlag={outFlag} lowFlag={lowFlag} isActive={item.is_active} />
          </div>
        </div>
        <div className="page-head-actions">
          <Button type="button" variant="outline" size="sm" className="page-head-back" onClick={onBack}>
            <Ic d="M19 12H5M12 19l-7-7 7-7" size={12} />
            Back to Items
          </Button>
          {showInstances ? (
            <Button type="button" variant="outline" size="sm" onClick={onShowInstances}>
              <Fingerprint size={14} strokeWidth={2.25} />
              View instances
            </Button>
          ) : null}
          {showBatches ? (
            <Button type="button" variant="outline" size="sm" onClick={onShowBatches}>
              <Layers size={14} strokeWidth={2.25} />
              View batches
            </Button>
          ) : null}
          {canManageItems ? (
            <Button type="button" size="sm" onClick={onEdit}>
              <Ic d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.1 2.1 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5Z" size={14} />
              Edit Item
            </Button>
          ) : null}
        </div>
      </div>

      <ItemDistributionStats units={units} acctUnit={acctUnit} className={styles.detailDistributionStats} />

      <main className={styles.dossierMain}>
        <ItemDistributionPanel
          itemId={String(item.id)}
          item={item}
          units={units}
          scopeOptions={scopeOptions}
          selectedScopeTokens={selectedScopeTokens}
          defaultScopeTokens={defaultScopeTokens}
          isLoading={isDistributionLoading}
          onScopeTokensChange={onScopeTokensChange}
          className={styles.embeddedDistribution}
          showStats={false}
        />
      </main>
    </div>
  );
}

function maxPercent(value: number, max: number) {
  if (max <= 0) return 0;
  return Math.max(3, Math.min(100, Math.round((value / max) * 100)));
}

function TrackingBadge({ trackingType, label }: { trackingType: string | null | undefined; label: string }) {
  const tone = workspaceTrackingTone(trackingType);
  const Icon: LucideIcon = tone === "individual" ? Fingerprint : tone === "quantity" ? Layers : Clock;
  return (
    <span className={styles.trackingBadge} data-tone={tone}>
      <Icon size={12} strokeWidth={2.25} />
      {label}
    </span>
  );
}

function StatusBadge({
  tone,
  outFlag,
  lowFlag,
  isActive,
}: {
  tone: "ok" | "warn" | "danger";
  outFlag: boolean;
  lowFlag: boolean;
  isActive: boolean;
}) {
  const Icon: LucideIcon = tone === "danger" ? CircleSlash : tone === "warn" ? AlertTriangle : BadgeCheck;
  const label = outFlag ? "Out of stock" : lowFlag ? "Low stock" : isActive ? "Active" : "Inactive";
  return (
    <span className={styles.statusBadge} data-tone={tone}>
      <Icon size={12} strokeWidth={2.25} />
      {label}
    </span>
  );
}

function formatItemDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return `${formatItemDate(value, "-")} · ${date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`;
}

function transactionIcon(tone: "positive" | "negative" | "neutral") {
  if (tone === "positive") return "↓";
  if (tone === "negative") return "↑";
  return "↔";
}

function stockEntryLocation(entry: { from_location_name?: string | null; to_location_name?: string | null; issued_to_name?: string | null }) {
  const from = entry.from_location_name?.trim();
  const to = entry.to_location_name?.trim();
  const person = entry.issued_to_name?.trim();
  if (from && to) return `${from} to ${to}`;
  return to || person || from || "-";
}

export function buildStandaloneDistributionRows(units: ItemDistributionUnit[]): DistributionPanelRow[] {
  return units.map(unit => {
    const available = toNumber(unit.availableQuantity);
    const inTransit = toNumber(unit.inTransitQuantity);
    const allocated = Math.max(toNumber(unit.allocatedQuantity), toNumber(unit.totalQuantity) - available - inTransit, 0);
    const total = normalizeDistributionTotal(unit.totalQuantity, allocated, available, inTransit);
    return {
      id: `unit-${unit.id}`,
      name: unit.name,
      kind: "unit",
      allocated,
      available,
      inTransit,
      total,
    };
  });
}

export function buildSubDistributionRows(unit: ItemDistributionUnit): DistributionPanelRow[] {
  const storeRows = aggregateStoreDistributionRows(unit);
  const allocationGroups = new Map<string, DistributionPanelRow>();
  unit.allocations.forEach(allocation => {
    const key = `${allocation.targetType}-${allocation.targetName}`;
    const kind = allocation.targetType === "PERSON" ? "person" : "location";
    const current = allocationGroups.get(key) ?? {
      id: `allocation-${key}`,
      name: allocation.targetName,
      kind,
      allocated: 0,
      available: 0,
      inTransit: 0,
      total: 0,
      badge: kind === "person" ? "Employee" : "Non-store",
    };
    const quantity = toNumber(allocation.quantity);
    current.allocated += quantity;
    current.total += quantity;
    allocationGroups.set(key, current);
  });
  return [...storeRows, ...Array.from(allocationGroups.values())];
}

function aggregateStoreDistributionRows(unit: ItemDistributionUnit): DistributionPanelRow[] {
  const groups = new Map<number, DistributionPanelRow>();
  unit.stores.forEach(store => {
    const current = groups.get(store.locationId) ?? {
      id: `store-${store.locationId}`,
      name: store.locationName,
      kind: "store",
      allocated: 0,
      available: 0,
      inTransit: 0,
      total: 0,
    };
    const available = toNumber(store.availableQuantity);
    const inTransit = toNumber(store.inTransitQuantity);
    const allocated = Math.max(toNumber(store.allocatedTotal), toNumber(store.quantity) - available - inTransit, 0);
    current.available += available;
    current.inTransit += inTransit;
    current.allocated += allocated;
    current.total += normalizeDistributionTotal(store.quantity, allocated, available, inTransit);
    groups.set(store.locationId, current);
  });
  return Array.from(groups.values());
}

export function normalizeDistributionTotal(total: number | string | null | undefined, allocated: number, available: number, inTransit = 0) {
  return Math.max(toNumber(total), allocated + available + inTransit, 0);
}

function distributionPercent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

function exportDistributionCsv(item: ItemRecord, units: ItemDistributionUnit[], acctUnit: string) {
  const rows = [
    ["Section", "Parent Location", "Location", "Allocated", "Available", "In Transit", "Total", "Unit"],
    ...buildStandaloneDistributionRows(units).map(row => [
      "Standalone Location",
      "",
      row.name,
      formatQuantity(row.allocated),
      formatQuantity(row.available),
      formatQuantity(row.inTransit),
      formatQuantity(row.total),
      acctUnit,
    ]),
    ...units.flatMap(unit => buildSubDistributionRows(unit).map(row => [
      "Sub Location",
      unit.name,
      row.name,
      formatQuantity(row.allocated),
      formatQuantity(row.available),
      formatQuantity(row.inTransit),
      formatQuantity(row.total),
      acctUnit,
    ])),
  ];
  const csv = rows.map(row => row.map(csvCell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFilename(item.code || item.name)}-distribution.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function safeFilename(value: string) {
  return value.trim().replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "item";
}

/* ============================================================
   Stat ribbon cell
============================================================ */
function RibbonCell({
  num,
  label,
  value,
  unit,
  sub,
  tone,
}: {
  num: string;
  label: string;
  value: string;
  unit?: string;
  sub?: ReactNode;
  tone?: "warn" | "danger";
}) {
  const valueClass = tone === "warn" ? styles.ribbonValueWarn : tone === "danger" ? styles.ribbonValueDanger : "";
  return (
    <div className={styles.ribbonCell}>
      <span className={styles.ribbonNum}>{num}</span>
      <div className={styles.ribbonLabel}>{label}</div>
      <div className={`${styles.ribbonValue} ${valueClass}`}>
        <span>{value}</span>
        {unit ? <span className={styles.ribbonUnit}>{unit}</span> : null}
      </div>
      {sub ? <div className={styles.ribbonSub}>{sub}</div> : null}
    </div>
  );
}

/* ============================================================
   Distribution section: master/detail ledger
============================================================ */
function DistributionSection({
  units,
  isLoading,
  selectedUnit,
  selectedUnitId,
  highlightStoreId,
  onClearHighlight,
  onPickUnit,
  maxQty,
  acctUnit,
  showInstances,
  showBatches,
  onJumpInstances,
  onJumpBatches,
  isFixedLot,
}: {
  units: ItemDistributionUnit[];
  isLoading: boolean;
  selectedUnit: ItemDistributionUnit | null;
  selectedUnitId: number | null;
  highlightStoreId: number | null;
  onClearHighlight: () => void;
  onPickUnit: (unitId: number, storeId?: number) => void;
  maxQty: number;
  acctUnit: string;
  showInstances: boolean;
  showBatches: boolean;
  onJumpInstances: () => void;
  onJumpBatches: () => void;
  isFixedLot: boolean;
}) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <div className={styles.sectionHeadLeft}>
          <span className={styles.sectionNum}>01 / Distribution</span>
          <h2 className={styles.sectionTitle}>Where this item lives</h2>
        </div>
        <span className={styles.sectionMeta}>
          {units.length} {units.length === 1 ? "location" : "locations"} · select a row for the breakdown
        </span>
      </div>

      {isLoading ? (
        <div className={styles.loading}>Loading distribution…</div>
      ) : units.length === 0 ? (
        <div className={styles.loading}>This item has no distribution in your current scope.</div>
      ) : (
        <div className={styles.distribution}>
          <div className={styles.locList}>
            {units.map((unit, idx) => {
              const total = toNumber(unit.totalQuantity);
              const available = toNumber(unit.availableQuantity);
              const allocated = toNumber(unit.allocatedQuantity);
              const inTransit = toNumber(unit.inTransitQuantity);
              return (
                <button
                  key={unit.id}
                  type="button"
                  className={styles.locRow}
                  data-active={selectedUnitId === unit.id ? "true" : "false"}
                  onClick={() => onPickUnit(unit.id)}
                >
                  <span className={styles.locRowIndex}>{String(idx + 1).padStart(2, "0")}</span>
                  <span className={styles.locRowMain}>
                    <span className={styles.locRowName}>{unit.name}</span>
                    <span className={styles.locRowSub}>
                      <span className={styles.locRowCode}>{unit.code}</span>
                      <span>·</span>
                      <span>{unit.stores.length} {unit.stores.length === 1 ? "store row" : "store rows"}</span>
                      {unit.allocations.length ? (
                        <>
                          <span>·</span>
                          <span>{unit.allocations.length} {unit.allocations.length === 1 ? "allocation" : "allocations"}</span>
                        </>
                      ) : null}
                    </span>
                  </span>
                  <span className={styles.locRowSplit}>
                    <span className={styles.locRowBar}>
                      <span className={styles.locRowBarFill} style={{ width: `${Math.min(100, (total / maxQty) * 100)}%` }} />
                    </span>
                    <span className={styles.locRowSplitLabel}>
                      <span>avail {formatQuantity(available)}</span>
                      <span>alloc {formatQuantity(allocated)}{inTransit > 0 ? ` · t ${formatQuantity(inTransit)}` : ""}</span>
                    </span>
                  </span>
                  <span className={styles.locRowQty}>
                    {formatQuantity(unit.totalQuantity)}
                    <span className={styles.locRowQtyUnit}>{acctUnit}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div>
            {selectedUnit ? (
              <UnitDetail
                unit={selectedUnit}
                acctUnit={acctUnit}
                highlightStoreId={highlightStoreId}
                onClearHighlight={onClearHighlight}
                showInstances={showInstances}
                showBatches={showBatches}
                onJumpInstances={onJumpInstances}
                onJumpBatches={onJumpBatches}
                isFixedLot={isFixedLot}
              />
            ) : (
              <div className={styles.locDetailEmpty}>Select a location to see its store rows and allocations.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function UnitDetail({
  unit,
  acctUnit,
  highlightStoreId,
  onClearHighlight,
  showInstances,
  showBatches,
  onJumpInstances,
  onJumpBatches,
  isFixedLot,
}: {
  unit: ItemDistributionUnit;
  acctUnit: string;
  highlightStoreId: number | null;
  onClearHighlight: () => void;
  showInstances: boolean;
  showBatches: boolean;
  onJumpInstances: () => void;
  onJumpBatches: () => void;
  isFixedLot: boolean;
}) {
  useEffect(() => {
    if (highlightStoreId == null) return;
    const el = document.querySelector(`[data-store-id="${highlightStoreId}"]`) as HTMLElement | null;
    if (el) el.scrollIntoView({ block: "center", behavior: "smooth" });
    const t = window.setTimeout(onClearHighlight, 1200);
    return () => window.clearTimeout(t);
  }, [highlightStoreId, onClearHighlight]);

  const total = toNumber(unit.totalQuantity);
  const available = toNumber(unit.availableQuantity);
  const allocated = toNumber(unit.allocatedQuantity);
  const inTransit = toNumber(unit.inTransitQuantity);

  return (
    <div className={styles.locDetail}>
      <div className={styles.locDetailHead}>
        <span className={styles.locDetailEyebrow}>Location · {unit.code}</span>
        <h3 className={styles.locDetailTitle}>{unit.name}</h3>
        <div className={styles.locDetailSub}>
          {unit.stores.length} {unit.stores.length === 1 ? "store row" : "store rows"}
          {unit.allocations.length ? ` · ${unit.allocations.length} ${unit.allocations.length === 1 ? "allocation" : "allocations"}` : ""}
        </div>
      </div>

      <div className={styles.locDetailKvs}>
        <UnitKv label="Total" value={`${formatQuantity(total)} ${acctUnit}`} />
        <UnitKv label="Available" value={`${formatQuantity(available)} ${acctUnit}`} />
        <UnitKv label="Allocated" value={`${formatQuantity(allocated)} ${acctUnit}`} />
        <UnitKv label="In transit" value={`${formatQuantity(inTransit)} ${acctUnit}`} tone={inTransit > 0 ? "warn" : undefined} />
      </div>

      {unit.stores.length ? (
        <div>
          <div className={styles.locDetailBlockHead}>
            <span>Store rows · {unit.stores.length}</span>
            <span>quantity</span>
          </div>
          <div className={styles.locDetailList}>
            {unit.stores.map(store => (
              <UnitDetailStoreRow key={store.id} store={store} acctUnit={acctUnit} />
            ))}
          </div>
        </div>
      ) : null}

      {unit.allocations.length ? (
        <div>
          <div className={styles.locDetailBlockHead}>
            <span>Allocations · {unit.allocations.length}</span>
            <span>quantity</span>
          </div>
          <div className={styles.locDetailList}>
            {unit.allocations.map(allocation => (
              <UnitDetailAllocationRow key={allocation.id} allocation={allocation} acctUnit={acctUnit} />
            ))}
          </div>
        </div>
      ) : null}

      <div className={styles.locDetailActions}>
        {showInstances ? (
          <Button type="button" variant="ghost" size="xs" onClick={onJumpInstances}>
            Instances here
          </Button>
        ) : null}
        {showBatches ? (
          <Button type="button" variant="ghost" size="xs" onClick={onJumpBatches}>
            {isFixedLot ? "Asset lots here" : "Batches here"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function UnitKv({ label, value, tone }: { label: string; value: ReactNode; tone?: "warn" }) {
  return (
    <div className={styles.locDetailKv}>
      <span className={styles.locDetailKvLabel}>{label}</span>
      <span className={styles.locDetailKvValue} data-tone={tone ?? ""}>{value}</span>
    </div>
  );
}

function UnitDetailStoreRow({ store, acctUnit }: { store: ItemDistributionStore; acctUnit: string }) {
  return (
    <div className={styles.locDetailListItem} data-store-id={store.id}>
      <span className={styles.locDetailListIcon}>{workspaceLocationIcon("store")}</span>
      <span className={styles.locDetailListBody}>
        <span className={styles.locDetailListName}>{store.locationName}</span>
        <span className={styles.locDetailListMeta}>
          {store.batchNumber ? `BATCH ${store.batchNumber} · ` : ""}
          AVAIL {formatQuantity(store.availableQuantity)}
          {toNumber(store.allocatedTotal) > 0 ? ` · ALLOC ${formatQuantity(store.allocatedTotal)}` : ""}
          {toNumber(store.inTransitQuantity) > 0 ? ` · TRANSIT ${formatQuantity(store.inTransitQuantity)}` : ""}
        </span>
      </span>
      <span className={styles.locDetailListQty}>
        {formatQuantity(store.quantity)} <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--muted)" }}>{acctUnit}</span>
      </span>
    </div>
  );
}

function UnitDetailAllocationRow({ allocation, acctUnit }: { allocation: ItemDistributionAllocation; acctUnit: string }) {
  return (
    <div className={styles.locDetailListItem}>
      <span className={styles.locDetailListIcon}>{workspaceLocationIcon(allocation.targetType === "PERSON" ? "person" : "location")}</span>
      <span className={styles.locDetailListBody}>
        <span className={styles.locDetailListName}>{allocation.targetName}</span>
        <span className={styles.locDetailListMeta}>
          {allocation.sourceStoreName} · {formatItemDate(allocation.allocatedAt, "Unknown")}
          {allocation.batchNumber ? ` · BATCH ${allocation.batchNumber}` : ""}
        </span>
      </span>
      <span className={styles.locDetailListQty}>
        {formatQuantity(allocation.quantity)} <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--muted)" }}>{acctUnit}</span>
      </span>
    </div>
  );
}

/* ============================================================
   Instances / Batches sections (reuse existing tab content)
============================================================ */
function InstancesSection({
  itemId,
  selectedLocationId,
  onClearSelectedLocation,
}: {
  itemId: string;
  selectedLocationId: string | null;
  onClearSelectedLocation: () => void;
}) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <div className={styles.sectionHeadLeft}>
          <span className={styles.sectionNum}>02 / Instances</span>
          <h2 className={styles.sectionTitle}>Individually tracked units</h2>
        </div>
        <span className={styles.sectionMeta}>
          {selectedLocationId ? "scoped to selected location" : "all instances visible in scope"}
        </span>
      </div>
      <WorkspaceInstancesTab
        itemId={itemId}
        selectedLocationId={selectedLocationId}
        onClearSelectedLocation={onClearSelectedLocation}
      />
    </div>
  );
}

function BatchesSection({
  itemId,
  selectedLocationId,
  onClearSelectedLocation,
}: {
  itemId: string;
  selectedLocationId: string | null;
  onClearSelectedLocation: () => void;
}) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <div className={styles.sectionHeadLeft}>
          <span className={styles.sectionNum}>· / Batches</span>
          <h2 className={styles.sectionTitle}>Lots, batches and capitalised assets</h2>
        </div>
        <span className={styles.sectionMeta}>
          {selectedLocationId ? "scoped to selected location" : "all batches visible in scope"}
        </span>
      </div>
      <WorkspaceBatchesTab
        itemId={itemId}
        selectedLocationId={selectedLocationId}
        onClearSelectedLocation={onClearSelectedLocation}
      />
    </div>
  );
}

/* ============================================================
   Identity / specs document
============================================================ */
function InfoSection({ item, units }: { item: ItemRecord; units: ItemDistributionUnit[] }) {
  const showDepreciation = isFixedAssetItem(item);
  const dep = item.depreciation_summary;

  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <div className={styles.sectionHeadLeft}>
          <span className={styles.sectionNum}>· / Identity</span>
          <h2 className={styles.sectionTitle}>Specifications & identity</h2>
        </div>
        <span className={styles.sectionMeta}>full record details</span>
      </div>

      <div className={styles.docGrid}>
        <div className={styles.docBlock}>
          <div className={styles.docBlockHead}>Identification</div>
          <div className={styles.docKvs}>
            <DocKv label="Item code" value={<span className="mono">{item.code}</span>} />
            <DocKv label="Category" value={item.category_display ?? "—"} />
            <DocKv label="Tracking" value={formatItemLabel(String(item.tracking_type ?? ""))} />
            <DocKv label="Accounting unit" value={item.acct_unit ?? "—"} />
            <DocKv label="Reorder threshold" value={toNumber(item.low_stock_threshold) > 0 ? `${formatQuantity(item.low_stock_threshold)} ${item.acct_unit ?? "unit"}` : "—"} />
            <DocKv label="Standalone locations" value={<span className="mono">{units.length}</span>} />
          </div>
        </div>

        <div className={styles.docBlock}>
          <div className={styles.docBlockHead}>Description</div>
          <div className={`${styles.docBody} ${item.description?.trim() ? "" : styles.docBodyEmpty}`}>
            {item.description?.trim() || "No description has been added for this item yet."}
          </div>
        </div>

        <div className={`${styles.docBlock} ${styles.docBlockSpan2}`}>
          <div className={styles.docBlockHead}>Specifications</div>
          <div className={`${styles.docBody} ${item.specifications?.trim() ? "" : styles.docBodyEmpty}`}>
            {item.specifications?.trim() || "No specifications have been added for this item yet."}
          </div>
        </div>

        {showDepreciation ? (
          <div className={`${styles.docBlock} ${styles.docBlockSpan2}`}>
            <div className={styles.docBlockHead}>Depreciation</div>
            <div className={styles.docKvs}>
              <DocKv label="Capitalisation" value={dep?.capitalized ? "Capitalised" : "Not capitalised"} />
              <DocKv label="Register entries" value={<span className="mono">{formatQuantity(dep?.asset_count ?? (dep?.capitalized ? 1 : 0))}</span>} />
              <DocKv label="Original cost" value={formatMoneyValue(dep?.original_cost)} />
              <DocKv label="Accumulated depreciation" value={formatMoneyValue(dep?.accumulated_depreciation)} />
              <DocKv label="Current WDV / NBV" value={formatMoneyValue(dep?.current_wdv)} />
              <DocKv
                label="Latest posted FY"
                value={dep?.latest_posted_fiscal_year ? `${dep.latest_posted_fiscal_year}-${String(dep.latest_posted_fiscal_year + 1).slice(-2)}` : "—"}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function DocKv({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className={styles.docKv}>
      <span className={styles.docKvLabel}>{label}</span>
      <span className={styles.docKvValue}>{value}</span>
      {sub ? <span className={styles.docKvSub}>{sub}</span> : null}
    </div>
  );
}

/* ============================================================
   Activity timeline
============================================================ */
function ActivitySection({ item }: { item: ItemRecord }) {
  const events = [
    item.updated_at
      ? {
          key: "updated",
          label: "Record updated",
          date: formatItemDate(item.updated_at, "Unknown"),
          note: item.created_by_name
            ? `Visible in your current permission scope · last edited by ${item.created_by_name}`
            : "Visible in your current permission scope",
        }
      : null,
    item.created_at
      ? {
          key: "created",
          label: "Record created",
          date: formatItemDate(item.created_at, "Unknown"),
          note: item.created_by_name ? `Created by ${item.created_by_name}` : "Creation source not available",
        }
      : null,
  ].filter(Boolean) as { key: string; label: string; date: string; note: string }[];

  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <div className={styles.sectionHeadLeft}>
          <span className={styles.sectionNum}>· / Activity</span>
          <h2 className={styles.sectionTitle}>Recorded events</h2>
        </div>
        <span className={styles.sectionMeta}>latest known record events</span>
      </div>
      {events.length === 0 ? (
        <div className={styles.loading}>No activity is available for this record yet.</div>
      ) : (
        <div className={styles.timeline}>
          {events.map(event => (
            <div key={event.key} className={styles.timelineRow}>
              <span className={styles.timelineDate}>{event.date}</span>
              <span className={styles.timelineDot} />
              <span className={styles.timelineBody}>
                <strong>{event.label}</strong>
                <span>{event.note}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   Locate palette (reskinned)
============================================================ */
type LocateRow =
  | { kind: "location"; key: string; name: string; code: string; path: string; qty: number; unit: string; jump: { unitId: number; storeId?: number } }
  | { kind: "person"; key: string; name: string; tag: string; path: string; jump: { unitId: number; storeId?: number } }
  | { kind: "store"; key: string; name: string; code: string; path: string; qty: number; unit: string; jump: { unitId: number; storeId: number } };

function LocatePalette({
  item,
  units,
  onClose,
  onJump,
}: {
  item: ItemRecord;
  units: ItemDistributionUnit[];
  onClose: () => void;
  onJump: (target: { unitId: number; storeId?: number }) => void;
}) {
  const [query, setQuery] = useState("");

  const allRows = useMemo<LocateRow[]>(() => {
    const acctUnit = item.acct_unit ?? "unit";
    const out: LocateRow[] = [];
    units.forEach(unit => {
      out.push({
        kind: "location",
        key: `unit-${unit.id}`,
        name: unit.name,
        code: unit.code,
        path: unit.name,
        qty: toNumber(unit.totalQuantity),
        unit: acctUnit,
        jump: { unitId: unit.id },
      });
      unit.stores.forEach(store => {
        out.push({
          kind: "store",
          key: `store-${store.id}`,
          name: store.locationName,
          code: store.batchNumber ? `Batch ${store.batchNumber}` : "",
          path: `${unit.name} › ${store.locationName}`,
          qty: toNumber(store.quantity),
          unit: acctUnit,
          jump: { unitId: unit.id, storeId: store.id },
        });
      });
      unit.allocations.forEach(allocation => {
        if (allocation.targetType === "PERSON") {
          out.push({
            kind: "person",
            key: `alloc-${allocation.id}`,
            name: allocation.targetName,
            tag: allocation.batchNumber ? `Batch ${allocation.batchNumber}` : `${formatQuantity(allocation.quantity)} ${acctUnit}`,
            path: `${unit.name} › ${allocation.sourceStoreName}`,
            jump: { unitId: unit.id, storeId: allocation.sourceStoreId },
          });
        }
      });
    });
    return out;
  }, [item.acct_unit, units]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter(row => {
      const hay = (row.name + " " + ("code" in row ? row.code : "") + " " + row.path + " " + ("tag" in row ? row.tag : "")).toLowerCase();
      return hay.includes(q);
    });
  }, [allRows, query]);

  const grouped = useMemo(() => ({
    locations: filtered.filter(r => r.kind === "location") as Extract<LocateRow, { kind: "location" }>[],
    stores: filtered.filter(r => r.kind === "store") as Extract<LocateRow, { kind: "store" }>[],
    persons: filtered.filter(r => r.kind === "person") as Extract<LocateRow, { kind: "person" }>[],
  }), [filtered]);

  const itemShortName = item.name.split("—")[0].trim();

  return (
    <>
      <button type="button" className={styles.locateBackdrop} onClick={onClose} aria-label="Close locate" />
      <div className={styles.locatePanel} role="dialog" aria-label="Locate within item">
        <div className={styles.locateSearch}>
          <Ic d={<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>} size={14} />
          <input
            autoFocus
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={`Find a location, store row or employee within ${itemShortName}…`}
            onKeyDown={event => {
              if (event.key === "Escape") onClose();
              if (event.key === "Enter" && filtered.length) {
                onJump(filtered[0].jump);
              }
            }}
          />
          <span className={styles.locateEsc}>esc</span>
        </div>
        <div className={styles.locateResults}>
          {filtered.length === 0 ? (
            <div className={styles.locateEmpty}>No matches</div>
          ) : (
            <>
              {grouped.locations.length > 0 && (
                <>
                  <div className={styles.locateSection}>Locations · {grouped.locations.length}</div>
                  {grouped.locations.slice(0, 10).map(row => (
                    <button key={row.key} type="button" className={styles.locateRow} onClick={() => onJump(row.jump)}>
                      <span className={styles.locateRowIcon}>
                        <Ic d={<><path d="M12 21s-7-6.5-7-12a7 7 0 1 1 14 0c0 5.5-7 12-7 12Z" /><circle cx="12" cy="9" r="2.5" /></>} size={14} />
                      </span>
                      <span className={styles.locateRowText}>
                        <span className={styles.locateRowName}>{row.name}</span>
                        <span className={styles.locateRowPath}>{row.code ? `${row.code} · ` : ""}{row.path}</span>
                      </span>
                      <span className={styles.locateRowQty}>{formatQuantity(row.qty)} {row.unit}</span>
                    </button>
                  ))}
                </>
              )}
              {grouped.stores.length > 0 && (
                <>
                  <div className={styles.locateSection}>Store rows · {grouped.stores.length}</div>
                  {grouped.stores.slice(0, 10).map(row => (
                    <button key={row.key} type="button" className={styles.locateRow} onClick={() => onJump(row.jump)}>
                      <span className={styles.locateRowIcon}>
                        <Ic d={<><rect x="3" y="6" width="18" height="4" /><rect x="3" y="14" width="18" height="4" /></>} size={14} />
                      </span>
                      <span className={styles.locateRowText}>
                        <span className={styles.locateRowName}>{row.name}</span>
                        <span className={styles.locateRowPath}>{row.code ? `${row.code} · ` : ""}{row.path}</span>
                      </span>
                      <span className={styles.locateRowQty}>{formatQuantity(row.qty)} {row.unit}</span>
                    </button>
                  ))}
                </>
              )}
              {grouped.persons.length > 0 && (
                <>
                  <div className={styles.locateSection}>Allocated to employees · {grouped.persons.length}</div>
                  {grouped.persons.slice(0, 10).map(row => (
                    <button key={row.key} type="button" className={styles.locateRow} onClick={() => onJump(row.jump)}>
                      <span className={styles.locateRowIcon}>
                        <Ic d={<><circle cx="12" cy="8" r="4" /><path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8" /></>} size={14} />
                      </span>
                      <span className={styles.locateRowText}>
                        <span className={styles.locateRowName}>{row.name}</span>
                        <span className={styles.locateRowPath}>{row.tag} · {row.path}</span>
                      </span>
                      <span className={styles.locateRowQty}>allocated</span>
                    </button>
                  ))}
                </>
              )}
            </>
          )}
        </div>
        <div className={styles.locateFoot}>
          <span>↩ jump · esc close</span>
          <span>{filtered.length} results</span>
        </div>
      </div>
    </>
  );
}
