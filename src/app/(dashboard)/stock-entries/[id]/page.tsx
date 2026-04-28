"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { apiFetch, type Page } from "@/lib/api";
import { useCan, useCapabilities } from "@/contexts/CapabilitiesContext";

type EntryType = "RECEIPT" | "ISSUE" | "RETURN";
type EntryStatus = "DRAFT" | "PENDING_ACK" | "COMPLETED" | "REJECTED" | "CANCELLED";

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
  status: string;
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
  acknowledged_by?: number | null;
  acknowledged_by_name?: string | null;
  acknowledged_at?: string | null;
  cancelled_by_name?: string | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
  created_by_name?: string | null;
  created_at: string;
  can_acknowledge?: boolean;
}

interface RelatedEntries {
  reference: StockEntryRecord | null;
  children: StockEntryRecord[];
  linkedReceipt: StockEntryRecord | null;
  generatedReturns: StockEntryRecord[];
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

function initials(value: string | null | undefined) {
  return (value || "NA").split(" ").map(part => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
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

function resolveLine(entry: StockEntryRecord, item: StockEntryItemRecord, related: RelatedEntries): LineResolution {
  const mirror = entry.entry_type === "ISSUE" ? findReceiptMirror(related.linkedReceipt, item) : null;
  const accepted = item.accepted_quantity ?? mirror?.accepted_quantity ?? null;
  const returned = accepted == null ? null : Math.max(0, item.quantity - accepted);
  return { accepted, returned, mirror };
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

function trackingLabel(item: StockEntryItemRecord) {
  return item.instances.length > 0 ? "Individual" : "Quantity";
}

function LineDetails({ entry, item, line, instanceMap }: { entry: StockEntryRecord; item: StockEntryItemRecord; line: LineResolution; instanceMap: Map<number, StockEntryItemInstance> }) {
  const acceptedIds = new Set((line.mirror?.accepted_instances ?? item.accepted_instances ?? []).map(Number));
  const returned = line.returned ?? null;

  if (item.instances.length > 0) {
    return (
      <div style={{ display: "grid", gap: 10 }}>
        <div className="eyebrow">Transferred instances</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
          {item.instances.map(instanceId => {
            const instance = instanceMap.get(instanceId);
            const accepted = acceptedIds.size ? acceptedIds.has(instanceId) : returned === 0 && entry.status === "COMPLETED";
            return (
              <div key={instanceId} style={{ border: "1px solid var(--hairline)", borderRadius: "var(--radius-lg)", padding: "10px 12px", background: "var(--surface)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <strong>{instance?.serial_number ?? `Instance ${instanceId}`}</strong>
                  <span className={`pill ${accepted ? "pill-success" : returned ? "pill-warning" : "pill-neutral"}`}>
                    {accepted ? "Accepted" : returned ? "Returned" : formatLabel(instance?.status)}
                  </span>
                </div>
                <div className="login-cell-sub mono" style={{ marginTop: 6 }}>{instance?.qr_code ?? `#${instanceId}`}</div>
                <div className="login-cell-sub" style={{ marginTop: 4 }}>{instance?.location_name ?? instance?.full_location_path ?? "Location pending sync"}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
      <div className="login-cell-sub"><strong>Source Ref:</strong> {item.stock_register_name ?? "-"}{item.page_number ? ` / p.${item.page_number}` : ""}</div>
      <div className="login-cell-sub"><strong>Ack Ref:</strong> {(line.mirror?.ack_stock_register_name ?? item.ack_stock_register_name) ?? "-"}{(line.mirror?.ack_page_number ?? item.ack_page_number) ? ` / p.${line.mirror?.ack_page_number ?? item.ack_page_number}` : ""}</div>
      <div className="login-cell-sub"><strong>Sent:</strong> {item.quantity}</div>
      <div className="login-cell-sub"><strong>Accepted:</strong> {line.accepted ?? "Pending"}</div>
      <div className="login-cell-sub"><strong>Returned:</strong> {line.returned ?? "Pending"}</div>
      <div className="login-cell-sub"><strong>Batch:</strong> {item.batch_number ?? "No batch"}</div>
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
                        <div className="user-username mono">{item.instances.length ? `${item.instances.length} instances` : item.batch_number ?? "No batch"}</div>
                      </div>
                    </div>
                  </td>
                  <td><span className="chip">{trackingLabel(item)}</span></td>
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
                          <strong style={{ fontSize: 13 }}>{item.instances.length ? "Instance trail" : "Quantity and register breakdown"}</strong>
                          <span className="mono muted-note">Click row again to collapse</span>
                        </div>
                        <LineDetails entry={entry} item={item} line={line} instanceMap={instanceMap} />
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

function AckForm({ entry, registers, onDone }: { entry: StockEntryRecord; registers: StockRegisterRecord[]; onDone: () => Promise<void> }) {
  const [values, setValues] = useState(() => Object.fromEntries(entry.items.map(item => [item.id, {
    quantity: entry.entry_type === "RETURN" ? item.quantity : item.accepted_quantity ?? item.quantity,
    instances: item.accepted_instances?.length ? item.accepted_instances.map(String) : item.instances.map(String),
    ack_stock_register: item.ack_stock_register ? String(item.ack_stock_register) : "",
    ack_page_number: item.ack_page_number ? String(item.ack_page_number) : "",
  }])) as Record<number, { quantity: number; instances: string[]; ack_stock_register: string; ack_page_number: string }>);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isReturn = entry.entry_type === "RETURN";
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
    <Panel eyebrow="Action" title={isReturn ? "Acknowledge Returned Stock" : "Record Receiving Decision"} actions={<span className="pill pill-warning">Pending acknowledgement</span>}>
      <div style={{ display: "grid", gap: 14 }}>
        {error && <Alert>{error}</Alert>}
        {entry.items.map(item => {
          const row = values[item.id];
          const returning = item.quantity - row.quantity;
          return (
            <div key={item.id} style={{ borderBottom: "1px solid var(--hairline)", padding: "12px 0", display: "grid", gap: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <strong>{item.item_name ?? `Item ${item.item}`}</strong>
                <span className="mono muted-note">Sent {item.quantity}{returning > 0 ? ` / returning ${returning}` : ""}</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                <Field label="Accepted Quantity">
                  <input className="input" type="number" min="1" max={item.quantity} value={row.quantity} disabled={isReturn || item.instances.length > 0} onChange={event => update(item.id, { quantity: Number(event.target.value) })} />
                </Field>
                <Field label="Ack Register">
                  <select value={row.ack_stock_register} onChange={event => update(item.id, { ack_stock_register: event.target.value })}>
                    <option value="">Choose register</option>
                    {ackRegisters.map(register => (
                      <option key={register.id} value={register.id}>{register.register_number} - {register.store_name}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Ack Page">
                  <input className="input" type="number" min="1" value={row.ack_page_number} onChange={event => update(item.id, { ack_page_number: event.target.value })} />
                </Field>
              </div>
              {item.instances.length > 0 && !isReturn && (
                <div className="group-cell">
                  {item.instances.map(instanceId => (
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
                      Instance {instanceId}
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-primary" disabled={!canSubmit || busy} onClick={submit}>
            {busy ? "Acknowledging..." : "Submit Acknowledgement"}
          </button>
        </div>
      </div>
    </Panel>
  );
}

export default function StockEntryDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { isLoading: capsLoading } = useCapabilities();
  const canView = useCan("stock-entries");

  const [entry, setEntry] = useState<StockEntryRecord | null>(null);
  const [allEntries, setAllEntries] = useState<StockEntryRecord[]>([]);
  const [registers, setRegisters] = useState<StockRegisterRecord[]>([]);
  const [instances, setInstances] = useState<StockEntryItemInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [entryData, entriesData, registerData, instanceData] = await Promise.all([
        apiFetch<StockEntryRecord>(`/api/inventory/stock-entries/${params.id}/`),
        apiFetch<Page<StockEntryRecord> | StockEntryRecord[]>("/api/inventory/stock-entries/?page_size=500"),
        apiFetch<Page<StockRegisterRecord> | StockRegisterRecord[]>("/api/inventory/stock-registers/?page_size=500"),
        apiFetch<Page<StockEntryItemInstance> | StockEntryItemInstance[]>("/api/inventory/item-instances/?page_size=1000"),
      ]);
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

  const summary = entry ? typeSummary(entry) : null;

  return (
    <div>
      <Topbar breadcrumb={["Operations", "Stock Entries", entry?.entry_number ?? "Detail"]} />
      <div className="page">
        <Link className="detail-page-back" href="/stock-entries">
          <Ic d="M19 12H5M12 19l-7-7 7-7" size={12} />
          Back to Stock Entries
        </Link>

        <div className="page-head-detail stock-entry-detail-head">
          <div className="page-title-group">
            <div className="eyebrow">Stock Entry Detail</div>
            <h1>{entry?.entry_number ?? "Stock Entry"}</h1>
            <div className="page-sub">{summary ? `${summary.title}. Audit, linked movement, and line-level stock information are shown below.` : "Operational stock movement record."}</div>
            {entry && (
              <div className="page-id-row">
                <span className="doc-no">{formatLabel(entry.entry_type)}</span>
                <StatusPill status={entry.status} />
              </div>
            )}
          </div>
        </div>

        {error && <Alert>{error}</Alert>}

        {loading ? (
          <div className="table-card" style={{ padding: 32, color: "var(--muted)", textAlign: "center" }}>Loading stock entry...</div>
        ) : entry ? (
          <>
            <HeroStrip entry={entry} />

            <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 720px", minWidth: 0, display: "grid", gap: 12 }}>
                <ItemLedger entry={entry} instances={instances} related={related} />
                {entry.can_acknowledge && entry.status === "PENDING_ACK" && (
                  <AckForm entry={entry} registers={registers} onDone={load} />
                )}
              </div>

              <aside style={{ flex: "0 1 340px", minWidth: 280, display: "grid", gap: 12 }}>
                <LifecyclePanel entry={entry} related={related} />
                <RelatedRecordsPanel entry={entry} related={related} />
                <RegisterTrailPanel entry={entry} related={related} />
                <NotesPanel entry={entry} />
              </aside>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
