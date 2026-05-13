"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ListPagination } from "@/components/ListPagination";
import { ThemedSelect, type ThemedSelectOption } from "@/components/ThemedSelect";
import { Topbar } from "@/components/Topbar";
import { useCan, useCapabilities } from "@/contexts/CapabilitiesContext";
import { apiFetch, type Page } from "@/lib/api";
import { useClientPagination } from "@/lib/listPagination";
import {
  formatDate,
  formatDateTime,
  formatMaintenanceLabel,
  isClosedMaintenance,
  normalizeList,
  priorityPillClass,
  statusPillClass,
  targetSummary,
  toNumber,
  type InventoryBatchOption,
  type InventoryInstanceOption,
  type LocationOptionRecord,
  type MaintenanceMeterReadingRecord,
  type MaintenancePlanRecord,
  type MaintenancePriority,
  type MaintenanceTargetType,
  type MaintenanceType,
  type MaintenanceTriggerType,
  type MaintenanceWorkOrderRecord,
} from "@/lib/maintenanceUi";

type MaintenanceTab = "work-orders" | "plans" | "readings";
type Density = "compact" | "balanced" | "comfortable";
type PlanTargetMode = "ITEM" | "SPECIFIC";

interface InventoryItemOption {
  id: number;
  name: string;
  code?: string | null;
  tracking_type?: string | null;
}

interface WorkOrderForm {
  target_type: MaintenanceTargetType;
  instance: string;
  batch: string;
  location: string;
  affected_quantity: string;
  title: string;
  description: string;
  maintenance_type: MaintenanceType;
  trigger_type: MaintenanceTriggerType;
  priority: MaintenancePriority;
  criticality: MaintenancePriority;
  due_date: string;
  vendor_name: string;
  estimated_cost: string;
  condition_before: string;
}

interface PlanForm {
  target_type: MaintenanceTargetType;
  target_mode: PlanTargetMode;
  item: string;
  instance: string;
  batch: string;
  name: string;
  maintenance_type: MaintenanceType;
  cadence: "CALENDAR" | "METER" | "CONDITION";
  interval_days: string;
  meter_name: string;
  meter_interval: string;
  condition_basis: string;
  priority: MaintenancePriority;
  criticality: MaintenancePriority;
  checklist: string;
  next_due_date: string;
}

interface MeterReadingForm {
  target_type: MaintenanceTargetType;
  instance: string;
  batch: string;
  location: string;
  reading_name: string;
  value: string;
  unit: string;
  recorded_at: string;
  notes: string;
}

interface CompletionForm {
  action_taken: string;
  outcome_notes: string;
  condition_after: string;
  actual_cost: string;
  failure_mode: string;
  root_cause: string;
  follow_up_required: boolean;
  next_due_date: string;
}

const TABS: Array<{ key: MaintenanceTab; label: string }> = [
  { key: "work-orders", label: "Work Orders" },
  { key: "plans", label: "Plans" },
  { key: "readings", label: "Meter Readings" },
];

const MAINTENANCE_TYPES: MaintenanceType[] = ["PREVENTIVE", "CORRECTIVE", "PREDICTIVE", "INSPECTION", "CALIBRATION"];
const TRIGGER_TYPES: MaintenanceTriggerType[] = ["CALENDAR", "METER", "CONDITION", "MANUAL", "FAILURE"];
const PRIORITIES: MaintenancePriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const STATUSES = ["REQUESTED", "APPROVED", "SCHEDULED", "IN_PROGRESS", "ON_HOLD", "COMPLETED", "CANCELLED"];
const MAINTENANCE_PAGE_SIZE = 12;

const EMPTY_WORK_ORDER_FORM: WorkOrderForm = {
  target_type: "INSTANCE",
  instance: "",
  batch: "",
  location: "",
  affected_quantity: "1",
  title: "",
  description: "",
  maintenance_type: "PREVENTIVE",
  trigger_type: "MANUAL",
  priority: "MEDIUM",
  criticality: "MEDIUM",
  due_date: "",
  vendor_name: "",
  estimated_cost: "",
  condition_before: "",
};

const EMPTY_PLAN_FORM: PlanForm = {
  target_type: "INSTANCE",
  target_mode: "SPECIFIC",
  item: "",
  instance: "",
  batch: "",
  name: "",
  maintenance_type: "PREVENTIVE",
  cadence: "CALENDAR",
  interval_days: "180",
  meter_name: "",
  meter_interval: "",
  condition_basis: "",
  priority: "MEDIUM",
  criticality: "MEDIUM",
  checklist: "",
  next_due_date: "",
};

const EMPTY_READING_FORM: MeterReadingForm = {
  target_type: "INSTANCE",
  instance: "",
  batch: "",
  location: "",
  reading_name: "",
  value: "",
  unit: "",
  recorded_at: "",
  notes: "",
};

const EMPTY_COMPLETION_FORM: CompletionForm = {
  action_taken: "",
  outcome_notes: "",
  condition_after: "",
  actual_cost: "",
  failure_mode: "",
  root_cause: "",
  follow_up_required: false,
  next_due_date: "",
};

const Ic = ({ d, size = 16 }: { d: ReactNode | string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true" focusable="false">
    {typeof d === "string" ? <path d={d} /> : d}
  </svg>
);

function optionize<T extends { id: number }>(rows: T[], label: (row: T) => string, meta?: (row: T) => string | null | undefined): ThemedSelectOption[] {
  return rows.map(row => ({ value: String(row.id), label: label(row), meta: meta?.(row) ?? undefined }));
}

function enumOptions(values: string[], includeAllLabel?: string): ThemedSelectOption[] {
  return [
    ...(includeAllLabel ? [{ value: "", label: includeAllLabel }] : []),
    ...values.map(value => ({ value, label: formatMaintenanceLabel(value) })),
  ];
}

function fieldValue(value: string | number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function buildPayload(source: object, omit: string[] = []) {
  const omitSet = new Set(omit);
  return Object.fromEntries(
    Object.entries(source as Record<string, unknown>).filter(([key, value]) => {
      if (omitSet.has(key)) return false;
      if (value === null || value === undefined) return false;
      if (typeof value === "boolean") return true;
      if (typeof value === "number") return Number.isFinite(value);
      return String(value).trim().length > 0;
    }),
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      {children}
      {hint ? <div className="field-hint">{hint}</div> : null}
    </div>
  );
}

function Section({ n, title, sub, children }: { n: number; title: string; sub?: string; children: ReactNode }) {
  return (
    <section className="form-section">
      <header className="form-section-head">
        <div className="form-section-n mono">{String(n).padStart(2, "0")}</div>
        <div>
          <h3>{title}</h3>
          {sub ? <div className="form-section-sub">{sub}</div> : null}
        </div>
      </header>
      <div className="form-section-body">{children}</div>
    </section>
  );
}

function Alert({ children, onDismiss }: { children: ReactNode; onDismiss?: () => void }) {
  return (
    <div className="notice notice-info" role="status">
      <div className="notice-body">
        <div className="notice-text">{children}</div>
      </div>
      {onDismiss ? <div className="notice-actions"><button type="button" className="btn btn-ghost btn-sm" onClick={onDismiss}>Dismiss</button></div> : null}
    </div>
  );
}

function ModalShell({
  title,
  eyebrow,
  children,
  footer,
  onClose,
  wide = false,
}: {
  title: string;
  eyebrow: string;
  children: ReactNode;
  footer: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className={"modal" + (wide ? " modal-lg" : "")} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">{eyebrow}</div>
            <h2>{title}</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">x</button>
        </div>
        <div className="modal-body">{children}</div>
        <div className="modal-foot">{footer}</div>
      </section>
    </div>
  );
}

function DensityToggle({ density, onChange }: { density: Density; onChange: (density: Density) => void }) {
  return (
    <div className="seg">
      {(["compact", "balanced", "comfortable"] as const).map(option => (
        <button type="button" key={option} className={"seg-btn" + (density === option ? " active" : "")} onClick={() => onChange(option)}>
          {formatMaintenanceLabel(option)}
        </button>
      ))}
    </div>
  );
}

export default function MaintenancePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoading: capsLoading } = useCapabilities();
  const canView = useCan("maintenance");
  const canManage = useCan("maintenance", "manage");
  const canFull = useCan("maintenance", "full");
  const [tab, setTab] = useState<MaintenanceTab>("work-orders");
  const [density, setDensity] = useState<Density>("balanced");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "");
  const [targetFilter, setTargetFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState(searchParams.get("priority") ?? "");
  const [workOrders, setWorkOrders] = useState<MaintenanceWorkOrderRecord[]>([]);
  const [plans, setPlans] = useState<MaintenancePlanRecord[]>([]);
  const [readings, setReadings] = useState<MaintenanceMeterReadingRecord[]>([]);
  const [items, setItems] = useState<InventoryItemOption[]>([]);
  const [instances, setInstances] = useState<InventoryInstanceOption[]>([]);
  const [batches, setBatches] = useState<InventoryBatchOption[]>([]);
  const [locations, setLocations] = useState<LocationOptionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [showWorkOrderModal, setShowWorkOrderModal] = useState(false);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showReadingModal, setShowReadingModal] = useState(false);
  const [workOrderForm, setWorkOrderForm] = useState<WorkOrderForm>(EMPTY_WORK_ORDER_FORM);
  const [planForm, setPlanForm] = useState<PlanForm>(EMPTY_PLAN_FORM);
  const [readingForm, setReadingForm] = useState<MeterReadingForm>(EMPTY_READING_FORM);
  const [historyTarget, setHistoryTarget] = useState<MaintenanceWorkOrderRecord | null>(null);
  const [completeTarget, setCompleteTarget] = useState<MaintenanceWorkOrderRecord | null>(null);
  const [completionForm, setCompletionForm] = useState<CompletionForm>(EMPTY_COMPLETION_FORM);

  const instanceParam = searchParams.get("instance");
  const batchParam = searchParams.get("batch");
  const overdueParam = searchParams.get("overdue");

  useEffect(() => {
    if (!capsLoading && !canView) router.replace("/403");
  }, [canView, capsLoading, router]);

  const loadData = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    setError(null);
    const query = new URLSearchParams({ page_size: "500" });
    if (instanceParam) query.set("instance", instanceParam);
    if (batchParam) query.set("batch", batchParam);
    if (overdueParam) query.set("overdue", overdueParam);
    if (priorityFilter) query.set("priority", priorityFilter);

    try {
      const [
        workOrderData,
        planData,
        readingData,
        itemData,
        instanceData,
        batchData,
        locationData,
      ] = await Promise.all([
        apiFetch<Page<MaintenanceWorkOrderRecord> | MaintenanceWorkOrderRecord[]>(`/api/inventory/maintenance/work-orders/?${query.toString()}`),
        apiFetch<Page<MaintenancePlanRecord> | MaintenancePlanRecord[]>("/api/inventory/maintenance/plans/?page_size=500"),
        apiFetch<Page<MaintenanceMeterReadingRecord> | MaintenanceMeterReadingRecord[]>("/api/inventory/maintenance/meter-readings/?page_size=500"),
        canManage ? apiFetch<Page<InventoryItemOption> | InventoryItemOption[]>("/api/inventory/items/?page_size=500").catch(() => [] as InventoryItemOption[]) : ([] as InventoryItemOption[]),
        canManage ? apiFetch<Page<InventoryInstanceOption> | InventoryInstanceOption[]>("/api/inventory/item-instances/?page_size=500").catch(() => [] as InventoryInstanceOption[]) : ([] as InventoryInstanceOption[]),
        canManage ? apiFetch<Page<InventoryBatchOption> | InventoryBatchOption[]>("/api/inventory/item-batches/?page_size=500").catch(() => [] as InventoryBatchOption[]) : ([] as InventoryBatchOption[]),
        canManage ? apiFetch<Page<LocationOptionRecord> | LocationOptionRecord[]>("/api/inventory/locations/?page_size=500").catch(() => [] as LocationOptionRecord[]) : ([] as LocationOptionRecord[]),
      ]);
      setWorkOrders(normalizeList(workOrderData));
      setPlans(normalizeList(planData));
      setReadings(normalizeList(readingData));
      setItems(normalizeList(itemData));
      setInstances(normalizeList(instanceData));
      setBatches(normalizeList(batchData));
      setLocations(normalizeList(locationData).filter(location => location.is_store !== false));
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Failed to load maintenance data.");
    } finally {
      setLoading(false);
    }
  }, [batchParam, canManage, canView, instanceParam, overdueParam, priorityFilter]);

  useEffect(() => {
    if (!capsLoading && canView) void loadData();
  }, [canView, capsLoading, loadData]);

  const itemOptions = useMemo(() => optionize(items, item => item.name, item => item.code), [items]);
  const instanceOptions = useMemo(() => optionize(instances, row => row.item_name || `Instance ${row.id}`, row => row.serial_number || row.location_name || `#${row.id}`), [instances]);
  const batchOptions = useMemo(() => optionize(batches, row => row.item_name || `Batch ${row.id}`, row => row.batch_number || `#${row.id}`), [batches]);
  const locationOptions = useMemo(() => optionize(locations, row => row.name, row => row.code), [locations]);

  const filteredWorkOrders = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    return workOrders.filter(row => {
      if (statusFilter && row.status !== statusFilter) return false;
      if (targetFilter && row.target_type !== targetFilter) return false;
      if (priorityFilter && row.priority !== priorityFilter) return false;
      if (!term) return true;
      return [
        row.work_order_number,
        row.title,
        row.target_label,
        row.item_name,
        row.item_code,
        row.instance_serial_number,
        row.batch_number,
        row.location_name,
      ].some(value => String(value ?? "").toLowerCase().includes(term));
    });
  }, [deferredSearch, priorityFilter, statusFilter, targetFilter, workOrders]);

  const filteredPlans = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    return plans.filter(row => {
      if (targetFilter && row.target_type !== targetFilter) return false;
      if (!term) return true;
      return [row.plan_code, row.name, row.target_label, row.item_name, row.item_code, row.batch_number, row.instance_serial_number]
        .some(value => String(value ?? "").toLowerCase().includes(term));
    });
  }, [deferredSearch, plans, targetFilter]);

  const filteredReadings = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    return readings.filter(row => {
      if (targetFilter && row.target_type !== targetFilter) return false;
      if (!term) return true;
      return [row.reading_name, row.target_label, row.item_name, row.item_code, row.batch_number, row.instance_serial_number, row.location_name]
        .some(value => String(value ?? "").toLowerCase().includes(term));
    });
  }, [deferredSearch, readings, targetFilter]);

  const activeRows: Array<MaintenanceWorkOrderRecord | MaintenancePlanRecord | MaintenanceMeterReadingRecord> = tab === "work-orders"
    ? filteredWorkOrders
    : tab === "plans"
    ? filteredPlans
    : filteredReadings;
  const activeCount = tab === "work-orders"
    ? filteredWorkOrders.length
    : tab === "plans"
    ? filteredPlans.length
    : filteredReadings.length;
  const totalCount = tab === "work-orders" ? workOrders.length : tab === "plans" ? plans.length : readings.length;
  const currentLabel = tab === "work-orders" ? "work orders" : tab === "plans" ? "plans" : "readings";

  const {
    page,
    setPage,
    pageItems,
    pageStart,
    pageEnd,
    totalPages,
  } = useClientPagination(activeRows, MAINTENANCE_PAGE_SIZE, [deferredSearch, priorityFilter, statusFilter, tab, targetFilter]);
  const pagedWorkOrders = pageItems as MaintenanceWorkOrderRecord[];
  const pagedPlans = pageItems as MaintenancePlanRecord[];
  const pagedReadings = pageItems as MaintenanceMeterReadingRecord[];

  const submitWorkOrder = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const omit = workOrderForm.target_type === "INSTANCE" ? ["batch", "location"] : ["instance"];
    try {
      await apiFetch<MaintenanceWorkOrderRecord>("/api/inventory/maintenance/work-orders/", {
        method: "POST",
        body: JSON.stringify(buildPayload(workOrderForm, omit)),
      });
      setShowWorkOrderModal(false);
      setWorkOrderForm(EMPTY_WORK_ORDER_FORM);
      setNotice("Maintenance work order created.");
      await loadData();
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Failed to create work order.");
    }
  };

  const submitPlan = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const omit = planForm.target_mode === "ITEM"
      ? ["instance", "batch", "target_mode"]
      : planForm.target_type === "INSTANCE"
      ? ["batch", "item", "target_mode"]
      : ["instance", "item", "target_mode"];
    try {
      await apiFetch<MaintenancePlanRecord>("/api/inventory/maintenance/plans/", {
        method: "POST",
        body: JSON.stringify(buildPayload(planForm, omit)),
      });
      setShowPlanModal(false);
      setPlanForm(EMPTY_PLAN_FORM);
      setNotice("Maintenance plan saved.");
      await loadData();
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Failed to save maintenance plan.");
    }
  };

  const submitReading = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    const omit = readingForm.target_type === "INSTANCE" ? ["batch", "location"] : ["instance"];
    try {
      await apiFetch<MaintenanceMeterReadingRecord>("/api/inventory/maintenance/meter-readings/", {
        method: "POST",
        body: JSON.stringify(buildPayload(readingForm, omit)),
      });
      setShowReadingModal(false);
      setReadingForm(EMPTY_READING_FORM);
      setNotice("Maintenance reading recorded.");
      await loadData();
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Failed to record reading.");
    }
  };

  const runWorkOrderAction = async (row: MaintenanceWorkOrderRecord, action: "approve" | "start") => {
    setError(null);
    try {
      await apiFetch<MaintenanceWorkOrderRecord>(`/api/inventory/maintenance/work-orders/${row.id}/${action}/`, {
        method: "POST",
        body: "{}",
      });
      setNotice(`Work order ${formatMaintenanceLabel(action)} action completed.`);
      await loadData();
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : `Failed to ${action} work order.`);
    }
  };

  const cancelWorkOrder = async (row: MaintenanceWorkOrderRecord) => {
    const reason = window.prompt("Cancellation reason");
    if (!reason?.trim()) return;
    setError(null);
    try {
      await apiFetch<MaintenanceWorkOrderRecord>(`/api/inventory/maintenance/work-orders/${row.id}/cancel/`, {
        method: "POST",
        body: JSON.stringify({ cancellation_reason: reason.trim() }),
      });
      setNotice("Work order cancelled.");
      await loadData();
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Failed to cancel work order.");
    }
  };

  const submitCompletion = async (event: FormEvent) => {
    event.preventDefault();
    if (!completeTarget) return;
    setError(null);
    try {
      await apiFetch<MaintenanceWorkOrderRecord>(`/api/inventory/maintenance/work-orders/${completeTarget.id}/complete/`, {
        method: "POST",
        body: JSON.stringify(buildPayload(completionForm)),
      });
      setCompleteTarget(null);
      setCompletionForm(EMPTY_COMPLETION_FORM);
      setNotice("Maintenance work order closed with history.");
      await loadData();
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Failed to complete work order.");
    }
  };

  const generateFromPlan = async (plan: MaintenancePlanRecord) => {
    setError(null);
    try {
      await apiFetch<MaintenanceWorkOrderRecord>(`/api/inventory/maintenance/plans/${plan.id}/generate-work-order/`, {
        method: "POST",
        body: "{}",
      });
      setNotice("Work order generated from plan.");
      setTab("work-orders");
      await loadData();
    } catch (exc) {
      setError(exc instanceof Error ? exc.message : "Failed to generate work order from plan.");
    }
  };

  if (capsLoading || loading) {
    return (
      <>
        <Topbar breadcrumb={["Operations", "Maintenance"]} />
        <main className="page"><div className="table-card" style={{ padding: 24 }}>Loading maintenance module...</div></main>
      </>
    );
  }

  if (!canView) return null;

  return (
    <>
      <Topbar breadcrumb={["Operations", "Maintenance"]} />
      <main className="page" data-density={density}>
        <div className="page-head">
          <div className="page-title-group">
            <div className="eyebrow">Operations</div>
            <h1>Maintenance</h1>
            <p className="page-sub">Plan, execute, and evidence preventive and corrective maintenance for individual assets and quantity batches.</p>
          </div>
          <div className="page-head-actions">
            {canFull ? <button type="button" className="btn btn-sm" onClick={() => setShowPlanModal(true)}>Add Plan</button> : null}
            {canManage ? <button type="button" className="btn btn-sm" onClick={() => setShowReadingModal(true)}>Record Reading</button> : null}
            {canManage ? <button type="button" className="btn btn-sm btn-primary" onClick={() => setShowWorkOrderModal(true)}>Add Work Order</button> : null}
          </div>
        </div>

        {error ? <Alert onDismiss={() => setError(null)}>{error}</Alert> : null}
        {notice ? <Alert onDismiss={() => setNotice(null)}>{notice}</Alert> : null}

        <div className="filter-bar">
          <div className="filter-bar-left">
            <div className="seg">
              {TABS.map(option => (
                <button type="button" key={option.key} className={"seg-btn" + (tab === option.key ? " active" : "")} onClick={() => setTab(option.key)}>
                  {option.label}
                </button>
              ))}
            </div>
            <div className="search-input">
              <Ic d={<><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>} size={14} />
              <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search maintenance records..." />
              {search ? <button type="button" className="clear-search" onClick={() => setSearch("")}>x</button> : null}
            </div>
          </div>
          <div className="filter-bar-right">
            <ThemedSelect value={targetFilter} options={enumOptions(["INSTANCE", "BATCH"], "All targets")} onChange={setTargetFilter} size="compact" ariaLabel="Filter by target type" />
            {tab === "work-orders" ? (
              <>
                <ThemedSelect value={statusFilter} options={enumOptions(STATUSES, "All statuses")} onChange={setStatusFilter} size="compact" ariaLabel="Filter by status" />
                <ThemedSelect value={priorityFilter} options={enumOptions(PRIORITIES, "All priorities")} onChange={setPriorityFilter} size="compact" ariaLabel="Filter by priority" />
              </>
            ) : null}
            <DensityToggle density={density} onChange={setDensity} />
          </div>
        </div>

        {tab === "work-orders" ? (
          <section className="table-card">
            <div className="table-card-head">
              <div className="table-card-head-left">
                <div className="eyebrow">Work orders list</div>
                <div className="table-count"><span className="mono">{filteredWorkOrders.length}</span><span>of</span><span className="mono">{workOrders.length}</span><span>work orders</span></div>
              </div>
            </div>
            <div className="h-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Work order</th>
                    <th>Target</th>
                    <th>Status</th>
                    <th>Type</th>
                    <th>Due</th>
                    <th>Cost</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedWorkOrders.length ? pagedWorkOrders.map(row => {
                    const target = targetSummary(row);
                    return (
                      <tr key={row.id}>
                        <td>
                          <div className="cell-main">{row.work_order_number}</div>
                          <div className="cell-sub">{row.title}</div>
                        </td>
                        <td>
                          <div className="cell-main">{target.primary}</div>
                          <div className="cell-sub">{target.secondary}</div>
                        </td>
                        <td>
                          <span className={statusPillClass(row.status)}>{formatMaintenanceLabel(row.status)}</span>
                          <span className={priorityPillClass(row.priority)} style={{ marginLeft: 6 }}>{formatMaintenanceLabel(row.priority)}</span>
                        </td>
                        <td>
                          <div className="cell-main">{formatMaintenanceLabel(row.maintenance_type)}</div>
                          <div className="cell-sub">{formatMaintenanceLabel(row.trigger_type)}</div>
                        </td>
                        <td>
                          <div className="cell-main">{formatDate(row.due_date)}</div>
                          <div className="cell-sub">{row.downtime_minutes ? `${row.downtime_minutes} min downtime` : row.vendor_name || "-"}</div>
                        </td>
                        <td>{toNumber(row.actual_cost) ? `PKR ${toNumber(row.actual_cost).toLocaleString("en-US")}` : row.estimated_cost ? `Est. PKR ${toNumber(row.estimated_cost).toLocaleString("en-US")}` : "-"}</td>
                        <td className="col-actions">
                          <div className="row-actions">
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setHistoryTarget(row)}>History</button>
                            {canFull && row.status === "REQUESTED" ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => void runWorkOrderAction(row, "approve")}>Approve</button> : null}
                            {canManage && !isClosedMaintenance(row.status) && row.status !== "IN_PROGRESS" ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => void runWorkOrderAction(row, "start")}>Start</button> : null}
                            {canManage && !isClosedMaintenance(row.status) ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setCompleteTarget(row); setCompletionForm({ ...EMPTY_COMPLETION_FORM, condition_after: row.condition_after ?? "", actual_cost: fieldValue(row.actual_cost) }); }}>Complete</button> : null}
                            {canManage && !isClosedMaintenance(row.status) ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => void cancelWorkOrder(row)}>Cancel</button> : null}
                          </div>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr><td colSpan={7} style={{ textAlign: "center", padding: 24, color: "var(--muted)" }}>No maintenance work orders match the current filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <ListPagination
              summary={activeCount === 0 ? `Showing 0 of ${totalCount} ${currentLabel}` : `Showing ${pageStart}-${pageEnd} of ${activeCount} filtered ${currentLabel}`}
              page={page}
              totalPages={totalPages}
              onPrev={() => setPage(current => Math.max(1, current - 1))}
              onNext={() => setPage(current => Math.min(totalPages, current + 1))}
            />
          </section>
        ) : null}

        {tab === "plans" ? (
          <section className="table-card">
            <div className="table-card-head">
              <div className="table-card-head-left">
                <div className="eyebrow">Plans list</div>
                <div className="table-count"><span className="mono">{filteredPlans.length}</span><span>of</span><span className="mono">{plans.length}</span><span>plans</span></div>
              </div>
            </div>
            <div className="h-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Target</th>
                    <th>Cadence</th>
                    <th>Next due</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedPlans.length ? pagedPlans.map(plan => (
                    <tr key={plan.id}>
                      <td>
                        <div className="cell-main">{plan.plan_code}</div>
                        <div className="cell-sub">{plan.name}</div>
                      </td>
                      <td>
                        <div className="cell-main">{plan.target_label || plan.item_name}</div>
                        <div className="cell-sub">{plan.instance_serial_number || plan.batch_number || "Item-level plan"}</div>
                      </td>
                      <td>
                        <div className="cell-main">{formatMaintenanceLabel(plan.cadence)}</div>
                        <div className="cell-sub">{plan.cadence === "CALENDAR" ? `${plan.interval_days ?? "-"} days` : plan.cadence === "METER" ? `${plan.meter_interval ?? "-"} ${plan.meter_name ?? ""}` : plan.condition_basis || "-"}</div>
                      </td>
                      <td>{formatDate(plan.next_due_date)}</td>
                      <td><span className={plan.is_active ? "pill pill-success" : "pill pill-neutral"}>{plan.is_active ? "Active" : "Inactive"}</span></td>
                      <td className="col-actions">
                        {canFull ? (
                          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void generateFromPlan(plan)} disabled={!plan.instance && !plan.batch} title={!plan.instance && !plan.batch ? "Item-level plans need a specific target before generation" : undefined}>
                            Generate WO
                          </button>
                        ) : "-"}
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan={6} style={{ textAlign: "center", padding: 24, color: "var(--muted)" }}>No maintenance plans match the current filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <ListPagination
              summary={activeCount === 0 ? `Showing 0 of ${totalCount} ${currentLabel}` : `Showing ${pageStart}-${pageEnd} of ${activeCount} filtered ${currentLabel}`}
              page={page}
              totalPages={totalPages}
              onPrev={() => setPage(current => Math.max(1, current - 1))}
              onNext={() => setPage(current => Math.min(totalPages, current + 1))}
            />
          </section>
        ) : null}

        {tab === "readings" ? (
          <section className="table-card">
            <div className="table-card-head">
              <div className="table-card-head-left">
                <div className="eyebrow">Readings list</div>
                <div className="table-count"><span className="mono">{filteredReadings.length}</span><span>of</span><span className="mono">{readings.length}</span><span>readings</span></div>
              </div>
            </div>
            <div className="h-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Reading</th>
                    <th>Target</th>
                    <th>Value</th>
                    <th>Recorded</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedReadings.length ? pagedReadings.map(row => (
                    <tr key={row.id}>
                      <td>
                        <div className="cell-main">{row.reading_name}</div>
                        <div className="cell-sub">{formatMaintenanceLabel(row.target_type)}</div>
                      </td>
                      <td>
                        <div className="cell-main">{row.target_label || row.item_name}</div>
                        <div className="cell-sub">{row.instance_serial_number || row.batch_number || row.location_name || "-"}</div>
                      </td>
                      <td>{toNumber(row.value).toLocaleString("en-US")} {row.unit}</td>
                      <td>
                        <div className="cell-main">{formatDateTime(row.recorded_at)}</div>
                        <div className="cell-sub">{row.recorded_by_name || "-"}</div>
                      </td>
                      <td>{row.notes || "-"}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--muted)" }}>No readings match the current filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <ListPagination
              summary={activeCount === 0 ? `Showing 0 of ${totalCount} ${currentLabel}` : `Showing ${pageStart}-${pageEnd} of ${activeCount} filtered ${currentLabel}`}
              page={page}
              totalPages={totalPages}
              onPrev={() => setPage(current => Math.max(1, current - 1))}
              onNext={() => setPage(current => Math.min(totalPages, current + 1))}
            />
          </section>
        ) : null}
      </main>

      {showWorkOrderModal ? (
        <ModalShell
          title="Create Work Order"
          eyebrow="Maintenance execution"
          onClose={() => setShowWorkOrderModal(false)}
          wide
          footer={(
            <>
              <span className="modal-foot-meta">Client targets are validated against instance status or batch stock at location.</span>
              <div className="modal-foot-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowWorkOrderModal(false)}>Cancel</button>
                <button type="submit" form="maintenance-work-order-form" className="btn btn-primary">Create</button>
              </div>
            </>
          )}
        >
          <form id="maintenance-work-order-form" onSubmit={submitWorkOrder}>
            <Section n={1} title="Target and work scope" sub="Choose either a serial-tracked instance or a quantity batch at a scoped stock location.">
              <div className="form-grid cols-2">
                <Field label="Target type">
                  <ThemedSelect value={workOrderForm.target_type} options={enumOptions(["INSTANCE", "BATCH"])} onChange={value => setWorkOrderForm(prev => ({ ...prev, target_type: value as MaintenanceTargetType, instance: "", batch: "", location: "", affected_quantity: "1" }))} />
                </Field>
                {workOrderForm.target_type === "INSTANCE" ? (
                  <Field label="Asset instance">
                    <ThemedSelect value={workOrderForm.instance} options={instanceOptions} onChange={value => setWorkOrderForm(prev => ({ ...prev, instance: value }))} placeholder="Select instance" />
                  </Field>
                ) : (
                  <>
                    <Field label="Batch / lot">
                      <ThemedSelect value={workOrderForm.batch} options={batchOptions} onChange={value => setWorkOrderForm(prev => ({ ...prev, batch: value }))} placeholder="Select batch" />
                    </Field>
                    <Field label="Location">
                      <ThemedSelect value={workOrderForm.location} options={locationOptions} onChange={value => setWorkOrderForm(prev => ({ ...prev, location: value }))} placeholder="Select stock location" />
                    </Field>
                    <Field label="Affected quantity">
                      <input type="number" min="1" value={workOrderForm.affected_quantity} onChange={event => setWorkOrderForm(prev => ({ ...prev, affected_quantity: event.target.value }))} required />
                    </Field>
                  </>
                )}
                <Field label="Title">
                  <input value={workOrderForm.title} onChange={event => setWorkOrderForm(prev => ({ ...prev, title: event.target.value }))} required />
                </Field>
                <Field label="Due date">
                  <input type="date" value={workOrderForm.due_date} onChange={event => setWorkOrderForm(prev => ({ ...prev, due_date: event.target.value }))} />
                </Field>
                <Field label="Maintenance type">
                  <ThemedSelect value={workOrderForm.maintenance_type} options={enumOptions(MAINTENANCE_TYPES)} onChange={value => setWorkOrderForm(prev => ({ ...prev, maintenance_type: value as MaintenanceType }))} />
                </Field>
                <Field label="Trigger">
                  <ThemedSelect value={workOrderForm.trigger_type} options={enumOptions(TRIGGER_TYPES)} onChange={value => setWorkOrderForm(prev => ({ ...prev, trigger_type: value as MaintenanceTriggerType }))} />
                </Field>
                <Field label="Priority">
                  <ThemedSelect value={workOrderForm.priority} options={enumOptions(PRIORITIES)} onChange={value => setWorkOrderForm(prev => ({ ...prev, priority: value as MaintenancePriority }))} />
                </Field>
                <Field label="Criticality">
                  <ThemedSelect value={workOrderForm.criticality} options={enumOptions(PRIORITIES)} onChange={value => setWorkOrderForm(prev => ({ ...prev, criticality: value as MaintenancePriority }))} />
                </Field>
                <Field label="Vendor">
                  <input value={workOrderForm.vendor_name} onChange={event => setWorkOrderForm(prev => ({ ...prev, vendor_name: event.target.value }))} />
                </Field>
                <Field label="Estimated cost">
                  <input type="number" min="0" step="0.01" value={workOrderForm.estimated_cost} onChange={event => setWorkOrderForm(prev => ({ ...prev, estimated_cost: event.target.value }))} />
                </Field>
                <Field label="Condition before">
                  <input value={workOrderForm.condition_before} onChange={event => setWorkOrderForm(prev => ({ ...prev, condition_before: event.target.value }))} />
                </Field>
                <label className="field" style={{ gridColumn: "1 / -1" }}>
                  <span className="field-label">Description / scope</span>
                  <textarea className="textarea-field" value={workOrderForm.description} onChange={event => setWorkOrderForm(prev => ({ ...prev, description: event.target.value }))} />
                </label>
              </div>
            </Section>
          </form>
        </ModalShell>
      ) : null}

      {showPlanModal ? (
        <ModalShell
          title="Create Maintenance Plan"
          eyebrow="Preventive strategy"
          onClose={() => setShowPlanModal(false)}
          wide
          footer={(
            <>
              <span className="modal-foot-meta">Calendar, meter, and condition plans create auditable future work orders.</span>
              <div className="modal-foot-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowPlanModal(false)}>Cancel</button>
                <button type="submit" form="maintenance-plan-form" className="btn btn-primary">Save Plan</button>
              </div>
            </>
          )}
        >
          <form id="maintenance-plan-form" onSubmit={submitPlan}>
            <Section n={1} title="Plan target and cadence" sub="Define the asset target and recurrence logic used to generate work orders.">
              <div className="form-grid cols-2">
                <Field label="Target type">
                  <ThemedSelect value={planForm.target_type} options={enumOptions(["INSTANCE", "BATCH"])} onChange={value => setPlanForm(prev => ({ ...prev, target_type: value as MaintenanceTargetType, item: "", instance: "", batch: "" }))} />
                </Field>
                <Field label="Target mode">
                  <ThemedSelect value={planForm.target_mode} options={[{ value: "SPECIFIC", label: "Specific asset or batch" }, { value: "ITEM", label: "Item-level plan" }]} onChange={value => setPlanForm(prev => ({ ...prev, target_mode: value as PlanTargetMode, item: "", instance: "", batch: "" }))} />
                </Field>
                {planForm.target_mode === "ITEM" ? (
                  <Field label="Catalog item">
                    <ThemedSelect value={planForm.item} options={itemOptions} onChange={value => setPlanForm(prev => ({ ...prev, item: value }))} placeholder="Select item" />
                  </Field>
                ) : planForm.target_type === "INSTANCE" ? (
                  <Field label="Asset instance">
                    <ThemedSelect value={planForm.instance} options={instanceOptions} onChange={value => setPlanForm(prev => ({ ...prev, instance: value }))} placeholder="Select instance" />
                  </Field>
                ) : (
                  <Field label="Batch / lot">
                    <ThemedSelect value={planForm.batch} options={batchOptions} onChange={value => setPlanForm(prev => ({ ...prev, batch: value }))} placeholder="Select batch" />
                  </Field>
                )}
                <Field label="Plan name">
                  <input value={planForm.name} onChange={event => setPlanForm(prev => ({ ...prev, name: event.target.value }))} required />
                </Field>
                <Field label="Maintenance type">
                  <ThemedSelect value={planForm.maintenance_type} options={enumOptions(MAINTENANCE_TYPES)} onChange={value => setPlanForm(prev => ({ ...prev, maintenance_type: value as MaintenanceType }))} />
                </Field>
                <Field label="Cadence">
                  <ThemedSelect value={planForm.cadence} options={enumOptions(["CALENDAR", "METER", "CONDITION"])} onChange={value => setPlanForm(prev => ({ ...prev, cadence: value as PlanForm["cadence"] }))} />
                </Field>
                {planForm.cadence === "CALENDAR" ? (
                  <Field label="Interval days">
                    <input type="number" min="1" value={planForm.interval_days} onChange={event => setPlanForm(prev => ({ ...prev, interval_days: event.target.value }))} required />
                  </Field>
                ) : null}
                {planForm.cadence === "METER" ? (
                  <>
                    <Field label="Meter name">
                      <input value={planForm.meter_name} onChange={event => setPlanForm(prev => ({ ...prev, meter_name: event.target.value }))} required />
                    </Field>
                    <Field label="Meter interval">
                      <input type="number" min="0" step="0.01" value={planForm.meter_interval} onChange={event => setPlanForm(prev => ({ ...prev, meter_interval: event.target.value }))} required />
                    </Field>
                  </>
                ) : null}
                {planForm.cadence === "CONDITION" ? (
                  <Field label="Condition basis">
                    <input value={planForm.condition_basis} onChange={event => setPlanForm(prev => ({ ...prev, condition_basis: event.target.value }))} required />
                  </Field>
                ) : null}
                <Field label="Next due">
                  <input type="date" value={planForm.next_due_date} onChange={event => setPlanForm(prev => ({ ...prev, next_due_date: event.target.value }))} />
                </Field>
                <Field label="Priority">
                  <ThemedSelect value={planForm.priority} options={enumOptions(PRIORITIES)} onChange={value => setPlanForm(prev => ({ ...prev, priority: value as MaintenancePriority }))} />
                </Field>
                <Field label="Criticality">
                  <ThemedSelect value={planForm.criticality} options={enumOptions(PRIORITIES)} onChange={value => setPlanForm(prev => ({ ...prev, criticality: value as MaintenancePriority }))} />
                </Field>
                <label className="field" style={{ gridColumn: "1 / -1" }}>
                  <span className="field-label">Checklist / standard work</span>
                  <textarea className="textarea-field" value={planForm.checklist} onChange={event => setPlanForm(prev => ({ ...prev, checklist: event.target.value }))} />
                </label>
              </div>
            </Section>
          </form>
        </ModalShell>
      ) : null}

      {showReadingModal ? (
        <ModalShell
          title="Record Reading"
          eyebrow="Predictive evidence"
          onClose={() => setShowReadingModal(false)}
          footer={(
            <>
              <span className="modal-foot-meta">Readings support meter and condition-based maintenance triggers.</span>
              <div className="modal-foot-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setShowReadingModal(false)}>Cancel</button>
                <button type="submit" form="maintenance-reading-form" className="btn btn-primary">Record</button>
              </div>
            </>
          )}
        >
          <form id="maintenance-reading-form" onSubmit={submitReading}>
            <Section n={1} title="Reading details" sub="Attach meter or condition evidence to a scoped instance or batch.">
              <div className="form-grid cols-2">
                <Field label="Target type">
                  <ThemedSelect value={readingForm.target_type} options={enumOptions(["INSTANCE", "BATCH"])} onChange={value => setReadingForm(prev => ({ ...prev, target_type: value as MaintenanceTargetType, instance: "", batch: "", location: "" }))} />
                </Field>
                {readingForm.target_type === "INSTANCE" ? (
                  <Field label="Asset instance">
                    <ThemedSelect value={readingForm.instance} options={instanceOptions} onChange={value => setReadingForm(prev => ({ ...prev, instance: value }))} placeholder="Select instance" />
                  </Field>
                ) : (
                  <>
                    <Field label="Batch / lot">
                      <ThemedSelect value={readingForm.batch} options={batchOptions} onChange={value => setReadingForm(prev => ({ ...prev, batch: value }))} placeholder="Select batch" />
                    </Field>
                    <Field label="Location">
                      <ThemedSelect value={readingForm.location} options={locationOptions} onChange={value => setReadingForm(prev => ({ ...prev, location: value }))} placeholder="Select location" />
                    </Field>
                  </>
                )}
                <Field label="Reading name">
                  <input value={readingForm.reading_name} onChange={event => setReadingForm(prev => ({ ...prev, reading_name: event.target.value }))} required />
                </Field>
                <Field label="Value">
                  <input type="number" min="0" step="0.01" value={readingForm.value} onChange={event => setReadingForm(prev => ({ ...prev, value: event.target.value }))} required />
                </Field>
                <Field label="Unit">
                  <input value={readingForm.unit} onChange={event => setReadingForm(prev => ({ ...prev, unit: event.target.value }))} placeholder="hours, cycles, vibration, condition score..." />
                </Field>
                <Field label="Recorded at">
                  <input type="datetime-local" value={readingForm.recorded_at} onChange={event => setReadingForm(prev => ({ ...prev, recorded_at: event.target.value }))} />
                </Field>
                <label className="field" style={{ gridColumn: "1 / -1" }}>
                  <span className="field-label">Notes</span>
                  <textarea className="textarea-field" value={readingForm.notes} onChange={event => setReadingForm(prev => ({ ...prev, notes: event.target.value }))} />
                </label>
              </div>
            </Section>
          </form>
        </ModalShell>
      ) : null}

      {completeTarget ? (
        <ModalShell
          title={`Complete ${completeTarget.work_order_number}`}
          eyebrow="Maintenance closure"
          onClose={() => setCompleteTarget(null)}
          wide
          footer={(
            <>
              <span className="modal-foot-meta">Closure writes an immutable history log and restores instance availability.</span>
              <div className="modal-foot-actions">
                <button type="button" className="btn btn-secondary" onClick={() => setCompleteTarget(null)}>Cancel</button>
                <button type="submit" form="maintenance-complete-form" className="btn btn-primary">Complete</button>
              </div>
            </>
          )}
        >
          <form id="maintenance-complete-form" onSubmit={submitCompletion}>
            <Section n={1} title="Closure evidence" sub="Record what was done, condition after service, and any follow-up requirement.">
              <div className="form-grid cols-2">
                <label className="field" style={{ gridColumn: "1 / -1" }}>
                  <span className="field-label">Action taken</span>
                  <textarea className="textarea-field" value={completionForm.action_taken} onChange={event => setCompletionForm(prev => ({ ...prev, action_taken: event.target.value }))} required />
                </label>
                <Field label="Condition after">
                  <input value={completionForm.condition_after} onChange={event => setCompletionForm(prev => ({ ...prev, condition_after: event.target.value }))} />
                </Field>
                <Field label="Actual cost">
                  <input type="number" min="0" step="0.01" value={completionForm.actual_cost} onChange={event => setCompletionForm(prev => ({ ...prev, actual_cost: event.target.value }))} />
                </Field>
                <Field label="Failure mode">
                  <input value={completionForm.failure_mode} onChange={event => setCompletionForm(prev => ({ ...prev, failure_mode: event.target.value }))} />
                </Field>
                <Field label="Root cause">
                  <input value={completionForm.root_cause} onChange={event => setCompletionForm(prev => ({ ...prev, root_cause: event.target.value }))} />
                </Field>
                <Field label="Next due date">
                  <input type="date" value={completionForm.next_due_date} onChange={event => setCompletionForm(prev => ({ ...prev, next_due_date: event.target.value }))} />
                </Field>
                <label className="field" style={{ justifyContent: "end" }}>
                  <span className="field-label">Follow-up required</span>
                  <input type="checkbox" checked={completionForm.follow_up_required} onChange={event => setCompletionForm(prev => ({ ...prev, follow_up_required: event.target.checked }))} />
                </label>
                <label className="field" style={{ gridColumn: "1 / -1" }}>
                  <span className="field-label">Outcome notes</span>
                  <textarea className="textarea-field" value={completionForm.outcome_notes} onChange={event => setCompletionForm(prev => ({ ...prev, outcome_notes: event.target.value }))} />
                </label>
              </div>
            </Section>
          </form>
        </ModalShell>
      ) : null}

      {historyTarget ? (
        <ModalShell
          title={`${historyTarget.work_order_number} History`}
          eyebrow="Maintenance audit trail"
          onClose={() => setHistoryTarget(null)}
          wide
          footer={<button type="button" className="btn btn-primary" onClick={() => setHistoryTarget(null)}>Close</button>}
        >
          <Section n={1} title="Work order history" sub={`${historyTarget.target_label} · ${formatMaintenanceLabel(historyTarget.status)} · Created ${formatDateTime(historyTarget.created_at)}`}>
            <div className="h-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Event</th>
                    <th>Status</th>
                    <th>Notes</th>
                    <th>By</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {(historyTarget.history ?? []).length ? historyTarget.history!.map(log => (
                    <tr key={log.id}>
                      <td>{formatMaintenanceLabel(log.event_type)}</td>
                      <td>
                        <span className={statusPillClass(log.from_status)}>{formatMaintenanceLabel(log.from_status, "Start")}</span>
                        <span style={{ color: "var(--muted)", margin: "0 6px" }}>to</span>
                        <span className={statusPillClass(log.to_status)}>{formatMaintenanceLabel(log.to_status)}</span>
                      </td>
                      <td>{log.notes || log.action_taken || "-"}</td>
                      <td>{log.performed_by_name || "System"}</td>
                      <td>{formatDateTime(log.created_at)}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={5} style={{ textAlign: "center", padding: 24, color: "var(--muted)" }}>No history entries recorded.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Section>
        </ModalShell>
      ) : null}
    </>
  );
}
