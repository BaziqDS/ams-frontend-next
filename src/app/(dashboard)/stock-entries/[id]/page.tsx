"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { apiFetch, type Page } from "@/lib/api";
import { useCan, useCapabilities } from "@/contexts/CapabilitiesContext";
import {
  buildFullReversalPayload,
  describeQuantityCorrectionChange,
  getCorrectionModeCopy,
  getQuantityCorrectionUiCopy,
  validateFullReversalRequest,
  type CorrectionMode,
} from "@/lib/stockEntryCorrectionRules";

type EntryType = "RECEIPT" | "ISSUE" | "RETURN";
type EntryStatus = "DRAFT" | "PENDING_ACK" | "COMPLETED" | "REJECTED" | "CANCELLED";
type CorrectionStatus = "REQUESTED" | "APPROVED" | "APPLIED" | "REJECTED" | "BLOCKED";

interface StockRegisterRecord {
  id: number;
  register_number: string;
  store: number;
  store_name?: string | null;
  is_active: boolean;
}

interface StockEntryItemInstance {
  id: number;
  item: number;
  batch: number | null;
  current_location: number | null;
  status: string;
  item_name?: string | null;
  item_code?: string | null;
  serial_number?: string | null;
  qr_code?: string | null;
  location_name?: string | null;
  full_location_path?: string | null;
}

interface StockEntryItemRecord {
  id: number;
  item: number;
  item_name?: string | null;
  batch: number | null;
  batch_number?: string | null;
  quantity: number;
  instances: number[];
  stock_register: number | null;
  stock_register_name?: string | null;
  page_number: number | null;
  ack_stock_register: number | null;
  ack_stock_register_name?: string | null;
  ack_page_number: number | null;
  accepted_quantity: number | null;
  accepted_instances: number[];
}

interface StockEntryRecord {
  id: number;
  entry_type: EntryType;
  entry_number: string;
  entry_date: string;
  inspection_certificate?: number | null;
  inspection_certificate_number?: string | null;
  from_location: number | null;
  from_location_name?: string | null;
  to_location: number | null;
  to_location_name?: string | null;
  issued_to: number | null;
  issued_to_name?: string | null;
  status: EntryStatus;
  remarks: string | null;
  purpose: string | null;
  items: StockEntryItemRecord[];
  reference_entry?: number | null;
  reference_purpose?: string | null;
  acknowledged_by?: number | null;
  acknowledged_by_name?: string | null;
  acknowledged_at?: string | null;
  cancelled_by_name?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  created_by_name?: string | null;
  created_at: string;
  can_acknowledge?: boolean;
  can_cancel?: boolean;
  can_correct?: boolean;
  can_request_reversal?: boolean;
  active_correction?: CorrectionSummary | null;
  correction_status?: CorrectionStatus | null;
  generated_correction_entries?: RelatedEntrySummary[];
  replacement_entry?: RelatedEntrySummary | null;
}

interface RelatedEntries {
  reference: StockEntryRecord | null;
  children: StockEntryRecord[];
  linkedReceipt: StockEntryRecord | null;
  generatedReturns: StockEntryRecord[];
}

interface RelatedEntrySummary {
  id: number;
  entry_number: string;
  entry_type: EntryType;
  status: EntryStatus;
  reference_purpose?: string | null;
}

interface CorrectionSummary {
  id: number;
  original_entry?: number;
  status: CorrectionStatus;
  resolution_type: string;
  reason: string;
  message?: string | null;
  requested_at?: string | null;
  applied_at?: string | null;
}

interface CorrectionPreviewLine {
  id: number;
  item: number;
  item_name: string;
  original_quantity: number;
  corrected_quantity: number;
  delta: number;
  resolution_type: string;
  message: string;
  affected_instances: number[];
}

interface CorrectionPreview {
  resolution_type: string;
  message: string;
  lines: CorrectionPreviewLine[];
}

interface CorrectionSubmitResult extends CorrectionSummary {
  original_entry?: number;
  generated_entries?: RelatedEntrySummary[];
  lines?: Array<{
    id: number;
    original_item: number;
    original_quantity: number;
    corrected_quantity: number;
    delta: number;
    affected_instances: number[];
  }>;
}

type LineResolution = {
  accepted: number | null;
  returned: number | null;
  mirror: StockEntryItemRecord | null;
};

const Ic = ({ d, size = 16 }: { d: ReactNode | string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true" focusable="false">
    {typeof d === "string" ? <path d={d} /> : d}
  </svg>
);

function normalizeList<T>(data: Page<T> | T[]): T[] {
  return Array.isArray(data) ? data : data.results;
}

function formatLabel(value: string | null | undefined, fallback = "-") {
  if (!value) return fallback;
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, char => char.toUpperCase());
}

function formatDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function initials(value: string | null | undefined) {
  return (value || "NA").split(" ").map(part => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
}

function instanceIdentifier(instance: StockEntryItemInstance | undefined, fallbackId: number) {
  return instance?.qr_code?.trim()
    || instance?.serial_number?.trim()
    || `ID ${fallbackId}`;
}

function signature(value: string | null | undefined) {
  if (!value) return "Pending";
  const parts = value.split(/[.\s_@-]+/).filter(Boolean);
  if (parts.length === 1) return parts[0];
  return `${parts[0][0]}. ${parts[parts.length - 1]}`;
}

function formatRegisterRef(name: string | null | undefined, page: number | null | undefined, fallback: string) {
  if (!name && !page) return fallback;
  return `${name ?? "Register"}${page ? ` / pg ${page}` : ""}`;
}

function correctionSubmittedMessage(correction: CorrectionSubmitResult) {
  if (correction.status === "APPLIED") {
    const generatedCount = correction.generated_entries?.length ?? 0;
    return generatedCount
      ? `Correction applied. ${generatedCount} generated movement record${generatedCount === 1 ? " is" : "s are"} linked below.`
      : "Correction applied. The stock balance has been updated.";
  }

  if (correction.status === "REQUESTED") {
    return "Correction request submitted. It is waiting for approval before stock is moved.";
  }

  if (correction.status === "BLOCKED") {
    return correction.message || "Correction is blocked because stock cannot be safely reversed from the current state.";
  }

  return `Correction ${formatLabel(correction.status)}. ${correction.message || "Refresh the entry to review the latest status."}`;
}

function firstRegisterRef(entry: StockEntryRecord) {
  const item = entry.items.find(candidate => candidate.stock_register_name || candidate.page_number);
  if (!item) return "Register pending";
  return formatRegisterRef(item.stock_register_name, item.page_number, "Register pending");
}

function firstAckRegisterRef(entry: StockEntryRecord, related: RelatedEntries) {
  if (hasImplicitInspectionSource(entry)) return firstRegisterRef(entry);
  const items = entry.entry_type === "ISSUE" ? related.linkedReceipt?.items ?? [] : entry.items;
  const item = items.find(candidate => candidate.ack_stock_register_name || candidate.ack_page_number);
  if (!item) return "Register pending";
  return formatRegisterRef(item.ack_stock_register_name, item.ack_page_number, "Register pending");
}

function voucherTitle(entry: StockEntryRecord) {
  return entry.entry_number;
}

function relevantRegisterRef(entry: StockEntryRecord, related: RelatedEntries) {
  if (entry.entry_type === "ISSUE") return firstRegisterRef(entry);
  return firstAckRegisterRef(entry, related);
}

function entryDateVerb(entry: StockEntryRecord) {
  if (entry.entry_type === "RECEIPT") return "Received";
  if (entry.entry_type === "RETURN") return "Returned";
  return "Issued";
}

function quantityLabel(entry: StockEntryRecord) {
  if (entry.entry_type === "RECEIPT") return "Received Quantity";
  if (entry.entry_type === "RETURN") return "Returned Quantity";
  return "Issued Quantity";
}

function quantityVerb(entry: StockEntryRecord) {
  if (entry.entry_type === "RECEIPT") return "received";
  if (entry.entry_type === "RETURN") return "returned";
  return "issued";
}

function hasImplicitInspectionSource(entry: StockEntryRecord) {
  return entry.entry_type === "RECEIPT" && entry.from_location == null && entry.issued_to == null;
}

function acknowledgementMeta(entry: StockEntryRecord, related: RelatedEntries) {
  if (hasImplicitInspectionSource(entry)) {
    return {
      by: null as string | null,
      at: null as string | null,
      pendingLabel: "-",
      signatureLabel: "-",
      isPending: false,
      isRequired: false,
    };
  }

  const by = entry.entry_type === "ISSUE" ? related.linkedReceipt?.acknowledged_by_name ?? null : entry.acknowledged_by_name ?? null;
  const at = entry.entry_type === "ISSUE" ? related.linkedReceipt?.acknowledged_at ?? null : entry.acknowledged_at ?? null;

  return {
    by,
    at,
    pendingLabel: by ?? "Pending acknowledgement",
    signatureLabel: at ? signature(by) : "Pending",
    isPending: !at,
    isRequired: true,
  };
}

function entryTarget(entry: StockEntryRecord) {
  return entry.issued_to_name ?? entry.to_location_name ?? "-";
}

function typeSummary(entry: StockEntryRecord) {
  if (entry.entry_type === "ISSUE") {
    return {
      eyebrow: "Dispatch record",
      title: "Store dispatch and movement control",
      stripNote: entry.status === "PENDING_ACK"
        ? "Stock remains in transit until the receiving side acknowledges the movement."
        : "Dispatch status is derived from the linked receiving side acknowledgement.",
      sourceLabel: "Source",
      targetLabel: "Destination",
    };
  }
  if (entry.entry_type === "RETURN") {
    return {
      eyebrow: "Return record",
      title: "Rejected stock returning to source",
      stripNote: entry.status === "PENDING_ACK"
        ? "Return stock is waiting for the original source store to receive it back."
        : "Returned stock has been acknowledged by the source store.",
      sourceLabel: "Returning From",
      targetLabel: "Returning To",
    };
  }
  return {
    eyebrow: "Receiving record",
    title: "Receipt acknowledgement and acceptance outcome",
    stripNote: entry.status === "PENDING_ACK"
      ? "Receiving side still needs to confirm accepted quantities or instances."
      : "Accepted and returned quantities are recorded against the original receipt lines.",
    sourceLabel: "Received From",
    targetLabel: "Receiving Side",
  };
}

function statusTone(status: EntryStatus) {
  if (status === "COMPLETED") return "pill-success";
  if (status === "CANCELLED" || status === "REJECTED") return "pill-neutral";
  return "pill-warning";
}

function StatusPill({ status }: { status: EntryStatus }) {
  return (
    <span className={`pill ${statusTone(status)}`}>
      <span className={`status-dot ${status === "COMPLETED" ? "active" : "inactive"}`} />
      {formatLabel(status)}
    </span>
  );
}

function Alert({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: "12px 16px", background: "var(--danger-weak)", border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)", borderRadius: "var(--radius)", color: "var(--danger)", fontSize: 13, marginBottom: 16 }}>
      {children}
    </div>
  );
}

function Panel({ eyebrow, title, actions, children }: { eyebrow: string; title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="table-card" style={{ overflow: "hidden" }}>
      <div className="table-card-head" style={{ paddingTop: 12, paddingBottom: 12 }}>
        <div className="table-card-head-left">
          <div className="eyebrow">{eyebrow}</div>
          <div style={{ color: "var(--ink)", fontWeight: 600 }}>{title}</div>
        </div>
        {actions}
      </div>
      <div style={{ padding: "12px 16px" }}>{children}</div>
    </section>
  );
}

function MetaRow({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div style={{ display: "grid", gap: 3, padding: "8px 0", borderBottom: "1px solid var(--hairline)" }}>
      <div className="eyebrow">{label}</div>
      <div style={{ color: "var(--ink)", fontWeight: 550 }}>{value}</div>
      {sub && <div className="login-cell-sub mono">{sub}</div>}
    </div>
  );
}

function RelatedEntryLink({ entry, label }: { entry: StockEntryRecord; label: string }) {
  return (
    <Link href={`/stock-entries/${entry.id}`} style={{ display: "grid", gap: 3, padding: "8px 0", borderBottom: "1px solid var(--hairline)", color: "inherit", textDecoration: "none" }}>
      <div className="eyebrow">{label}</div>
      <div style={{ color: "var(--ink)", fontWeight: 550 }}>{entry.entry_number}</div>
      <div className="login-cell-sub mono">{formatLabel(entry.entry_type)} / {formatLabel(entry.status)}</div>
    </Link>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <div className="field-label">{label}</div>
      {children}
    </div>
  );
}

function findReceiptMirror(receipt: StockEntryRecord | null, item: StockEntryItemRecord) {
  if (!receipt) return null;
  return receipt.items.find(candidate => (
    candidate.item === item.item &&
    candidate.batch === item.batch &&
    candidate.quantity === item.quantity &&
    candidate.instances.length === item.instances.length
  )) ?? receipt.items.find(candidate => candidate.item === item.item && candidate.batch === item.batch) ?? null;
}

function findReferenceMirror(reference: StockEntryRecord | null, item: StockEntryItemRecord) {
  if (!reference) return null;
  return reference.items.find(candidate => (
    candidate.item === item.item &&
    candidate.batch === item.batch &&
    candidate.quantity === item.quantity
  )) ?? reference.items.find(candidate => candidate.item === item.item && candidate.batch === item.batch)
    ?? reference.items.find(candidate => candidate.item === item.item)
    ?? null;
}

function effectiveInstances(entry: StockEntryRecord, item: StockEntryItemRecord, related: RelatedEntries) {
  if (item.instances.length > 0) return item.instances;
  if (entry.entry_type === "RECEIPT") {
    return findReferenceMirror(related.reference, item)?.instances ?? [];
  }
  return item.instances;
}

function resolveLine(entry: StockEntryRecord, item: StockEntryItemRecord, related: RelatedEntries): LineResolution {
  const mirror = entry.entry_type === "ISSUE" ? findReceiptMirror(related.linkedReceipt, item) : null;
  if (hasImplicitInspectionSource(entry)) {
    const accepted = item.accepted_quantity ?? item.quantity;
    return { accepted, returned: Math.max(0, item.quantity - accepted), mirror };
  }
  const accepted = item.accepted_quantity ?? mirror?.accepted_quantity ?? null;
  const returned = accepted == null ? null : Math.max(0, item.quantity - accepted);
  return { accepted, returned, mirror };
}

function lineRegisterRef(entry: StockEntryRecord, item: StockEntryItemRecord, line: LineResolution) {
  if (entry.entry_type === "ISSUE" || hasImplicitInspectionSource(entry)) {
    return formatRegisterRef(item.stock_register_name, item.page_number, "-");
  }

  const ackName = line.mirror?.ack_stock_register_name ?? item.ack_stock_register_name;
  const ackPage = line.mirror?.ack_page_number ?? item.ack_page_number;
  return formatRegisterRef(ackName, ackPage, "-");
}

function trackingLabel(entry: StockEntryRecord, item: StockEntryItemRecord, related: RelatedEntries) {
  return effectiveInstances(entry, item, related).length > 0 ? "Individual" : "Quantity";
}

function selectableCorrectionInstances(entry: StockEntryRecord, item: StockEntryItemRecord, related: RelatedEntries, allInstances: StockEntryItemInstance[], delta: number) {
  if (delta === 0) return [];
  const currentInstanceIds = effectiveInstances(entry, item, related);
  const isReturnFromAllocation = entry.entry_type === "RECEIPT" && Boolean(entry.issued_to || entry.from_location);

  if (delta < 0) return currentInstanceIds;
  if (isReturnFromAllocation) {
    return allInstances
      .filter(instance => Number(instance.item) === Number(item.item) && instance.status === "ALLOCATED")
      .map(instance => instance.id);
  }

  return allInstances
    .filter(instance => (
      Number(instance.item) === Number(item.item) &&
      Number(instance.current_location) === Number(entry.from_location) &&
      instance.status === "AVAILABLE"
    ))
    .map(instance => instance.id);
}

function totals(entry: StockEntryRecord, related: RelatedEntries) {
  return entry.items.reduce((acc, item) => {
    const line = resolveLine(entry, item, related);
    acc.lines += 1;
    acc.sent += item.quantity;
    acc.instances += item.instances.length;
    if (line.accepted != null) acc.accepted += line.accepted;
    if (line.returned != null) acc.returned += line.returned;
    return acc;
  }, { lines: 0, sent: 0, accepted: 0, returned: 0, instances: 0 });
}

function acknowledgementTotals(entry: StockEntryRecord, related: RelatedEntries) {
  if (hasImplicitInspectionSource(entry)) {
    const base = totals(entry, related);
    return { ...base, accepted: base.sent, returned: 0, pending: 0 };
  }
  const base = totals(entry, related);
  const hasAnyAcknowledgement = entry.items.some(item => resolveLine(entry, item, related).accepted != null);
  const accepted = hasAnyAcknowledgement ? base.accepted : null;
  const returned = hasAnyAcknowledgement ? base.returned : null;
  const pending = accepted == null ? base.sent : Math.max(0, base.sent - accepted - (returned ?? 0));
  return { ...base, accepted, returned, pending };
}

function uniqueRefs(values: Array<string | null>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value && value.trim()))));
}

function HeroStrip({ entry }: { entry: StockEntryRecord }) {
  const summary = typeSummary(entry);
  const isPersonTarget = Boolean(entry.issued_to_name);

  return (
    <section className="detail-card stock-movement-card">
      <header className="detail-card-head stock-movement-head">
        <div>
          <div className="eyebrow">{summary.eyebrow}</div>
          <h2>{summary.title}</h2>
        </div>
      </header>
      <div className="stock-movement-body">
        <div className="stock-movement-flow">
          <div className="stock-movement-node">
            <span className="stock-movement-icon">
              <Ic d="M3 21h18M5 21V7l8-4 6 3v15" size={15} />
            </span>
            <span className="stock-movement-copy">
              <span className="eyebrow">{summary.sourceLabel}</span>
              <strong>{entry.from_location_name ?? "System / Inspection"}</strong>
            </span>
          </div>

          <div className="stock-movement-mid" aria-label={`${formatLabel(entry.entry_type)} movement`}>
            <span>{formatLabel(entry.entry_type)}</span>
            <Ic d="M5 12h14M13 5l7 7-7 7" size={16} />
          </div>

          <div className="stock-movement-node stock-movement-node-target">
            <span className="stock-movement-icon">
              <Ic d={isPersonTarget ? "M20 21a8 8 0 10-16 0M12 11a4 4 0 100-8 4 4 0 000 8" : "M12 21s7-4.4 7-11a7 7 0 10-14 0c0 6.6 7 11 7 11z"} size={15} />
            </span>
            <span className="stock-movement-copy">
              <span className="eyebrow">{summary.targetLabel}</span>
              <strong>{entryTarget(entry)}</strong>
            </span>
          </div>
        </div>

        <div className="detail-muted-row stock-movement-note">{summary.stripNote}</div>
      </div>
    </section>
  );
}

function LifecyclePanel({ entry, related }: { entry: StockEntryRecord; related: RelatedEntries }) {
  const issueAckBy = entry.entry_type === "ISSUE" ? related.linkedReceipt?.acknowledged_by_name : entry.acknowledged_by_name;
  const issueAckAt = entry.entry_type === "ISSUE" ? related.linkedReceipt?.acknowledged_at : entry.acknowledged_at;

  return (
    <Panel eyebrow="Audit" title="Lifecycle">
      <div style={{ display: "grid" }}>
        <MetaRow label="Entry Date" value={formatDate(entry.entry_date)} sub="Movement document timestamp" />
        <MetaRow label="Created" value={entry.created_by_name ?? "Unknown"} sub={formatDate(entry.created_at)} />
        <MetaRow label={entry.entry_type === "RECEIPT" ? "Received / Acknowledged" : entry.entry_type === "RETURN" ? "Return Acknowledged" : "Dispatch Closed"} value={issueAckBy ?? (entry.status === "PENDING_ACK" ? "Pending" : "Not recorded")} sub={formatDate(issueAckAt)} />
        <MetaRow label="Cancelled" value={entry.cancelled_by_name ?? "No cancellation"} sub={formatDate(entry.cancelled_at)} />
      </div>
    </Panel>
  );
}

function RelatedRecordsPanel({ entry, related }: { entry: StockEntryRecord; related: RelatedEntries }) {
  return (
    <Panel eyebrow="Links" title="Related Records">
      <div style={{ display: "grid", gap: 10 }}>
        {related.reference ? <RelatedEntryLink entry={related.reference} label="Reference Entry" /> : <div className="login-cell-sub">No reference entry recorded.</div>}
        {entry.entry_type === "ISSUE" && related.linkedReceipt ? <RelatedEntryLink entry={related.linkedReceipt} label="Receiving Entry" /> : null}
        {entry.entry_type === "RECEIPT" && related.generatedReturns.length > 0 ? related.generatedReturns.map(child => <RelatedEntryLink key={child.id} entry={child} label="Generated Return" />) : null}
        {entry.entry_type !== "RECEIPT" && entry.entry_type !== "ISSUE" && related.children.length > 0 ? related.children.map(child => <RelatedEntryLink key={child.id} entry={child} label="Child Entry" />) : null}
        {entry.entry_type === "RECEIPT" && related.generatedReturns.length === 0 && !related.reference ? <div className="login-cell-sub">No generated returns or parent links recorded.</div> : null}
      </div>
    </Panel>
  );
}

function RegisterTrailPanel({ entry, related }: { entry: StockEntryRecord; related: RelatedEntries }) {
  const sourceRefs = uniqueRefs(entry.items.map(item => item.stock_register_name ? `${item.stock_register_name}${item.page_number ? ` / p.${item.page_number}` : ""}` : null));
  const receiptSource = related.linkedReceipt?.items ?? [];
  const ackRefs = uniqueRefs((entry.entry_type === "ISSUE" ? receiptSource : entry.items).map(item => item.ack_stock_register_name ? `${item.ack_stock_register_name}${item.ack_page_number ? ` / p.${item.ack_page_number}` : ""}` : null));

  return (
    <Panel eyebrow="Registers" title="Register Trail">
      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <div className="eyebrow">Source References</div>
          <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
            {sourceRefs.length ? sourceRefs.map(value => <div key={value} className="login-cell-sub mono">{value}</div>) : <div className="login-cell-sub">No source register recorded.</div>}
          </div>
        </div>
        <div>
          <div className="eyebrow">Destination References</div>
          <div style={{ display: "grid", gap: 6, marginTop: 6 }}>
            {ackRefs.length ? ackRefs.map(value => <div key={value} className="login-cell-sub mono">{value}</div>) : <div className="login-cell-sub">No acknowledgement register recorded yet.</div>}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function NotesPanel({ entry }: { entry: StockEntryRecord }) {
  return (
    <Panel eyebrow="Context" title="Purpose & Remarks">
      <div style={{ display: "grid" }}>
        <MetaRow label="Purpose" value={entry.purpose ?? "No purpose recorded"} />
        <MetaRow label="Remarks" value={entry.remarks ?? "No remarks recorded."} />
        {entry.cancellation_reason && (
          <div style={{ border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)", background: "var(--danger-weak)", color: "var(--danger)", borderRadius: "var(--radius)", padding: 10, marginTop: 8 }}>
            <strong>Cancellation:</strong> {entry.cancellation_reason}
          </div>
        )}
      </div>
    </Panel>
  );
}

function MovementOverview({ entry, related }: { entry: StockEntryRecord; related: RelatedEntries }) {
  const summary = typeSummary(entry);
  const sourceRefs = uniqueRefs(entry.items.map(item => item.stock_register_name ? `${item.stock_register_name}${item.page_number ? ` / p.${item.page_number}` : ""}` : null));
  const receiverItems = entry.entry_type === "ISSUE" ? related.linkedReceipt?.items ?? [] : entry.items;
  const ackRefs = uniqueRefs(receiverItems.map(item => item.ack_stock_register_name ? `${item.ack_stock_register_name}${item.ack_page_number ? ` / p.${item.ack_page_number}` : ""}` : null));

  return (
    <div className="card card-pad">
      <div className="kv-grid cols-2">
        <div className="kv">
          <div className="kv-label">{summary.sourceLabel}</div>
          <div className="kv-value">{entry.from_location_name ?? "System / inspection source"}</div>
          <div className="kv-sub">Source side of this movement</div>
        </div>
        <div className="kv">
          <div className="kv-label">{summary.targetLabel}</div>
          <div className="kv-value">{entryTarget(entry)}</div>
          <div className="kv-sub">{entry.issued_to_name ? "Issued to person" : "Destination location"}</div>
        </div>
        <div className="kv">
          <div className="kv-label">Source Register</div>
          <div className="kv-value mono">{sourceRefs.length ? sourceRefs.join(", ") : "Not recorded"}</div>
        </div>
        <div className="kv">
          <div className="kv-label">Acknowledgement Register</div>
          <div className="kv-value mono">{ackRefs.length ? ackRefs.join(", ") : "Pending"}</div>
        </div>
        <div className="kv" style={{ gridColumn: "1 / -1" }}>
          <div className="kv-label">Purpose / Remarks</div>
          <div className="kv-value">{entry.purpose ?? entry.remarks ?? "No purpose or remarks recorded."}</div>
          {entry.purpose && entry.remarks ? <div className="kv-sub">{entry.remarks}</div> : null}
        </div>
      </div>
    </div>
  );
}

function StockStats({ entry, related }: { entry: StockEntryRecord; related: RelatedEntries }) {
  const stats = acknowledgementTotals(entry, related);
  const sourceRefs = uniqueRefs(entry.items.map(item => item.stock_register_name ? item.stock_register_name : null));
  const receiverItems = entry.entry_type === "ISSUE" ? related.linkedReceipt?.items ?? [] : entry.items;
  const ackRefs = uniqueRefs(receiverItems.map(item => item.ack_stock_register_name ? item.ack_stock_register_name : null));
  const registerCount = new Set([...sourceRefs, ...ackRefs]).size;

  return (
    <div className="stat-strip" style={{ marginBottom: 16 }}>
      <div className="stat stat-accent">
        <div className="stat-label">Line Items</div>
        <div className="stat-value">{stats.lines}</div>
        <div className="stat-sub">{stats.instances ? `${stats.instances} tracked instances` : "quantity tracked"}</div>
      </div>
      <div className="stat">
        <div className="stat-label">{quantityLabel(entry)}</div>
        <div className="stat-value">{stats.sent}</div>
        <div className="stat-sub">Original {formatLabel(entry.entry_type).toLowerCase()} quantity</div>
      </div>
      <div className="stat">
        <div className="stat-label">Acknowledged</div>
        <div className="stat-value">{stats.accepted ?? "-"}</div>
        <div className="stat-sub">{stats.pending > 0 ? `${stats.pending} pending` : "receiver side recorded"}</div>
      </div>
      <div className="stat">
        <div className="stat-label">Register Refs</div>
        <div className="stat-value">{registerCount || "-"}</div>
        <div className="stat-sub">source and acknowledgement books</div>
      </div>
    </div>
  );
}

function MovementWorkflow({ entry, related }: { entry: StockEntryRecord; related: RelatedEntries }) {
  const issueAckBy = entry.entry_type === "ISSUE" ? related.linkedReceipt?.acknowledged_by_name : entry.acknowledged_by_name;
  const issueAckAt = entry.entry_type === "ISSUE" ? related.linkedReceipt?.acknowledged_at : entry.acknowledged_at;
  const isCancelled = entry.status === "CANCELLED" || entry.status === "REJECTED";
  const isDone = entry.status === "COMPLETED";

  return (
    <div className="workflow" style={{ gridTemplateColumns: "repeat(3, 1fr)", marginBottom: 16 }}>
      <div className="wf-step done">
        <div className="wf-marker"><span className="wf-num">1</span><span className="wf-label">Issued</span></div>
        <div className="wf-meta"><span className="who">{entry.created_by_name ?? "Unknown"}</span><span className="when">{formatDate(entry.created_at)}</span></div>
        <div className="wf-bar" />
      </div>
      <div className={`wf-step ${entry.status === "PENDING_ACK" ? "active" : isDone ? "done" : isCancelled ? "rejected" : ""}`}>
        <div className="wf-marker"><span className="wf-num">2</span><span className="wf-label">Acknowledgement</span></div>
        <div className="wf-meta"><span className="who">{issueAckBy ?? "Receiving side pending"}</span><span className="when">{issueAckAt ? formatDate(issueAckAt) : "Awaiting receiver register"}</span></div>
        <div className="wf-bar" />
      </div>
      <div className={`wf-step ${isDone ? "done" : isCancelled ? "rejected" : ""}`}>
        <div className="wf-marker"><span className="wf-num">3</span><span className="wf-label">{isCancelled ? "Cancelled" : "Closed"}</span></div>
        <div className="wf-meta"><span className="who">{isCancelled ? entry.cancelled_by_name ?? "Cancelled" : isDone ? "Movement complete" : "Not closed"}</span><span className="when">{isCancelled ? formatDate(entry.cancelled_at) : isDone ? formatDate(issueAckAt) : "Pending acknowledgement"}</span></div>
        <div className="wf-bar" />
      </div>
    </div>
  );
}

function DetailSwitcher() {
  return (
    <div className="stock-detail-switcher">
      <button className="ds-btn" data-active="true" type="button">
        <Ic d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6" size={13} />
        Stock Entry — detail
      </button>
      <button className="ds-btn" data-active="false" type="button">
        <Ic d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" size={13} />
        Inspection Certificate — detail
      </button>
      <span className="stock-detail-switcher-note">prototype: switch between the two detail page designs</span>
    </div>
  );
}

function StockVoucherHead({ entry, related }: { entry: StockEntryRecord; related: RelatedEntries }) {
  const summary = typeSummary(entry);
  const entryAt = formatDate(entry.entry_date);
  const register = relevantRegisterRef(entry, related);
  const target = entryTarget(entry);

  return (
    <div className="page-head-detail stock-voucher-head">
      <div className="page-title-group">
        <div className="eyebrow">Stock Entry · {formatLabel(entry.entry_type)} voucher</div>
        <h1 className="display">{voucherTitle(entry)}</h1>
        <div className="page-sub">
          {summary.sourceLabel} <strong>{entry.from_location_name ?? "System / inspection"}</strong> to <strong>{target}</strong>.
          {" "}{summary.stripNote}
        </div>
        <div className="page-id-row">
          <span className="doc-no">{entry.entry_number}</span>
          <span className={`pill ${entry.status === "PENDING_ACK" ? "pill-info" : statusTone(entry.status)} pill-lg`}>
            <span className={`status-dot ${entry.status === "COMPLETED" ? "active" : "inactive"}`} />
            {entry.status === "PENDING_ACK" ? "In transit · Awaiting acknowledgment" : formatLabel(entry.status)}
          </span>
          <span className="doc-meta">
            <span className="dot-sep">·</span>
            <span>{entryDateVerb(entry)} {entryAt}</span>
            <span className="dot-sep">·</span>
            <span>Register {register}</span>
          </span>
        </div>
      </div>
    </div>
  );
}

function AcknowledgementNotice({ entry, related, onAcknowledge }: { entry: StockEntryRecord; related: RelatedEntries; onAcknowledge: () => void }) {
  const stats = acknowledgementTotals(entry, related);
  if (entry.status !== "PENDING_ACK") return null;
  const pendingUnits = stats.pending ?? stats.sent;
  const isIssue = entry.entry_type === "ISSUE";
  const title = isIssue ? "Waiting for acknowledgement from receiver" : "Acknowledgement required";
  const text = isIssue
    ? `${entryTarget(entry)} has not acknowledged this movement yet. ${pendingUnits} unit${pendingUnits === 1 ? "" : "s"} remain pending on the receiving side.`
    : `Items have left ${entry.from_location_name ?? "the source"} but ${entryTarget(entry)} has not confirmed receipt. ${pendingUnits} unit${pendingUnits === 1 ? "" : "s"} still require receiver acknowledgement.`;
  const actionText = isIssue
    ? "The receiving side must capture the register and accepted quantities before this dispatch can close."
    : "Capture the receiving register and accepted quantities to close this receipt.";

  return (
    <div className="notice notice-warn">
      <div className="notice-icon"><Ic d={<><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><path d="M12 9v4M12 17h.01" /></>} size={18} /></div>
      <div className="notice-body">
        <div className="notice-title">{title}</div>
        <div className="notice-text">{text} <strong>{actionText}</strong></div>
      </div>
      {!isIssue && entry.can_acknowledge ? (
        <div className="notice-actions">
          <button className="btn btn-xs" type="button" onClick={onAcknowledge}>Acknowledge</button>
        </div>
      ) : null}
    </div>
  );
}

function RoutingPanel({ entry, related }: { entry: StockEntryRecord; related: RelatedEntries }) {
  const sourcePerson = entry.created_by_name ?? "Unknown";
  const ack = acknowledgementMeta(entry, related);

  return (
    <div className="routing">
      <div className="routing-end">
        <div className="role">From · {entry.entry_type === "RECEIPT" ? "Source" : "Source store"}</div>
        <div className="name">{entry.from_location_name ?? "System / Inspection"}</div>
        <div className="sub">{entry.entry_type === "ISSUE" ? firstRegisterRef(entry) : "Source register not shown on receipt voucher"}</div>
        <div className="person"><span className="av">{initials(sourcePerson)}</span> Issued by {sourcePerson}</div>
      </div>
      <div className="routing-arrow">
        <span className="arrow">{formatLabel(entry.entry_type)} <Ic d="M5 12h14M13 5l7 7-7 7" size={15} /></span>
      </div>
      <div className="routing-end">
        <div className="role">To · {entry.issued_to_name ? "Recipient person" : "Recipient location"}</div>
        <div className="name">{entryTarget(entry)}</div>
        <div className="sub">{entry.entry_type === "ISSUE" ? "Destination register captured on receipt voucher" : firstAckRegisterRef(entry, related)}</div>
        <div className="person"><span className="av">{initials(ack.by ?? entryTarget(entry))}</span> Recipient: {ack.by ?? entryTarget(entry)}</div>
      </div>
    </div>
  );
}

function LineItemCards({ entry, related, instances }: { entry: StockEntryRecord; related: RelatedEntries; instances: StockEntryItemInstance[] }) {
  const instanceMap = new Map(instances.map(instance => [instance.id, instance]));

  return (
    <div>
      <div className="section-h">
        <span className="eyebrow">Line item ledger</span>
        <span className="section-h-meta">{entry.items.length} item{entry.items.length === 1 ? "" : "s"}</span>
      </div>
      {entry.items.map((item, index) => {
        const line = resolveLine(entry, item, related);
        const returned = line.returned ?? null;
        const acceptedLabel = line.accepted == null ? "Pending" : String(line.accepted);
        const returnedLabel = returned == null ? "Pending" : String(returned);
        const itemInstances = effectiveInstances(entry, item, related);
        const receiverRef = line.mirror?.ack_stock_register_name ?? item.ack_stock_register_name;
        const receiverPage = line.mirror?.ack_page_number ?? item.ack_page_number;
        const outcome = returned && returned > 0 ? "Partial acknowledgement" : line.accepted != null ? "Acknowledged" : entry.status === "PENDING_ACK" ? "Awaiting acknowledgement" : formatLabel(entry.status);

        return (
          <div className="ins-item" key={item.id}>
            <div className="ins-item-head">
                  <div className="ins-item-head-left">
                    <div className="ins-item-idx">{String(index + 1).padStart(2, "0")}</div>
                    <div>
                      <div className="ins-item-title">{item.item_name ?? `Item ${item.item}`}</div>
                      <div className="ins-item-cat">{item.batch_number ?? "No batch"} · {trackingLabel(entry, item, related)} tracking</div>
                    </div>
                  </div>
              <span className={`pill ${returned && returned > 0 ? "pill-warning" : line.accepted != null ? "pill-success" : "pill-neutral"}`}>{outcome}</span>
            </div>
            <div className="ins-item-body">
                <div className="kv">
                  <div className="kv-label">Item Reference</div>
                  <div className="kv-value mono">#{item.item}{item.batch ? ` / batch ${item.batch}` : ""}</div>
                  <div className="kv-sub">{itemInstances.length ? `${itemInstances.length} selected instances` : "bulk quantity line"}</div>
                </div>
              <div className="kv">
                <div className="kv-label">Source Register</div>
                <div className="kv-value mono">{item.stock_register_name ?? "Not recorded"}</div>
                <div className="kv-sub">{item.page_number ? `Page ${item.page_number}` : "No source page"}</div>
              </div>
              <div className="kv">
                <div className="kv-label">Register</div>
                <div className="kv-value mono">{receiverRef ?? "Pending"}</div>
                <div className="kv-sub">{receiverPage ? `Page ${receiverPage}` : "No page recorded"}</div>
              </div>
              <div className="kv">
                <div className="kv-label">Movement Qty</div>
                <div className="qty-grid">
                  <div className="qty"><div className="qty-label">Issued</div><div className="qty-value">{item.quantity}</div></div>
                  <div className="qty accept"><div className="qty-label">Accepted</div><div className="qty-value">{acceptedLabel}</div></div>
                  <div className="qty reject"><div className="qty-label">Returned</div><div className="qty-value">{returnedLabel}</div></div>
                </div>
              </div>
              {itemInstances.length > 0 ? (
                <div className="kv" style={{ gridColumn: "1 / -1" }}>
                  <div className="kv-label">Instances</div>
                  <div className="group-cell">
                    {itemInstances.map(instanceId => {
                      const instance = instanceMap.get(instanceId);
                      return <span className="chip" key={instanceId}>{instance?.serial_number ?? `Instance ${instanceId}`}</span>;
                    })}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="ins-item-foot">
              <span>{entry.from_location_name ?? "Source not recorded"} to {entryTarget(entry)}</span>
              <span className="mono-small">line id #{item.id}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ItemsIssuedTable({ entry, related, instances }: { entry: StockEntryRecord; related: RelatedEntries; instances: StockEntryItemInstance[] }) {
  const registerColumnLabel = "Register";
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const selectedItem = entry.items.find(item => item.id === selectedItemId) ?? null;
  const selectedLine = selectedItem ? resolveLine(entry, selectedItem, related) : null;

  return (
    <>
      <div className="card">
        <div className="card-head">
          <h3>Line items</h3>
          <div className="head-meta">{entry.items.length} line item{entry.items.length === 1 ? "" : "s"} · Register coordinates recorded</div>
        </div>
        <div className="h-scroll">
          <table className="items-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Item</th>
                <th>Qty</th>
                <th>Accepted</th>
                <th>
                  <span className="th-with-help">
                    <span>Returned</span>
                    <span
                      className="th-help"
                      title="Shows how many units of this line were returned during acknowledgement."
                      aria-label="Returned quantity help"
                    >
                      ?
                    </span>
                  </span>
                </th>
                <th>{registerColumnLabel}</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {entry.items.map((item, index) => {
                const line = resolveLine(entry, item, related);
                const returned = line.returned ?? null;
                const registerRef = lineRegisterRef(entry, item, line);
                const itemInstances = effectiveInstances(entry, item, related);
                const detailLabel = itemInstances.length > 0 ? "View instances" : "View batch";

                return (
                  <tr key={item.id}>
                    <td className="idx">{String(index + 1).padStart(2, "0")}</td>
                    <td>
                      <div className="item-main">{item.item_name ?? `Item ${item.item}`}</div>
                      <div className="item-sub">{item.batch_number ?? "No batch"} · {trackingLabel(entry, item, related)} tracking{itemInstances.length ? ` · ${itemInstances.length} instances` : ""}</div>
                    </td>
                    <td className="num">{item.quantity}</td>
                    <td className="num">{line.accepted ?? "-"}</td>
                    <td className="num">{returned ?? "-"}</td>
                    <td className="register-cell">
                      <div className="register-ref mono-small">{registerRef}</div>
                    </td>
                    <td className="details-cell">
                      <button type="button" className="btn btn-xs" onClick={() => setSelectedItemId(item.id)}>
                        {detailLabel}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {selectedItem && selectedLine ? (
        <LineItemDetailModal
          entry={entry}
          item={selectedItem}
          line={selectedLine}
          related={related}
          instances={instances}
          onClose={() => setSelectedItemId(null)}
        />
      ) : null}
    </>
  );
}

function VoucherDetailsCard({ entry, related }: { entry: StockEntryRecord; related: RelatedEntries }) {
  const ack = acknowledgementMeta(entry, related);

  return (
    <div className="card">
      <div className="card-head"><h3>Voucher details</h3></div>
      <div className="card-body">
        <div className="kv-grid cols-3">
          <div className="kv"><div className="kv-label">Document type</div><div className="kv-value">{formatLabel(entry.entry_type)} voucher</div><div className="kv-sub">{entry.entry_type}</div></div>
          <div className="kv"><div className="kv-label">Voucher number</div><div className="kv-value mono">{entry.entry_number}</div></div>
          <div className="kv"><div className="kv-label">{entryDateVerb(entry)} on</div><div className="kv-value">{formatDate(entry.entry_date)}</div></div>
          <div className="kv"><div className="kv-label">Created by</div><div className="kv-value">{entry.created_by_name ?? "Unknown"}</div><div className="kv-sub">{formatDate(entry.created_at)}</div></div>
          <div className="kv"><div className="kv-label">Acknowledged by</div><div className="kv-value">{ack.by ?? "-"}</div><div className="kv-sub">{ack.at ? formatDate(ack.at) : "-"}</div></div>
          <div className="kv"><div className="kv-label">Status</div><div className="kv-value">{formatLabel(entry.status)}</div></div>
          <div className="kv" style={{ gridColumn: "1 / -1" }}><div className="kv-label">Purpose / remarks</div><div className="kv-value">{entry.purpose ?? entry.remarks ?? "No purpose or remarks recorded."}</div>{entry.purpose && entry.remarks ? <div className="kv-sub">{entry.remarks}</div> : null}</div>
        </div>
      </div>
    </div>
  );
}

function StatusAsideCard({ entry, related }: { entry: StockEntryRecord; related: RelatedEntries }) {
  const stats = acknowledgementTotals(entry, related);
  const pending = entry.status === "PENDING_ACK";

  return (
    <div className="card">
      <div className="card-head"><h3>Status</h3></div>
      <div className="card-body card-body-tight" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="kv"><div className="kv-label">Current state</div><div className="kv-value">{pending ? "In transit · awaiting ack" : formatLabel(entry.status)}</div><div className="kv-sub">{pending ? "Receiver register has not been captured." : "Voucher has receiver-side outcome data."}</div></div>
        <div className="kv"><div className="kv-label">Editable</div><div className="kv-value">{entry.status === "DRAFT" ? "Yes" : "No · Voucher locked once issued"}</div></div>
        <div className="kv"><div className="kv-label">Quantity balance</div><div className="kv-value mono">{stats.sent} {quantityVerb(entry)} · {stats.accepted ?? "-"} accepted · {stats.returned ?? "-"} returned</div></div>
        <hr className="h-rule" />
        <div className="kv"><div className="kv-label">Next action</div><div className="kv-value">{pending ? "Receiving side acknowledgement" : "No action required"}</div></div>
      </div>
    </div>
  );
}

function RelatedRecordsCard({ entry, related }: { entry: StockEntryRecord; related: RelatedEntries }) {
  const records: Array<{ entry: StockEntryRecord; label: string; sub: string }> = [];
  if (related.reference) records.push({ entry: related.reference, label: "Reference Entry", sub: `${formatLabel(related.reference.entry_type)} · ${formatLabel(related.reference.status)}` });
  if (entry.entry_type === "ISSUE" && related.linkedReceipt) records.push({ entry: related.linkedReceipt, label: "Receiving Entry", sub: `${formatLabel(related.linkedReceipt.status)} · acknowledgement side` });
  related.generatedReturns.forEach(child => records.push({ entry: child, label: "Generated Return", sub: `${formatLabel(child.status)} · discrepancy return` }));
  if (entry.entry_type !== "RECEIPT" && entry.entry_type !== "ISSUE") {
    related.children.forEach(child => records.push({ entry: child, label: "Child Entry", sub: `${formatLabel(child.entry_type)} · ${formatLabel(child.status)}` }));
  }

  return (
    <div className="card">
      <div className="card-head"><h3>Linked records</h3></div>
      <div className="ref-list">
        {records.length ? records.map(({ entry: linked, label, sub }) => (
          <Link className="ref-row" href={`/stock-entries/${linked.id}`} key={`${label}-${linked.id}`}>
            <div className="ref-text">
              <div className="ref-doc">{linked.entry_number}</div>
              <div className="ref-sub">{label} · {sub}</div>
            </div>
            <span className="ref-arrow"><Ic d="M9 18l6-6-6-6" size={14} /></span>
          </Link>
        )) : <div className="card-body-tight"><div className="detail-empty-copy">No parent, receipt, or return records are linked to this stock entry.</div></div>}
      </div>
    </div>
  );
}

function AsideSummaryCard({ entry, related }: { entry: StockEntryRecord; related: RelatedEntries }) {
  const stats = acknowledgementTotals(entry, related);
  const summary = typeSummary(entry);

  return (
    <div className="card">
      <div className="card-head"><h3>Movement summary</h3></div>
      <div className="card-body card-body-tight" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="kv">
          <div className="kv-label">Entry Type</div>
          <div className="kv-value">{formatLabel(entry.entry_type)}</div>
          <div className="kv-sub">{summary.stripNote}</div>
        </div>
        <div className="kv">
          <div className="kv-label">Total Quantity</div>
          <div className="kv-value mono">{stats.sent}</div>
        </div>
        <div className="kv">
          <div className="kv-label">Accepted / Returned</div>
          <div className="kv-value mono">{stats.accepted ?? "Pending"} / {stats.returned ?? "Pending"}</div>
        </div>
        <div className="kv">
          <div className="kv-label">Entry Date</div>
          <div className="kv-value">{formatShortDate(entry.entry_date)}</div>
        </div>
        {entry.cancellation_reason ? (
          <>
            <hr className="h-rule" />
            <div className="notice notice-danger" style={{ marginBottom: 0 }}>
              <div className="notice-body">
                <div className="notice-title">Cancellation reason</div>
                <div className="notice-text">{entry.cancellation_reason}</div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function WorkflowHistoryCard({ entry, related }: { entry: StockEntryRecord; related: RelatedEntries }) {
  const ack = acknowledgementMeta(entry, related);

  return (
    <div className="card">
      <div className="card-head">
        <h3>Workflow history</h3>
        <div className="head-meta">audit events</div>
      </div>
      <div className="timeline">
        <div className="tl-item">
          <div className="tl-dot info" />
          <div className="tl-content">
            <div className="tl-title"><span className="who">{entry.created_by_name ?? "Unknown"}</span> issued stock entry</div>
            <div className="tl-meta"><span>{formatLabel(entry.entry_type)}</span><span className="dot-sep">·</span><span className="when">{formatDate(entry.created_at)}</span></div>
          </div>
        </div>
        <div className="tl-item">
          <div className={`tl-dot ${entry.status === "PENDING_ACK" ? "warn" : ack.at ? "ok" : ""}`} />
          <div className="tl-content">
            <div className="tl-title">{ack.at ? <><span className="who">{ack.by ?? "Receiver"}</span> acknowledged movement</> : ack.isRequired ? "Acknowledgement pending" : "No acknowledgement required"}</div>
            <div className="tl-meta"><span>{ack.at ? "receiver register captured" : ack.isRequired ? "waiting for receiving side" : "system-generated receipt source"}</span><span className="dot-sep">·</span><span className="when">{ack.at ? formatDate(ack.at) : "-"}</span></div>
          </div>
        </div>
        {entry.cancelled_at ? (
          <div className="tl-item">
            <div className="tl-dot danger" />
            <div className="tl-content">
              <div className="tl-title"><span className="who">{entry.cancelled_by_name ?? "Unknown"}</span> cancelled entry</div>
              <div className="tl-meta"><span>{entry.cancellation_reason ?? "No reason recorded"}</span><span className="dot-sep">·</span><span className="when">{formatDate(entry.cancelled_at)}</span></div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SignoffSection({ entry, related }: { entry: StockEntryRecord; related: RelatedEntries }) {
  const ack = acknowledgementMeta(entry, related);

  return (
    <div>
      <div className="section-h">
        <span className="eyebrow">Sign-off</span>
        <span className="section-h-meta">{ack.at ? "2 of 2 captured" : ack.isRequired ? "1 of 2 captured" : "acknowledgement not required"}</span>
      </div>
      <div className="signoff" style={{ gridTemplateColumns: "repeat(2, 1fr)" }}>
        <div className="so">
          <div className="so-role">Issued by</div>
          <div className="so-name">{entry.created_by_name ?? "Unknown"}</div>
          <div className="so-sig">{signature(entry.created_by_name)}</div>
          <div className="so-when">{formatDate(entry.created_at)}</div>
        </div>
        <div className={`so ${ack.isPending && ack.isRequired ? "pending" : ""}`}>
          <div className="so-role">Acknowledged by</div>
          <div className="so-name">{ack.pendingLabel}</div>
          <div className="so-sig">{ack.signatureLabel}</div>
          <div className="so-when">{ack.at ? formatDate(ack.at) : ack.isRequired ? "Awaiting receiver" : "-"}</div>
        </div>
      </div>
    </div>
  );
}

function LineDetails({ entry, item, line, related, instanceMap }: { entry: StockEntryRecord; item: StockEntryItemRecord; line: LineResolution; related: RelatedEntries; instanceMap: Map<number, StockEntryItemInstance> }) {
  const acceptedIds = new Set((line.mirror?.accepted_instances ?? item.accepted_instances ?? []).map(Number));
  const returned = line.returned ?? null;
  const itemInstances = effectiveInstances(entry, item, related);

  if (itemInstances.length > 0) {
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <div className="eyebrow">Transferred instances</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {itemInstances.map(instanceId => {
            const instance = instanceMap.get(instanceId);
            const accepted = acceptedIds.size ? acceptedIds.has(instanceId) : returned === 0 && entry.status === "COMPLETED";
            const detailHref = `/items/${instance?.item ?? item.item}/instances/${instanceId}`;
            return (
              <Link key={instanceId} href={detailHref} className="line-instance-link">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <strong>{instance?.serial_number ?? `Instance ${instanceId}`}</strong>
                  <span className={`pill ${accepted ? "pill-success" : returned ? "pill-warning" : "pill-neutral"}`}>
                    {accepted ? "Accepted" : returned ? "Returned" : formatLabel(instance?.status)}
                  </span>
                </div>
                <div className="login-cell-sub mono" style={{ marginTop: 6 }}>{instance?.qr_code ?? `#${instanceId}`}</div>
                <div className="login-cell-sub" style={{ marginTop: 4 }}>{instance?.location_name ?? instance?.full_location_path ?? "Location pending sync"}</div>
                <div className="login-cell-sub line-instance-link-note">Open instance detail</div>
              </Link>
            );
          })}
        </div>
      </div>
    );
  }

  const destinationRef = (line.mirror?.ack_stock_register_name ?? item.ack_stock_register_name) ?? null;
  const destinationPage = line.mirror?.ack_page_number ?? item.ack_page_number;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
      <div className="login-cell-sub"><strong>Batch:</strong> {item.batch_number ?? "No batch"}</div>
      <div className="login-cell-sub"><strong>Line Ref:</strong> #{item.item}{item.batch ? ` / batch ${item.batch}` : ""}</div>
      <div className="login-cell-sub"><strong>Source Ref:</strong> {formatRegisterRef(item.stock_register_name, item.page_number, "-")}</div>
      <div className="login-cell-sub"><strong>Destination Ref:</strong> {formatRegisterRef(destinationRef, destinationPage, "-")}</div>
    </div>
  );
}

function LineItemDetailModal({
  entry,
  item,
  line,
  related,
  instances,
  onClose,
}: {
  entry: StockEntryRecord;
  item: StockEntryItemRecord;
  line: LineResolution;
  related: RelatedEntries;
  instances: StockEntryItemInstance[];
  onClose: () => void;
}) {
  const instanceMap = useMemo(() => new Map(instances.map(instance => [instance.id, instance])), [instances]);
  const inspectionHref = entry.inspection_certificate ? `/inspections/${entry.inspection_certificate}` : null;
  const itemInstances = effectiveInstances(entry, item, related);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal modal-lg stock-line-modal" role="dialog" aria-modal="true" aria-labelledby="stock-line-detail-title" onMouseDown={event => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">Line item detail</div>
            <h2 id="stock-line-detail-title">{item.item_name ?? `Item ${item.item}`}</h2>
            <div className="login-cell-sub">
              {itemInstances.length > 0 ? `${itemInstances.length} transferred instance${itemInstances.length === 1 ? "" : "s"}` : "Batch transfer detail"}
            </div>
          </div>
          <button type="button" className="modal-close" aria-label="Close line item detail modal" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          {itemInstances.length > 0 ? (
            <div className="card-pad" style={{ display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
                <div className="kv"><div className="kv-label">Qty</div><div className="kv-value mono">{item.quantity}</div></div>
                <div className="kv"><div className="kv-label">Accepted</div><div className="kv-value mono">{line.accepted ?? "-"}</div></div>
                <div className="kv"><div className="kv-label">Returned</div><div className="kv-value mono">{line.returned ?? "-"}</div></div>
                <div className="kv"><div className="kv-label">Register</div><div className="kv-value mono">{lineRegisterRef(entry, item, line)}</div></div>
              </div>
              <LineDetails entry={entry} item={item} line={line} related={related} instanceMap={instanceMap} />
            </div>
          ) : (
            <div className="card-pad" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              <div className="kv">
                <div className="kv-label">Batch Number</div>
                <div className="kv-value mono">{item.batch_number ?? "No batch"}</div>
              </div>
              <div className="kv">
                <div className="kv-label">Inspection Certificate</div>
                <div className="kv-value">
                  {inspectionHref && entry.inspection_certificate_number ? (
                    <Link href={inspectionHref} className="link-inline">
                      {entry.inspection_certificate_number}
                    </Link>
                  ) : (
                    "-"
                  )}
                </div>
              </div>
              <div className="kv">
                <div className="kv-label">Quantity</div>
                <div className="kv-value mono">{item.quantity}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ItemLedger({ entry, instances, related }: { entry: StockEntryRecord; instances: StockEntryItemInstance[]; related: RelatedEntries }) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const instanceMap = useMemo(() => new Map(instances.map(instance => [instance.id, instance])), [instances]);
  const partial = entry.items.some(item => (resolveLine(entry, item, related).returned ?? 0) > 0);

  return (
    <Panel eyebrow="Ledger" title="Line Items" actions={<div style={{ display: "flex", gap: 8, alignItems: "center" }}>{partial && <span className="pill pill-warning">Partial acknowledgement</span>}<div className="table-count"><span className="mono">{entry.items.length}</span><span>rows</span></div></div>}>
      <div className="h-scroll" style={{ margin: "-12px -16px 0" }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Tracking</th>
              <th>Sent</th>
              <th>Accepted</th>
              <th>Returned</th>
              <th>Source Ref</th>
              <th>Receiver Ref</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {entry.items.flatMap(item => {
              const line = resolveLine(entry, item, related);
              const rowAccepted = line.accepted == null ? "-" : String(line.accepted);
              const rowReturned = line.returned == null ? "-" : String(line.returned);
              const lineExpanded = Boolean(expanded[item.id]);
              const outcome = line.returned && line.returned > 0 ? "Partial" : line.accepted != null ? "Accepted" : entry.status === "PENDING_ACK" ? "Awaiting ack" : "Open";
              const receiverRef = line.mirror?.ack_stock_register_name ?? item.ack_stock_register_name;
              const receiverPage = line.mirror?.ack_page_number ?? item.ack_page_number;

              return [
                <tr key={item.id} onClick={() => setExpanded(prev => ({ ...prev, [item.id]: !prev[item.id] }))} style={{ cursor: "pointer" }} aria-expanded={lineExpanded}>
                  <td className="col-user">
                    <div className="user-cell">
                      <div className="avatar" style={{ width: 32, height: 32, fontSize: 11, background: "linear-gradient(135deg, color-mix(in oklch, var(--primary) 74%, white), var(--primary))" }}>{initials(item.item_name)}</div>
                      <div>
                        <div className="user-name">{item.item_name ?? `Item ${item.item}`}</div>
                        <div className="user-username mono">{effectiveInstances(entry, item, related).length ? `${effectiveInstances(entry, item, related).length} instances` : item.batch_number ?? "No batch"}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className="chip">{trackingLabel(entry, item, related)}</span></td>
                  <td className="mono">{item.quantity}</td>
                  <td className="mono">{rowAccepted}</td>
                  <td className="mono">{rowReturned}</td>
                  <td className="mono">{item.stock_register_name ?? "-"}{item.page_number ? ` / p.${item.page_number}` : ""}</td>
                  <td className="mono">{receiverRef ?? "-"}{receiverPage ? ` / p.${receiverPage}` : ""}</td>
                  <td><span className={`pill ${line.returned && line.returned > 0 ? "pill-warning" : line.accepted != null ? "pill-success" : "pill-neutral"}`}>{outcome}</span></td>
                </tr>,
                line.returned && line.returned > 0 ? (
                  <tr key={`${item.id}-partial`}>
                    <td colSpan={8}>
                      <div style={{ border: "1px solid color-mix(in oklch, var(--danger) 30%, transparent)", background: "var(--danger-weak)", color: "var(--danger)", borderRadius: "var(--radius)", padding: "10px 12px", fontSize: 13 }}>
                        <strong>Partial receipt:</strong> {line.accepted} accepted and {line.returned} returned. Original sent quantity is preserved on this entry for audit.
                      </div>
                    </td>
                  </tr>
                ) : null,
                lineExpanded ? (
                  <tr key={`${item.id}-expanded`}>
                    <td colSpan={8}>
                      <div style={{ padding: "10px 12px 12px", background: "color-mix(in oklch, var(--surface-2) 82%, white)", borderTop: "1px solid var(--hairline)", display: "grid", gap: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
                          <strong style={{ fontSize: 13 }}>{effectiveInstances(entry, item, related).length ? "Instance trail" : "Quantity and register breakdown"}</strong>
                          <span className="mono muted-note">Click row again to collapse</span>
                        </div>
                        <LineDetails entry={entry} item={item} line={line} related={related} instanceMap={instanceMap} />
                      </div>
                    </td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function AckForm({ entry, related, registers, instances, onDone, onCancel }: { entry: StockEntryRecord; related: RelatedEntries; registers: StockRegisterRecord[]; instances: StockEntryItemInstance[]; onDone: () => Promise<void>; onCancel?: () => void }) {
  const [values, setValues] = useState(() => Object.fromEntries(entry.items.map(item => [item.id, {
    quantity: entry.entry_type === "RETURN" ? item.quantity : item.accepted_quantity ?? item.quantity,
    instances: item.accepted_instances?.length ? item.accepted_instances.map(String) : effectiveInstances(entry, item, related).map(String),
    ack_stock_register: item.ack_stock_register ? String(item.ack_stock_register) : "",
    ack_page_number: item.ack_page_number ? String(item.ack_page_number) : "",
  }])) as Record<number, { quantity: number; instances: string[]; ack_stock_register: string; ack_page_number: string }>);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isReturn = entry.entry_type === "RETURN";
  const instanceMap = useMemo(() => new Map(instances.map(instance => [instance.id, instance])), [instances]);
  const ackRegisters = useMemo(
    () => registers.filter(register => register.is_active && register.store === entry.to_location),
    [entry.to_location, registers],
  );

  const update = (id: number, patch: Partial<(typeof values)[number]>) => {
    setValues(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/inventory/stock-entries/${entry.id}/acknowledge/`, {
        method: "POST",
        body: JSON.stringify({
          items: entry.items.map(item => ({
            id: item.id,
            quantity: isReturn ? item.quantity : values[item.id].quantity,
            instances: isReturn ? item.instances : values[item.id].instances.map(Number),
            ack_stock_register: Number(values[item.id].ack_stock_register),
            ack_page_number: Number(values[item.id].ack_page_number),
          })),
        }),
      });
      await onDone();
      onCancel?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to acknowledge stock entry");
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = entry.items.every(item => (
    values[item.id]?.ack_stock_register &&
    values[item.id]?.ack_page_number &&
    values[item.id].quantity >= 1 &&
    values[item.id].quantity <= item.quantity
  ));

  return (
    <div className="stock-ack-form">
      <div className="stock-ack-form-inner">
        {error && <Alert>{error}</Alert>}
        {entry.items.map(item => {
          const row = values[item.id];
          const returning = item.quantity - row.quantity;
          const tracking = trackingLabel(entry, item, related);
          const itemInstances = effectiveInstances(entry, item, related);
          return (
            <section key={item.id} className="stock-ack-item">
              <div className="stock-ack-item-head">
                <div className="stock-ack-item-title-wrap">
                  <strong className="stock-ack-item-title">{item.item_name ?? `Item ${item.item}`}</strong>
                  <div className="stock-ack-item-meta">
                    {item.batch_number ?? "No batch"} · {tracking} tracking
                  </div>
                </div>
                <div className="stock-ack-badges">
                  <span className="stock-ack-badge">Sent {item.quantity}</span>
                  {!isReturn && returning > 0 ? <span className="stock-ack-badge is-warning">Returning {returning}</span> : null}
                </div>
              </div>
              <div className="stock-ack-grid">
                <Field label={isReturn ? "Received Quantity" : "Accepted Quantity"}>
                  <input className="input" type="number" min="1" max={item.quantity} value={row.quantity} disabled={isReturn || itemInstances.length > 0} onChange={event => update(item.id, { quantity: Number(event.target.value) })} />
                </Field>
                <Field label="Register">
                  <select value={row.ack_stock_register} onChange={event => update(item.id, { ack_stock_register: event.target.value })}>
                    <option value="">Choose register</option>
                    {ackRegisters.map(register => (
                      <option key={register.id} value={register.id}>{register.register_number} - {register.store_name}</option>
                    ))}
                  </select>
                  {!ackRegisters.length ? (
                    <div className="login-cell-sub" style={{ marginTop: 6 }}>
                      No active register found for {entry.to_location_name ?? "this destination store"}.
                    </div>
                  ) : null}
                </Field>
                <Field label="Page">
                  <input className="input" type="number" min="1" value={row.ack_page_number} onChange={event => update(item.id, { ack_page_number: event.target.value })} />
                </Field>
              </div>
              {itemInstances.length > 0 && !isReturn && (
                <div className="stock-ack-instance-picker">
                  <div className="stock-ack-instance-note">Select the instances received at the destination.</div>
                  <div className="group-cell">
                  {itemInstances.map(instanceId => (
                    <label key={instanceId} className="chip" style={{ cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={row.instances.includes(String(instanceId))}
                        onChange={event => {
                          const next = event.target.checked
                            ? [...row.instances, String(instanceId)]
                            : row.instances.filter(id => id !== String(instanceId));
                          update(item.id, { instances: next, quantity: next.length });
                        }}
                      />
                      {instanceIdentifier(instanceMap.get(instanceId), instanceId)}
                    </label>
                  ))}
                  </div>
                </div>
              )}
            </section>
          );
        })}
        <div className="stock-ack-actions">
          {onCancel && (
            <button type="button" className="btn" disabled={busy} onClick={onCancel}>
              Cancel
            </button>
          )}
          <button type="button" className="btn btn-primary" disabled={!canSubmit || busy} onClick={submit}>
            {busy ? "Acknowledging..." : "Submit Acknowledgement"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AckModal({ entry, related, registers, instances, onDone, onClose }: { entry: StockEntryRecord; related: RelatedEntries; registers: StockRegisterRecord[]; instances: StockEntryItemInstance[]; onDone: () => Promise<void>; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal modal-lg stock-ack-modal" role="dialog" aria-modal="true" aria-labelledby="stock-ack-title" onMouseDown={event => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">Pending acknowledgement</div>
            <h2 id="stock-ack-title">{entry.entry_type === "RETURN" ? "Acknowledge Returned Stock" : "Record Receiving Decision"}</h2>
            <div className="stock-ack-modal-sub">Capture the receiving register and confirm accepted quantities for each line item.</div>
          </div>
          <button type="button" className="modal-close" aria-label="Close acknowledgement modal" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <AckForm entry={entry} related={related} registers={registers} instances={instances} onDone={onDone} onCancel={onClose} />
        </div>
      </div>
    </div>
  );
}

function CorrectionActionsPanel({
  entry,
  canApproveCorrections,
  correctionActionBusy,
  onCancelEntry,
  onResolveDifference,
  onRequestReversal,
  onApproveCorrection,
  onApplyCorrection,
  onRejectCorrection,
}: {
  entry: StockEntryRecord;
  canApproveCorrections: boolean;
  correctionActionBusy: "approve" | "apply" | "reject" | null;
  onCancelEntry: () => void;
  onResolveDifference: () => void;
  onRequestReversal: () => void;
  onApproveCorrection: () => void;
  onApplyCorrection: () => void;
  onRejectCorrection: () => void;
}) {
  const hasAppliedReversal = entry.generated_correction_entries?.some(generated => generated.reference_purpose === "REVERSAL");
  const canCreateReplacement = entry.status === "CANCELLED" || hasAppliedReversal;
  const hasActions = entry.can_cancel || entry.can_correct || entry.can_request_reversal || entry.active_correction || canCreateReplacement;
  const activeCorrection = entry.active_correction;
  const differenceCopy = getCorrectionModeCopy("difference");
  const reversalCopy = getCorrectionModeCopy("reversal");
  const isProjectedReceiptCorrection = Boolean(
    activeCorrection?.original_entry &&
    activeCorrection.original_entry !== entry.id &&
    entry.entry_type === "RECEIPT" &&
    entry.reference_purpose === "AUTO_RECEIPT"
  );
  const isProjectedAdditionalMovement = isProjectedReceiptCorrection && activeCorrection?.resolution_type === "ADDITIONAL_MOVEMENT";
  const correctionCanBeActedOnHere = Boolean(
    activeCorrection &&
    canApproveCorrections &&
    !isProjectedAdditionalMovement &&
    (activeCorrection.resolution_type !== "REVERSAL" || isProjectedReceiptCorrection)
  );
  if (!hasActions) return null;

  return (
    <Panel eyebrow="Controls" title="Entry correction actions">
      <div style={{ display: "grid", gap: 12 }}>
        {activeCorrection ? (
          <div className="notice notice-warn">
            <div className="notice-body">
              <div className="notice-title">Correction {formatLabel(activeCorrection.status)}</div>
              <div className="notice-text">
                {activeCorrection.message || activeCorrection.reason}
                {activeCorrection.status === "REQUESTED" && activeCorrection.resolution_type === "REVERSAL" && !isProjectedReceiptCorrection ? " Waiting for the receiving store to approve it from the linked receipt voucher." : ""}
                {activeCorrection.status === "REQUESTED" && activeCorrection.resolution_type === "ADDITIONAL_MOVEMENT" && isProjectedReceiptCorrection ? " Waiting for the source store to approve and send the additional quantity." : ""}
                {activeCorrection.status === "REQUESTED" && !isProjectedAdditionalMovement && (activeCorrection.resolution_type !== "REVERSAL" || isProjectedReceiptCorrection) ? " Approval is required before any linked movement is generated." : ""}
                {activeCorrection.status === "APPROVED" && activeCorrection.resolution_type === "REVERSAL" && !isProjectedReceiptCorrection ? " The receiving store can apply it from the linked receipt voucher." : ""}
                {activeCorrection.status === "APPROVED" && isProjectedAdditionalMovement ? " The source store can now apply it to generate the additional issue." : ""}
                {activeCorrection.status === "APPROVED" && !isProjectedAdditionalMovement && (activeCorrection.resolution_type !== "REVERSAL" || isProjectedReceiptCorrection) ? " Apply it to generate the linked movement records." : ""}
              </div>
            </div>
            {correctionCanBeActedOnHere && activeCorrection.status === "REQUESTED" ? (
              <div className="notice-actions">
                <button type="button" className="btn btn-xs btn-primary" onClick={onApproveCorrection} disabled={correctionActionBusy !== null}>
                  {correctionActionBusy === "approve" ? "Approving..." : "Approve"}
                </button>
                <button type="button" className="btn btn-xs btn-ghost" onClick={onRejectCorrection} disabled={correctionActionBusy !== null}>
                  {correctionActionBusy === "reject" ? "Rejecting..." : "Reject"}
                </button>
              </div>
            ) : null}
            {correctionCanBeActedOnHere && activeCorrection.status === "APPROVED" ? (
              <div className="notice-actions">
                <button type="button" className="btn btn-xs btn-primary" onClick={onApplyCorrection} disabled={correctionActionBusy !== null}>
                  {correctionActionBusy === "apply" ? "Applying..." : "Apply Correction"}
                </button>
                <button type="button" className="btn btn-xs btn-ghost" onClick={onRejectCorrection} disabled={correctionActionBusy !== null}>
                  {correctionActionBusy === "reject" ? "Rejecting..." : "Reject"}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {entry.can_cancel ? (
            <button type="button" className="btn btn-sm" onClick={onCancelEntry}>
              Cancel Entry
            </button>
          ) : null}
          {entry.can_correct ? (
            <button type="button" className="btn btn-sm btn-primary" onClick={onResolveDifference}>
              {differenceCopy.actionLabel}
            </button>
          ) : null}
          {entry.can_request_reversal ? (
            <button type="button" className="btn btn-sm" onClick={onRequestReversal}>
              {reversalCopy.actionLabel}
            </button>
          ) : null}
          {canCreateReplacement ? (
            <Link className="btn btn-sm" href={`/stock-entries?replacement_for=${entry.id}`}>
              Create Replacement Entry
            </Link>
          ) : null}
        </div>

        {entry.generated_correction_entries?.length ? (
          <div style={{ display: "grid", gap: 6 }}>
            <div className="eyebrow">Generated Records</div>
            {entry.generated_correction_entries.map(generated => (
              <Link key={generated.id} href={`/stock-entries/${generated.id}`} className="chip" style={{ justifyContent: "space-between", textDecoration: "none" }}>
                <span>{generated.entry_number}</span>
                <span>{formatLabel(generated.reference_purpose ?? generated.entry_type)}</span>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}

function CorrectionModal({ entry, related, instances, onDone, onClose }: { entry: StockEntryRecord; related: RelatedEntries; instances: StockEntryItemInstance[]; onDone: (correction: CorrectionSubmitResult) => Promise<void>; onClose: () => void }) {
  const copy = getCorrectionModeCopy("difference");
  const quantityCopy = getQuantityCorrectionUiCopy(entry.entry_type);
  const [reason, setReason] = useState("");
  const [lineQuantities, setLineQuantities] = useState<Record<number, string>>({});
  const [lineInstances, setLineInstances] = useState<Record<number, string[]>>({});
  const [preview, setPreview] = useState<CorrectionPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLineQuantities(Object.fromEntries(entry.items.map(item => [item.id, String(item.accepted_quantity ?? item.quantity)])));
    setLineInstances({});
    setReason("");
    setPreview(null);
    setError(null);
    setBusy(false);
  }, [entry]);

  const payload = () => ({
    reason,
    lines: entry.items.map(item => ({
      id: item.id,
      corrected_quantity: Number(lineQuantities[item.id] || 0),
      instances: lineInstances[item.id] ?? [],
    })),
  });

  const lineStates = entry.items.map((item, index) => {
    const recordedQuantity = item.accepted_quantity ?? item.quantity;
    const rawQuantity = lineQuantities[item.id] ?? "";
    const correctedQuantity = Number(rawQuantity || 0);
    const delta = correctedQuantity - recordedQuantity;
    const selectableInstances = selectableCorrectionInstances(entry, item, related, instances, delta);
    const selectedInstanceCount = lineInstances[item.id]?.length ?? 0;
    const requiredInstanceCount = selectableInstances.length > 0 && delta !== 0 ? Math.abs(delta) : 0;
    return {
      item,
      index,
      recordedQuantity,
      rawQuantity,
      correctedQuantity,
      delta,
      selectableInstances,
      selectedInstanceCount,
      requiredInstanceCount,
    };
  });
  const hasChangedLine = lineStates.some(line => line.delta !== 0);
  const hasInvalidQuantity = lineStates.some(line => line.rawQuantity === "" || !Number.isFinite(line.correctedQuantity) || line.correctedQuantity < 0);
  const instanceSelectionError = lineStates.find(line => line.requiredInstanceCount > 0 && line.selectedInstanceCount !== line.requiredInstanceCount);
  const validationMessage = !reason.trim()
    ? "Enter a reason before submitting a correction."
    : hasInvalidQuantity
      ? "Quantities cannot be less than zero."
      : !hasChangedLine
        ? quantityCopy.unchangedMessage
        : instanceSelectionError
          ? `Select exactly ${instanceSelectionError.requiredInstanceCount} affected instance${instanceSelectionError.requiredInstanceCount === 1 ? "" : "s"} for ${instanceSelectionError.item.item_name ?? `item ${instanceSelectionError.item.item}`}.`
          : preview
            ? null
            : "Review what will happen before sending this correction request.";
  const canPreview = reason.trim().length > 0 && !hasInvalidQuantity && hasChangedLine && !instanceSelectionError;
  const canSubmit = canPreview && Boolean(preview) && preview?.resolution_type !== "BLOCKED";
  const changedPreviewLines = preview?.lines.filter(line => line.delta !== 0) ?? [];
  const primaryLabel = preview ? copy.submitLabel : "Check What Will Happen";

  const toggleLineInstance = (lineId: number, instanceId: number, checked: boolean) => {
    setLineInstances(prev => {
      const current = prev[lineId] ?? [];
      const value = String(instanceId);
      return {
        ...prev,
        [lineId]: checked
          ? [...current, value]
          : current.filter(candidate => candidate !== value),
      };
    });
    setPreview(null);
  };

  const runPreview = async () => {
    if (!canPreview) {
      setError(validationMessage ?? "Complete the correction details before previewing.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await apiFetch<CorrectionPreview>(`/api/inventory/stock-entries/${entry.id}/correction-preview/`, {
        method: "POST",
        body: JSON.stringify(payload()),
      });
      setPreview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview correction");
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const correction = await apiFetch<CorrectionSubmitResult>(`/api/inventory/stock-entries/${entry.id}/request-correction/`, {
        method: "POST",
        body: JSON.stringify(payload()),
      });
      await onDone(correction);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit correction");
    } finally {
      setBusy(false);
    }
  };

  const handlePrimaryAction = () => {
    if (preview) {
      void submit();
      return;
    }
    void runPreview();
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal stock-correction-modal" role="dialog" aria-modal="true" aria-labelledby="stock-correction-title" onMouseDown={event => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">Contextual correction</div>
            <h2 id="stock-correction-title">{copy.title}</h2>
            <div className="stock-ack-modal-sub">Use this only when the quantity on record is wrong.</div>
          </div>
          <button type="button" className="modal-close" aria-label="Close correction modal" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <div className="stock-correction-form">
            {error && <Alert>{error}</Alert>}
            <div className="notice notice-warn stock-correction-risk">
              <div className="notice-body">
                <div className="notice-title">{copy.disclaimerTitle}</div>
                <div className="notice-text">{copy.disclaimer}</div>
              </div>
            </div>
            <Field label="Reason">
              <textarea
                className="input stock-correction-reason-input"
                rows={3}
                value={reason}
                onChange={event => {
                  setReason(event.target.value);
                  setPreview(null);
                }}
                placeholder="Explain what mistake happened and why this correction is needed."
              />
            </Field>

            <div className="stock-correction-lines" aria-label="Correction lines">
              {lineStates.map(({ item, index, recordedQuantity, correctedQuantity, delta, selectableInstances, selectedInstanceCount }) => {
                const changeText = describeQuantityCorrectionChange(recordedQuantity, correctedQuantity);
                return (
                  <section key={item.id} className="stock-correction-line">
                    <div className="stock-correction-line-head">
                      <div className="stock-correction-item">
                        <div className="stock-correction-item-index">{String(index + 1).padStart(2, "0")}</div>
                        <div className="stock-correction-item-copy">
                          <div className="stock-correction-item-name">{item.item_name ?? `Item ${item.item}`}</div>
                          <div className="stock-correction-item-meta">{item.batch_number ?? "No batch"} · {trackingLabel(entry, item, related)} tracking</div>
                        </div>
                      </div>
                      <span className={`stock-correction-delta ${delta === 0 ? "is-neutral" : delta > 0 ? "is-positive" : "is-negative"}`}>
                        {changeText}
                      </span>
                    </div>

                    <div className="stock-correction-metrics">
                      <div className="stock-correction-metric">
                        <span>{quantityCopy.currentQuantityLabel}</span>
                        <strong>{recordedQuantity}</strong>
                      </div>
                      <label className="field stock-correction-quantity-field">
                        <span className="field-label">{quantityCopy.targetQuantityLabel}</span>
                        <input
                          className="input"
                          type="number"
                          min={0}
                          value={lineQuantities[item.id] ?? ""}
                          onChange={event => {
                            setLineQuantities(prev => ({ ...prev, [item.id]: event.target.value }));
                            setLineInstances(prev => ({ ...prev, [item.id]: [] }));
                            setPreview(null);
                          }}
                        />
                      </label>
                    </div>
                    <div className="stock-correction-line-help">{quantityCopy.helperText}</div>

                    {selectableInstances.length > 0 ? (
                      <div className="stock-correction-instance-picker">
                        <div className="stock-correction-instance-note">
                          <span>Select {Math.abs(delta)} affected instance{Math.abs(delta) === 1 ? "" : "s"}.</span>
                          <strong>{selectedInstanceCount} selected</strong>
                        </div>
                        <div className="stock-correction-instance-grid">
                          {selectableInstances.map(instanceId => (
                            <label key={instanceId} className="stock-correction-instance-chip">
                              <input
                                type="checkbox"
                                checked={(lineInstances[item.id] ?? []).includes(String(instanceId))}
                                onChange={event => toggleLineInstance(item.id, instanceId, event.target.checked)}
                              />
                              <span>{instanceIdentifier(instances.find(candidate => candidate.id === instanceId), instanceId)}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>

            {preview ? (
              <div className={`stock-correction-preview ${preview.resolution_type === "BLOCKED" ? "is-blocked" : "is-ready"}`}>
                <div>
                  <div className="stock-correction-preview-title">What will happen</div>
                  <div className="stock-correction-preview-text">{preview.message}</div>
                </div>
                {changedPreviewLines.length ? (
                  <div className="stock-correction-preview-lines">
                    {changedPreviewLines.map(line => (
                      <div key={line.id} className="stock-correction-preview-line">
                        {line.item_name}: {describeQuantityCorrectionChange(line.original_quantity, line.corrected_quantity)} · {line.message}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {validationMessage ? (
              <div className="notice notice-info stock-correction-guidance">
                <div className="notice-body">
                  <div className="notice-title">Next step</div>
                  <div className="notice-text">{validationMessage}</div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <div className="modal-foot">
          <div className="modal-foot-actions">
            <button type="button" className="btn" disabled={busy} onClick={onClose}>Close</button>
            <button type="button" className="btn btn-primary" disabled={(preview ? !canSubmit : !canPreview) || busy} onClick={handlePrimaryAction}>
              {busy ? (preview ? "Submitting..." : "Checking...") : primaryLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FullReversalModal({ entry, onDone, onClose }: { entry: StockEntryRecord; onDone: (correction: CorrectionSubmitResult) => Promise<void>; onClose: () => void }) {
  const copy = getCorrectionModeCopy("reversal");
  const [reason, setReason] = useState("");
  const [responsibilityAccepted, setResponsibilityAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validationMessage = validateFullReversalRequest(reason, responsibilityAccepted);
  const movementSummary = `${entry.from_location_name ?? "Source store"} -> ${entry.to_location_name ?? "Receiving store"}`;

  const submit = async () => {
    const validation = validateFullReversalRequest(reason, responsibilityAccepted);
    if (validation) {
      setError(validation);
      return;
    }

    const confirmed = window.confirm(
      `Request full return for ${entry.entry_number}? This will ask the receiving store to return the full transfer. Continue?`,
    );
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    try {
      const correction = await apiFetch<CorrectionSubmitResult>(`/api/inventory/stock-entries/${entry.id}/request-correction/`, {
        method: "POST",
        body: JSON.stringify(buildFullReversalPayload(entry, reason)),
      });
      await onDone(correction);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit full return request");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="modal stock-correction-modal stock-reversal-modal" role="dialog" aria-modal="true" aria-labelledby="stock-reversal-title" onMouseDown={event => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <div className="eyebrow">Exceptional stock action</div>
            <h2 id="stock-reversal-title">{copy.title}</h2>
            <div className="stock-ack-modal-sub">No quantity editing. This requests return of the complete transfer.</div>
          </div>
          <button type="button" className="modal-close" aria-label="Close full return modal" onClick={onClose}>x</button>
        </div>
        <div className="modal-body">
          <div className="stock-correction-form">
            {error && <Alert>{error}</Alert>}
            <div className="notice notice-warn stock-correction-risk">
              <div className="notice-body">
                <div className="notice-title">{copy.disclaimerTitle}</div>
                <div className="notice-text">{copy.disclaimer}</div>
              </div>
            </div>

            <div className="stock-reversal-summary" aria-label="Full return summary">
              <div>
                <span>Entry</span>
                <strong>{entry.entry_number}</strong>
              </div>
              <div>
                <span>Movement</span>
                <strong>{movementSummary}</strong>
              </div>
              <div>
                <span>Effect</span>
                <strong>Request full return from receiver</strong>
              </div>
            </div>

            <Field label="Reason">
              <textarea
                className="input stock-correction-reason-input"
                rows={3}
                value={reason}
                onChange={event => {
                  setReason(event.target.value);
                  setError(null);
                }}
                placeholder="Explain why this full transfer needs to be returned."
              />
            </Field>

            <label className="stock-reversal-ack">
              <input
                type="checkbox"
                checked={responsibilityAccepted}
                onChange={event => {
                  setResponsibilityAccepted(event.target.checked);
                  setError(null);
                }}
              />
              <span>I understand this is an auditable responsibility action and should only be used when an actual mistake happened.</span>
            </label>

            {validationMessage ? (
              <div className="notice notice-info stock-correction-guidance">
                <div className="notice-body">
                  <div className="notice-title">Next step</div>
                  <div className="notice-text">{validationMessage}</div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <div className="modal-foot">
          <div className="modal-foot-actions">
            <button type="button" className="btn" disabled={busy} onClick={onClose}>Close</button>
            <button type="button" className="btn btn-primary" disabled={Boolean(validationMessage) || busy} onClick={submit}>
              {busy ? "Submitting..." : copy.submitLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StockEntryDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { isLoading: capsLoading } = useCapabilities();
  const canView = useCan("stock-entries");
  const canApproveCorrections = useCan("stock-entries", "full");

  const [entry, setEntry] = useState<StockEntryRecord | null>(null);
  const [allEntries, setAllEntries] = useState<StockEntryRecord[]>([]);
  const [registers, setRegisters] = useState<StockRegisterRecord[]>([]);
  const [instances, setInstances] = useState<StockEntryItemInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [ackModalOpen, setAckModalOpen] = useState(false);
  const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
  const [correctionMode, setCorrectionMode] = useState<CorrectionMode>("difference");
  const [correctionActionBusy, setCorrectionActionBusy] = useState<"approve" | "apply" | "reject" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [entryData, entriesData, instanceData] = await Promise.all([
        apiFetch<StockEntryRecord>(`/api/inventory/stock-entries/${params.id}/`),
        apiFetch<Page<StockEntryRecord> | StockEntryRecord[]>("/api/inventory/stock-entries/?page_size=500"),
        apiFetch<Page<StockEntryItemInstance> | StockEntryItemInstance[]>("/api/inventory/item-instances/?page_size=1000"),
      ]);
      const registerPath = entryData.to_location
        ? `/api/inventory/stock-registers/?page_size=500&store=${entryData.to_location}`
        : "/api/inventory/stock-registers/?page_size=500";
      const registerData = await apiFetch<Page<StockRegisterRecord> | StockRegisterRecord[]>(registerPath);
      setEntry(entryData);
      setAllEntries(normalizeList(entriesData));
      setRegisters(normalizeList(registerData));
      setInstances(normalizeList(instanceData));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stock entry");
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => {
    if (capsLoading) return;
    if (!canView) {
      router.replace("/403");
      return;
    }
    load();
  }, [canView, capsLoading, load, router]);

  const cancelEntry = useCallback(async () => {
    if (!entry) return;
    const reason = window.prompt("Enter a cancellation reason.");
    if (!reason?.trim()) return;
    try {
      await apiFetch(`/api/inventory/stock-entries/${entry.id}/cancel/`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to cancel stock entry");
    }
  }, [entry, load]);

  const handleCorrectionDone = useCallback(async (correction: CorrectionSubmitResult) => {
    await load();
    setActionNotice(correctionSubmittedMessage(correction));
  }, [load]);

  const approveCorrection = useCallback(async () => {
    if (!entry?.active_correction) return;
    setCorrectionActionBusy("approve");
    setError(null);
    try {
      const correction = await apiFetch<CorrectionSubmitResult>(`/api/inventory/stock-corrections/${entry.active_correction.id}/approve/`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await load();
      setActionNotice(`Correction approved. ${correction.resolution_type === "REVERSAL" ? "Apply it to generate the return movement for the excess stock." : "Apply it to generate the linked stock records."}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve correction");
    } finally {
      setCorrectionActionBusy(null);
    }
  }, [entry?.active_correction, load]);

  const applyCorrectionRequest = useCallback(async () => {
    if (!entry?.active_correction) return;
    setCorrectionActionBusy("apply");
    setError(null);
    try {
      const correction = await apiFetch<CorrectionSubmitResult>(`/api/inventory/stock-corrections/${entry.active_correction.id}/apply/`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      await load();
      setActionNotice(correctionSubmittedMessage(correction));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to apply correction");
    } finally {
      setCorrectionActionBusy(null);
    }
  }, [entry?.active_correction, load]);

  const rejectCorrection = useCallback(async () => {
    if (!entry?.active_correction) return;
    const reason = window.prompt("Enter a rejection reason.");
    if (!reason?.trim()) return;
    setCorrectionActionBusy("reject");
    setError(null);
    try {
      await apiFetch<CorrectionSubmitResult>(`/api/inventory/stock-corrections/${entry.active_correction.id}/reject/`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      await load();
      setActionNotice("Correction rejected. No stock movement was generated.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject correction");
    } finally {
      setCorrectionActionBusy(null);
    }
  }, [entry?.active_correction, load]);

  const related = useMemo<RelatedEntries>(() => {
    if (!entry) {
      return { reference: null, children: [], linkedReceipt: null, generatedReturns: [] };
    }
    const reference = allEntries.find(candidate => candidate.id === entry.reference_entry) ?? null;
    const children = allEntries.filter(candidate => candidate.reference_entry === entry.id && candidate.id !== entry.id);
    const linkedReceipt = entry.entry_type === "ISSUE" ? children.find(candidate => candidate.entry_type === "RECEIPT") ?? null : null;
    const generatedReturns = entry.entry_type === "RECEIPT" ? children.filter(candidate => candidate.entry_type === "RETURN") : [];
    return { reference, children, linkedReceipt, generatedReturns };
  }, [allEntries, entry]);

  return (
    <div>
      <Topbar breadcrumb={["Operations", "Stock Entries", entry?.entry_number ?? "Detail"]} />
      <div className="page">
        {error && <Alert>{error}</Alert>}
        {actionNotice ? (
          <div className="notice notice-info">
            <div className="notice-body">
              <div className="notice-title">Correction submitted</div>
              <div className="notice-text">{actionNotice}</div>
            </div>
            <div className="notice-actions">
              <button type="button" className="btn btn-xs btn-ghost" onClick={() => setActionNotice(null)}>Dismiss</button>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="table-card" style={{ padding: 32, color: "var(--muted)", textAlign: "center" }}>Loading stock entry...</div>
        ) : entry ? (
          <>
            <Link className="page-back stock-page-back-inline" href="/stock-entries">
              <Ic d="M19 12H5M12 19l-7-7 7-7" size={12} />
              Back to Stock Entries
            </Link>
            <StockVoucherHead entry={entry} related={related} />
            <CorrectionActionsPanel
              entry={entry}
              canApproveCorrections={canApproveCorrections}
              correctionActionBusy={correctionActionBusy}
              onCancelEntry={cancelEntry}
              onResolveDifference={() => {
                setCorrectionMode("difference");
                setCorrectionModalOpen(true);
              }}
              onRequestReversal={() => {
                setCorrectionMode("reversal");
                setCorrectionModalOpen(true);
              }}
              onApproveCorrection={approveCorrection}
              onApplyCorrection={applyCorrectionRequest}
              onRejectCorrection={rejectCorrection}
            />
            <AcknowledgementNotice entry={entry} related={related} onAcknowledge={() => setAckModalOpen(true)} />
            <RoutingPanel entry={entry} related={related} />
            <ItemsIssuedTable entry={entry} related={related} instances={instances} />

            <div className="detail-grid">
              <div className="detail-main">
                <VoucherDetailsCard entry={entry} related={related} />
                <SignoffSection entry={entry} related={related} />
              </div>

              <aside className="detail-aside">
                <StatusAsideCard entry={entry} related={related} />
                <RelatedRecordsCard entry={entry} related={related} />
                <WorkflowHistoryCard entry={entry} related={related} />
              </aside>
            </div>
            {ackModalOpen && entry.can_acknowledge && entry.status === "PENDING_ACK" && (
              <AckModal entry={entry} related={related} registers={registers} instances={instances} onDone={load} onClose={() => setAckModalOpen(false)} />
            )}
            {correctionModalOpen && correctionMode === "difference" && entry.can_correct && (
              <CorrectionModal entry={entry} related={related} instances={instances} onDone={handleCorrectionDone} onClose={() => setCorrectionModalOpen(false)} />
            )}
            {correctionModalOpen && correctionMode === "reversal" && entry.can_request_reversal && (
              <FullReversalModal entry={entry} onDone={handleCorrectionDone} onClose={() => setCorrectionModalOpen(false)} />
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
