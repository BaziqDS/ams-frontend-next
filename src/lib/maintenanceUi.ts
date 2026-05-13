import type { Page } from "@/lib/api";

export type MaintenanceTargetType = "INSTANCE" | "BATCH";
export type MaintenanceStatus = "REQUESTED" | "APPROVED" | "SCHEDULED" | "IN_PROGRESS" | "ON_HOLD" | "COMPLETED" | "CANCELLED";
export type MaintenanceType = "PREVENTIVE" | "CORRECTIVE" | "PREDICTIVE" | "INSPECTION" | "CALIBRATION";
export type MaintenanceTriggerType = "CALENDAR" | "METER" | "CONDITION" | "MANUAL" | "FAILURE";
export type MaintenancePriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type MaintenancePlanCadence = "CALENDAR" | "METER" | "CONDITION";

export interface MaintenanceLogRecord {
  id: number;
  event_type: string;
  from_status?: string | null;
  to_status?: string | null;
  notes?: string | null;
  condition_before?: string | null;
  condition_after?: string | null;
  failure_mode?: string | null;
  root_cause?: string | null;
  action_taken?: string | null;
  cost?: string | number | null;
  downtime_minutes?: number | null;
  performed_by_name?: string | null;
  created_at: string;
}

export interface MaintenanceWorkOrderRecord {
  id: number;
  work_order_number: string;
  plan?: number | null;
  target_type: MaintenanceTargetType;
  target_label: string;
  item: number;
  item_name?: string | null;
  item_code?: string | null;
  instance?: number | null;
  instance_serial_number?: string | null;
  batch?: number | null;
  batch_number?: string | null;
  location?: number | null;
  location_name?: string | null;
  affected_quantity: number;
  title: string;
  description?: string | null;
  maintenance_type: MaintenanceType | string;
  trigger_type: MaintenanceTriggerType | string;
  priority: MaintenancePriority | string;
  criticality: MaintenancePriority | string;
  status: MaintenanceStatus | string;
  due_date?: string | null;
  scheduled_start?: string | null;
  scheduled_end?: string | null;
  started_at?: string | null;
  completed_at?: string | null;
  approved_at?: string | null;
  requested_by_name?: string | null;
  approved_by_name?: string | null;
  assigned_to_name?: string | null;
  vendor_name?: string | null;
  estimated_cost?: string | number | null;
  actual_cost?: string | number | null;
  failure_mode?: string | null;
  root_cause?: string | null;
  condition_before?: string | null;
  condition_after?: string | null;
  action_taken?: string | null;
  outcome_notes?: string | null;
  follow_up_required?: boolean;
  next_due_date?: string | null;
  downtime_minutes?: number | null;
  history?: MaintenanceLogRecord[];
  created_at: string;
  updated_at: string;
}

export interface MaintenancePlanRecord {
  id: number;
  plan_code: string;
  name: string;
  target_type: MaintenanceTargetType;
  target_label?: string | null;
  item: number;
  item_name?: string | null;
  item_code?: string | null;
  instance?: number | null;
  instance_serial_number?: string | null;
  batch?: number | null;
  batch_number?: string | null;
  maintenance_type: MaintenanceType | string;
  cadence: MaintenancePlanCadence | string;
  interval_days?: number | null;
  meter_name?: string | null;
  meter_interval?: string | number | null;
  condition_basis?: string | null;
  priority: MaintenancePriority | string;
  criticality: MaintenancePriority | string;
  checklist?: string | null;
  next_due_date?: string | null;
  last_generated_at?: string | null;
  is_active: boolean;
  created_by_name?: string | null;
}

export interface MaintenanceMeterReadingRecord {
  id: number;
  target_type: MaintenanceTargetType;
  target_label?: string | null;
  item: number;
  item_name?: string | null;
  item_code?: string | null;
  instance?: number | null;
  instance_serial_number?: string | null;
  batch?: number | null;
  batch_number?: string | null;
  location?: number | null;
  location_name?: string | null;
  reading_name: string;
  value: string | number;
  unit?: string | null;
  recorded_at: string;
  recorded_by_name?: string | null;
  notes?: string | null;
}

export interface InventoryInstanceOption {
  id: number;
  item: number;
  item_name?: string | null;
  item_code?: string | null;
  serial_number?: string | null;
  status?: string | null;
  current_location: number;
  location_name?: string | null;
}

export interface InventoryBatchOption {
  id: number;
  item: number;
  item_name?: string | null;
  item_code?: string | null;
  batch_number?: string | null;
  quantity?: number | string | null;
  available_quantity?: number | string | null;
}

export interface LocationOptionRecord {
  id: number;
  name: string;
  code?: string | null;
  is_store?: boolean;
}

export function normalizeList<T>(data: Page<T> | T[]) {
  return Array.isArray(data) ? data : data.results;
}

export function formatMaintenanceLabel(value: string | null | undefined, fallback = "-") {
  if (!value) return fallback;
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, char => char.toUpperCase());
}

export function formatDate(value: string | null | undefined, fallback = "-") {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(value: string | null | undefined, fallback = "-") {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return parsed.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function toNumber(value: number | string | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function statusPillClass(status: string | null | undefined) {
  if (status === "COMPLETED") return "pill pill-success";
  if (status === "IN_PROGRESS" || status === "APPROVED" || status === "SCHEDULED") return "pill pill-info";
  if (status === "REQUESTED" || status === "ON_HOLD") return "pill pill-warning";
  if (status === "CANCELLED") return "pill pill-danger";
  return "pill pill-neutral";
}

export function priorityPillClass(priority: string | null | undefined) {
  if (priority === "CRITICAL") return "pill pill-danger";
  if (priority === "HIGH") return "pill pill-warning";
  if (priority === "MEDIUM") return "pill pill-info";
  return "pill pill-neutral";
}

export function isClosedMaintenance(status: string | null | undefined) {
  return status === "COMPLETED" || status === "CANCELLED";
}

export function targetSummary(row: Pick<MaintenanceWorkOrderRecord, "target_type" | "target_label" | "instance_serial_number" | "batch_number" | "location_name" | "affected_quantity">) {
  const secondary = row.target_type === "INSTANCE"
    ? row.instance_serial_number || "No serial"
    : `${row.affected_quantity} unit${row.affected_quantity === 1 ? "" : "s"}${row.location_name ? ` at ${row.location_name}` : ""}`;
  return { primary: row.target_label, secondary };
}
