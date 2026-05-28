"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import {
  Boxes,
  ChevronRight,
  ClipboardCheck,
  Download,
  PackageOpen,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { MultiSelectFilter } from "@/components/MultiSelectFilter";
import { Button } from "@/components/ui/button";
import { useCan, useCapabilities } from "@/contexts/CapabilitiesContext";
import { apiFetch, type Page } from "@/lib/api";
import {
  canShowInstances,
  formatItemDate,
  formatItemLabel,
  formatQuantity,
  toNumber,
  type ItemDistributionAllocation,
  type ItemDistributionBatchBreakdown,
  type ItemDistributionInstance,
  type ItemDistributionStore,
  type ItemDistributionUnit,
  type ItemRecord,
  type ItemScopeOption,
} from "@/lib/itemUi";
import {
  Alert,
  Ic,
  scopeFilterOptions,
  useItemDistribution,
  workspaceTrackingTone,
} from "@/components/ItemModuleViews";
import styles from "./ItemDistributionView.module.css";

type SubKind = "store" | "location" | "person";
type FilterKind = "all" | SubKind;

type RowKind = "unit" | "store" | "batch" | "instance" | "location" | "person";
type RowLevel = 0 | 1 | 2 | 3;

interface StoreDetailData {
  unit: ItemDistributionUnit;
  store: ItemDistributionStore;
  allocations: ItemDistributionAllocation[];
  instances: ItemDistributionInstance[];
}

interface AggregatedRow {
  id: string;
  level: RowLevel;
  kind: RowKind;
  name: string;
  code?: string;
  allocated: number;
  available: number;
  inTransit: number;
  total: number;
  badge?: string;
  storeCount?: number;
  allocationCount?: number;
  source?: string | null;
  batch?: string | null;
  updatedAt?: string | null;
  hasOutgoing?: boolean;
  detail?: StoreDetailData;
  children?: AggregatedRow[];
}

interface AggregateOptions {
  item?: Pick<ItemRecord, "tracking_type"> | null;
  instancesByLocation?: Map<number, ItemDistributionInstance[]>;
}

const FILTER_TABS: { key: FilterKind; label: string }[] = [
  { key: "all", label: "All" },
  { key: "store", label: "Stores" },
  { key: "location", label: "Non-store" },
  { key: "person", label: "Employees" },
];
const META_SEPARATOR = " - ";

function normalizeTotal(total: number | string | null | undefined, allocated: number, available: number, inTransit = 0) {
  return Math.max(toNumber(total), allocated + available + inTransit, 0);
}

function normalizeList<T>(data: Page<T> | T[]) {
  return Array.isArray(data) ? data : data.results;
}

function buildScopeQuery(scopeTokens: string[]) {
  if (!scopeTokens.length) return "";
  return scopeTokens.map(token => `scope=${encodeURIComponent(token)}`).join("&");
}

function instanceDisplayName(instance: ItemDistributionInstance) {
  return instance.qr_code || instance.serial_number || `Instance #${instance.id}`;
}

function readableStatus(value: string | null | undefined) {
  const label = formatItemLabel(value, "Unknown").toLowerCase();
  return label.replace(/\b\w/g, c => c.toUpperCase());
}

function normalizedInstanceStatus(instance: ItemDistributionInstance) {
  return String(instance.status ?? "").toUpperCase();
}

function instanceStatusCounts(instances: ItemDistributionInstance[]) {
  return instances.reduce(
    (acc, instance) => {
      const status = normalizedInstanceStatus(instance);
      if (status === "AVAILABLE") acc.available += 1;
      else if (status === "IN_TRANSIT") acc.inTransit += 1;
      else if (status === "ALLOCATED" || status === "ISSUED" || status === "IN_USE") acc.allocated += 1;
      acc.total += 1;
      return acc;
    },
    { allocated: 0, available: 0, inTransit: 0, total: 0 },
  );
}

function buildInstanceRow(instance: ItemDistributionInstance, index: number): AggregatedRow {
  const status = normalizedInstanceStatus(instance);
  const metaParts = [
    instance.serial_number || null,
    readableStatus(instance.status),
    instance.allocated_to ? `Allocated to ${instance.allocated_to}` : null,
  ].filter(Boolean);

  return {
    id: `instance-${instance.id ?? index}`,
    level: 2,
    kind: "instance",
    name: instanceDisplayName(instance),
    badge: metaParts.join(META_SEPARATOR),
    source: instance.location_name ?? null,
    updatedAt: instance.updated_at ?? null,
    allocated: status === "ALLOCATED" || status === "ISSUED" || status === "IN_USE" ? 1 : 0,
    available: status === "AVAILABLE" ? 1 : 0,
    inTransit: status === "IN_TRANSIT" ? 1 : 0,
    total: 1,
  };
}

function buildAllocationRow(unit: ItemDistributionUnit, allocation: ItemDistributionAllocation, index: number, level: RowLevel): AggregatedRow {
  const kind: RowKind = allocation.targetType === "PERSON" ? "person" : "location";
  const quantity = toNumber(allocation.quantity);
  return {
    id: `alloc-${unit.id}-${level}-${allocation.id ?? index}`,
    level,
    kind,
    name: allocation.targetName,
    badge: kind === "person" ? "Employee" : "Non-store",
    source: allocation.sourceStoreName ?? null,
    batch: allocation.batchNumber ?? null,
    updatedAt: allocation.allocatedAt ?? null,
    allocated: quantity,
    available: 0,
    inTransit: 0,
    total: quantity,
  };
}

function buildBatchRow(unit: ItemDistributionUnit, store: ItemDistributionStore, batch: ItemDistributionBatchBreakdown, index: number): AggregatedRow {
  const available = toNumber(batch.availableQuantity);
  const inTransit = toNumber(batch.inTransitQuantity);
  const allocationTotal = batch.allocations.reduce((sum, alloc) => sum + toNumber(alloc.quantity), 0);
  const allocated = Math.max(toNumber(batch.allocatedTotal), allocationTotal, toNumber(batch.quantity) - available - inTransit, 0);
  const personCount = batch.allocations.filter(a => a.targetType === "PERSON").length;
  const nonStoreCount = batch.allocations.length - personCount;
  const metaParts: string[] = [];
  if (batch.batchNumber) metaParts.push("Batch");
  else metaParts.push("Unbatched stock");
  if (batch.allocations.length) {
    const targets: string[] = [];
    if (personCount) targets.push(`${personCount} employee${personCount === 1 ? "" : "s"}`);
    if (nonStoreCount) targets.push(`${nonStoreCount} room${nonStoreCount === 1 ? "" : "s"}`);
    metaParts.push(`Issued ${formatQuantity(allocationTotal)} to ${targets.join(" + ")}`);
  } else {
    metaParts.push("No outgoing allocations");
  }
  if (batch.lastUpdated) metaParts.push(`Updated ${formatItemDate(batch.lastUpdated, "")}`);

  const children = batch.allocations.map((alloc, i) => buildAllocationRow(unit, alloc, i, 3));

  return {
    id: `batch-${unit.id}-${store.id ?? store.locationId}-${batch.batchId ?? "none"}-${index}`,
    level: 2,
    kind: "batch",
    name: batch.batchNumber ? `Batch ${batch.batchNumber}` : "Unbatched",
    badge: metaParts.join(META_SEPARATOR),
    batch: batch.batchNumber ?? null,
    updatedAt: batch.lastUpdated ?? null,
    allocated,
    available,
    inTransit,
    total: normalizeTotal(batch.quantity, allocated, available, inTransit),
    allocationCount: batch.allocations.length,
    hasOutgoing: batch.allocations.length > 0,
    children: children.length ? children : undefined,
  };
}

function buildStoreRow(
  unit: ItemDistributionUnit,
  store: ItemDistributionStore,
  allocations: ItemDistributionAllocation[],
  index: number,
  options: AggregateOptions = {},
): AggregatedRow {
  const isIndividual = canShowInstances(options.item?.tracking_type);
  const stockAvailable = toNumber(store.availableQuantity);
  const stockInTransit = toNumber(store.inTransitQuantity);
  const stockAllocated = Math.max(toNumber(store.allocatedTotal), toNumber(store.quantity) - stockAvailable - stockInTransit, 0);
  const batches = isIndividual ? [] : store.batches ?? [];
  const instances = options.instancesByLocation?.get(store.locationId) ?? [];
  const instanceCounts = instanceStatusCounts(instances);
  const allocationRows = isIndividual ? allocations : batches.length ? batches.flatMap(batch => batch.allocations) : allocations;
  const allocationTotal = allocationRows.reduce((sum, alloc) => sum + toNumber(alloc.quantity), 0);
  const allocated = isIndividual
    ? (instances.length ? instanceCounts.allocated : allocationTotal)
    : stockAllocated;
  const available = isIndividual ? instanceCounts.available : stockAvailable;
  const inTransit = isIndividual ? instanceCounts.inTransit : stockInTransit;
  const total = isIndividual
    ? normalizeTotal(instances.length || allocationTotal, allocated, available, inTransit)
    : normalizeTotal(store.quantity, allocated, available, inTransit);
  const issuedQty = allocationRows.reduce((sum, alloc) => sum + toNumber(alloc.quantity), 0);
  const personCount = allocationRows.filter(a => a.targetType === "PERSON").length;
  const nonStoreCount = allocationRows.length - personCount;
  const metaParts: string[] = [];
  metaParts.push(store.isStore ? "Store" : "Holding");
  if (isIndividual) {
    if (instances.length) metaParts.push(`${instances.length} instance${instances.length === 1 ? "" : "s"}`);
    else if (allocationRows.length) metaParts.push("No visible instances");
  } else {
    if (batches.length) metaParts.push(`${batches.length} batch${batches.length === 1 ? "" : "es"}`);
    if (store.batchNumber) metaParts.push(`Batch ${store.batchNumber}`);
  }
  if (allocationRows.length) {
    const issuedSummary: string[] = [];
    if (personCount) issuedSummary.push(`${personCount} employee${personCount === 1 ? "" : "s"}`);
    if (nonStoreCount) issuedSummary.push(`${nonStoreCount} room${nonStoreCount === 1 ? "" : "s"}`);
    metaParts.push(`Issued ${formatQuantity(issuedQty)} to ${issuedSummary.join(" + ")}`);
  } else {
    metaParts.push("No outgoing allocations");
  }
  if (store.lastUpdated) metaParts.push(`Updated ${formatItemDate(store.lastUpdated, "")}`);

  const children = isIndividual && instances.length
    ? instances.slice(0, 4).map((instance, i) => buildInstanceRow(instance, i))
    : isIndividual
      ? allocations.map((alloc, i) => buildAllocationRow(unit, alloc, i, 2))
      : batches.length
        ? batches.map((batch, i) => buildBatchRow(unit, store, batch, i))
        : allocations.map((alloc, i) => buildAllocationRow(unit, alloc, i, 2));

  return {
    id: `store-${unit.id}-${store.id ?? index}`,
    level: 1,
    kind: "store",
    name: store.locationName,
    badge: metaParts.join(META_SEPARATOR),
    batch: store.batchNumber ?? null,
    updatedAt: store.lastUpdated ?? null,
    allocated,
    available,
    inTransit,
    total,
    allocationCount: allocationRows.length,
    hasOutgoing: allocationRows.length > 0,
    detail: {
      unit,
      store,
      allocations: allocationRows,
      instances,
    },
    children: children.length ? children : undefined,
  };
}

function pickLatest(values: Array<string | null | undefined>): string | null {
  let best = 0;
  let raw: string | null = null;
  values.forEach(value => {
    if (!value) return;
    const ts = new Date(value).getTime();
    if (Number.isFinite(ts) && ts > best) {
      best = ts;
      raw = value;
    }
  });
  return raw;
}

function buildUnitAggregate(unit: ItemDistributionUnit, options: AggregateOptions = {}): AggregatedRow {
  const isIndividual = canShowInstances(options.item?.tracking_type);
  const stockAvailable = toNumber(unit.availableQuantity);
  const stockInTransit = toNumber(unit.inTransitQuantity);
  const stockAllocated = Math.max(toNumber(unit.allocatedQuantity), toNumber(unit.totalQuantity) - stockAvailable - stockInTransit, 0);

  // group allocations under their source store; remainder become orphans at level 1
  const allocationsByStore = new Map<number, ItemDistributionAllocation[]>();
  const orphanAllocations: ItemDistributionAllocation[] = [];
  const storeIdSet = new Set(unit.stores.map(s => s.id));
  unit.allocations.forEach(alloc => {
    if (alloc.sourceStoreId != null && storeIdSet.has(alloc.sourceStoreId)) {
      const list = allocationsByStore.get(alloc.sourceStoreId) ?? [];
      list.push(alloc);
      allocationsByStore.set(alloc.sourceStoreId, list);
    } else {
      orphanAllocations.push(alloc);
    }
  });

  const storeRows = unit.stores.map((store, i) =>
    buildStoreRow(unit, store, allocationsByStore.get(store.id) ?? [], i, options),
  ).filter(row => {
    if (!isIndividual) return true;
    return Boolean(row.detail?.instances.length || row.allocationCount || row.children?.length);
  });
  const orphanRows = orphanAllocations.map((alloc, i) => buildAllocationRow(unit, alloc, i, 1));
  const childRows = [...storeRows, ...orphanRows];
  const storeCount = isIndividual
    ? storeRows.filter(row => row.detail?.store.isStore).length
    : unit.stores.filter(s => s.isStore).length;
  const holdingCount = isIndividual
    ? storeRows.length - storeCount
    : unit.stores.length - storeCount;
  const employeeCount = unit.allocations.filter(a => a.targetType === "PERSON").length;
  const nonStoreCount = unit.allocations.length - employeeCount;
  const updatedAt = pickLatest([
    ...(isIndividual ? storeRows.map(row => row.updatedAt) : unit.stores.map(s => s.lastUpdated)),
    ...unit.allocations.map(a => a.allocatedAt),
  ]);
  const allocated = isIndividual
    ? childRows.reduce((sum, row) => sum + row.allocated, 0)
    : stockAllocated;
  const available = isIndividual
    ? childRows.reduce((sum, row) => sum + row.available, 0)
    : stockAvailable;
  const inTransit = isIndividual
    ? childRows.reduce((sum, row) => sum + row.inTransit, 0)
    : stockInTransit;
  const total = isIndividual
    ? childRows.reduce((sum, row) => sum + row.total, 0)
    : normalizeTotal(unit.totalQuantity, allocated, available, inTransit);

  return {
    id: `unit-${unit.id}`,
    level: 0,
    kind: "unit",
    name: unit.name,
    code: unit.code,
    allocated,
    available,
    inTransit,
    total,
    storeCount,
    allocationCount: unit.allocations.length,
    updatedAt,
    badge: [
      storeCount ? `${storeCount} store${storeCount === 1 ? "" : "s"}` : null,
      holdingCount ? `${holdingCount} holding${holdingCount === 1 ? "" : "s"}` : null,
      nonStoreCount ? `${nonStoreCount} non-store` : null,
      employeeCount ? `${employeeCount} employee${employeeCount === 1 ? "" : "s"}` : null,
    ].filter(Boolean).join(META_SEPARATOR) || "No holders",
    children: childRows,
  };
}

function buildAggregates(units: ItemDistributionUnit[], options: AggregateOptions = {}) {
  const isIndividual = canShowInstances(options.item?.tracking_type);
  return units
    .map(unit => buildUnitAggregate(unit, options))
    .filter(row => !isIndividual || row.total > 0 || Boolean(row.children?.length));
}

export const __buildUnitAggregateForTest = buildUnitAggregate;
export const __buildAggregatesForTest = buildAggregates;

function segPct(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

function csvEscape(value: string | number) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function holderTypeLabel(kind: RowKind): string {
  if (kind === "store") return "Store";
  if (kind === "batch") return "Batch";
  if (kind === "instance") return "Instance";
  if (kind === "person") return "Employee";
  if (kind === "location") return "Non-store Location";
  return "Location";
}

function sectionLabel(row: AggregatedRow): string {
  if (row.kind === "instance") return "Instance";
  if (row.level === 0) return "Location Total";
  if (row.level === 1) return "Store";
  if (row.level === 2) return "Batch";
  return "Allocation";
}

function exportDistributionCsv(item: ItemRecord, units: ItemDistributionUnit[], acctUnit: string) {
  const rows: (string | number)[][] = [
    ["Section", "Parent", "Holder", "Holder Type", "Source", "Batch", "Allocated", "Available", "In Transit", "Total", "Unit"],
  ];
  const walk = (row: AggregatedRow, parentName: string) => {
    rows.push([
      sectionLabel(row),
      parentName,
      row.name,
      holderTypeLabel(row.kind),
      row.source ?? "",
      row.batch ?? "",
      formatQuantity(row.allocated),
      formatQuantity(row.available),
      formatQuantity(row.inTransit),
      formatQuantity(row.total),
      acctUnit,
    ]);
    row.children?.forEach(child => walk(child, row.name));
  };
  units.forEach(unit => walk(buildUnitAggregate(unit), ""));
  const csv = rows.map(row => row.map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  const safeName = (item.code || item.name || "item").trim().replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
  link.download = `${safeName}-distribution.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function distributionTotals(aggregates: AggregatedRow[]) {
  return aggregates.reduce(
    (acc, row) => {
      acc.allocated += row.allocated;
      acc.available += row.available;
      acc.inTransit += row.inTransit;
      acc.total += row.total;
      return acc;
    },
    { allocated: 0, available: 0, inTransit: 0, total: 0 },
  );
}

export function ItemDistributionStats({
  units,
  acctUnit,
  className,
}: {
  units: ItemDistributionUnit[];
  acctUnit: string;
  className?: string;
}) {
  const totals = useMemo(() => distributionTotals(units.map(unit => buildUnitAggregate(unit))), [units]);
  const statsClassName = ["notif-stat-grid", styles.statStrip, className].filter(Boolean).join(" ");

  return (
    <div className={statsClassName}>
      <StatCard title="Total stock" value={formatQuantity(totals.total)} unit={acctUnit} hint={`${units.length} ${units.length === 1 ? "location" : "locations"}`} icon={Boxes} tone="neutral" accent="slate" />
      <StatCard title="Available" value={formatQuantity(totals.available)} unit={acctUnit} hint={`${segPct(totals.available, totals.total)}% of total`} icon={PackageOpen} tone="ok" accent="success" />
      <StatCard title="Allocated" value={formatQuantity(totals.allocated)} unit={acctUnit} hint={`${segPct(totals.allocated, totals.total)}% of total`} icon={ClipboardCheck} tone="neutral" accent="primary" />
      <StatCard title="In transit" value={formatQuantity(totals.inTransit)} unit={acctUnit} hint={totals.inTransit > 0 ? "Awaiting confirmation" : "Nothing in transit"} icon={Truck} tone={totals.inTransit > 0 ? "warning" : "neutral"} accent="warn" />
    </div>
  );
}

export function ItemDistributionPanel({
  itemId,
  item,
  units,
  scopeOptions,
  selectedScopeTokens,
  defaultScopeTokens,
  isLoading,
  onScopeTokensChange,
  className,
  showStats = true,
}: {
  itemId: string;
  item: ItemRecord | null;
  units: ItemDistributionUnit[];
  scopeOptions: ItemScopeOption[];
  selectedScopeTokens: string[];
  defaultScopeTokens: string[];
  isLoading: boolean;
  onScopeTokensChange: (tokens: string[]) => void;
  className?: string;
  showStats?: boolean;
}) {
  const [filterKind, setFilterKind] = useState<FilterKind>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [instances, setInstances] = useState<ItemDistributionInstance[]>([]);
  const [instancesLoading, setInstancesLoading] = useState(false);
  const [instanceError, setInstanceError] = useState<string | null>(null);
  const [selectedStoreDetail, setSelectedStoreDetail] = useState<StoreDetailData | null>(null);
  const shouldLoadInstances = canShowInstances(item?.tracking_type);
  const effectiveScopeTokens = selectedScopeTokens.length ? selectedScopeTokens : defaultScopeTokens;
  const scopeKey = effectiveScopeTokens.join("|");

  useEffect(() => {
    if (!shouldLoadInstances) {
      setInstances([]);
      setInstancesLoading(false);
      setInstanceError(null);
      return;
    }

    let cancelled = false;
    const scopeQuery = buildScopeQuery(scopeKey ? scopeKey.split("|") : []);
    const scopeSuffix = scopeQuery ? `&${scopeQuery}` : "";

    setInstancesLoading(true);
    setInstanceError(null);
    apiFetch<Page<ItemDistributionInstance> | ItemDistributionInstance[]>(
      `/api/inventory/item-instances/?item=${encodeURIComponent(itemId)}&page_size=500${scopeSuffix}`,
    )
      .then(data => {
        if (!cancelled) setInstances(normalizeList(data));
      })
      .catch(err => {
        if (!cancelled) {
          setInstances([]);
          setInstanceError(err instanceof Error ? err.message : "Failed to load item instances.");
        }
      })
      .finally(() => {
        if (!cancelled) setInstancesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [itemId, scopeKey, shouldLoadInstances]);

  const instancesByLocation = useMemo(() => {
    const map = new Map<number, ItemDistributionInstance[]>();
    instances.forEach(instance => {
      if (instance.current_location == null) return;
      const list = map.get(instance.current_location) ?? [];
      list.push(instance);
      map.set(instance.current_location, list);
    });
    return map;
  }, [instances]);

  const aggregates = useMemo(
    () => buildAggregates(units, { item, instancesByLocation }),
    [instancesByLocation, item, units],
  );

  useEffect(() => {
    setExpanded(prev => {
      let changed = false;
      const next = { ...prev };
      const walk = (row: AggregatedRow) => {
        if (next[row.id] === undefined && row.children && row.children.length) {
          // Locations default open; deeper levels stay collapsed unless the user opens them.
          next[row.id] = row.level === 0;
          changed = true;
        }
        row.children?.forEach(walk);
      };
      aggregates.forEach(walk);
      return changed ? next : prev;
    });
  }, [aggregates]);

  const acctUnit = item?.acct_unit ?? "unit";
  const exportItem = item ?? ({ code: itemId, name: itemId } as ItemRecord);
  const panelClassName = [styles.panel, className].filter(Boolean).join(" ");
  const tableLoading = isLoading || instancesLoading;
  const toggleRow = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <div className={panelClassName}>
      {scopeOptions.length ? (
        <div className={styles.scopeBar}>
          <span className={styles.scopeBarLabel}>Scope</span>
          <MultiSelectFilter
            options={scopeFilterOptions(scopeOptions)}
            value={effectiveScopeTokens}
            onChange={tokens => onScopeTokensChange(tokens.length ? tokens : defaultScopeTokens)}
            placeholder="All accessible scopes"
            searchPlaceholder="Search scopes"
          />
          {selectedScopeTokens.length && selectedScopeTokens.join("|") !== defaultScopeTokens.join("|") ? (
            <Button type="button" variant="ghost" size="xs" onClick={() => onScopeTokensChange(defaultScopeTokens)}>
              Reset
            </Button>
          ) : null}
        </div>
      ) : null}

      {showStats ? <ItemDistributionStats units={units} acctUnit={acctUnit} /> : null}
      {instanceError ? <Alert onDismiss={() => setInstanceError(null)}>{instanceError}</Alert> : null}

      <section className={styles.tableCard}>
        <header className={styles.tableHead}>
          <div>
            <h2>Distribution by location</h2>
            <p>Expand a location to see its stores, non-store rooms, and assigned employees.</p>
          </div>
          <div className={styles.tableTools}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => exportDistributionCsv(exportItem, units, acctUnit)}
              disabled={!units.length}
            >
              <Download size={14} />
              Export CSV
            </Button>
            <div className={styles.filterRail}>
              {FILTER_TABS.map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  className={styles.filterTab}
                  data-active={filterKind === tab.key ? "true" : "false"}
                  onClick={() => setFilterKind(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className={styles.tableHeaderRow}>
          <span>Location</span>
          <span>Allocated</span>
          <span>Available</span>
          <span>In transit</span>
          <span>Total</span>
        </div>

        <div className={styles.tableBody}>
          {tableLoading && !aggregates.length ? (
            <div className={styles.tableEmpty}>Loading distribution...</div>
          ) : aggregates.length === 0 ? (
            <div className={styles.tableEmpty}>No distribution is visible in your current permission scope.</div>
          ) : aggregates.map(row => (
            <DistRowNode
              key={row.id}
              row={row}
              expanded={expanded}
              toggle={toggleRow}
              filterKind={filterKind}
              acctUnit={acctUnit}
              onStoreDetail={setSelectedStoreDetail}
            />
          ))}
        </div>
      </section>

      <StoreDetailDrawer
        detail={selectedStoreDetail}
        item={item}
        acctUnit={acctUnit}
        onClose={() => setSelectedStoreDetail(null)}
      />
    </div>
  );
}

export function ItemDistributionView({ itemId }: { itemId: string }) {
  const router = useRouter();
  const { isLoading: capsLoading } = useCapabilities();
  const canViewItems = useCan("items");

  const [selectedScopeTokens, setSelectedScopeTokens] = useState<string[]>([]);
  const [filterKind, setFilterKind] = useState<FilterKind>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selectedStoreDetail, setSelectedStoreDetail] = useState<StoreDetailData | null>(null);

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

  useEffect(() => {
    if (capsLoading) return;
    if (!canViewItems) {
      router.replace("/403");
      return;
    }
    load();
  }, [canViewItems, capsLoading, load, router]);

  const aggregates = useMemo(() => units.map(unit => buildUnitAggregate(unit)), [units]);

  useEffect(() => {
    setExpanded(prev => {
      let changed = false;
      const next = { ...prev };
      const walk = (row: AggregatedRow) => {
        if (next[row.id] === undefined && row.children && row.children.length) {
          // Locations default open; deeper levels stay collapsed unless the user opens them.
          next[row.id] = row.level === 0;
          changed = true;
        }
        row.children?.forEach(walk);
      };
      aggregates.forEach(walk);
      return changed ? next : prev;
    });
  }, [aggregates]);

  const totals = useMemo(() => {
    return aggregates.reduce(
      (acc, row) => {
        acc.allocated += row.allocated;
        acc.available += row.available;
        acc.inTransit += row.inTransit;
        acc.total += row.total;
        return acc;
      },
      { allocated: 0, available: 0, inTransit: 0, total: 0 },
    );
  }, [aggregates]);

  const toggleRow = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const acctUnit = item?.acct_unit ?? "unit";
  const trackingLabel = item?.tracking_type === "INDIVIDUAL"
    ? "Individual tracking"
    : item?.tracking_type === "QUANTITY"
      ? "Quantity tracking"
      : "Perishable batches";

  if (capsLoading) {
    return (
      <div>
        <Topbar breadcrumb={["Inventory", "Items", "Distribution"]} />
        <div className={styles.page}>
          <div className={styles.loading}>Loading distribution permissions…</div>
        </div>
      </div>
    );
  }
  if (!canViewItems) return null;

  return (
    <div>
      <Topbar breadcrumb={["Inventory", "Items", item?.name ?? "Item", "Distribution"]} />
      <div className={styles.page}>
        {fetchError ? (
          <div className={styles.alertSlot}>
            <Alert onDismiss={() => setFetchError(null)} action={
              <Button type="button" variant="outline" size="xs" onClick={() => load()}>Retry</Button>
            }>{fetchError}</Alert>
          </div>
        ) : null}

        <div className="page-head-detail">
          <div className="page-title-group">
            <div className="eyebrow">Stock Distribution</div>
            <h1>{item?.name ?? "Distribution"}</h1>
            <div className="page-sub">
              Live aggregation across every location in your permission scope, with a drill-down into stores and holders.
            </div>
            {item ? (
              <div className="page-id-row">
                <span className="doc-no">{item.code}</span>
                <span className={styles.trackChip} data-tone={workspaceTrackingTone(item.tracking_type)}>{trackingLabel}</span>
              </div>
            ) : null}
          </div>
          <div className="page-head-actions">
            <Button asChild variant="outline" size="sm" className="page-head-back">
              <Link href={`/items/${itemId}`}>
                <Ic d="M19 12H5M12 19l-7-7 7-7" size={12} />
                Back to item
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => exportDistributionCsv(item ?? ({ code: itemId, name: itemId } as ItemRecord), units, acctUnit)}
              disabled={!units.length}
            >
              <Download size={14} />
              Export CSV
            </Button>
          </div>
        </div>

        {scopeOptions.length ? (
          <div className={styles.scopeBar}>
            <span className={styles.scopeBarLabel}>Scope</span>
            <MultiSelectFilter
              options={scopeFilterOptions(scopeOptions)}
              value={effectiveScopeTokens}
              onChange={tokens => setSelectedScopeTokens(tokens.length ? tokens : defaultScopeTokens)}
              placeholder="All accessible scopes"
              searchPlaceholder="Search scopes"
            />
            {selectedScopeTokens.length && selectedScopeTokens.join("|") !== defaultScopeTokens.join("|") ? (
              <Button type="button" variant="ghost" size="xs" onClick={() => setSelectedScopeTokens(defaultScopeTokens)}>
                Reset
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className={`notif-stat-grid ${styles.statStrip}`}>
          <StatCard title="Total stock" value={formatQuantity(totals.total)} unit={acctUnit} hint={`${units.length} ${units.length === 1 ? "location" : "locations"}`} icon={Boxes} tone="neutral" accent="slate" />
          <StatCard title="Available" value={formatQuantity(totals.available)} unit={acctUnit} hint={`${segPct(totals.available, totals.total)}% of total`} icon={PackageOpen} tone="ok" accent="success" />
          <StatCard title="Allocated" value={formatQuantity(totals.allocated)} unit={acctUnit} hint={`${segPct(totals.allocated, totals.total)}% of total`} icon={ClipboardCheck} tone="neutral" accent="primary" />
          <StatCard title="In transit" value={formatQuantity(totals.inTransit)} unit={acctUnit} hint={totals.inTransit > 0 ? "Awaiting confirmation" : "Nothing in transit"} icon={Truck} tone={totals.inTransit > 0 ? "warning" : "neutral"} accent="warn" />
        </div>

        <section className={styles.tableCard}>
          <header className={styles.tableHead}>
            <div>
              <h2>Distribution by location</h2>
              <p>Expand a location to see its stores, non-store rooms, and assigned employees.</p>
            </div>
            <div className={styles.filterRail}>
              {FILTER_TABS.map(tab => (
                <button
                  key={tab.key}
                  type="button"
                  className={styles.filterTab}
                  data-active={filterKind === tab.key ? "true" : "false"}
                  onClick={() => setFilterKind(tab.key)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </header>

          <div className={styles.tableHeaderRow}>
            <span>Location</span>
            <span>Allocated</span>
            <span>Available</span>
            <span>In transit</span>
            <span>Total</span>
          </div>

          <div className={styles.tableBody}>
            {isLoading && !units.length ? (
              <div className={styles.tableEmpty}>Loading distribution…</div>
            ) : aggregates.length === 0 ? (
              <div className={styles.tableEmpty}>No distribution is visible in your current permission scope.</div>
            ) : aggregates.map(row => (
            <DistRowNode
              key={row.id}
                row={row}
                expanded={expanded}
                toggle={toggleRow}
                filterKind={filterKind}
                acctUnit={acctUnit}
                onStoreDetail={setSelectedStoreDetail}
              />
            ))}
          </div>
        </section>
        <StoreDetailDrawer
          detail={selectedStoreDetail}
          item={item}
          acctUnit={acctUnit}
          onClose={() => setSelectedStoreDetail(null)}
        />
      </div>
    </div>
  );
}

function filterChildren(children: AggregatedRow[] | undefined, filterKind: FilterKind): AggregatedRow[] {
  if (!children) return [];
  if (filterKind === "all") return children;
  return children
    .map(child => {
      if (child.kind === filterKind) return child;
      const filteredChildren = filterChildren(child.children, filterKind);
      if (filteredChildren.length) return { ...child, children: filteredChildren };
      return null;
    })
    .filter((row): row is AggregatedRow => row !== null);
}

function DistRowNode({
  row,
  expanded,
  toggle,
  filterKind,
  acctUnit,
  onStoreDetail,
}: {
  row: AggregatedRow;
  expanded: Record<string, boolean>;
  toggle: (id: string) => void;
  filterKind: FilterKind;
  acctUnit: string;
  onStoreDetail: (detail: StoreDetailData) => void;
}) {
  const visibleChildren = useMemo(() => filterChildren(row.children, filterKind), [row.children, filterKind]);
  const hasChildren = visibleChildren.length > 0;
  const isOpen = hasChildren && expanded[row.id] !== false;
  const isLeaf = !row.children || row.children.length === 0;

  const isStore = row.kind === "store";
  const isBatch = row.kind === "batch";
  const isAllocation = row.kind === "person" || row.kind === "location";
  const passiveTarget = isAllocation;
  const canOpenDetail = row.kind === "store" && row.detail;

  const metaParts: string[] = [];
  if (row.level === 0) {
    if (row.code) metaParts.push(row.code);
    if (row.badge) metaParts.push(row.badge);
    if (row.updatedAt) metaParts.push(`Updated ${formatItemDate(row.updatedAt, "")}`);
  } else if (isStore) {
    if (row.badge) metaParts.push(row.badge);
  } else if (isBatch) {
    if (row.badge) metaParts.push(row.badge);
  } else if (isAllocation) {
    if (row.badge) metaParts.push(row.badge);
    if (row.source) metaParts.push(`from ${row.source}`);
    if (row.batch) metaParts.push(`Batch ${row.batch}`);
    if (row.updatedAt) metaParts.push(`Issued ${formatItemDate(row.updatedAt, "")}`);
  }

  const handleToggle = () => {
    if (hasChildren) toggle(row.id);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!hasChildren) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggle(row.id);
    }
  };

  return (
    <div className={styles.node} data-level={row.level} data-open={isOpen ? "true" : "false"} data-kind={row.kind}>
      <div
        role={hasChildren ? "button" : undefined}
        tabIndex={hasChildren ? 0 : undefined}
        className={styles.row}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        aria-expanded={hasChildren ? isOpen : undefined}
        data-clickable={hasChildren ? "true" : "false"}
      >
        <span className={styles.nameCell}>
          <span className={styles.caret} data-leaf={isLeaf ? "true" : "false"} data-empty={hasChildren ? "false" : "true"}>
            {hasChildren ? <ChevronRight size={14} strokeWidth={2.25} /> : null}
          </span>
          <span className={styles.nameText}>
            <strong>{row.name}</strong>
            {metaParts.length ? <small>{metaParts.join(META_SEPARATOR)}</small> : null}
          </span>
          {canOpenDetail ? (
            <button
              type="button"
              className={styles.detailInlineButton}
              onClick={event => {
                event.stopPropagation();
                onStoreDetail(row.detail as StoreDetailData);
              }}
            >
              View detail
            </button>
          ) : null}
        </span>
        <span className={styles.cell}>{passiveTarget ? "—" : formatQuantity(row.allocated)}</span>
        <span className={styles.cell}>{passiveTarget ? "—" : formatQuantity(row.available)}</span>
        <span className={styles.cell}>{passiveTarget ? "—" : formatQuantity(row.inTransit)}</span>
        <span className={styles.cellTotal}>
          {formatQuantity(row.total)}
          <em>{acctUnit}</em>
        </span>
      </div>

      {isOpen ? (
        <div className={styles.childrenWrap}>
          {visibleChildren.map(child => (
            <DistRowNode
              key={child.id}
              row={child}
              expanded={expanded}
              toggle={toggle}
              filterKind={filterKind}
              acctUnit={acctUnit}
              onStoreDetail={onStoreDetail}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DetailMetric({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className={styles.detailMetric}>
      <span>{label}</span>
      <strong>{formatQuantity(value)} <em>{unit}</em></strong>
    </div>
  );
}

function StoreDetailDrawer({
  detail,
  item,
  acctUnit,
  onClose,
}: {
  detail: StoreDetailData | null;
  item: ItemRecord | null;
  acctUnit: string;
  onClose: () => void;
}) {
  if (!detail) return null;

  const { unit, store, allocations, instances } = detail;
  const batches = store.batches ?? [];
  const isIndividual = canShowInstances(item?.tracking_type);
  const detailCounts = isIndividual ? instanceStatusCounts(instances) : null;

  return (
    <div className={styles.detailLayer}>
      <button type="button" className={styles.detailBackdrop} aria-label="Close store detail" onClick={onClose} />
      <aside className={styles.detailDrawer} role="dialog" aria-modal="true" aria-label={`${store.locationName} detail`}>
        <header className={styles.detailDrawerHead}>
          <div>
            <span>{unit.name}</span>
            <h3>{store.locationName}</h3>
            <p>{isIndividual ? "Instance-level store detail" : "Batch and allocation detail"}</p>
          </div>
          <button type="button" className={styles.detailClose} aria-label="Close store detail" onClick={onClose}>
            <Ic d="M18 6 6 18M6 6l12 12" size={16} />
          </button>
        </header>

        <div className={styles.detailMetricGrid}>
          <DetailMetric label="Total" value={detailCounts ? detailCounts.total : toNumber(store.quantity)} unit={acctUnit} />
          <DetailMetric label="Available" value={detailCounts ? detailCounts.available : toNumber(store.availableQuantity)} unit={acctUnit} />
          <DetailMetric label="Allocated" value={detailCounts ? detailCounts.allocated : toNumber(store.allocatedTotal)} unit={acctUnit} />
          <DetailMetric label="In transit" value={detailCounts ? detailCounts.inTransit : toNumber(store.inTransitQuantity)} unit={acctUnit} />
        </div>

        <div className={styles.detailDrawerBody}>
          {isIndividual ? (
            <section className={styles.detailSection}>
              <div className={styles.detailSectionHead}>
                <h4>Instances</h4>
                <span>{instances.length}</span>
              </div>
              {instances.length ? (
                <div className={styles.detailList}>
                  {instances.map(instance => (
                    <div key={instance.id} className={styles.detailListRow}>
                      <div>
                        <strong>{instanceDisplayName(instance)}</strong>
                        <small>
                          {[instance.serial_number, readableStatus(instance.status), instance.allocated_to ? `Allocated to ${instance.allocated_to}` : null].filter(Boolean).join(META_SEPARATOR)}
                        </small>
                      </div>
                      <span>{instance.location_name ?? store.locationName}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.detailEmpty}>No instances are visible for this store in your current permission scope.</div>
              )}
            </section>
          ) : (
            <section className={styles.detailSection}>
              <div className={styles.detailSectionHead}>
                <h4>Batches</h4>
                <span>{batches.length}</span>
              </div>
              {batches.length ? (
                <div className={styles.detailList}>
                  {batches.map((batch, index) => (
                    <div key={`${batch.batchId ?? "none"}-${index}`} className={styles.detailListRow}>
                      <div>
                        <strong>{batch.batchNumber ? `Batch ${batch.batchNumber}` : "Unbatched"}</strong>
                        <small>
                          {[
                            `${formatQuantity(batch.availableQuantity)} available`,
                            `${formatQuantity(batch.allocatedTotal)} allocated`,
                            toNumber(batch.inTransitQuantity) > 0 ? `${formatQuantity(batch.inTransitQuantity)} in transit` : null,
                          ].filter(Boolean).join(META_SEPARATOR)}
                        </small>
                      </div>
                      <span>{formatQuantity(batch.quantity)} {acctUnit}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className={styles.detailEmpty}>No batch rows are visible for this store.</div>
              )}
            </section>
          )}

          <section className={styles.detailSection}>
            <div className={styles.detailSectionHead}>
              <h4>Allocations</h4>
              <span>{allocations.length}</span>
            </div>
            {allocations.length ? (
              <div className={styles.detailList}>
                {allocations.map((allocation, index) => (
                  <div key={`${allocation.id}-${index}`} className={styles.detailListRow}>
                    <div>
                      <strong>{allocation.targetName}</strong>
                      <small>
                        {[
                          allocation.targetType === "PERSON" ? "Employee" : "Room",
                          allocation.batchNumber ? `Batch ${allocation.batchNumber}` : null,
                          allocation.allocatedAt ? `Issued ${formatItemDate(allocation.allocatedAt, "")}` : null,
                        ].filter(Boolean).join(META_SEPARATOR)}
                      </small>
                    </div>
                    <span>{formatQuantity(allocation.quantity)} {acctUnit}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.detailEmpty}>No outgoing allocations are visible for this store.</div>
            )}
          </section>
        </div>
      </aside>
    </div>
  );
}

type StatTone = "neutral" | "ok" | "warning" | "critical";
type StatAccent = "slate" | "primary" | "success" | "warn";

function StatCard({
  title,
  value,
  unit,
  hint,
  icon: Icon,
  tone,
  accent,
}: {
  title: string;
  value: string;
  unit: string;
  hint: string;
  icon: LucideIcon;
  tone: StatTone;
  accent: StatAccent;
}) {
  return (
    <div className="notif-stat" data-tone={tone} data-accent={accent}>
      <div className="notif-stat-body">
        <div className="notif-stat-title">{title}</div>
        <div className="notif-stat-value">
          {value}
          <span className={styles.statUnit}>{unit}</span>
        </div>
        <div className="notif-stat-meta">
          <span className="notif-stat-hint">{hint}</span>
        </div>
      </div>
      <div className="notif-stat-icon" aria-hidden="true">
        <Icon size={16} strokeWidth={2} />
      </div>
    </div>
  );
}
