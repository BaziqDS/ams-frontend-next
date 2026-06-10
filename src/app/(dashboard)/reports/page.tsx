"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { ThemedSelect, type ThemedSelectOption } from "@/components/ThemedSelect";
import { ApiError, apiFetch, type Page } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { ADMIN_PERMISSIONS } from "@/lib/adminPermissions";
import styles from "./reports.module.css";
import { Button } from "@/components/ui/button";


type ReportFamily = "all" | "operational" | "audit" | "finance" | "executive";
type Tone = "blue" | "green" | "amber" | "red" | "violet";

type ReportId =
  | "inventory-position"
  | "low-stock"
  | "pending-ack"
  | "asset-custody"
  | "movement-ledger"
  | "correction-control"
  | "inspection-aging"
  | "procurement-trace"
  | "capitalization-pending"
  | "fixed-asset-register"
  | "asset-adjustments"
  | "university-snapshot";

type ApiList<T> = Page<T> | T[];
type ReportLoaderFilters = InventoryReportFilters | PendingAcknowledgementFilters | AssetCustodyFilters | MovementLedgerFilters | CorrectionFilters | ProcurementTraceFilters;

interface SummaryMetric {
  label: string;
  value: string;
  hint: string;
  tone?: Tone;
}

interface ReportView {
  metrics: SummaryMetric[];
  columns: string[];
  rows: string[][];
  note?: string;
  metadata?: Array<{ label: string; value: string }>;
  traceRows?: ProcurementTraceRow[];
}

interface ReportDefinition {
  id: ReportId;
  family: Exclude<ReportFamily, "all">;
  title: string;
  description: string;
  schema: string[];
  filters: string[];
  loader: (filters?: ReportLoaderFilters) => Promise<ReportView>;
}

interface InventoryReportFilters {
  scope: string;
  locationId: string;
  locationTagId: string;
  itemQuery: string;
  categoryType: string;
  updatedFrom: string;
  updatedTo: string;
  inspectionWise: boolean;
}

interface PendingAcknowledgementFilters {
  fromLocation: string;
  toLocation: string;
  itemQuery: string;
  createdBy: string;
  createdFrom: string;
  createdTo: string;
}

interface AssetCustodyFilters {
  sourceLocation: string;
  person: string;
  targetLocation: string;
  itemQuery: string;
  status: string;
  allocatedFrom: string;
  allocatedTo: string;
  inspectionWise: boolean;
}

interface MovementLedgerFilters {
  dateFrom: string;
  dateTo: string;
  itemQuery: string;
  location: string;
  batch: string;
  instanceSerial: string;
  stockRegister: string;
}

interface CorrectionFilters {
  dateFrom: string;
  dateTo: string;
  status: string;
  resolutionType: string;
  requestedBy: string;
}

interface ProcurementTraceFilters {
  inspectionId: string;
}

interface ProcurementTraceStep {
  label: string;
  value: string;
  timestamp: number;
  actor?: string;
  note?: string;
  state: "done" | "current" | "pending" | "blocked";
}

interface ProcurementTraceRow {
  id: string;
  certificate: InspectionCertificate;
  item: InspectionItem;
  steps: ProcurementTraceStep[];
}

interface ScopeOption {
  id: string;
  label: string;
  kind: "all" | "root" | "standalone" | "store";
  location_id: number | null;
}

interface ScopeOptionsResponse {
  options: ScopeOption[];
  default: string[];
  is_root_scope: boolean;
}

interface StockRecord {
  id: number;
  item: number;
  item_name?: string | null;
  item_code?: string | null;
  category_name?: string | null;
  category_type?: string | null;
  tracking_type?: string | null;
  batch?: number | null;
  batch_number?: string | null;
  location: number;
  location_name?: string | null;
  location_tags?: number[];
  location_tags_display?: LocationTagSummary[];
  subcategory_name?: string | null;
  low_stock_threshold?: number | string | null;
  source_inspection_contracts?: string[];
  quantity: number;
  allocated_quantity?: number | null;
  in_transit_quantity: number;
  available_quantity: number;
  last_updated?: string | null;
}

interface LocationTagSummary {
  id: number;
  name: string;
  code?: string | null;
  category: string;
  category_display?: string | null;
  label?: string | null;
  color?: string | null;
  is_active?: boolean;
}

interface StockEntryItem {
  item: number;
  item_name?: string | null;
  batch?: number | null;
  batch_number?: string | null;
  quantity: number;
  accepted_quantity?: number | null;
  stock_register_name?: string | null;
  ack_stock_register_name?: string | null;
  page_number?: number | null;
  ack_page_number?: number | null;
}

interface StockEntry {
  id: number;
  entry_type: string;
  entry_number: string;
  entry_date: string;
  from_location?: number | null;
  from_location_name?: string | null;
  to_location?: number | null;
  to_location_name?: string | null;
  issued_to_name?: string | null;
  status: string;
  items: StockEntryItem[];
  reference_entry?: number | null;
  reference_purpose?: string | null;
  acknowledged_by_name?: string | null;
  acknowledged_at?: string | null;
  cancellation_reason?: string | null;
  cancelled_by_name?: string | null;
  cancelled_at?: string | null;
  created_by_name?: string | null;
  created_at?: string | null;
}

interface StockAllocation {
  id: number;
  item?: number | null;
  item_name?: string | null;
  item_code?: string | null;
  item_category_type?: string | null;
  item_subcategory_name?: string | null;
  batch?: number | null;
  batch_number?: string | null;
  source_location?: number | null;
  source_location_name?: string | null;
  allocated_to_person?: number | null;
  allocated_to_person_name?: string | null;
  allocated_to_location?: number | null;
  allocated_to_location_name?: string | null;
  quantity: number;
  status: string;
  entry_number?: string | null;
  allocated_by_name?: string | null;
  allocated_at?: string | null;
  return_date?: string | null;
}

interface MovementHistory {
  id: number;
  item: number;
  item_name?: string | null;
  instance?: number | null;
  instance_serial?: string | null;
  batch?: number | null;
  batch_number?: string | null;
  action: string;
  from_location?: number | null;
  from_location_name?: string | null;
  to_location?: number | null;
  to_location_name?: string | null;
  entry_number?: string | null;
  stock_register?: number | null;
  stock_register_name?: string | null;
  ack_stock_register?: number | null;
  ack_stock_register_name?: string | null;
  allocation?: number | null;
  allocation_target_type?: "PERSON" | "LOCATION" | null;
  allocation_target_name?: string | null;
  quantity: number;
  performed_by_name?: string | null;
  timestamp: string;
  remarks?: string | null;
}

interface StockCorrection {
  id: number;
  original_entry: number;
  status: string;
  resolution_type: string;
  reason?: string | null;
  message?: string | null;
  requested_by?: number | null;
  requested_at?: string | null;
  approved_by?: number | null;
  approved_at?: string | null;
  applied_at?: string | null;
  updated_at?: string | null;
  generated_entries?: Array<{ id: number; entry_number: string; entry_type: string; status: string }> | null;
  lines?: Array<{ original_item_name?: string | null; original_quantity?: number | null; corrected_quantity?: number | null; delta?: number | null }> | null;
}

interface InspectionItem {
  id?: number;
  item_name?: string | null;
  item_code?: string | null;
  item_description: string;
  tendered_quantity: number;
  accepted_quantity: number;
  rejected_quantity: number;
  unit_price?: string | null;
  stock_register_name?: string | null;
  stock_register_no?: string | null;
  stock_register_page_no?: string | null;
  central_register_name?: string | null;
  central_register_no?: string | null;
  central_register_page_no?: string | null;
  depreciation_asset_class_name?: string | null;
  capitalization_cost?: string | null;
  capitalization_date?: string | null;
}

interface InspectionCertificate {
  id: number;
  contract_no: string;
  indent_no?: string | null;
  contractor_name?: string | null;
  department_name?: string | null;
  stage: string;
  status: string;
  items: InspectionItem[];
  stock_entries?: Array<{ id?: number; entry_number: string; entry_type: string; status: string; entry_date?: string | null; created_by_name?: string | null }>;
  initiated_by_name?: string | null;
  initiated_at?: string | null;
  stock_filled_by_name?: string | null;
  stock_filled_at?: string | null;
  central_store_filled_by_name?: string | null;
  central_store_filled_at?: string | null;
  finance_reviewed_at?: string | null;
  finance_reviewed_by_name?: string | null;
  revision_requested_by_name?: string | null;
  revision_requested_reason?: string | null;
  revision_requested_from_stage?: string | null;
  rejected_by_name?: string | null;
  rejection_reason?: string | null;
  rejection_stage?: string | null;
  revision_requested_at?: string | null;
  rejected_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

interface DepreciationSummary {
  fiscal_year_start?: number | null;
  opening_value?: string | null;
  depreciation_amount?: string | null;
  accumulated_depreciation?: string | null;
  closing_value?: string | null;
}

interface FixedAssetEntry {
  id: number;
  asset_number: string;
  item_name?: string | null;
  item_code?: string | null;
  instance_serial?: string | null;
  batch_number?: string | null;
  target_type: string;
  asset_class_name?: string | null;
  original_quantity: number;
  remaining_quantity: number;
  original_cost: string;
  capitalization_date: string;
  depreciation_start_date?: string | null;
  status: string;
  depreciation_summary?: DepreciationSummary | null;
}

interface UncapitalizedAsset {
  target_type: string;
  item_name: string;
  item_code: string;
  batch_number?: string | null;
  quantity: number;
  depreciation_setup_name?: string | null;
  depreciation_rate?: string | null;
}

interface AssetAdjustment {
  id: number;
  asset_number?: string | null;
  item_name?: string | null;
  adjustment_type: string;
  effective_date: string;
  amount: string;
  quantity_delta: number;
  reason: string;
  created_at?: string | null;
}

function normalizeList<T>(data: ApiList<T>) {
  return Array.isArray(data) ? data : data.results;
}

async function fetchList<T>(path: string) {
  const separator = path.includes("?") ? "&" : "?";
  return normalizeList(await apiFetch<ApiList<T>>(`${path}${separator}page_size=200`));
}

function n(value: number | string | null | undefined) {
  const parsed = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmtNumber(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-PK", { maximumFractionDigits: 0 }).format(n(value));
}

function fmtMoney(value: number | string | null | undefined) {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  }).format(n(value));
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function pct(part: number, total: number) {
  if (!total) return "0%";
  return `${((part / total) * 100).toFixed(1)}%`;
}

function firstItem(entry: StockEntry) {
  return entry.items?.[0];
}

function itemLabel(entry: StockEntry) {
  const item = firstItem(entry);
  if (!item) return "-";
  const extra = entry.items.length > 1 ? ` +${entry.items.length - 1}` : "";
  return `${item.item_name ?? `Item ${item.item}`}${extra}`;
}

function stockAllocated(row: StockRecord) {
  return row.allocated_quantity ?? Math.max(0, n(row.quantity) - n(row.available_quantity) - n(row.in_transit_quantity));
}

function stockStatus(row: { quantity: number | string | null | undefined; available_quantity: number | string | null | undefined; low_stock_threshold?: number | string | null }) {
  const total = n(row.quantity);
  const threshold = n(row.low_stock_threshold);
  if (total <= 0) return "Out Of Stock";
  if (threshold > 0 && total < threshold) return "Low Stock";
  return "In Stock";
}

function locationTagLabels(row: { location_tags_display?: LocationTagSummary[] }) {
  return (row.location_tags_display ?? [])
    .map(tag => tag.label ?? `${tag.category_display ?? tag.category}: ${tag.name}`)
    .join(", ");
}

function reportNote(source: string) {
  return `Live data from ${source}. Rows shown are limited by the current API page size.`;
}

function safeFilePart(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "report";
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function htmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function exportReportCsv(report: ReportDefinition, view: ReportView) {
  const headers = view.columns;
  const csv = [
    headers.map(csvCell).join(","),
    ...view.rows.map(row => headers.map((_, index) => csvCell(row[index] ?? "")).join(",")),
  ].join("\r\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFilePart(report.title)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function openReportPdfPrintView(report: ReportDefinition, view: ReportView) {
  const popup = window.open("", "_blank");
  if (!popup) return;
  popup.opener = null;

  const printedAt = new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const metricHtml = view.metrics.length
    ? `<section class="metrics">${view.metrics.map(metric => `
        <div>
          <span>${htmlEscape(metric.label)}</span>
          <strong>${htmlEscape(metric.value)}</strong>
          <small>${htmlEscape(metric.hint)}</small>
        </div>
      `).join("")}</section>`
    : "";
  const metadataHtml = view.metadata?.length
    ? `<section class="metadata">${view.metadata.map(item => `
        <div>
          <span>${htmlEscape(item.label)}</span>
          <strong>${htmlEscape(item.value)}</strong>
        </div>
      `).join("")}</section>`
    : "";
  const tableHead = view.columns.map(column => `<th>${htmlEscape(column)}</th>`).join("");
  const tableRows = view.rows.map(row => `<tr>${view.columns.map((_, index) => `<td>${htmlEscape(row[index] ?? "")}</td>`).join("")}</tr>`).join("");

  popup.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${htmlEscape(report.title)}</title>
  <style>
    @page { size: A4 landscape; margin: 14mm; }
    * { box-sizing: border-box; }
    body {
      color: #172033;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10px;
      margin: 0;
    }
    header {
      align-items: center;
      border-bottom: 2px solid #172033;
      display: flex;
      gap: 14px;
      margin-bottom: 14px;
      padding-bottom: 10px;
    }
    header img { height: 48px; width: 48px; object-fit: contain; }
    h1 { font-size: 20px; line-height: 1.2; margin: 0 0 4px; }
    .sub { color: #596579; font-size: 11px; line-height: 1.4; }
    .meta {
      display: grid;
      gap: 4px;
      margin-left: auto;
      min-width: 190px;
      text-align: right;
    }
    .metrics {
      display: grid;
      gap: 8px;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      margin: 0 0 12px;
    }
    .metadata {
      display: grid;
      gap: 8px;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      margin: 0 0 12px;
    }
    .metrics div, .metadata div {
      border: 1px solid #d7dce5;
      border-radius: 6px;
      padding: 8px;
    }
    .metrics span, .metrics small, .metadata span { color: #596579; display: block; }
    .metrics strong, .metadata strong { display: block; font-size: 15px; margin: 3px 0; }
    .metadata span { font-size: 9px; font-weight: 700; text-transform: uppercase; }
    .metadata strong { font-size: 12px; line-height: 1.25; }
    table { border-collapse: collapse; width: 100%; }
    th, td {
      border: 1px solid #d7dce5;
      padding: 5px 6px;
      text-align: left;
      vertical-align: top;
      word-break: break-word;
    }
    th { background: #eef2f7; color: #172033; font-size: 9px; text-transform: uppercase; }
    tbody tr:nth-child(even) { background: #f8fafc; }
    footer { color: #596579; font-size: 9px; margin-top: 10px; }
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <header>
    <img src="${window.location.origin}/ned_seal.webp" alt="NED University" />
    <div>
      <h1>${htmlEscape(report.title)}</h1>
      <div class="sub">${htmlEscape(report.description)}</div>
    </div>
    <div class="meta">
      <strong>NED Asset Management System</strong>
      <span>${htmlEscape(printedAt)}</span>
      <span>${view.rows.length} rows</span>
    </div>
  </header>
  ${metadataHtml}
  ${metricHtml}
  <table>
    <thead><tr>${tableHead}</tr></thead>
    <tbody>${tableRows || `<tr><td colspan="${Math.max(view.columns.length, 1)}">No records returned for this report.</td></tr>`}</tbody>
  </table>
  <footer>${htmlEscape(view.note ?? "Live report data only. No mock data is rendered.")}</footer>
  <script>
    window.addEventListener("load", () => {
      window.document.title = ${JSON.stringify(report.title)};
      window.focus();
      window.print();
    });
  </script>
</body>
</html>`);
  popup.document.close();
}

function uniqueOptions(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b));
}

function mapIdOptions<T>(rows: T[], idKey: keyof T, labelKey: keyof T) {
  const map = new Map<string, string>();
  rows.forEach(row => {
    const id = row[idKey];
    const label = row[labelKey];
    if (id !== null && id !== undefined && label) map.set(String(id), String(label));
  });
  return Array.from(map, ([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
}

function filterInventoryRows(rows: StockRecord[], filters?: InventoryReportFilters) {
  const itemQuery = filters?.itemQuery.trim().toLowerCase() ?? "";
  const updatedFrom = filters?.updatedFrom ? new Date(`${filters.updatedFrom}T00:00:00`).getTime() : null;
  const updatedTo = filters?.updatedTo ? new Date(`${filters.updatedTo}T23:59:59.999`).getTime() : null;

  return rows.filter(row => {
    if (filters?.locationId && String(row.location) !== filters.locationId) return false;
    if (filters?.locationTagId && !(row.location_tags ?? []).map(String).includes(filters.locationTagId)) return false;
    if (filters?.categoryType && row.category_type !== filters.categoryType) return false;
    if (itemQuery) {
      const haystack = `${row.item_code ?? ""} ${row.item_name ?? ""} ${row.subcategory_name ?? ""} ${row.source_inspection_contracts?.join(" ") ?? ""}`.toLowerCase();
      if (!haystack.includes(itemQuery)) return false;
    }
    if (updatedFrom !== null || updatedTo !== null) {
      const updated = row.last_updated ? new Date(row.last_updated).getTime() : Number.NaN;
      if (!Number.isFinite(updated)) return false;
      if (updatedFrom !== null && updated < updatedFrom) return false;
      if (updatedTo !== null && updated > updatedTo) return false;
    }
    return true;
  });
}

interface InventoryPositionRow {
  location: number;
  location_name?: string | null;
  location_tags?: number[];
  location_tags_display?: LocationTagSummary[];
  item: number;
  item_code?: string | null;
  item_name?: string | null;
  subcategory_name?: string | null;
  low_stock_threshold?: number | string | null;
  source_inspection_contracts?: string[];
  quantity: number;
  allocated_quantity: number;
  in_transit_quantity: number;
  available_quantity: number;
  last_updated?: string | null;
}

function collapseInventoryRows(rows: StockRecord[], inspectionWise = false, includeEmpty = false): InventoryPositionRow[] {
  if (inspectionWise) {
    return rows
      .filter(row => includeEmpty || n(row.quantity) > 0)
      .map(row => ({
        location: row.location,
        location_name: row.location_name,
        location_tags: row.location_tags,
        location_tags_display: row.location_tags_display,
        item: row.item,
        item_code: row.item_code,
        item_name: row.item_name,
        subcategory_name: row.subcategory_name,
        low_stock_threshold: row.low_stock_threshold,
        source_inspection_contracts: row.source_inspection_contracts,
        quantity: n(row.quantity),
        allocated_quantity: stockAllocated(row),
        in_transit_quantity: n(row.in_transit_quantity),
        available_quantity: n(row.available_quantity),
        last_updated: row.last_updated,
      }));
  }

  const grouped = new Map<string, InventoryPositionRow>();
  rows.forEach(row => {
    if (!includeEmpty && n(row.quantity) <= 0) return;
    const key = `${row.location}:${row.item}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        location: row.location,
        location_name: row.location_name,
        location_tags: row.location_tags,
        location_tags_display: row.location_tags_display,
        item: row.item,
        item_code: row.item_code,
        item_name: row.item_name,
        subcategory_name: row.subcategory_name,
        low_stock_threshold: row.low_stock_threshold,
        source_inspection_contracts: [],
        quantity: n(row.quantity),
        allocated_quantity: stockAllocated(row),
        in_transit_quantity: n(row.in_transit_quantity),
        available_quantity: n(row.available_quantity),
        last_updated: row.last_updated,
      });
      return;
    }

    existing.quantity += n(row.quantity);
    existing.allocated_quantity += stockAllocated(row);
    existing.in_transit_quantity += n(row.in_transit_quantity);
    existing.available_quantity += n(row.available_quantity);
    if (row.last_updated && (!existing.last_updated || new Date(row.last_updated).getTime() > new Date(existing.last_updated).getTime())) {
      existing.last_updated = row.last_updated;
    }
  });

  return Array.from(grouped.values()).sort((a, b) => (
    (a.location_name ?? "").localeCompare(b.location_name ?? "") ||
    (a.item_name ?? "").localeCompare(b.item_name ?? "")
  ));
}

async function fetchInventoryRows(filters?: InventoryReportFilters) {
  const scope = filters?.scope;
  const path = scope && scope !== "all" ? `/api/inventory/distribution/?scope=${encodeURIComponent(scope)}` : "/api/inventory/distribution/";
  return filterInventoryRows(await fetchList<StockRecord>(path), filters);
}

async function inventoryPositionReport(filters?: InventoryReportFilters): Promise<ReportView> {
  const rows = collapseInventoryRows(await fetchInventoryRows(filters), Boolean(filters?.inspectionWise));
  const total = rows.reduce((sum, row) => sum + n(row.quantity), 0);
  const available = rows.reduce((sum, row) => sum + n(row.available_quantity), 0);
  const allocated = rows.reduce((sum, row) => sum + n(row.allocated_quantity), 0);
  const transit = rows.reduce((sum, row) => sum + n(row.in_transit_quantity), 0);
  const inspectionWise = Boolean(filters?.inspectionWise);

  return {
    metrics: [
      { label: "Total Quantity", value: fmtNumber(total), hint: "physical stock in selected scope", tone: "blue" },
      { label: "Available", value: fmtNumber(available), hint: `${pct(available, total)} of total`, tone: "green" },
      { label: "Allocated", value: fmtNumber(allocated), hint: `${pct(allocated, total)} of total`, tone: "amber" },
      { label: "In Transit", value: fmtNumber(transit), hint: `${pct(transit, total)} of total`, tone: "violet" },
    ],
    columns: inspectionWise
      ? ["Store / Location", "Location Tags", "Item Code", "Item Name", "Subcategory", "Inspection Contract No.", "Total", "Allocated", "In Transit", "Available", "Last Updated"]
      : ["Store / Location", "Location Tags", "Item Code", "Item Name", "Subcategory", "Total", "Allocated", "In Transit", "Available", "Last Updated"],
    rows: rows.map(row => [
      row.location_name ?? `Location ${row.location}`,
      locationTagLabels(row) || "-",
      row.item_code ?? `Item ${row.item}`,
      row.item_name ?? "-",
      row.subcategory_name ?? "-",
      ...(inspectionWise ? [row.source_inspection_contracts?.length ? row.source_inspection_contracts.join(", ") : "-"] : []),
      fmtNumber(row.quantity),
      fmtNumber(row.allocated_quantity),
      fmtNumber(row.in_transit_quantity),
      fmtNumber(row.available_quantity),
      fmtDate(row.last_updated),
    ]),
    note: filters ? "Live scoped inventory position. Filters are applied to backend-scoped stock records." : reportNote("/api/inventory/distribution/"),
  };
}

async function lowStockReport(filters?: InventoryReportFilters): Promise<ReportView> {
  const inspectionWise = Boolean(filters?.inspectionWise);
  // includeEmpty keeps zero-quantity rows so items that are out of stock at a
  // scoped location still surface (instead of being collapsed away).
  const rowData = collapseInventoryRows(await fetchInventoryRows(filters), inspectionWise, true);
  const lowRows = rowData.filter(row => stockStatus(row) !== "In Stock");
  const available = lowRows.reduce((sum, row) => sum + n(row.available_quantity), 0);
  const allocated = lowRows.reduce((sum, row) => sum + n(row.allocated_quantity), 0);
  return {
    metrics: [
      { label: "Low-Stock Items", value: fmtNumber(lowRows.filter(row => stockStatus(row) === "Low Stock").length), hint: "computed from current balances", tone: "amber" },
      { label: "Out-of-Stock Rows", value: fmtNumber(lowRows.filter(row => stockStatus(row) === "Out Of Stock").length), hint: "available quantity is zero", tone: "red" },
      { label: "Available Quantity", value: fmtNumber(available), hint: "across low-risk rows", tone: "green" },
      { label: "Allocated Quantity", value: fmtNumber(allocated), hint: "currently allocated", tone: "violet" },
    ],
    columns: inspectionWise
      ? ["Store / Location", "Location Tags", "Item Code", "Item Name", "Subcategory", "Inspection Contract No.", "Total", "Allocated", "In Transit", "Available", "Low Stock Threshold", "Stock Status", "Last Updated"]
      : ["Store / Location", "Location Tags", "Item Code", "Item Name", "Subcategory", "Total", "Allocated", "In Transit", "Available", "Low Stock Threshold", "Stock Status", "Last Updated"],
    rows: lowRows.map(row => [
      row.location_name ?? `Location ${row.location}`,
      locationTagLabels(row) || "-",
      row.item_code ?? `Item ${row.item}`,
      row.item_name ?? "-",
      row.subcategory_name ?? "-",
      ...(inspectionWise ? [row.source_inspection_contracts?.length ? row.source_inspection_contracts.join(", ") : "-"] : []),
      fmtNumber(row.quantity),
      fmtNumber(row.allocated_quantity),
      fmtNumber(row.in_transit_quantity),
      fmtNumber(row.available_quantity),
      n(row.low_stock_threshold) > 0 ? fmtNumber(row.low_stock_threshold) : "-",
      stockStatus(row),
      fmtDate(row.last_updated),
    ]),
    note: "Live scoped low-stock rows. Filters are applied to backend-scoped stock records.",
  };
}

function filterPendingEntries(entries: StockEntry[], filters?: PendingAcknowledgementFilters) {
  const itemQuery = filters?.itemQuery.trim().toLowerCase() ?? "";
  const createdFrom = filters?.createdFrom ? new Date(`${filters.createdFrom}T00:00:00`).getTime() : null;
  const createdTo = filters?.createdTo ? new Date(`${filters.createdTo}T23:59:59.999`).getTime() : null;

  return entries.filter(entry => {
    if (entry.status !== "PENDING_ACK") return false;
    if (filters?.fromLocation && String(entry.from_location ?? "") !== filters.fromLocation) return false;
    if (filters?.toLocation && String(entry.to_location ?? "") !== filters.toLocation) return false;
    if (filters?.createdBy && entry.created_by_name !== filters.createdBy) return false;
    if (itemQuery) {
      const haystack = `${entry.entry_number} ${entry.items.map(item => `${item.item_name ?? ""} ${item.batch_number ?? ""}`).join(" ")}`.toLowerCase();
      if (!haystack.includes(itemQuery)) return false;
    }
    if (createdFrom !== null || createdTo !== null) {
      const created = new Date(entry.created_at ?? entry.entry_date).getTime();
      if (!Number.isFinite(created)) return false;
      if (createdFrom !== null && created < createdFrom) return false;
      if (createdTo !== null && created > createdTo) return false;
    }
    return true;
  });
}

async function pendingAcknowledgementReport(filters?: PendingAcknowledgementFilters): Promise<ReportView> {
  const entries = await fetchList<StockEntry>("/api/inventory/stock-entries/");
  const pending = filterPendingEntries(entries, filters);

  return {
    metrics: [
      { label: "Pending Acknowledgement Entries", value: fmtNumber(pending.length), hint: "StockEntry.status = PENDING_ACK", tone: "amber" },
    ],
    columns: ["Entry Number", "Entry Date", "Entry Type", "From Location", "To Location", "Issued To Employee", "Item", "Sent Quantity", "Accepted Quantity", "Status", "Created By", "Created At", "Acknowledged By"],
    rows: pending.map(entry => {
      const item = firstItem(entry);
      const sentQty = entry.items.reduce((sum, row) => sum + n(row.quantity), 0);
      const acceptedQty = entry.items.reduce((sum, row) => sum + n(row.accepted_quantity), 0);
      return [
        entry.entry_number,
        fmtDate(entry.entry_date),
        entry.entry_type,
        entry.from_location_name ?? "-",
        entry.to_location_name ?? "-",
        entry.issued_to_name ?? "-",
        item?.item_name ?? itemLabel(entry),
        fmtNumber(sentQty),
        fmtNumber(acceptedQty),
        entry.status,
        entry.created_by_name ?? "-",
        fmtDate(entry.created_at),
        entry.acknowledged_by_name ?? "-",
      ];
    }),
    note: "Live pending acknowledgement entries only. Filters are applied to backend-scoped stock entries.",
  };
}

function withinDateRange(value: string | null | undefined, from: string, to: string) {
  if (!from && !to) return true;
  const timestamp = value ? new Date(value).getTime() : Number.NaN;
  if (!Number.isFinite(timestamp)) return false;
  const fromTime = from ? new Date(`${from}T00:00:00`).getTime() : null;
  const toTime = to ? new Date(`${to}T23:59:59.999`).getTime() : null;
  if (fromTime !== null && timestamp < fromTime) return false;
  if (toTime !== null && timestamp > toTime) return false;
  return true;
}

interface AssetPositionRow {
  itemId: number | null;
  itemCode: string;
  itemName: string;
  subcategory: string;
  currentHolderType: "Store" | "Employee" | "Location";
  currentHolderId: string;
  currentHolder: string;
  sourceStoreId: string;
  sourceStore: string;
  quantity: number;
  status: "In Store" | "Allocated";
  evidence: string;
  recordedAt?: string | null;
}

function buildAssetPositionRows(stockRows: StockRecord[], allocationRows: StockAllocation[], inspectionWise = false) {
  const positions: AssetPositionRow[] = [];

  stockRows
    .filter(row => row.category_type === "FIXED_ASSET" && n(row.available_quantity) > 0)
    .forEach(row => {
      positions.push({
        itemId: row.item,
        itemCode: row.item_code ?? `Item ${row.item}`,
        itemName: row.item_name ?? "-",
        subcategory: row.subcategory_name ?? "-",
        currentHolderType: "Store",
        currentHolderId: String(row.location),
        currentHolder: row.location_name ?? `Location ${row.location}`,
        sourceStoreId: String(row.location),
        sourceStore: row.location_name ?? `Location ${row.location}`,
        quantity: n(row.available_quantity),
        status: "In Store",
        evidence: inspectionWise && row.source_inspection_contracts?.length ? row.source_inspection_contracts.join(", ") : "Stock balance",
        recordedAt: row.last_updated,
      });
    });

  allocationRows
    .filter(row => row.item_category_type === "FIXED_ASSET" && row.status === "ALLOCATED")
    .forEach(row => {
      const holderType = row.allocated_to_person_name ? "Employee" : "Location";
      positions.push({
        itemId: row.item ?? null,
        itemCode: row.item_code ?? (row.item ? `Item ${row.item}` : "-"),
        itemName: row.item_name ?? "-",
        subcategory: row.item_subcategory_name ?? "-",
        currentHolderType: holderType,
        currentHolderId: row.allocated_to_person_name ? String(row.allocated_to_person ?? "") : String(row.allocated_to_location ?? ""),
        currentHolder: row.allocated_to_person_name ?? row.allocated_to_location_name ?? "-",
        sourceStoreId: String(row.source_location ?? ""),
        sourceStore: row.source_location_name ?? "-",
        quantity: n(row.quantity),
        status: "Allocated",
        evidence: row.entry_number ?? "-",
        recordedAt: row.allocated_at,
      });
    });

  return positions.sort((a, b) => a.itemName.localeCompare(b.itemName) || a.currentHolder.localeCompare(b.currentHolder));
}

function filterAssetCustodyRows(rows: AssetPositionRow[], filters?: AssetCustodyFilters) {
  const itemQuery = filters?.itemQuery.trim().toLowerCase() ?? "";
  return rows.filter(row => {
    if (filters?.sourceLocation && row.sourceStoreId !== filters.sourceLocation) return false;
    if (filters?.person && !(row.currentHolderType === "Employee" && row.currentHolderId === filters.person)) return false;
    if (filters?.targetLocation && !(row.currentHolderType === "Location" && row.currentHolderId === filters.targetLocation)) return false;
    if (filters?.status && row.status !== filters.status) return false;
    if (!withinDateRange(row.recordedAt, filters?.allocatedFrom ?? "", filters?.allocatedTo ?? "")) return false;
    if (itemQuery) {
      const haystack = `${row.itemCode} ${row.itemName} ${row.subcategory} ${row.currentHolder} ${row.sourceStore} ${row.evidence}`.toLowerCase();
      if (!haystack.includes(itemQuery)) return false;
    }
    return true;
  });
}

async function assetCustodyReport(filters?: AssetCustodyFilters): Promise<ReportView> {
  const [stockRows, allocationRows] = await Promise.all([
    fetchInventoryRows({ scope: "", locationId: "", locationTagId: "", itemQuery: "", categoryType: "", updatedFrom: "", updatedTo: "", inspectionWise: Boolean(filters?.inspectionWise) }),
    fetchList<StockAllocation>("/api/inventory/stock-allocations/?status=ALLOCATED"),
  ]);
  const rows = filterAssetCustodyRows(buildAssetPositionRows(stockRows, allocationRows, Boolean(filters?.inspectionWise)), filters);
  const inStore = rows.filter(row => row.status === "In Store");
  const allocated = rows.filter(row => row.status === "Allocated");
  return {
    metrics: [
      { label: "Fixed Asset Positions", value: fmtNumber(rows.length), hint: "current fixed-asset rows", tone: "blue" },
      { label: "Total Quantity", value: fmtNumber(rows.reduce((sum, row) => sum + n(row.quantity), 0)), hint: "fixed assets only", tone: "green" },
      { label: "In Store", value: fmtNumber(inStore.reduce((sum, row) => sum + n(row.quantity), 0)), hint: "available in stores", tone: "violet" },
      { label: "Allocated Out", value: fmtNumber(allocated.reduce((sum, row) => sum + n(row.quantity), 0)), hint: "held by employee/location", tone: "amber" },
    ],
    columns: ["Item Code", "Item Name", "Subcategory", "Current Holder Type", "Current Holder", "Source Store", "Quantity", "Position Status", "Evidence", "Recorded At"],
    rows: rows.map(row => [
      row.itemCode,
      row.itemName,
      row.subcategory,
      row.currentHolderType,
      row.currentHolder,
      row.sourceStore,
      fmtNumber(row.quantity),
      row.status,
      row.evidence,
      fmtDate(row.recordedAt),
    ]),
    note: "Live fixed-asset position report. Store-held assets come from current stock balances; issued assets come from active allocations.",
  };
}

function filterMovementRows(rows: MovementHistory[], filters?: MovementLedgerFilters) {
  const itemQuery = filters?.itemQuery.trim().toLowerCase() ?? "";
  const instanceQuery = filters?.instanceSerial.trim().toLowerCase() ?? "";
  return rows.filter(row => {
    if (!withinDateRange(row.timestamp, filters?.dateFrom ?? "", filters?.dateTo ?? "")) return false;
    if (filters?.location) {
      // RECEIVE/RETURN are destination-side events (owned by the receiving store);
      // every other action is owned by its source (from_location).
      const destinationOwned = row.action === "RECEIVE" || row.action === "RETURN";
      const ownerLocation = destinationOwned ? row.to_location : row.from_location;
      if (String(ownerLocation ?? "") !== filters.location) return false;
    }
    if (filters?.batch && String(row.batch ?? "") !== filters.batch) return false;
    if (filters?.stockRegister && String(row.stock_register ?? "") !== filters.stockRegister && String(row.ack_stock_register ?? "") !== filters.stockRegister) return false;
    if (itemQuery && !`${row.item_name ?? ""} ${row.entry_number ?? ""}`.toLowerCase().includes(itemQuery)) return false;
    if (instanceQuery && !`${row.instance_serial ?? ""}`.toLowerCase().includes(instanceQuery)) return false;
    return true;
  });
}

function movementDestination(row: MovementHistory) {
  if (row.action === "ALLOCATE" && row.allocation_target_name) {
    return row.allocation_target_type === "PERSON"
      ? `Employee: ${row.allocation_target_name}`
      : `Location: ${row.allocation_target_name}`;
  }
  return row.to_location_name ?? "-";
}

async function movementLedgerReport(filters?: MovementLedgerFilters): Promise<ReportView> {
  const rows = filterMovementRows(await fetchList<MovementHistory>("/api/inventory/movement-history/"), filters);
  const qty = rows.reduce((sum, row) => sum + n(row.quantity), 0);
  return {
    metrics: [
      { label: "Movement Events", value: fmtNumber(rows.length), hint: "total events", tone: "blue" },
      { label: "Quantity Moved", value: fmtNumber(qty), hint: "sum quantity", tone: "blue" },
      { label: "Allocations", value: fmtNumber(rows.filter(row => row.action === "ALLOCATE").length), hint: "allocation events", tone: "green" },
      { label: "Returns", value: fmtNumber(rows.filter(row => row.action === "RETURN").length), hint: "return events", tone: "violet" },
    ],
    columns: ["Timestamp", "Action", "Item", "Batch", "Instance / Serial", "From Location", "To Location", "Quantity", "Stock Entry", "Stock Register", "Allocation", "Performed By", "Remarks"],
    rows: rows.map(row => [
      fmtDate(row.timestamp),
      row.action,
      row.item_name ?? `Item ${row.item}`,
      row.batch_number ?? "-",
      row.instance_serial ?? "-",
      row.from_location_name ?? "-",
      movementDestination(row),
      fmtNumber(row.quantity),
      row.entry_number ?? "-",
      row.stock_register_name ?? row.ack_stock_register_name ?? "-",
      row.allocation ? String(row.allocation) : "-",
      row.performed_by_name ?? "-",
      row.remarks ?? "-",
    ]),
    note: "Live movement ledger rows. Filters are applied to backend-scoped movement history.",
  };
}

function filterCorrectionRows(rows: StockCorrection[], filters?: CorrectionFilters) {
  return rows.filter(row => {
    if (!withinDateRange(row.requested_at, filters?.dateFrom ?? "", filters?.dateTo ?? "")) return false;
    if (filters?.status && row.status !== filters.status) return false;
    if (filters?.resolutionType && row.resolution_type !== filters.resolutionType) return false;
    if (filters?.requestedBy && String(row.requested_by ?? "") !== filters.requestedBy) return false;
    return true;
  });
}

function traceStep(label: string, value: string | null | undefined, actor?: string | null, note?: string, forceState?: ProcurementTraceStep["state"]): ProcurementTraceStep {
  const timestamp = value ? new Date(value).getTime() : Number.POSITIVE_INFINITY;
  return {
    label,
    value: fmtDate(value),
    timestamp: Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY,
    actor: actor || undefined,
    note,
    state: forceState ?? (value ? "done" : "pending"),
  };
}

function traceTimestamp(value: string | null | undefined) {
  const timestamp = value ? new Date(value).getTime() : Number.POSITIVE_INFINITY;
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function stockEntryActor(entry: NonNullable<InspectionCertificate["stock_entries"]>[number], certificate: InspectionCertificate) {
  return entry.created_by_name || certificate.central_store_filled_by_name || certificate.stock_filled_by_name || certificate.initiated_by_name || undefined;
}

function buildStockEntryTraceSteps(certificate: InspectionCertificate): ProcurementTraceStep[] {
  const entries = certificate.stock_entries ?? [];
  const receipts = entries.filter(entry => entry.entry_type === "RECEIPT");
  const issues = entries.filter(entry => entry.entry_type === "ISSUE");

  if (issues.length && receipts.length > 1) {
    const firstReceipt = receipts[0];
    const receivingReceipt = receipts[receipts.length - 1];
    const issueNumbers = issues.map(entry => entry.entry_number).join(", ");
    return [
      {
        label: "Central store receipt completed",
        value: fmtDate(firstReceipt.entry_date),
        timestamp: traceTimestamp(firstReceipt.entry_date),
        actor: stockEntryActor(firstReceipt, certificate),
        note: `${firstReceipt.entry_number} / ${firstReceipt.status}`,
        state: firstReceipt.status === "COMPLETED" ? "done" : "current",
      },
      {
        label: "Transfer to standalone store completed",
        value: fmtDate(receivingReceipt.entry_date),
        timestamp: traceTimestamp(receivingReceipt.entry_date),
        actor: stockEntryActor(receivingReceipt, certificate),
        note: `${issueNumbers} -> ${receivingReceipt.entry_number} / ${receivingReceipt.status}`,
        state: receivingReceipt.status === "COMPLETED" && issues.every(entry => entry.status === "COMPLETED") ? "done" : "current",
      },
    ];
  }

  return entries.map(entry => ({
    label: entry.entry_type === "RECEIPT" ? "Receipt completed" : entry.entry_type === "ISSUE" ? "Issue completed" : `Stock entry ${entry.entry_number}`,
    value: fmtDate(entry.entry_date),
    timestamp: traceTimestamp(entry.entry_date),
    actor: stockEntryActor(entry, certificate),
    note: `${entry.entry_number} / ${entry.entry_type} / ${entry.status}`,
    state: entry.status === "COMPLETED" ? "done" : "current",
  }));
}

function buildProcurementTraceSteps(certificate: InspectionCertificate, item: InspectionItem): ProcurementTraceStep[] {
  const stockEvidence = item.stock_register_name || item.stock_register_no
    ? `Stock register ${item.stock_register_name ?? item.stock_register_no}`
    : certificate.central_store_filled_at && certificate.status === "COMPLETED"
      ? "Not required separately; completed through central register workflow"
      : "Awaiting stock register evidence";
  const stockStep = traceStep(
    "Stock details recorded",
    certificate.stock_filled_at ?? (certificate.status === "COMPLETED" ? certificate.central_store_filled_at : null),
    certificate.stock_filled_by_name ?? certificate.central_store_filled_by_name,
    stockEvidence,
    !certificate.stock_filled_at && certificate.central_store_filled_at && certificate.status === "COMPLETED" ? "done" : undefined,
  );
  if (!certificate.stock_filled_at && certificate.central_store_filled_at && certificate.status === "COMPLETED") {
    stockStep.timestamp = traceTimestamp(certificate.central_store_filled_at) - 1;
  }

  const centralEvidence = item.central_register_name || item.central_register_no
    ? `Central register ${item.central_register_name ?? item.central_register_no}`
    : certificate.central_store_filled_at
      ? "Central register stage completed"
      : "Awaiting central register evidence";
  const financeEvidence = item.capitalization_cost || item.capitalization_date
    ? `Capitalization ${item.capitalization_cost ? fmtMoney(item.capitalization_cost) : "-"} on ${item.capitalization_date ?? "-"}`
    : certificate.finance_reviewed_at
      ? "Finance review completed; no capitalization fields recorded for this item"
      : "Finance review not completed";

  const steps: ProcurementTraceStep[] = [
    traceStep("Certificate created", certificate.created_at, certificate.initiated_by_name, `Contract ${certificate.contract_no}`),
    traceStep("Inspection initiated", certificate.initiated_at, certificate.initiated_by_name, certificate.stage === "DRAFT" ? "Still in draft" : "Workflow started"),
    stockStep,
    traceStep("Central register recorded", certificate.central_store_filled_at, certificate.central_store_filled_by_name, centralEvidence),
    traceStep("Finance reviewed", certificate.finance_reviewed_at, certificate.finance_reviewed_by_name, financeEvidence),
  ];

  if (certificate.stock_entries?.length) {
    steps.push(...buildStockEntryTraceSteps(certificate));
  }

  if (certificate.revision_requested_at) {
    steps.push(traceStep("Revision requested", certificate.revision_requested_at, certificate.revision_requested_by_name, certificate.revision_requested_reason || certificate.revision_requested_from_stage || undefined, "blocked"));
  }

  if (certificate.rejected_at) {
    steps.push(traceStep("Rejected", certificate.rejected_at, certificate.rejected_by_name, certificate.rejection_reason || certificate.rejection_stage || undefined, "blocked"));
  } else if (certificate.status === "COMPLETED") {
    steps.push({
      label: "Workflow completed",
      value: fmtDate(certificate.updated_at ?? certificate.finance_reviewed_at ?? certificate.central_store_filled_at),
      timestamp: traceTimestamp(certificate.updated_at ?? certificate.finance_reviewed_at ?? certificate.central_store_filled_at),
      note: "Procurement-to-register path completed",
      state: "done",
    });
  } else {
    steps.push({
      label: `Current stage: ${certificate.stage}`,
      value: "-",
      timestamp: Number.POSITIVE_INFINITY,
      note: certificate.status,
      state: "current",
    });
  }

  return steps.sort((a, b) => a.timestamp - b.timestamp);
}

async function correctionControlReport(filters?: CorrectionFilters): Promise<ReportView> {
  const correctionRows = filterCorrectionRows(await fetchList<StockCorrection>("/api/inventory/stock-corrections/"), filters);
  return {
    metrics: [
      { label: "Correction Requests", value: fmtNumber(correctionRows.length), hint: "stock correction workflow", tone: "blue" },
      { label: "Pending Approval", value: fmtNumber(correctionRows.filter(row => row.status === "REQUESTED").length), hint: "status REQUESTED", tone: "amber" },
      { label: "Applied", value: fmtNumber(correctionRows.filter(row => row.status === "APPLIED").length), hint: "correction applied", tone: "green" },
      { label: "Rejected / Blocked", value: fmtNumber(correctionRows.filter(row => ["REJECTED", "BLOCKED"].includes(row.status)).length), hint: "workflow stopped", tone: "red" },
    ],
    columns: ["Correction ID", "Original Entry", "Status", "Resolution Type", "Requested By", "Requested At", "Approved At", "Applied At", "Generated Entries", "Reason"],
    rows: correctionRows.map(row => [
      String(row.id),
      String(row.original_entry),
      row.status,
      row.resolution_type,
      row.requested_by ? String(row.requested_by) : "-",
      fmtDate(row.requested_at),
      fmtDate(row.approved_at),
      fmtDate(row.applied_at),
      row.generated_entries?.map(entry => entry.entry_number).join(", ") || "-",
      row.reason ?? row.message ?? "-",
    ]),
    note: "Live correction workflow data from /api/inventory/stock-corrections/.",
  };
}

async function inspectionsReport(mode: "aging" | "capitalization"): Promise<ReportView> {
  const rows = await fetchList<InspectionCertificate>("/api/inventory/inspections/");
  if (mode === "aging") {
    const open = rows.filter(row => !["COMPLETED", "CANCELLED", "REJECTED", "VOIDED"].includes(row.status));
    return {
      metrics: [
        { label: "In-Progress Certificates", value: fmtNumber(open.length), hint: "not terminal", tone: "blue" },
        { label: "Rejected", value: fmtNumber(rows.filter(row => row.status === "REJECTED").length), hint: "status rejected", tone: "red" },
        { label: "Revision Requested", value: fmtNumber(rows.filter(row => row.revision_requested_at).length), hint: "revision_requested_at", tone: "amber" },
        { label: "Finance Reviewed", value: fmtNumber(rows.filter(row => row.finance_reviewed_at).length), hint: "finance_reviewed_at", tone: "green" },
        { label: "Total Inspection Items", value: fmtNumber(rows.reduce((sum, row) => sum + row.items.length, 0)), hint: "nested items", tone: "violet" },
      ],
      columns: ["Contract No", "Department", "Contractor Name", "Stage", "Status", "Initiated By", "Initiated At", "Stock Filled At", "Central Filled At", "Finance Reviewed At", "Revision Requested", "Rejected At"],
      rows: rows.map(row => [
        row.contract_no,
        row.department_name ?? "-",
        row.contractor_name ?? "-",
        row.stage,
        row.status,
        row.initiated_by_name ?? "-",
        fmtDate(row.initiated_at),
        fmtDate(row.stock_filled_at),
        fmtDate(row.central_store_filled_at),
        fmtDate(row.finance_reviewed_at),
        fmtDate(row.revision_requested_at),
        fmtDate(row.rejected_at),
      ]),
      note: reportNote("/api/inventory/inspections/"),
    };
  }

  const itemRows = rows.flatMap(certificate => certificate.items.map(item => ({ certificate, item })));
  if (mode === "capitalization") {
    const pending = itemRows.filter(({ item }) => item.depreciation_asset_class_name || item.capitalization_cost || item.capitalization_date);
    return {
      metrics: [
        { label: "Accepted Fixed Asset Items", value: fmtNumber(pending.length), hint: "inspection items with finance fields", tone: "blue" },
        { label: "Missing Capitalization Cost", value: fmtNumber(pending.filter(({ item }) => !item.capitalization_cost).length), hint: "capitalization_cost blank", tone: "amber" },
        { label: "Missing Capitalization Date", value: fmtNumber(pending.filter(({ item }) => !item.capitalization_date).length), hint: "capitalization_date blank", tone: "red" },
        { label: "Ready To Capitalize", value: fmtNumber(pending.filter(({ item }) => item.capitalization_cost && item.capitalization_date).length), hint: "cost and date present", tone: "green" },
      ],
      columns: ["Contract No", "Department", "Inspection Item", "Item Code", "Accepted Qty", "Depreciation Asset Class", "Capitalization Cost", "Capitalization Date", "Finance Reviewed At", "Finance Reviewed By"],
      rows: pending.map(({ certificate, item }) => [
        certificate.contract_no,
        certificate.department_name ?? "-",
        item.item_description || item.item_name || "-",
        item.item_code ?? "-",
        fmtNumber(item.accepted_quantity),
        item.depreciation_asset_class_name ?? "-",
        item.capitalization_cost ? fmtMoney(item.capitalization_cost) : "-",
        item.capitalization_date ?? "-",
        fmtDate(certificate.finance_reviewed_at),
        certificate.finance_reviewed_by_name ?? "-",
      ]),
      note: reportNote("/api/inventory/inspections/"),
    };
  }

  return {
    metrics: [
      { label: "Accepted Quantity", value: fmtNumber(itemRows.reduce((sum, row) => sum + n(row.item.accepted_quantity), 0)), hint: "accepted_quantity", tone: "blue" },
      { label: "Rejected Quantity", value: fmtNumber(itemRows.reduce((sum, row) => sum + n(row.item.rejected_quantity), 0)), hint: "rejected_quantity", tone: "red" },
      { label: "Registered Items", value: fmtNumber(itemRows.filter(({ item }) => item.stock_register_name || item.stock_register_no).length), hint: "stock register refs", tone: "green" },
      { label: "Missing Register", value: fmtNumber(itemRows.filter(({ item }) => !item.stock_register_name && !item.stock_register_no).length), hint: "no stock register ref", tone: "amber" },
      { label: "Capitalization Rows", value: fmtNumber(itemRows.filter(({ item }) => item.capitalization_cost || item.capitalization_date).length), hint: "finance fields present", tone: "green" },
    ],
    columns: ["Contract No", "Inspection Item", "Item Code", "Tendered", "Accepted", "Rejected", "Stock Register", "Stock Page", "Central Register", "Central Page", "Stock Entry", "Capitalization Cost", "Capitalization Date"],
    rows: itemRows.map(({ certificate, item }) => [
      certificate.contract_no,
      item.item_description || item.item_name || "-",
      item.item_code ?? "-",
      fmtNumber(item.tendered_quantity),
      fmtNumber(item.accepted_quantity),
      fmtNumber(item.rejected_quantity),
      item.stock_register_name ?? item.stock_register_no ?? "-",
      item.stock_register_page_no ?? "-",
      item.central_register_name ?? item.central_register_no ?? "-",
      item.central_register_page_no ?? "-",
      certificate.stock_entries?.map(entry => entry.entry_number).join(", ") || "-",
      item.capitalization_cost ? fmtMoney(item.capitalization_cost) : "-",
      item.capitalization_date ?? "-",
    ]),
    note: reportNote("/api/inventory/inspections/"),
  };
}

async function procurementTraceReport(filters?: ProcurementTraceFilters): Promise<ReportView> {
  const certificates = await fetchList<InspectionCertificate>("/api/inventory/inspections/");
  const certificate = certificates.find(row => String(row.id) === filters?.inspectionId);
  if (!certificate) {
    return {
      metrics: [],
      columns: ["Stage", "Recorded At", "Recorded By", "Evidence", "Status"],
    rows: [],
    traceRows: [],
      metadata: [],
      note: "Select an inspection certificate to generate its procurement-to-register trace.",
    };
  }

  const primaryItem = certificate.items[0] ?? {
    item_description: "Inspection certificate",
    tendered_quantity: 0,
    accepted_quantity: 0,
    rejected_quantity: 0,
  };
  const traceRows = certificate.items.map(item => ({
    id: `${certificate.id}-${item.id ?? item.item_code ?? item.item_description}`,
    certificate,
    item,
    steps: buildProcurementTraceSteps(certificate, item),
  }));
  const steps = buildProcurementTraceSteps(certificate, primaryItem);
  const withStockRegister = certificate.items.filter(item => item.stock_register_name || item.stock_register_no).length;
  const withCentralRegister = certificate.items.filter(item => item.central_register_name || item.central_register_no).length;
  const acceptedQty = certificate.items.reduce((sum, item) => sum + n(item.accepted_quantity), 0);

  return {
    metrics: [
      { label: "Inspection Items", value: fmtNumber(certificate.items.length), hint: "item lines on certificate", tone: "blue" },
      { label: "Accepted Quantity", value: fmtNumber(acceptedQty), hint: "accepted across all items", tone: "green" },
      { label: "Stock Registers", value: fmtNumber(withStockRegister), hint: "item lines with stage 2 evidence", tone: "violet" },
      { label: "Stock Entries", value: fmtNumber(certificate.stock_entries?.length ?? 0), hint: "receipt evidence", tone: "amber" },
    ],
    columns: ["Stage", "Recorded At", "Recorded By", "Evidence", "Status"],
    rows: steps.map(step => [step.label, step.value, step.actor ?? "-", step.note ?? "-", step.state === "done" ? "Completed" : step.state === "blocked" ? "Blocked" : step.state === "current" ? "Current" : "Pending"]),
    metadata: [
      { label: "Contract / Invoice", value: `${certificate.contract_no}${certificate.indent_no ? ` / ${certificate.indent_no}` : ""}` },
      { label: "Contractor", value: certificate.contractor_name ?? "-" },
      { label: "Department", value: certificate.department_name ?? "-" },
      { label: "Stage", value: certificate.stage },
      { label: "Status", value: certificate.status },
    ],
    traceRows,
    note: `Live procurement trace for ${certificate.contract_no} from inspection workflow, register fields, stock entries, and finance evidence.`,
  };
}

async function fixedAssetRegisterReport(): Promise<ReportView> {
  const rows = await fetchList<FixedAssetEntry>("/api/inventory/depreciation/assets/");
  const original = rows.reduce((sum, row) => sum + n(row.original_cost), 0);
  const accumulated = rows.reduce((sum, row) => sum + n(row.depreciation_summary?.accumulated_depreciation), 0);
  const closing = rows.reduce((sum, row) => sum + n(row.depreciation_summary?.closing_value), 0);
  return {
    metrics: [
      { label: "Active Assets", value: fmtNumber(rows.filter(row => row.status === "ACTIVE").length), hint: "status ACTIVE", tone: "blue" },
      { label: "Original Cost", value: fmtMoney(original), hint: "gross capitalization", tone: "blue" },
      { label: "Accumulated Depreciation", value: fmtMoney(accumulated), hint: "latest summary", tone: "violet" },
      { label: "Current WDV / NBV", value: fmtMoney(closing), hint: "latest closing value", tone: "green" },
      { label: "Register Entries", value: fmtNumber(rows.length), hint: "fixed assets", tone: "amber" },
    ],
    columns: ["Asset Number", "Item Code", "Item Name", "Target Type", "Instance / Batch", "Asset Class", "Orig Qty", "Rem Qty", "Original Cost", "Capitalization Date", "Opening Value", "Dep Amount", "Closing Value", "Status"],
    rows: rows.map(row => [
      row.asset_number,
      row.item_code ?? "-",
      row.item_name ?? "-",
      row.target_type,
      row.instance_serial ?? row.batch_number ?? "-",
      row.asset_class_name ?? "-",
      fmtNumber(row.original_quantity),
      fmtNumber(row.remaining_quantity),
      fmtMoney(row.original_cost),
      row.capitalization_date,
      fmtMoney(row.depreciation_summary?.opening_value),
      fmtMoney(row.depreciation_summary?.depreciation_amount),
      fmtMoney(row.depreciation_summary?.closing_value),
      row.status,
    ]),
    note: reportNote("/api/inventory/depreciation/assets/"),
  };
}

async function assetAdjustmentsReport(): Promise<ReportView> {
  const rows = await fetchList<AssetAdjustment>("/api/inventory/depreciation/adjustments/");
  return {
    metrics: [
      { label: "Capital Additions", value: fmtMoney(rows.filter(row => row.adjustment_type === "ADDITION").reduce((sum, row) => sum + n(row.amount), 0)), hint: "ADDITION", tone: "green" },
      { label: "Disposals", value: fmtMoney(rows.filter(row => row.adjustment_type === "DISPOSAL").reduce((sum, row) => sum + n(row.amount), 0)), hint: "DISPOSAL", tone: "amber" },
      { label: "Loss / Write-offs", value: fmtMoney(rows.filter(row => ["LOSS", "WRITE_OFF"].includes(row.adjustment_type)).reduce((sum, row) => sum + n(row.amount), 0)), hint: "LOSS + WRITE_OFF", tone: "red" },
      { label: "Quantity Reductions", value: fmtNumber(rows.filter(row => row.adjustment_type === "QUANTITY_REDUCTION").length), hint: "quantity changes", tone: "violet" },
      { label: "Adjustment Amount", value: fmtMoney(rows.reduce((sum, row) => sum + n(row.amount), 0)), hint: "net listed amount", tone: "blue" },
    ],
    columns: ["Asset Number", "Item", "Adjustment Type", "Effective Date", "Amount", "Quantity Delta", "Reason", "Created At"],
    rows: rows.map(row => [
      row.asset_number ?? "-",
      row.item_name ?? "-",
      row.adjustment_type,
      row.effective_date,
      fmtMoney(row.amount),
      fmtNumber(row.quantity_delta),
      row.reason,
      fmtDate(row.created_at),
    ]),
    note: reportNote("/api/inventory/depreciation/adjustments/"),
  };
}

async function universitySnapshotReport(): Promise<ReportView> {
  const [inventory, pending, lowStock, fixedAssets, inspections] = await Promise.all([
    inventoryPositionReport(),
    pendingAcknowledgementReport(),
    lowStockReport(),
    fixedAssetRegisterReport(),
    inspectionsReport("aging"),
  ]);
  return {
    metrics: [
      ...inventory.metrics.slice(0, 4),
      ...fixedAssets.metrics.slice(0, 2),
      pending.metrics[0],
      inspections.metrics[0],
    ],
    columns: ["Indicator", "Current Value", "Evidence Source", "Primary Drilldown"],
    rows: [
      ["Stock status distribution", `${inventory.metrics[1].value} available / ${inventory.metrics[3].value} in transit`, "StockRecord", "Inventory Position"],
      ["Pending acknowledgements", pending.metrics[0].value, "StockEntry.status", "Pending Acknowledgement"],
      ["Asset register value", fixedAssets.metrics[3].value, "FixedAssetRegisterEntry + DepreciationEntry", "Fixed Asset Register"],
      ["Open inspection aging", inspections.metrics[0].value, "InspectionCertificate", "Inspection Aging"],
      ["Low-stock rows", lowStock.metrics[0].value, "StockRecord current balances", "Low Stock Risk"],
    ],
    note: "Live aggregate from distribution, stock entries, fixed assets, and inspections endpoints.",
  };
}

const REPORTS: ReportDefinition[] = [
  {
    id: "inventory-position",
    family: "operational",
    title: "Inventory Position and Availability",
    description: "Shows current stock position by store and item with availability, allocation, and in-transit quantities.",
    schema: ["StockRecord", "Item", "ItemBatch", "Location", "Category"],
    filters: ["Scope", "Department / Standalone Unit", "Store", "Item", "Category", "Tracking Type", "Batch / Lot", "Expiry Range"],
    loader: filters => inventoryPositionReport(filters as InventoryReportFilters | undefined),
  },
  {
    id: "low-stock",
    family: "operational",
    title: "Low Stock and Stock Risk",
    description: "Highlights items with weak current availability in the selected scope.",
    schema: ["StockRecord", "Item.low_stock_threshold", "Location", "Category"],
    filters: ["Department / Unit", "Store / Location", "Item", "Category", "Category Type", "Tracking Type"],
    loader: filters => lowStockReport(filters as InventoryReportFilters | undefined),
  },
  {
    id: "pending-ack",
    family: "operational",
    title: "Pending Acknowledgement",
    description: "Shows stock sent through entries that still need receiving-side acknowledgement.",
    schema: ["StockEntry", "StockEntryItem", "Location", "Employee"],
    filters: ["Date Range", "Source Store", "Destination Store / Location", "Entry Type", "Status", "Item"],
    loader: filters => pendingAcknowledgementReport(filters as PendingAcknowledgementFilters | undefined),
  },
  {
    id: "asset-custody",
    family: "operational",
    title: "Asset Custody and Allocation",
    description: "Shows the current position of fixed assets, whether held in store or allocated to an employee or location.",
    schema: ["StockRecord", "StockAllocation", "Item", "Employee", "Location"],
    filters: ["Store", "Employee", "Non-Store Location", "Item", "Position Status", "Date Range"],
    loader: filters => assetCustodyReport(filters as AssetCustodyFilters | undefined),
  },
  {
    id: "movement-ledger",
    family: "audit",
    title: "Stock Movement Ledger",
    description: "Complete audit trail of stock and allocation movements across stores, locations, employees, instances, and batches.",
    schema: ["MovementHistory", "StockEntry", "StockEntryItem", "StockRegister", "StockAllocation", "Item", "ItemBatch", "ItemInstance", "Location"],
    filters: ["Date Range", "Item", "Location", "Batch", "Instance / Serial", "Stock Register"],
    loader: filters => movementLedgerReport(filters as MovementLedgerFilters | undefined),
  },
  {
    id: "correction-control",
    family: "audit",
    title: "Correction and Reversal Control",
    description: "Tracks corrected, reversed, replacement, and cancelled stock entries using existing stock-entry fields.",
    schema: ["StockCorrectionRequest", "StockCorrectionLine", "StockEntry", "CorrectionResolutionType"],
    filters: ["Date Range", "Status", "Resolution Type", "Requested By"],
    loader: filters => correctionControlReport(filters as CorrectionFilters | undefined),
  },
  {
    id: "inspection-aging",
    family: "audit",
    title: "Inspection Aging and Stage Compliance",
    description: "Monitors inspection certificates across workflow stages, revisions, and rejections.",
    schema: ["InspectionCertificate", "InspectionItem", "Location"],
    filters: ["Department", "Stage", "Status", "Contractor", "Revision Requested"],
    loader: () => inspectionsReport("aging"),
  },
  {
    id: "procurement-trace",
    family: "audit",
    title: "Procurement-to-Register Trace",
    description: "Traces accepted inspected items into stock registers, stock entries, and finance fields.",
    schema: ["InspectionCertificate", "InspectionItem", "StockRegister", "StockEntry", "FixedAssetRegisterEntry"],
    filters: ["Contract No", "Department", "Item", "Stock Register", "Central Register", "Finance Reviewed"],
    loader: filters => procurementTraceReport(filters as ProcurementTraceFilters | undefined),
  },
  {
    id: "capitalization-pending",
    family: "finance",
    title: "Capitalization Pending",
    description: "Accepted fixed asset inspection rows with missing or incomplete capitalization evidence.",
    schema: ["InspectionCertificate", "InspectionItem", "DepreciationAssetClass", "FixedAssetRegisterEntry"],
    filters: ["Department", "Date Range", "Item", "Asset Class", "Finance Stage"],
    loader: () => inspectionsReport("capitalization"),
  },
  {
    id: "fixed-asset-register",
    family: "finance",
    title: "Fixed Asset Register and Depreciation Summary",
    description: "Active fixed assets with latest depreciation values for the selected fiscal year.",
    schema: ["FixedAssetRegisterEntry", "DepreciationEntry", "DepreciationRun", "DepreciationAssetClass"],
    filters: ["Fiscal Year", "Department", "Asset Class", "Status", "Target Type"],
    loader: fixedAssetRegisterReport,
  },
  {
    id: "asset-adjustments",
    family: "finance",
    title: "Asset Adjustment / Disposal / Loss",
    description: "Asset value adjustments including additions, disposals, losses, and quantity reductions.",
    schema: ["AssetValueAdjustment", "FixedAssetRegisterEntry"],
    filters: ["Fiscal Year", "Department", "Asset Class", "Adjustment Type", "Status"],
    loader: assetAdjustmentsReport,
  },
  {
    id: "university-snapshot",
    family: "executive",
    title: "University Asset Snapshot",
    description: "High-level live view of inventory, fixed assets, inspections, and key operational indicators.",
    schema: ["StockRecord", "FixedAssetRegisterEntry", "DepreciationEntry", "InspectionCertificate", "StockEntry"],
    filters: ["Scope", "Department", "Fiscal Year", "As Of Date"],
    loader: universitySnapshotReport,
  },
];

const FAMILY_LABELS: Record<ReportFamily, string> = {
  all: "All Reports",
  operational: "Operational",
  audit: "Audit & Control",
  finance: "Finance & Fixed Assets",
  executive: "Executive Snapshot",
};

const FAMILY_ORDER: ReportFamily[] = ["all", "operational", "audit", "finance", "executive"];

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

function ReportToggle({ checked, onChange, label }: { checked: boolean; onChange: (checked: boolean) => void; label: string }) {
  return (
    <button type="button" className={"report-toggle" + (checked ? " active" : "")} onClick={() => onChange(!checked)} aria-pressed={checked}>
      <span className="report-toggle-track" aria-hidden="true">
        <span className="report-toggle-thumb" />
      </span>
      <span>{label}</span>
    </button>
  );
}

function metricIcon(tone: Tone | undefined) {
  if (tone === "green") return <><path d="M20 6L9 17l-5-5" /></>;
  if (tone === "amber") return <><circle cx="12" cy="8" r="4" /><path d="M6 21v-2a6 6 0 0112 0v2" /></>;
  if (tone === "red") return <><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 4.2L2.5 18a2 2 0 001.7 3h15.6a2 2 0 001.7-3L13.7 4.2a2 2 0 00-3.4 0z" /></>;
  if (tone === "violet") return <><rect x="5" y="4" width="14" height="16" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" /></>;
  return <><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z" /><path d="M3.3 7L12 12l8.7-5M12 22V12" /></>;
}

function statusClass(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("healthy") || normalized.includes("allocated") || normalized.includes("active") || normalized.includes("completed")) return styles.ok;
  if (normalized.includes("pending") || normalized.includes("low") || normalized.includes("revision") || normalized.includes("draft")) return styles.warn;
  if (normalized.includes("out") || normalized.includes("lost") || normalized.includes("rejected") || normalized.includes("disposed") || normalized.includes("cancelled")) return styles.danger;
  return styles.neutral;
}

function isStatusCell(column: string, value: string) {
  return /status|stage|purpose|action|type/i.test(column) || /healthy|allocated|active|completed|pending|low|out|lost|rejected|disposed|cancelled|draft/i.test(value);
}

export default function ReportsPage() {
  const router = useRouter();
  const { can, isLoading: authLoading } = useAuth();
  const canViewReports = can(ADMIN_PERMISSIONS.reports.view);
  const [family, setFamily] = useState<ReportFamily>("all");
  const [selectedId, setSelectedId] = useState<ReportId>("inventory-position");
  const [catalogCollapsed, setCatalogCollapsed] = useState(false);
  const [view, setView] = useState<ReportView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [scopeOptions, setScopeOptions] = useState<ScopeOptionsResponse>({ options: [], default: ["all"], is_root_scope: false });
  const [inventoryRowsForFilters, setInventoryRowsForFilters] = useState<StockRecord[]>([]);
  const [reportLocationTags, setReportLocationTags] = useState<LocationTagSummary[]>([]);
  const [pendingEntriesForFilters, setPendingEntriesForFilters] = useState<StockEntry[]>([]);
  const [assetRowsForFilters, setAssetRowsForFilters] = useState<StockAllocation[]>([]);
  const [movementRowsForFilters, setMovementRowsForFilters] = useState<MovementHistory[]>([]);
  const [correctionRowsForFilters, setCorrectionRowsForFilters] = useState<StockCorrection[]>([]);
  const [inspectionRowsForFilters, setInspectionRowsForFilters] = useState<InspectionCertificate[]>([]);
  const [inventoryFilters, setInventoryFilters] = useState<InventoryReportFilters>({
    scope: "",
    locationId: "",
    locationTagId: "",
    itemQuery: "",
    categoryType: "",
    updatedFrom: "",
    updatedTo: "",
    inspectionWise: false,
  });
  const [pendingFilters, setPendingFilters] = useState<PendingAcknowledgementFilters>({
    fromLocation: "",
    toLocation: "",
    itemQuery: "",
    createdBy: "",
    createdFrom: "",
    createdTo: "",
  });
  const [assetFilters, setAssetFilters] = useState<AssetCustodyFilters>({ sourceLocation: "", person: "", targetLocation: "", itemQuery: "", status: "", allocatedFrom: "", allocatedTo: "", inspectionWise: false });
  const [movementFilters, setMovementFilters] = useState<MovementLedgerFilters>({ dateFrom: "", dateTo: "", itemQuery: "", location: "", batch: "", instanceSerial: "", stockRegister: "" });
  const [correctionFilters, setCorrectionFilters] = useState<CorrectionFilters>({ dateFrom: "", dateTo: "", status: "", resolutionType: "", requestedBy: "" });
  const [procurementFilters, setProcurementFilters] = useState<ProcurementTraceFilters>({ inspectionId: "" });

  const selected = REPORTS.find(report => report.id === selectedId) ?? REPORTS[0];
  const isInventoryPosition = selected.id === "inventory-position";
  const isInventoryStockReport = selected.id === "inventory-position" || selected.id === "low-stock";
  const isPendingAcknowledgement = selected.id === "pending-ack";
  const isAssetCustody = selected.id === "asset-custody";
  const isMovementLedger = selected.id === "movement-ledger";
  const isCorrectionControl = selected.id === "correction-control";
  const isProcurementTrace = selected.id === "procurement-trace";

  const groupedReports = useMemo(() => {
    return REPORTS.reduce<Record<Exclude<ReportFamily, "all">, ReportDefinition[]>>(
      (groups, report) => {
        groups[report.family].push(report);
        return groups;
      },
      { operational: [], audit: [], finance: [], executive: [] },
    );
  }, []);

  const visibleGroups = (["operational", "audit", "finance", "executive"] as const).filter(group => family === "all" || family === group);

  useEffect(() => {
    if (!authLoading && !canViewReports) router.replace("/403");
  }, [authLoading, canViewReports, router]);

  const scopeSelectOptions = useMemo<ThemedSelectOption[]>(() => {
    return scopeOptions.options.map(option => ({
      value: option.id,
      label: option.label,
      meta: option.kind === "all" ? "All accessible locations" : option.kind,
    }));
  }, [scopeOptions.options]);

  const selectedScopeIsStandalone = useMemo(
    () => scopeOptions.options.some(option => option.id === inventoryFilters.scope && option.kind === "standalone"),
    [scopeOptions.options, inventoryFilters.scope],
  );

  const locationOptions = useMemo(() => {
    const map = new Map<number, string>();
    inventoryRowsForFilters.forEach(row => map.set(row.location, row.location_name ?? `Location ${row.location}`));
    return Array.from(map, ([id, label]) => ({ id: String(id), label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [inventoryRowsForFilters]);

  const locationSelectOptions = useMemo<ThemedSelectOption[]>(() => [
    { value: "", label: "All locations in scope" },
    ...locationOptions.map(option => ({ value: option.id, label: option.label })),
  ], [locationOptions]);

  const locationTagOptions = useMemo(() => {
    const map = new Map<string, string>();
    reportLocationTags.forEach(tag => {
      map.set(String(tag.id), tag.label ?? `${tag.category_display ?? tag.category}: ${tag.name}`);
    });
    inventoryRowsForFilters.forEach(row => {
      (row.location_tags_display ?? []).forEach(tag => {
        map.set(String(tag.id), tag.label ?? `${tag.category_display ?? tag.category}: ${tag.name}`);
      });
    });
    return Array.from(map, ([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [inventoryRowsForFilters, reportLocationTags]);

  const locationTagSelectOptions = useMemo<ThemedSelectOption[]>(() => [
    { value: "", label: "All location tags" },
    ...locationTagOptions.map(option => ({ value: option.id, label: option.label })),
  ], [locationTagOptions]);

  const pendingFromLocationOptions = useMemo(() => {
    const map = new Map<string, string>();
    pendingEntriesForFilters.forEach(entry => {
      if (entry.from_location) map.set(String(entry.from_location), entry.from_location_name ?? `Location ${entry.from_location}`);
    });
    return Array.from(map, ([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [pendingEntriesForFilters]);

  const pendingToLocationOptions = useMemo(() => {
    const map = new Map<string, string>();
    pendingEntriesForFilters.forEach(entry => {
      if (entry.to_location) map.set(String(entry.to_location), entry.to_location_name ?? `Location ${entry.to_location}`);
    });
    return Array.from(map, ([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [pendingEntriesForFilters]);

  const pendingCreatedByOptions = useMemo(() => uniqueOptions(pendingEntriesForFilters.map(entry => entry.created_by_name)), [pendingEntriesForFilters]);
  const assetPositionRowsForFilters = useMemo(
    () => buildAssetPositionRows(inventoryRowsForFilters, assetRowsForFilters, assetFilters.inspectionWise),
    [assetFilters.inspectionWise, assetRowsForFilters, inventoryRowsForFilters],
  );
  const assetSourceOptions = useMemo(() => {
    const map = new Map<string, string>();
    assetPositionRowsForFilters.forEach(row => {
      if (row.sourceStoreId) map.set(row.sourceStoreId, row.sourceStore);
    });
    return Array.from(map, ([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [assetPositionRowsForFilters]);
  const assetPersonOptions = useMemo(() => {
    const map = new Map<string, string>();
    assetPositionRowsForFilters.forEach(row => {
      if (row.currentHolderType === "Employee" && row.currentHolderId) map.set(row.currentHolderId, row.currentHolder);
    });
    return Array.from(map, ([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [assetPositionRowsForFilters]);
  const assetTargetOptions = useMemo(() => {
    const map = new Map<string, string>();
    assetPositionRowsForFilters.forEach(row => {
      if (row.currentHolderType === "Location" && row.currentHolderId) map.set(row.currentHolderId, row.currentHolder);
    });
    return Array.from(map, ([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [assetPositionRowsForFilters]);
  const assetStatusOptions = useMemo(() => ["In Store", "Allocated"], []);
  const movementLocationOptions = useMemo(() => {
    const map = new Map<string, string>();
    movementRowsForFilters.forEach(row => {
      if (row.from_location) map.set(String(row.from_location), row.from_location_name ?? `Location ${row.from_location}`);
      if (row.to_location) map.set(String(row.to_location), row.to_location_name ?? `Location ${row.to_location}`);
    });
    return Array.from(map, ([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [movementRowsForFilters]);
  const movementBatchOptions = useMemo(() => mapIdOptions(movementRowsForFilters, "batch", "batch_number"), [movementRowsForFilters]);
  const movementRegisterOptions = useMemo(() => {
    if (!movementFilters.location) return [];
    const map = new Map<string, string>();
    movementRowsForFilters.forEach(row => {
      const destinationOwned = row.action === "RECEIVE" || row.action === "RETURN";
      const ownerLocation = destinationOwned ? row.to_location : row.from_location;
      if (String(ownerLocation ?? "") !== movementFilters.location) return;
      if (row.stock_register) map.set(String(row.stock_register), row.stock_register_name ?? `Register ${row.stock_register}`);
      if (row.ack_stock_register) map.set(String(row.ack_stock_register), row.ack_stock_register_name ?? `Register ${row.ack_stock_register}`);
    });
    return Array.from(map, ([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [movementRowsForFilters, movementFilters.location]);
  const correctionStatusOptions = useMemo(() => uniqueOptions(correctionRowsForFilters.map(row => row.status)), [correctionRowsForFilters]);
  const correctionResolutionOptions = useMemo(() => uniqueOptions(correctionRowsForFilters.map(row => row.resolution_type)), [correctionRowsForFilters]);
  const correctionRequesterOptions = useMemo(() => {
    const ids = Array.from(new Set(correctionRowsForFilters.map(row => row.requested_by).filter((id): id is number => Boolean(id))));
    return ids.map(id => ({ id: String(id), label: `User ${id}` }));
  }, [correctionRowsForFilters]);
  const inspectionCertificateOptions = useMemo<ThemedSelectOption[]>(() => {
    return inspectionRowsForFilters.map(row => ({
      value: String(row.id),
      label: `${row.contract_no}${row.indent_no ? ` / ${row.indent_no}` : ""}`,
      meta: row.department_name ?? "No department",
    }));
  }, [inspectionRowsForFilters]);
  const selectedTraceInspection = useMemo(() => inspectionRowsForFilters.find(row => String(row.id) === procurementFilters.inspectionId) ?? null, [inspectionRowsForFilters, procurementFilters.inspectionId]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters = isInventoryStockReport ? inventoryFilters : isPendingAcknowledgement ? pendingFilters : isAssetCustody ? assetFilters : isMovementLedger ? movementFilters : isCorrectionControl ? correctionFilters : isProcurementTrace ? procurementFilters : undefined;
      setView(await selected.loader(filters));
    } catch (err) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Unable to load report data.";
      setError(message);
      setView({ metrics: [], columns: [], rows: [], note: "No mock fallback is used. Start the backend or grant access to the required module to load this report." });
    } finally {
      setLoading(false);
    }
  }, [assetFilters, correctionFilters, inventoryFilters, isAssetCustody, isCorrectionControl, isInventoryStockReport, isMovementLedger, isPendingAcknowledgement, isProcurementTrace, movementFilters, pendingFilters, procurementFilters, selected]);

  const generateProcurementTraceReport = useCallback(async () => {
    if (!procurementFilters.inspectionId) return;
    setLoading(true);
    setError(null);
    try {
      const nextView = await selected.loader(procurementFilters);
      setView(nextView);
      if (nextView.rows.length) openReportPdfPrintView(selected, nextView);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Unable to load report data.";
      setError(message);
      setView({ metrics: [], columns: [], rows: [], note: "No mock fallback is used. Start the backend or grant access to the required module to load this report." });
    } finally {
      setLoading(false);
    }
  }, [procurementFilters, selected]);

  const loadInventoryFilterRows = useCallback(async (scope: string) => {
    try {
      const scopeParam = scope && scope !== "all" ? `?scope=${encodeURIComponent(scope)}` : "";
      const [rows, tags] = await Promise.all([
        fetchInventoryRows({ scope, locationId: "", locationTagId: "", itemQuery: "", categoryType: "", updatedFrom: "", updatedTo: "", inspectionWise: false }),
        apiFetch<LocationTagSummary[]>(`/api/inventory/distribution/tag-options/${scopeParam}`),
      ]);
      setInventoryRowsForFilters(rows);
      setReportLocationTags(tags);
    } catch {
      setInventoryRowsForFilters([]);
      setReportLocationTags([]);
    }
  }, []);

  useEffect(() => {
    if (authLoading || !canViewReports) return;
    let active = true;
    async function loadPendingFilterEntries() {
      try {
        const rows = await fetchList<StockEntry>("/api/inventory/stock-entries/");
        if (active) setPendingEntriesForFilters(rows.filter(entry => entry.status === "PENDING_ACK"));
      } catch {
        if (active) setPendingEntriesForFilters([]);
      }
    }
    void loadPendingFilterEntries();
    return () => {
      active = false;
    };
  }, [authLoading, canViewReports]);

  useEffect(() => {
    if (authLoading || !canViewReports) return;
    let active = true;
    async function loadFilterRows() {
      const [allocations, movements, corrections, inspections] = await Promise.allSettled([
        fetchList<StockAllocation>("/api/inventory/stock-allocations/"),
        fetchList<MovementHistory>("/api/inventory/movement-history/"),
        fetchList<StockCorrection>("/api/inventory/stock-corrections/"),
        fetchList<InspectionCertificate>("/api/inventory/inspections/"),
      ]);
      if (!active) return;
      setAssetRowsForFilters(allocations.status === "fulfilled" ? allocations.value : []);
      setMovementRowsForFilters(movements.status === "fulfilled" ? movements.value : []);
      setCorrectionRowsForFilters(corrections.status === "fulfilled" ? corrections.value : []);
      setInspectionRowsForFilters(inspections.status === "fulfilled" ? inspections.value : []);
    }
    void loadFilterRows();
    return () => {
      active = false;
    };
  }, [authLoading, canViewReports]);

  useEffect(() => {
    if (authLoading || !canViewReports) return;
    let active = true;
    async function loadScopeOptions() {
      try {
        const data = await apiFetch<ScopeOptionsResponse>("/api/inventory/distribution/scope-options/");
        if (!active) return;
        const defaultScope = data.default[0] ?? data.options[0]?.id ?? "all";
        setScopeOptions(data);
        setInventoryFilters(current => ({ ...current, scope: data.options.some(option => option.id === current.scope) ? current.scope : defaultScope }));
        void loadInventoryFilterRows(defaultScope);
      } catch {
        if (!active) return;
        setScopeOptions({ options: [{ id: "all", label: "All accessible locations", kind: "all", location_id: null }], default: ["all"], is_root_scope: false });
        void loadInventoryFilterRows("all");
      }
    }
    void loadScopeOptions();
    return () => {
      active = false;
    };
  }, [authLoading, canViewReports, loadInventoryFilterRows]);

  useEffect(() => {
    if (authLoading || !canViewReports) return;
    void loadReport();
  }, [authLoading, canViewReports, loadReport]);

  useEffect(() => {
    setFiltersOpen(isInventoryStockReport || isPendingAcknowledgement || isAssetCustody || isMovementLedger || isCorrectionControl || isProcurementTrace);
  }, [isAssetCustody, isCorrectionControl, isInventoryStockReport, isMovementLedger, isPendingAcknowledgement, isProcurementTrace]);

  return (
    <div>
      <Topbar breadcrumb={["Operations", "Reports"]} />
      <div className="page">
        <div className="page-head">
          <div className="page-title-group">
            <div className="eyebrow">Operations</div>
            <h1>Reports</h1>
            <div className="page-sub">Generate operational, audit, and financial reports from live asset data.</div>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={loadReport} disabled={loading}>
            <Icon><path d="M3 12a9 9 0 109-9" /><path d="M3 3v6h6" /></Icon>
            Refresh Data
          </Button>
        </div>

        <div className={styles.tabs}>
          {FAMILY_ORDER.map(option => (
            <button key={option} type="button" className={family === option ? styles.activeTab : ""} onClick={() => setFamily(option)}>
              {FAMILY_LABELS[option]}
            </button>
          ))}
        </div>

        <div className={catalogCollapsed ? `${styles.workspace} ${styles.catalogIsCollapsed}` : styles.workspace}>
          <aside className={styles.catalog}>
            <div className={styles.catalogHead}>
              <div>
                <div className="eyebrow">Report Catalog</div>
                {!catalogCollapsed ? <span>{REPORTS.length} live report views</span> : null}
              </div>
              <Button
                type="button"
                variant="outline" size="icon-xs"
                onClick={() => setCatalogCollapsed(!catalogCollapsed)}
                title={catalogCollapsed ? "Expand catalog" : "Collapse catalog"}
                aria-label={catalogCollapsed ? "Expand report catalog" : "Collapse report catalog"}
              >
                <Icon>{catalogCollapsed ? <path d="M9 18l6-6-6-6" /> : <path d="M15 18l-6-6 6-6" />}</Icon>
              </Button>
            </div>
            {catalogCollapsed ? (
              <div className={styles.catalogCollapsedList}>
                {REPORTS.map(report => (
                  <button
                    key={report.id}
                    type="button"
                    className={report.id === selectedId ? styles.catalogDotActive : styles.catalogDot}
                    onClick={() => setSelectedId(report.id)}
                    title={report.title}
                    aria-label={report.title}
                  />
                ))}
              </div>
            ) : (
              <>
            {visibleGroups.map(group => (
              <section key={group} className={styles.catalogGroup}>
                <h2>{FAMILY_LABELS[group]}</h2>
                {groupedReports[group].map(report => (
                  <button key={report.id} type="button" className={report.id === selectedId ? styles.reportItemActive : styles.reportItem} onClick={() => setSelectedId(report.id)}>
                    <span className={styles.fileIcon}>
                      <Icon><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><path d="M14 2v6h6" /></Icon>
                    </span>
                    <span>{report.title}</span>
                    <span className={styles.star}>☆</span>
                  </button>
                ))}
              </section>
            ))}
              </>
            )}
          </aside>

          <main className={styles.reportPanel}>
            <div className={styles.reportTopline}>
              <div>
                <h2>{selected.title} <span aria-hidden="true">☆</span></h2>
                <p>{selected.description}</p>
              </div>
              <div className={styles.actions}>
                {!isProcurementTrace ? (
                  <>
                    <Button type="button" size="sm" onClick={loadReport} disabled={loading}>
                      <Icon><path d="M5 3l14 9-14 9V3z" /></Icon>
                      {loading ? "Running..." : "Run Report"}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => view ? exportReportCsv(selected, view) : undefined} disabled={!view?.rows.length}>
                      <Icon><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M5 21h14" /></Icon>
                      Export CSV
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => view ? openReportPdfPrintView(selected, view) : undefined} disabled={!view?.rows.length}>
                      <Icon><path d="M7 3h10l4 4v14H7z" /><path d="M17 3v5h5" /></Icon>
                      Download
                    </Button>
                  </>
                ) : null}
              </div>
            </div>

            {error ? (
              <div className={styles.errorBox}>{error}</div>
            ) : null}

            <details className={styles.filterDisclosure} open={filtersOpen} onToggle={event => setFiltersOpen(event.currentTarget.open)}>
              <summary>
                <span>
                  <span className="eyebrow">Report setup</span>
                  <strong>
                    {isInventoryStockReport
                      ? "Filter live stock records by your accessible scope, location, item, tag, and update date."
                      : isPendingAcknowledgement
                        ? "Filter pending acknowledgement entries by source, destination, item, creator, and created date."
                        : isProcurementTrace
                          ? "Search by inspection contract or invoice number, then generate the procurement-to-register lifecycle report."
                          : "This report currently runs against all accessible live records."}
                  </strong>
                </span>
                <span className="chip">Show filters</span>
              </summary>
              {isInventoryStockReport ? (
                <div className={styles.filters}>
                  <label className="field">
                    <span className="field-label">Standalone / Scope</span>
                    <ThemedSelect
                      value={inventoryFilters.scope}
                      options={scopeSelectOptions}
                      onChange={scope => {
                        setInventoryFilters(current => ({ ...current, scope, locationId: "", locationTagId: "" }));
                        void loadInventoryFilterRows(scope);
                      }}
                      placeholder="Search standalone or scope"
                      ariaLabel="Search standalone or scope"
                    />
                  </label>
                  {selectedScopeIsStandalone ? (
                    <label className="field">
                      <span className="field-label">Store / Location</span>
                      <ThemedSelect
                        value={inventoryFilters.locationId}
                        options={locationSelectOptions}
                        onChange={value => setInventoryFilters(current => ({ ...current, locationId: value }))}
                        placeholder="Search store or location"
                        ariaLabel="Search store or location"
                      />
                    </label>
                  ) : null}
                  <label className="field">
                    <span className="field-label">Location Tag</span>
                    <ThemedSelect
                      value={inventoryFilters.locationTagId}
                      options={locationTagSelectOptions}
                      onChange={value => setInventoryFilters(current => ({ ...current, locationTagId: value }))}
                      placeholder="Search location tag"
                      ariaLabel="Search location tag"
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Item</span>
                    <input
                      className="input"
                      value={inventoryFilters.itemQuery}
                      onChange={event => setInventoryFilters(current => ({ ...current, itemQuery: event.target.value }))}
                      placeholder="Search item code, name, or batch"
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Last Updated From</span>
                    <input
                      className="input"
                      type="date"
                      value={inventoryFilters.updatedFrom}
                      onChange={event => setInventoryFilters(current => ({ ...current, updatedFrom: event.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Last Updated To</span>
                    <input
                      className="input"
                      type="date"
                      value={inventoryFilters.updatedTo}
                      onChange={event => setInventoryFilters(current => ({ ...current, updatedTo: event.target.value }))}
                    />
                  </label>
                  <label className="field report-checkbox-field">
                    <span className="field-label">Inspection Detail</span>
                    <ReportToggle
                      checked={inventoryFilters.inspectionWise}
                      onChange={checked => setInventoryFilters(current => ({ ...current, inspectionWise: checked }))}
                      label="Show inspection certificate wise distribution"
                    />
                  </label>
                  <div className={styles.filterActions}>
                    <Button type="button" size="sm" onClick={loadReport} disabled={loading}>
                      Apply Filters
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const scope = scopeOptions.default[0] ?? scopeOptions.options[0]?.id ?? "all";
                        setInventoryFilters({ scope, locationId: "", locationTagId: "", itemQuery: "", categoryType: "", updatedFrom: "", updatedTo: "", inspectionWise: false });
                        void loadInventoryFilterRows(scope);
                      }}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              ) : isPendingAcknowledgement ? (
                <div className={styles.filters}>
                  <label className="field">
                    <span className="field-label">From Location</span>
                    <select
                      className="input"
                      value={pendingFilters.fromLocation}
                      onChange={event => setPendingFilters(current => ({ ...current, fromLocation: event.target.value }))}
                    >
                      <option value="">All source locations</option>
                      {pendingFromLocationOptions.map(option => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">To Location</span>
                    <select
                      className="input"
                      value={pendingFilters.toLocation}
                      onChange={event => setPendingFilters(current => ({ ...current, toLocation: event.target.value }))}
                    >
                      <option value="">All destination locations</option>
                      {pendingToLocationOptions.map(option => (
                        <option key={option.id} value={option.id}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Item</span>
                    <input
                      className="input"
                      value={pendingFilters.itemQuery}
                      onChange={event => setPendingFilters(current => ({ ...current, itemQuery: event.target.value }))}
                      placeholder="Search entry, item, or batch"
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Created By</span>
                    <select
                      className="input"
                      value={pendingFilters.createdBy}
                      onChange={event => setPendingFilters(current => ({ ...current, createdBy: event.target.value }))}
                    >
                      <option value="">All users</option>
                      {pendingCreatedByOptions.map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Created From</span>
                    <input
                      className="input"
                      type="date"
                      value={pendingFilters.createdFrom}
                      onChange={event => setPendingFilters(current => ({ ...current, createdFrom: event.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Created To</span>
                    <input
                      className="input"
                      type="date"
                      value={pendingFilters.createdTo}
                      onChange={event => setPendingFilters(current => ({ ...current, createdTo: event.target.value }))}
                    />
                  </label>
                  <div className={styles.filterActions}>
                    <Button type="button" size="sm" onClick={loadReport} disabled={loading}>
                      Apply Filters
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPendingFilters({ fromLocation: "", toLocation: "", itemQuery: "", createdBy: "", createdFrom: "", createdTo: "" })}
                    >
                      Clear
                    </Button>
                  </div>
                </div>
              ) : isAssetCustody ? (
                <div className={styles.filters}>
                  <label className="field"><span className="field-label">Store</span><select className="input" value={assetFilters.sourceLocation} onChange={event => setAssetFilters(current => ({ ...current, sourceLocation: event.target.value }))}><option value="">All source stores</option>{assetSourceOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
                  <label className="field"><span className="field-label">Employee</span><select className="input" value={assetFilters.person} onChange={event => setAssetFilters(current => ({ ...current, person: event.target.value }))}><option value="">All employees</option>{assetPersonOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
                  <label className="field"><span className="field-label">Non-Store Location</span><select className="input" value={assetFilters.targetLocation} onChange={event => setAssetFilters(current => ({ ...current, targetLocation: event.target.value }))}><option value="">All non-store locations</option>{assetTargetOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
                  <label className="field"><span className="field-label">Item</span><input className="input" value={assetFilters.itemQuery} onChange={event => setAssetFilters(current => ({ ...current, itemQuery: event.target.value }))} placeholder="Search item, subcategory, holder, store, or evidence" /></label>
                  <label className="field"><span className="field-label">Position Status</span><select className="input" value={assetFilters.status} onChange={event => setAssetFilters(current => ({ ...current, status: event.target.value }))}><option value="">All positions</option>{assetStatusOptions.map(option => <option key={option} value={option}>{option}</option>)}</select></label>
                  <label className="field"><span className="field-label">Recorded From</span><input className="input" type="date" value={assetFilters.allocatedFrom} onChange={event => setAssetFilters(current => ({ ...current, allocatedFrom: event.target.value }))} /></label>
                  <label className="field"><span className="field-label">Recorded To</span><input className="input" type="date" value={assetFilters.allocatedTo} onChange={event => setAssetFilters(current => ({ ...current, allocatedTo: event.target.value }))} /></label>
                  <label className="field report-checkbox-field">
                    <span className="field-label">Inspection Detail</span>
                    <ReportToggle
                      checked={assetFilters.inspectionWise}
                      onChange={checked => setAssetFilters(current => ({ ...current, inspectionWise: checked }))}
                      label="Show inspection certificate evidence"
                    />
                  </label>
                  <div className={styles.filterActions}><Button type="button" size="sm" onClick={loadReport} disabled={loading}>Apply Filters</Button><Button type="button" variant="outline" size="sm" onClick={() => setAssetFilters({ sourceLocation: "", person: "", targetLocation: "", itemQuery: "", status: "", allocatedFrom: "", allocatedTo: "", inspectionWise: false })}>Clear</Button></div>
                </div>
              ) : isMovementLedger ? (
                <div className={styles.filters}>
                  <label className="field"><span className="field-label">Date From</span><input className="input" type="date" value={movementFilters.dateFrom} onChange={event => setMovementFilters(current => ({ ...current, dateFrom: event.target.value }))} /></label>
                  <label className="field"><span className="field-label">Date To</span><input className="input" type="date" value={movementFilters.dateTo} onChange={event => setMovementFilters(current => ({ ...current, dateTo: event.target.value }))} /></label>
                  <label className="field"><span className="field-label">Item</span><input className="input" value={movementFilters.itemQuery} onChange={event => setMovementFilters(current => ({ ...current, itemQuery: event.target.value }))} placeholder="Search item or entry" /></label>
                  <label className="field"><span className="field-label">Location</span><select className="input" value={movementFilters.location} onChange={event => setMovementFilters(current => ({ ...current, location: event.target.value, stockRegister: "" }))}><option value="">All locations</option>{movementLocationOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
                  <label className="field"><span className="field-label">Batch</span><select className="input" value={movementFilters.batch} onChange={event => setMovementFilters(current => ({ ...current, batch: event.target.value }))}><option value="">All batches</option>{movementBatchOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
                  <label className="field"><span className="field-label">Instance / Serial</span><input className="input" value={movementFilters.instanceSerial} onChange={event => setMovementFilters(current => ({ ...current, instanceSerial: event.target.value }))} placeholder="Search serial" /></label>
                  {movementFilters.location ? (
                    <label className="field"><span className="field-label">Stock Register</span><select className="input" value={movementFilters.stockRegister} onChange={event => setMovementFilters(current => ({ ...current, stockRegister: event.target.value }))}><option value="">All registers</option>{movementRegisterOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
                  ) : null}
                  <div className={styles.filterActions}><Button type="button" size="sm" onClick={loadReport} disabled={loading}>Apply Filters</Button><Button type="button" variant="outline" size="sm" onClick={() => setMovementFilters({ dateFrom: "", dateTo: "", itemQuery: "", location: "", batch: "", instanceSerial: "", stockRegister: "" })}>Clear</Button></div>
                </div>
              ) : isCorrectionControl ? (
                <div className={styles.filters}>
                  <label className="field"><span className="field-label">Requested From</span><input className="input" type="date" value={correctionFilters.dateFrom} onChange={event => setCorrectionFilters(current => ({ ...current, dateFrom: event.target.value }))} /></label>
                  <label className="field"><span className="field-label">Requested To</span><input className="input" type="date" value={correctionFilters.dateTo} onChange={event => setCorrectionFilters(current => ({ ...current, dateTo: event.target.value }))} /></label>
                  <label className="field"><span className="field-label">Status</span><select className="input" value={correctionFilters.status} onChange={event => setCorrectionFilters(current => ({ ...current, status: event.target.value }))}><option value="">All statuses</option>{correctionStatusOptions.map(option => <option key={option} value={option}>{option}</option>)}</select></label>
                  <label className="field"><span className="field-label">Resolution Type</span><select className="input" value={correctionFilters.resolutionType} onChange={event => setCorrectionFilters(current => ({ ...current, resolutionType: event.target.value }))}><option value="">All resolutions</option>{correctionResolutionOptions.map(option => <option key={option} value={option}>{option}</option>)}</select></label>
                  <label className="field"><span className="field-label">Requested By</span><select className="input" value={correctionFilters.requestedBy} onChange={event => setCorrectionFilters(current => ({ ...current, requestedBy: event.target.value }))}><option value="">All users</option>{correctionRequesterOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
                  <div className={styles.filterActions}><Button type="button" size="sm" onClick={loadReport} disabled={loading}>Apply Filters</Button><Button type="button" variant="outline" size="sm" onClick={() => setCorrectionFilters({ dateFrom: "", dateTo: "", status: "", resolutionType: "", requestedBy: "" })}>Clear</Button></div>
                </div>
              ) : isProcurementTrace ? (
                <div className={styles.traceLookup}>
                  <label className="field">
                    <span className="field-label">Inspection Certificate / Invoice</span>
                    <ThemedSelect
                      value={procurementFilters.inspectionId}
                      options={inspectionCertificateOptions}
                      onChange={value => {
                        setProcurementFilters({ inspectionId: value });
                      }}
                      placeholder="Search contract or invoice number"
                      ariaLabel="Search inspection certificate"
                    />
                  </label>
                  {selectedTraceInspection ? (
                    <div className={styles.traceSelectionMeta}>
                      <span><strong>Contractor</strong>{selectedTraceInspection.contractor_name ?? "-"}</span>
                      <span><strong>Department</strong>{selectedTraceInspection.department_name ?? "-"}</span>
                      <span><strong>Stage</strong>{selectedTraceInspection.stage}</span>
                      <span><strong>Status</strong>{selectedTraceInspection.status}</span>
                    </div>
                  ) : null}
                  <div className={styles.traceLookupActions}>
                    <Button type="button" size="sm" onClick={generateProcurementTraceReport} disabled={loading || !procurementFilters.inspectionId}>
                      {loading ? "Generating..." : "Generate Report"}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => {
                      setProcurementFilters({ inspectionId: "" });
                      setView({ metrics: [], columns: ["Stage", "Recorded At", "Recorded By", "Evidence", "Status"], rows: [], traceRows: [], note: "Select an inspection certificate to generate its procurement-to-register trace." });
                    }}>
                      Clear
                    </Button>
                  </div>
                </div>
              ) : (
                <div className={styles.filters}>
                  {selected.filters.map(filter => (
                    <label key={filter} className="field">
                      <span className="field-label">{filter}</span>
                      <select className="input" defaultValue="" disabled>
                        <option value="">All accessible live records</option>
                      </select>
                    </label>
                  ))}
                </div>
              )}
            </details>

            <div className={styles.metricGrid}>
              {(view?.metrics ?? []).map(metric => (
                <div key={metric.label} className={styles.metric}>
                  <span className={`${styles.metricIcon} ${styles[metric.tone ?? "blue"]}`}>
                    <Icon>{metricIcon(metric.tone)}</Icon>
                  </span>
                  <span>
                    <span className={styles.metricLabel}>{metric.label}</span>
                    <strong>{metric.value}</strong>
                    <span className={styles.metricHint}>{metric.hint}</span>
                  </span>
                </div>
              ))}
            </div>

            {selected.id === "university-snapshot" && view ? <SnapshotVisuals view={view} /> : null}

            {(!isProcurementTrace || Boolean(view?.rows.length)) ? <section className={styles.results}>
              <div className={styles.resultsHead}>
                <span className="eyebrow">Results</span>
                <span className="mono">{loading ? "Loading live data..." : `1 - ${view?.rows.length ?? 0} rows`}</span>
              </div>
              <div className={styles.tableWrap}>
                <table>
                  <thead>
                    <tr>
                      {(view?.columns ?? []).map(column => <th key={column}>{column}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {!loading && view && view.rows.length === 0 ? (
                      <tr>
                        <td colSpan={view.columns.length || 1}>
                          <div className={styles.emptyState}>No records returned by the backend for this report.</div>
                        </td>
                      </tr>
                    ) : null}
                    {(view?.rows ?? []).map((row, rowIndex) => (
                      <tr key={`${selected.id}-${rowIndex}`}>
                        {row.map((cell, index) => (
                          <td key={`${cell}-${index}`}>
                            {isStatusCell(view?.columns[index] ?? "", cell) ? <span className={`${styles.status} ${statusClass(cell)}`}>{cell}</span> : cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="table-card-foot">
                <div className="eyebrow">{view?.note ?? "Live report data only. No mock data is rendered."}</div>
                <div className="pager">
                  <Button type="button" variant="outline" size="xs" disabled>‹ Prev</Button>
                  <span className="mono pager-current">1</span>
                  <Button type="button" variant="outline" size="xs" disabled>Next ›</Button>
                </div>
              </div>
            </section> : null}
          </main>
        </div>
      </div>
    </div>
  );
}

function SnapshotVisuals({ view }: { view: ReportView }) {
  return (
    <div className={styles.snapshotGrid}>
      <div className={styles.chartCard}>
        <h3>Asset value by department (WDV)</h3>
        <div className={styles.donut} />
        <div className={styles.legend}>
          <span><i className={styles.dotBlue} />Fixed asset register</span>
          <span><i className={styles.dotGreen} />Depreciation entries</span>
          <span><i className={styles.dotAmber} />Inspection evidence</span>
        </div>
      </div>
      <div className={styles.chartCard}>
        <h3>Stock status distribution</h3>
        <div className={styles.ring} />
        <div className={styles.legend}>
          <span><i className={styles.dotGreen} />Available</span>
          <span><i className={styles.dotAmber} />Allocated</span>
          <span><i className={styles.dotBlue} />In transit</span>
        </div>
      </div>
      <div className={styles.chartCard}>
        <h3>Inspection stage aging</h3>
        <div className={styles.bars}>
          <span style={{ height: "42%" }} />
          <span style={{ height: "58%" }} />
          <span style={{ height: "88%" }} />
          <span style={{ height: "52%" }} />
        </div>
      </div>
      <div className={styles.printPreview}>
        <div className={styles.printHeader}>
          <img src="/ned_seal.webp" alt="NED University" />
          <div>
            <strong>NED UNIVERSITY OF ENGINEERING & TECHNOLOGY</strong>
            <span>Asset Management System</span>
          </div>
        </div>
        <h3>University Asset Snapshot</h3>
        <table>
          <tbody>
            {view.metrics.slice(0, 5).map(metric => (
              <tr key={metric.label}><td>{metric.label}</td><td>{metric.value}</td></tr>
            ))}
          </tbody>
        </table>
        <p>Printable HTML preview. Values are populated from current API responses.</p>
      </div>
    </div>
  );
}
