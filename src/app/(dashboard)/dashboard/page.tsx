"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bell,
  Boxes,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  LineChart,
  Lock,
  MapPin,
  Package,
  RefreshCw,
  ShieldCheck,
  Truck,
  Wrench,
} from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { Button } from "@/components/ui/button";
import { useCapabilities, type CapabilityLevel } from "@/contexts/CapabilitiesContext";
import { useNotifications } from "@/contexts/NotificationsContext";
import { apiFetch, type Page } from "@/lib/api";
import styles from "./dashboard.module.css";

type ApiList<T> = Page<T> | T[];
type Tone = "blue" | "green" | "amber" | "red" | "violet" | "neutral";

interface StockRecord {
  id: number;
  item_name?: string | null;
  item_code?: string | null;
  category_name?: string | null;
  quantity?: number | string | null;
  allocated_quantity?: number | string | null;
  in_transit_quantity?: number | string | null;
  available_quantity?: number | string | null;
  location_name?: string | null;
  last_updated?: string | null;
}

interface StockEntryItem {
  item_name?: string | null;
  quantity?: number | string | null;
}

interface StockEntryRecord {
  id: number;
  entry_number?: string | null;
  entry_type?: string | null;
  status?: string | null;
  from_location_name?: string | null;
  to_location_name?: string | null;
  issued_to_name?: string | null;
  created_by_name?: string | null;
  acknowledged_by_name?: string | null;
  created_at?: string | null;
  entry_date?: string | null;
  items?: StockEntryItem[];
}

interface InspectionRecord {
  id: number;
  contract_no?: string | null;
  department_name?: string | null;
  stage?: string | null;
  status?: string | null;
  initiated_by_name?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface MaintenanceWorkOrderRecord {
  id: number;
  work_order_number?: string | null;
  title?: string | null;
  status?: string | null;
  priority?: string | null;
  location_name?: string | null;
  assigned_to_name?: string | null;
  due_date?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
}

interface DepreciationAssetRecord {
  id: number;
  asset_number?: string | null;
  item_name?: string | null;
  status?: string | null;
  closing_value?: string | number | null;
}

interface DashboardData {
  stock: StockRecord[];
  stockEntries: StockEntryRecord[];
  inspections: InspectionRecord[];
  maintenance: MaintenanceWorkOrderRecord[];
  depreciationAssets: DepreciationAssetRecord[];
}

interface MetricCard {
  label: string;
  value: string;
  hint: string;
  tone: Tone;
  icon: React.ComponentType<{ "aria-hidden"?: boolean }>;
  trend?: string;
  scope: string;
}

interface AttentionItem {
  title: string;
  meta: string;
  count: number;
  tone: "critical" | "warning" | "info";
  href: string;
  module: string;
}

interface ActivityRow {
  kind: string;
  subject: string;
  location: string;
  actor: string;
  time: string;
  tone: Tone;
  href: string;
}

const MODULES: Array<{
  key: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ "aria-hidden"?: boolean }>;
}> = [
  { key: "items", label: "Items", href: "/items", icon: Package },
  { key: "locations", label: "Locations", href: "/locations", icon: MapPin },
  { key: "stock-entries", label: "Stock Entries", href: "/stock-entries", icon: FileText },
  { key: "reports", label: "Reports", href: "/reports", icon: BarChart3 },
  { key: "inspections", label: "Inspections", href: "/inspections", icon: ClipboardCheck },
  { key: "maintenance", label: "Maintenance", href: "/maintenance", icon: Wrench },
  { key: "depreciation", label: "Depreciation", href: "/depreciation", icon: LineChart },
];

const EMPTY_DATA: DashboardData = {
  stock: [],
  stockEntries: [],
  inspections: [],
  maintenance: [],
  depreciationAssets: [],
};

function normalizeList<T>(data: ApiList<T>) {
  return Array.isArray(data) ? data : data.results;
}

async function safeList<T>(path: string) {
  try {
    return normalizeList(await apiFetch<ApiList<T>>(path));
  } catch {
    return [] as T[];
  }
}

function n(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmtNumber(value: number) {
  return new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(Math.max(0, Math.round(value)));
}

function fmtDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusText(value: string | null | undefined) {
  return (value ?? "Unknown").replace(/_/g, " ").replace(/\b\w/g, letter => letter.toUpperCase());
}

function includesStatus(value: string | null | undefined, terms: string[]) {
  const normalized = (value ?? "").toLowerCase();
  return terms.some(term => normalized.includes(term));
}

function firstItemName(entry: StockEntryRecord) {
  const first = entry.items?.[0]?.item_name;
  if (!first) return entry.entry_type ? statusText(entry.entry_type) : "Stock movement";
  const extra = (entry.items?.length ?? 0) > 1 ? ` +${(entry.items?.length ?? 1) - 1}` : "";
  return `${first}${extra}`;
}

function stockAllocated(row: StockRecord) {
  if (row.allocated_quantity !== null && row.allocated_quantity !== undefined) return n(row.allocated_quantity);
  return Math.max(0, n(row.quantity) - n(row.available_quantity) - n(row.in_transit_quantity));
}

interface ActivityMonth {
  month: string;
  stock: number;
  inspections: number;
  maintenance: number;
  notifications: number;
}

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth()).padStart(2, "0")}`;
}

function monthLabel(date: Date) {
  return date.toLocaleString("en-GB", { month: "short", year: "2-digit" });
}

function recentMonths(reference = new Date(), count = 6) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(reference.getFullYear(), reference.getMonth() - (count - 1 - index), 1);
    return { key: monthKey(date), label: monthLabel(date) };
  });
}

function addMonthCount(months: Map<string, ActivityMonth>, value: string | null | undefined, field: keyof Omit<ActivityMonth, "month">) {
  if (!value) return;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return;
  const row = months.get(monthKey(date));
  if (!row) return;
  row[field] += 1;
}

function maxActivityTotal(rows: ActivityMonth[]) {
  return Math.max(1, ...rows.map(row => row.stock + row.inspections + row.maintenance + row.notifications));
}

function getCapabilityLabel(level: CapabilityLevel | null | undefined) {
  if (!level) return "Locked";
  if (level === "full") return "Full";
  if (level === "manage") return "Manage";
  return "View";
}

function capabilityTone(level: CapabilityLevel | null | undefined) {
  if (level === "full" || level === "manage") return "green";
  if (level === "view") return "violet";
  return "neutral";
}

function DonutChart({ available, allocated, transit, lowStock }: { available: number; allocated: number; transit: number; lowStock: number }) {
  const total = Math.max(available + allocated + transit + lowStock, 1);
  const segments = [
    { value: available, color: "var(--ink-2)", label: "Available" },
    { value: allocated, color: "color-mix(in oklch, var(--ink) 52%, white)", label: "Allocated" },
    { value: transit, color: "var(--muted)", label: "In transit" },
    { value: lowStock, color: "color-mix(in oklch, var(--danger) 72%, var(--ink))", label: "Low stock" },
  ];
  let offset = 25;

  return (
    <div className={styles.donutWrap}>
      <svg viewBox="0 0 44 44" className={styles.donut} role="img" aria-label="Stock status donut chart">
        <circle cx="22" cy="22" r="15.915" fill="transparent" stroke="var(--surface-2)" strokeWidth="5" />
        {segments.map(segment => {
          const dash = (segment.value / total) * 100;
          const circle = (
            <circle
              key={segment.label}
              cx="22"
              cy="22"
              r="15.915"
              fill="transparent"
              stroke={segment.color}
              strokeWidth="5"
              strokeDasharray={`${dash} ${100 - dash}`}
              strokeDashoffset={offset}
            />
          );
          offset -= dash;
          return circle;
        })}
      </svg>
      <div className={styles.donutCenter}>
        <strong>{fmtNumber(total)}</strong>
        <span>Total</span>
      </div>
    </div>
  );
}

function ActivityChart({ rows }: { rows: ActivityMonth[] }) {
  const max = maxActivityTotal(rows);

  return (
    <div className={styles.healthChart} aria-label="Accessible activity by month">
      <div className={styles.chartGrid} aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      {rows.map(row => {
        const total = row.stock + row.inspections + row.maintenance + row.notifications;
        const height = Math.max(38, Math.round((total / max) * 150));
        return (
          <div key={row.month} className={styles.healthColumn}>
            <div className={styles.healthTotal}>{fmtNumber(total)}</div>
            <div className={styles.healthStack} style={{ height }}>
              <span className={styles.healthUnknown} style={{ flexGrow: row.notifications }} />
              <span className={styles.healthCritical} style={{ flexGrow: row.maintenance }} />
              <span className={styles.healthFair} style={{ flexGrow: row.inspections }} />
              <span className={styles.healthGood} style={{ flexGrow: row.stock }} />
            </div>
            <div className={styles.healthMonth}>{row.month}</div>
          </div>
        );
      })}
    </div>
  );
}

function MetricCardView({ metric }: { metric: MetricCard }) {
  const Icon = metric.icon;

  return (
    <section className={`${styles.metricCard} ${styles[`tone_${metric.tone}`]}`}>
      <div className={styles.metricIcon}>
        <Icon aria-hidden />
      </div>
      <div className={styles.metricBody}>
        <div className={styles.metricLabel}>{metric.label}</div>
        <div className={styles.metricValue}>{metric.value}</div>
        <div className={styles.metricMeta}>
          {metric.trend ? <span className={styles.metricTrend}>{metric.trend}</span> : null}
          <span>{metric.hint}</span>
        </div>
      </div>
      <span className={styles.scopeChip}>{metric.scope}</span>
    </section>
  );
}

export default function DashboardPage() {
  const { modules, can, isSuperuser, isLoading: capabilitiesLoading } = useCapabilities();
  const { summary, alerts, feed, isSummaryLoading, refreshSummary } = useNotifications();
  const [data, setData] = useState<DashboardData>(EMPTY_DATA);
  const [isLoading, setIsLoading] = useState(true);

  const access = useMemo(() => ({
    stock: can("items", "view") || can("stock-entries", "view") || can("reports", "view"),
    stockEntries: can("stock-entries", "view"),
    inspections: can("inspections", "view"),
    maintenance: can("maintenance", "view"),
    depreciation: can("depreciation", "view"),
  }), [can]);

  useEffect(() => {
    if (capabilitiesLoading) return;

    let cancelled = false;
    async function load() {
      setIsLoading(true);
      const [stock, stockEntries, inspections, maintenance, depreciationAssets] = await Promise.all([
        access.stock ? safeList<StockRecord>("/api/inventory/distribution/?page_size=500") : Promise.resolve([]),
        access.stockEntries ? safeList<StockEntryRecord>("/api/inventory/stock-entries/?page_size=200") : Promise.resolve([]),
        access.inspections ? safeList<InspectionRecord>("/api/inventory/inspections/?page_size=200") : Promise.resolve([]),
        access.maintenance ? safeList<MaintenanceWorkOrderRecord>("/api/inventory/maintenance/work-orders/?page_size=200") : Promise.resolve([]),
        access.depreciation ? safeList<DepreciationAssetRecord>("/api/inventory/depreciation/assets/?page_size=200") : Promise.resolve([]),
      ]);
      if (!cancelled) {
        setData({ stock, stockEntries, inspections, maintenance, depreciationAssets });
        setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [access.depreciation, access.inspections, access.maintenance, access.stock, access.stockEntries, capabilitiesLoading]);

  const totals = useMemo(() => {
    const stockTotal = data.stock.reduce((sum, row) => sum + n(row.quantity), 0);
    const available = data.stock.reduce((sum, row) => sum + n(row.available_quantity), 0);
    const allocated = data.stock.reduce((sum, row) => sum + stockAllocated(row), 0);
    const transit = data.stock.reduce((sum, row) => sum + n(row.in_transit_quantity), 0);
    const lowStock = data.stock.filter(row => n(row.quantity) > 0 && n(row.available_quantity) <= Math.max(1, Math.floor(n(row.quantity) * 0.2))).length;
    const pendingAcknowledgements = data.stockEntries.filter(entry => includesStatus(entry.status, ["issued", "pending", "await", "draft"])).length;
    const inspectionWaiting = data.inspections.filter(inspection => includesStatus(inspection.stage, ["central", "stock", "finance", "review"]) && !includesStatus(inspection.status, ["complete", "approved", "closed", "cancel", "reject"])).length;
    const maintenanceOverdue = data.maintenance.filter(order => {
      if (includesStatus(order.status, ["complete", "cancel", "closed"])) return false;
      if (!order.due_date) return includesStatus(order.priority, ["high", "critical"]);
      return new Date(order.due_date).getTime() < Date.now();
    }).length;

    return {
      stockTotal,
      available,
      allocated,
      transit,
      lowStock,
      pendingAcknowledgements,
      inspectionWaiting,
      maintenanceOverdue,
      openAlerts: summary.open_alerts ?? 0,
      unread: summary.unread_notifications ?? 0,
    };
  }, [data, summary.open_alerts, summary.unread_notifications]);

  const accessibleModuleCount = MODULES.filter(module => can(module.key)).length;
  const scopeLabel = isSuperuser ? "University scope" : accessibleModuleCount > 3 ? "Multi-module scope" : "Limited scope";
  const activityMonths = useMemo(() => {
    const rows = recentMonths();
    const byKey = new Map(rows.map(row => [row.key, {
      month: row.label,
      stock: 0,
      inspections: 0,
      maintenance: 0,
      notifications: 0,
    } satisfies ActivityMonth]));

    data.stockEntries.forEach(entry => addMonthCount(byKey, entry.created_at ?? entry.entry_date, "stock"));
    data.inspections.forEach(inspection => addMonthCount(byKey, inspection.updated_at ?? inspection.created_at, "inspections"));
    data.maintenance.forEach(order => addMonthCount(byKey, order.updated_at ?? order.created_at ?? order.due_date, "maintenance"));
    feed.forEach(item => addMonthCount(byKey, item.created_at, "notifications"));

    return rows.map(row => byKey.get(row.key)).filter((row): row is ActivityMonth => Boolean(row));
  }, [data.inspections, data.maintenance, data.stockEntries, feed]);

  const metrics: MetricCard[] = useMemo(() => {
    const base: MetricCard[] = [
      {
        label: access.stock ? "Accessible assets" : "Accessible modules",
        value: access.stock ? fmtNumber(totals.stockTotal) : fmtNumber(accessibleModuleCount),
        hint: access.stock ? "stock quantity in allowed scope" : "sections available to your role",
        tone: "violet",
        icon: Boxes,
        trend: access.stock ? "+ scoped" : undefined,
        scope: scopeLabel,
      },
      {
        label: access.stock ? "In transit" : "Unread updates",
        value: access.stock ? fmtNumber(totals.transit) : fmtNumber(totals.unread),
        hint: access.stock ? "movement not yet settled" : "notifications visible to you",
        tone: "blue",
        icon: Truck,
        trend: totals.transit > 0 ? "active" : undefined,
        scope: access.stock ? "Live stock" : "Inbox",
      },
      {
        label: "Open alerts",
        value: fmtNumber(totals.openAlerts),
        hint: "permission-filtered alert count",
        tone: totals.openAlerts > 0 ? "amber" : "green",
        icon: Bell,
        trend: totals.openAlerts > 0 ? "review" : "clear",
        scope: "Your scope",
      },
      {
        label: access.stockEntries ? "Pending acknowledgements" : "Actionable queues",
        value: access.stockEntries ? fmtNumber(totals.pendingAcknowledgements) : fmtNumber(totals.inspectionWaiting + totals.maintenanceOverdue),
        hint: access.stockEntries ? "stock entries awaiting movement closure" : "tasks from accessible modules",
        tone: totals.pendingAcknowledgements + totals.inspectionWaiting + totals.maintenanceOverdue > 0 ? "red" : "green",
        icon: ClipboardCheck,
        trend: access.stockEntries ? "workflow" : undefined,
        scope: access.stockEntries ? getCapabilityLabel(modules["stock-entries"]) : scopeLabel,
      },
    ];
    return base;
  }, [access.stock, access.stockEntries, accessibleModuleCount, modules, scopeLabel, totals]);

  const attentionItems: AttentionItem[] = useMemo(() => {
    const items: AttentionItem[] = [];
    if (access.stockEntries) {
      items.push({
        title: "Acknowledge transfer",
        meta: "Stock entries waiting for receiving action",
        count: totals.pendingAcknowledgements,
        tone: totals.pendingAcknowledgements > 4 ? "critical" : "warning",
        href: "/stock-entries",
        module: "Stock Entries",
      });
    }
    if (access.inspections) {
      items.push({
        title: "Inspection waiting central register",
        meta: "Certificates still moving through register stages",
        count: totals.inspectionWaiting,
        tone: totals.inspectionWaiting > 8 ? "critical" : "warning",
        href: "/inspections",
        module: "Inspections",
      });
    }
    if (access.stock) {
      items.push({
        title: "Low stock threshold",
        meta: "Rows below available stock threshold",
        count: totals.lowStock,
        tone: totals.lowStock > 10 ? "critical" : "warning",
        href: "/reports",
        module: "Inventory",
      });
    }
    if (access.maintenance) {
      items.push({
        title: "Maintenance overdue",
        meta: "Open work orders past due or high priority",
        count: totals.maintenanceOverdue,
        tone: totals.maintenanceOverdue > 0 ? "critical" : "info",
        href: "/maintenance",
        module: "Maintenance",
      });
    }
    if (items.length === 0) {
      items.push({
        title: "No module queues assigned",
        meta: "Your role currently has read-only or limited access",
        count: accessibleModuleCount,
        tone: "info",
        href: "/notifications",
        module: "Access",
      });
    }
    return items.slice(0, 4);
  }, [access.inspections, access.maintenance, access.stock, access.stockEntries, accessibleModuleCount, totals]);

  const activityRows: ActivityRow[] = useMemo(() => {
    const stockRows = data.stockEntries.slice(0, 4).map<ActivityRow>(entry => ({
      kind: statusText(entry.entry_type ?? "Stock entry"),
      subject: `${entry.entry_number ?? `SE-${entry.id}`} - ${firstItemName(entry)}`,
      location: entry.to_location_name ?? entry.from_location_name ?? entry.issued_to_name ?? "Accessible location",
      actor: entry.acknowledged_by_name ?? entry.created_by_name ?? "System",
      time: fmtDateTime(entry.created_at ?? entry.entry_date),
      tone: includesStatus(entry.status, ["cancel", "reject"]) ? "red" : includesStatus(entry.status, ["pending", "issued"]) ? "amber" : "green",
      href: `/stock-entries/${entry.id}`,
    }));

    const inspectionRows = data.inspections.slice(0, 3).map<ActivityRow>(inspection => ({
      kind: "Inspection",
      subject: `${inspection.contract_no ?? `INSP-${inspection.id}`} - ${statusText(inspection.stage)}`,
      location: inspection.department_name ?? "Inspection department",
      actor: inspection.initiated_by_name ?? "System",
      time: fmtDateTime(inspection.updated_at ?? inspection.created_at),
      tone: includesStatus(inspection.status, ["reject", "revision"]) ? "red" : "violet",
      href: `/inspections/${inspection.id}`,
    }));

    const maintenanceRows = data.maintenance.slice(0, 2).map<ActivityRow>(order => ({
      kind: "Maintenance",
      subject: `${order.work_order_number ?? `WO-${order.id}`} - ${order.title ?? "Work order"}`,
      location: order.location_name ?? "Assigned location",
      actor: order.assigned_to_name ?? "Maintenance desk",
      time: fmtDateTime(order.updated_at ?? order.created_at ?? order.due_date),
      tone: includesStatus(order.priority, ["critical", "high"]) ? "red" : "blue",
      href: "/maintenance",
    }));

    const notificationRows = feed.slice(0, 2).map<ActivityRow>(item => ({
      kind: statusText(item.module),
      subject: item.title,
      location: item.entity_type || "Notification",
      actor: item.actor_name ?? "System",
      time: fmtDateTime(item.created_at),
      tone: item.severity === "critical" ? "red" : item.severity === "warning" ? "amber" : "blue",
      href: item.href || "/notifications",
    }));

    return [...stockRows, ...inspectionRows, ...maintenanceRows, ...notificationRows]
      .sort((a, b) => (a.time === "-" ? 1 : b.time === "-" ? -1 : 0))
      .slice(0, 6);
  }, [data.inspections, data.maintenance, data.stockEntries, feed]);

  const suggestedActions = useMemo(() => {
    const actions = [
      access.stockEntries ? {
        href: "/stock-entries",
        icon: ClipboardCheck,
        title: "Review pending acknowledgements",
        hint: `${fmtNumber(totals.pendingAcknowledgements)} entries need closure`,
        tone: "violet" as Tone,
      } : null,
      access.stock ? {
        href: "/reports",
        icon: BarChart3,
        title: "Open low stock report",
        hint: `${fmtNumber(totals.lowStock)} rows are below threshold`,
        tone: "amber" as Tone,
      } : null,
      access.inspections ? {
        href: "/inspections",
        icon: ClipboardCheck,
        title: "Continue inspection register",
        hint: `${fmtNumber(totals.inspectionWaiting)} inspections need review`,
        tone: "blue" as Tone,
      } : null,
      access.maintenance ? {
        href: "/maintenance",
        icon: Wrench,
        title: "Review maintenance queue",
        hint: `${fmtNumber(totals.maintenanceOverdue)} overdue or high priority`,
        tone: "red" as Tone,
      } : null,
    ].filter((action): action is NonNullable<typeof action> => Boolean(action));

    if (actions.length > 0) return actions.slice(0, 3);
    return [{
      href: "/notifications",
      icon: ShieldCheck,
      title: "Review your notifications",
      hint: `${fmtNumber(totals.unread)} unread updates in your inbox`,
      tone: "green" as Tone,
    }];
  }, [access.inspections, access.maintenance, access.stock, access.stockEntries, totals]);

  const isBusy = isLoading || capabilitiesLoading || isSummaryLoading;

  return (
    <div>
      <Topbar breadcrumb={["Overview", "Dashboard"]} />
      <main className="page">
        <div className="page-head">
          <div className="page-title-group">
            <div className="eyebrow">Overview</div>
            <h1 className="display">Dashboard</h1>
            <div className="page-sub">Role-aware operational summary for accessible assets and workflows.</div>
          </div>
          <div className="page-head-actions">
            <span className={styles.scopeStatus}>
              <ShieldCheck aria-hidden />
              {scopeLabel}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void refreshSummary();
              }}
            >
              <RefreshCw aria-hidden />
              Refresh
            </Button>
          </div>
        </div>

        <div className={styles.dashboardStack} aria-busy={isBusy}>
          <section className={styles.metricGrid} aria-label="Dashboard summary">
            {metrics.map(metric => <MetricCardView key={metric.label} metric={metric} />)}
          </section>

          <section className={styles.mainGrid}>
            <div className="card">
              <header className="card-head">
                <h3>Accessible activity by month</h3>
                <span className="head-meta">Live records</span>
              </header>
              <div className="card-body">
                <div className={styles.chartLegend}>
                  <span><i className={styles.dotGood} />Stock entries</span>
                  <span><i className={styles.dotFair} />Inspections</span>
                  <span><i className={styles.dotCritical} />Maintenance</span>
                  <span><i className={styles.dotUnknown} />Notifications</span>
                </div>
                <ActivityChart rows={activityMonths} />
                <p className={styles.chartNote}>
                  Totals come only from live records returned for this role. Months with no accessible records remain at zero.
                </p>
              </div>
            </div>

            <div className="card">
              <header className="card-head">
                <h3>Stock status</h3>
                <span className="head-meta">{access.stock ? "Live stock" : "Limited"}</span>
              </header>
              <div className="card-body">
                <div className={styles.stockStatusBody}>
                  <DonutChart
                    available={totals.available}
                    allocated={totals.allocated}
                    transit={totals.transit}
                    lowStock={totals.lowStock}
                  />
                  <div className={styles.donutLegend}>
                    <span><i className={styles.dotGood} />Available <strong>{fmtNumber(totals.available)}</strong></span>
                    <span><i className={styles.dotBlue} />Allocated <strong>{fmtNumber(totals.allocated)}</strong></span>
                    <span><i className={styles.dotFair} />In transit <strong>{fmtNumber(totals.transit)}</strong></span>
                    <span><i className={styles.dotCritical} />Low stock <strong>{fmtNumber(totals.lowStock)}</strong></span>
                  </div>
                </div>
                {!access.stock ? (
                  <div className={styles.limitedNote}>Stock values are hidden because this role does not have inventory visibility.</div>
                ) : null}
              </div>
            </div>

            <div className="card">
              <header className="card-head">
                <h3>Needs attention</h3>
                <span className="head-meta">{fmtNumber(attentionItems.reduce((sum, item) => sum + item.count, 0))} open</span>
              </header>
              <div className="card-body-tight">
                <div className={styles.attentionList}>
                  {attentionItems.map(item => (
                    <Link key={item.title} href={item.href} className={styles.attentionRow}>
                      <span className={`${styles.attentionIcon} ${styles[`attention_${item.tone}`]}`}>
                        {item.tone === "critical" ? <AlertTriangle aria-hidden /> : item.tone === "warning" ? <Bell aria-hidden /> : <CheckCircle2 aria-hidden />}
                      </span>
                      <span className={styles.attentionMain}>
                        <strong>{item.title}</strong>
                        <span>{item.meta}</span>
                      </span>
                      <span className={`${styles.attentionBadge} ${styles[`attention_${item.tone}`]}`}>{fmtNumber(item.count)}</span>
                      <ArrowRight aria-hidden />
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="card">
            <header className="card-head">
              <h3>Your access map</h3>
              <Link href="/roles" className={styles.inlineLink}>
                View permissions matrix
                <ArrowRight aria-hidden />
              </Link>
            </header>
            <div className="card-body-tight">
              <div className={styles.accessGrid}>
                {MODULES.map(module => {
                  const level = isSuperuser ? "full" : modules[module.key];
                  const Icon = module.icon;
                  const isLocked = !level;
                  const card = (
                    <span className={`${styles.accessCard} ${isLocked ? styles.accessLocked : ""}`}>
                      <span className={`${styles.accessIcon} ${styles[`tone_${capabilityTone(level)}`]}`}>
                        {isLocked ? <Lock aria-hidden /> : <Icon aria-hidden />}
                      </span>
                      <span>
                        <strong>{module.label}</strong>
                        <em>{getCapabilityLabel(level)}</em>
                      </span>
                    </span>
                  );

                  return isLocked ? (
                    <span key={module.key}>{card}</span>
                  ) : (
                    <Link key={module.key} href={module.href} className={styles.accessLink}>
                      {card}
                    </Link>
                  );
                })}
              </div>
            </div>
          </section>

          <section className={styles.bottomGrid}>
            <div className="table-card">
              <div className="table-card-head">
                <div className="table-card-head-left">
                  <div>
                    <div className="eyebrow">Activity</div>
                    <strong className={styles.tableTitle}>Recent activity in your scope</strong>
                  </div>
                </div>
                <span className="table-count"><span className="mono">{activityRows.length}</span> rows</span>
              </div>
              <div className={styles.tableScroll}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Activity</th>
                      <th>Asset / Document</th>
                      <th>Location</th>
                      <th>Actor</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityRows.length > 0 ? activityRows.map(row => (
                      <tr key={`${row.kind}-${row.subject}-${row.time}`}>
                        <td className="col-user">
                          <span className={`${styles.rowDot} ${styles[`tone_${row.tone}`]}`} />
                          {row.kind}
                        </td>
                        <td><Link href={row.href} className={styles.tableLink}>{row.subject}</Link></td>
                        <td>{row.location}</td>
                        <td>{row.actor}</td>
                        <td className="mono">{row.time}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={5}>
                          <div className={styles.emptyInline}>No recent records were returned for the modules this role can access.</div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="table-card-foot">
                <span>Permission-filtered live records only.</span>
                <Link href="/notifications" className={styles.inlineLink}>View all updates <ArrowRight aria-hidden /></Link>
              </div>
            </div>

            <aside className="card">
              <header className="card-head">
                <h3>Suggested next actions</h3>
              </header>
              <div className="card-body-tight">
                <div className={styles.actionList}>
                  {suggestedActions.map(action => {
                    const Icon = action.icon;
                    return (
                      <Link href={action.href} key={action.title} className={styles.actionRow}>
                        <span className={`${styles.actionIcon} ${styles[`tone_${action.tone}`]}`}>
                          <Icon aria-hidden />
                        </span>
                        <span>
                          <strong>{action.title}</strong>
                          <em>{action.hint}</em>
                        </span>
                        <ArrowRight aria-hidden />
                      </Link>
                    );
                  })}
                </div>
              </div>
              <footer className="card-foot">
                <span>{alerts.length > 0 ? `${fmtNumber(alerts.length)} visible alerts` : "No visible alert rows"}</span>
                <Link href="/notifications" className={styles.inlineLink}>Open inbox</Link>
              </footer>
            </aside>
          </section>
        </div>
      </main>
    </div>
  );
}
