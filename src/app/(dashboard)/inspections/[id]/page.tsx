"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import {
  InspectionIcon,
  RejectInspectionModal,
  ReturnInspectionModal,
} from "@/components/inspections/InspectionDialogs";
import {
  Stage1Form,
  Stage2Form,
  Stage3Form,
  Stage4Form,
} from "@/components/inspections/InspectionStageForms";
import { ApiError, apiFetch } from "@/lib/api";
import { useCapabilities } from "@/contexts/CapabilitiesContext";
import {
  API_BASE,
  canResumeInspectionEditor,
  formatInspectionDate,
  formatInspectionDateShort,
  getInspectionActiveRevisionRequest,
  getInspectionAuditEntries,
  getInspectionItemSecondaryLine,
  getInspectionRegisterCoverage,
  getInspectionRegisterDetailRows,
  getInspectionRegisterRefs,
  getInspectionReturnActionLabel,
  getInspectionStageDisplayLabel,
  getInspectionStageGuidance,
  getInspectionValueTotals,
  getInspectionWorkflowSteps,
  INSPECTION_STAGE_LABELS,
  type InspectionItemRecord,
  type InspectionRecord,
  type InspectionWorkflowStep,
} from "@/lib/inspectionUi";
import {
  buildStageItemsPayload,
  getInspectionItemFinancials,
  normalizeStageItems,
} from "@/lib/inspectionStageForms";

function formatInspectionDateTime(value: string | null | undefined) {
  if (!value) return "Pending";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatCurrency(value: number) {
  return value.toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getDisplayTitle(inspection: InspectionRecord) {
  const primary = inspection.contractor_name?.trim() || inspection.contract_no;
  const secondary = inspection.department_name?.trim();
  return secondary ? `${primary} - ${secondary}` : primary;
}

function getDisplaySubtitle(inspection: InspectionRecord) {
  return (
    `Acceptance inspection of contract ${inspection.contract_no}, vendor ${inspection.contractor_name || "not recorded"}. ` +
    `${inspection.date_of_delivery ? `Delivery received on ${formatInspectionDate(inspection.date_of_delivery)}, ` : "Delivery date not recorded, "}` +
    `currently under ${getInspectionStageDisplayLabel(inspection).toLowerCase()}.`
  );
}

function getDocumentHref(file: string) {
  return file.startsWith("http") ? file : `${API_BASE}${file}`;
}

function getDocumentBadge(file: string, label: string) {
  const source = (label || file).toLowerCase();
  if (source.endsWith(".pdf")) return "PDF";
  if (source.endsWith(".docx")) return "DOC";
  if (source.endsWith(".xlsx") || source.endsWith(".xls")) return "XLS";
  if (/\.(png|jpe?g|gif|webp)$/.test(source)) return "IMG";
  return "FILE";
}

function visibleWorkflowSteps(inspection: InspectionRecord) {
  return getInspectionWorkflowSteps(inspection).filter(step => step.key !== "DRAFT");
}

function workflowStateClass(state: InspectionWorkflowStep["state"]) {
  if (state === "complete") return "is-complete";
  if (state === "current") return "is-current";
  if (state === "rejected") return "is-rejected";
  return "is-upcoming";
}

function stageClass(stage: InspectionWorkflowStep["key"]) {
  return `stage-${stage.toLowerCase().replaceAll("_", "-")}`;
}

function getStagePillClass(stage: InspectionRecord["stage"]) {
  if (stage === "COMPLETED") return "pill-success";
  if (stage === "REJECTED") return "pill-danger";
  if (stage === "DRAFT") return "pill-draft";
  if (stage === "FINANCE_REVIEW") return "pill-warn";
  return "pill-info";
}

function StageStatusPill({ inspection }: { inspection: InspectionRecord }) {
  const steps = visibleWorkflowSteps(inspection);
  const effectiveStage = inspection.stage === "REJECTED" ? inspection.rejection_stage : inspection.stage;
  const index = steps.findIndex(step => step.key === effectiveStage);
  const label = inspection.stage === "DRAFT" || index < 0
    ? getInspectionStageDisplayLabel(inspection)
    : inspection.stage === "REJECTED"
      ? `${getInspectionStageDisplayLabel(inspection)} at Stage ${index + 1} of ${steps.length} - ${INSPECTION_STAGE_LABELS[effectiveStage ?? inspection.stage]}`
      : `Stage ${index + 1} of ${steps.length} - ${INSPECTION_STAGE_LABELS[effectiveStage ?? inspection.stage]}`;

  return (
    <span className={`pill pill-lg ${getStagePillClass(inspection.stage)}`}>
      <span className="status-dot" />
      {label}
    </span>
  );
}

function WorkflowTracker({ inspection }: { inspection: InspectionRecord }) {
  const steps = visibleWorkflowSteps(inspection);
  const rejectedStepLabel = inspection.status === "CANCELLED" ? "Cancelled at this step" : "Rejected at this step";
  return (
    <div className="inspection-workflow-strip" style={{ gridTemplateColumns: `repeat(${Math.max(steps.length, 1)}, minmax(0, 1fr))` }}>
      {steps.map((step, index) => (
        <div key={step.key} className={`inspection-workflow-step ${stageClass(step.key)} ${workflowStateClass(step.state)}`}>
          <div className="inspection-workflow-marker">
            <div className="inspection-workflow-badge">
              {step.state === "complete" ? "✓" : step.state === "rejected" ? "!" : index + 1}
            </div>
            <div>
              <div className="inspection-workflow-label">{step.label}</div>
              <div className="inspection-workflow-status">
                {step.state === "current" ? "Current hand-off" : step.state === "complete" ? "Completed workflow step" : step.state === "rejected" ? rejectedStepLabel : "Pending workflow step"}
              </div>
            </div>
          </div>
          <div className="inspection-workflow-owner">{step.ownerLabel ?? "Pending officer"}</div>
          <div className="inspection-workflow-meta-grid">
            <span>{step.activityAt ? formatInspectionDateShort(step.activityAt) : "Pending"}</span>
            <span>{step.state}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function KeyValue({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="detail-kv">
      <div className="detail-kv-label">{label}</div>
      <div className="detail-kv-value">{value || "—"}</div>
      {sub ? <div className="detail-kv-sub">{sub}</div> : null}
    </div>
  );
}

function CertificateInfoCard({ inspection }: { inspection: InspectionRecord }) {
  return (
    <section className="detail-card active-stage-card">
      <header className="detail-card-head">
        <div>
          <div className="eyebrow">Certificate information</div>
          <h2>Contract, indenter, delivery and inspection details</h2>
        </div>
        <StageStatusPill inspection={inspection} />
      </header>
      <div className="detail-card-body">
        <div className="detail-kv-grid">
          <KeyValue label="Contract / invoice no" value={inspection.contract_no} />
          <KeyValue label="Certificate date" value={formatInspectionDate(inspection.date)} />
          <KeyValue label="Contract date" value={formatInspectionDate(inspection.contract_date)} />
          <KeyValue label="Indent no" value={inspection.indent_no} />
          <KeyValue label="Indenter" value={inspection.indenter} />
          <KeyValue label="Department" value={inspection.department_name} sub={`Hierarchy level ${inspection.department_hierarchy_level}`} />
          <KeyValue label="Contractor" value={inspection.contractor_name} />
          <KeyValue label="Delivery" value={formatInspectionDate(inspection.date_of_delivery)} sub={inspection.delivery_type === "FULL" ? "Full delivery" : "Partial delivery"} />
          <KeyValue label="Inspected by" value={inspection.inspected_by} />
          <KeyValue label="Inspection date" value={formatInspectionDate(inspection.date_of_inspection)} />
          <KeyValue label="Consignee" value={inspection.consignee_name} />
          <KeyValue label="Designation" value={inspection.consignee_designation} />
        </div>
        <div className="detail-muted-row" style={{ marginTop: 18 }}>{inspection.remarks || "No supplementary remarks recorded."}</div>
      </div>
    </section>
  );
}

function ItemsSummary({ inspection }: { inspection: InspectionRecord }) {
  const values = getInspectionValueTotals(inspection);
  return (
    <section className="detail-card">
      <header className="detail-card-head">
        <div>
          <div className="eyebrow">Items inspected</div>
          <h2>Accepted, rejected and pricing summary</h2>
        </div>
        <div className="detail-card-head-meta">{inspection.items.length} line items</div>
      </header>
      <div className="h-scroll">
        <table className="inspection-line-table inspection-line-table-review inspection-line-table-pricing">
          <thead>
            <tr>
              <th className="idx">#</th>
              <th>Item</th>
              <th className="num center">Tendered</th>
              <th className="num center">Accepted</th>
              <th className="num center">Rejected</th>
              <th className="num center">Unit Price</th>
              <th className="num center">Total Price</th>
            </tr>
          </thead>
          <tbody>
            {inspection.items.map((item, index) => {
              const financials = getInspectionItemFinancials(item);
              const secondaryLine = getInspectionItemSecondaryLine(item);
              const canViewDistribution =
                inspection.stage === "COMPLETED" &&
                item.item_tracking_type === "QUANTITY" &&
                item.id != null;
              const trackingBatch = item.batch_number?.trim();
              return (
                <tr key={item.id ?? index}>
                  <td className="idx">{index + 1}</td>
                  <td className="item-cell">
                    <div className="inspection-line-primary">{item.item_description || item.item_name || "Unnamed item"}</div>
                    {secondaryLine ? (
                      <div className="inspection-line-secondary">{secondaryLine}</div>
                    ) : null}
                    {trackingBatch || canViewDistribution ? (
                      <div className="inspection-line-track" style={{ marginTop: 8 }}>
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
                          {trackingBatch ? <span className="chip">Batch {trackingBatch}</span> : null}
                          {canViewDistribution ? (
                            <Link className="btn-link" href={`/inspections/${inspection.id}/items/${item.id}/distribution`}>
                              View distribution
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    {item.remarks ? <div className="inspection-line-note">{item.remarks}</div> : null}
                  </td>
                  <td className="num center">{item.tendered_quantity}</td>
                  <td className="num center inspection-qty-value-accepted">{item.accepted_quantity}</td>
                  <td className="num center inspection-qty-value-rejected">{item.rejected_quantity}</td>
                  <td className="num center">PKR {formatCurrency(financials.unitPrice)}</td>
                  <td className="num center">PKR {formatCurrency(financials.totalPrice)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <footer className="detail-card-foot">
        <div className="inspection-lines-foot">
          <div className="inspection-lines-foot-meta">Totals are calculated from the certificate item lines currently returned by the backend.</div>
          <div className="inspection-lines-foot-totals">
            <div className="detail-total-block">
              <div className="detail-total-label">Accepted value</div>
              <div className="detail-total-value">PKR {formatCurrency(values.accepted)}</div>
            </div>
            <div className="detail-total-block">
              <div className="detail-total-label">Rejected value</div>
              <div className="detail-total-value">PKR {formatCurrency(values.rejected)}</div>
            </div>
          </div>
        </div>
      </footer>
    </section>
  );
}

function RegisterTrailCard({ inspection }: { inspection: InspectionRecord }) {
  const coverage = getInspectionRegisterCoverage(inspection);
  const rows = getInspectionRegisterDetailRows(inspection);
  const stockRefs = getInspectionRegisterRefs(inspection.items, "stock");
  const centralRefs = getInspectionRegisterRefs(inspection.items, "central");
  const acceptedCount = rows.length;
  const stockCoveredCount = rows.filter(row => Boolean(row.stockRegisterRef)).length;
  const centralCoveredCount = rows.filter(row => Boolean(row.centralRegisterRef)).length;
  const fullyLinkedCount = rows.filter(row => coverage.requiresStockStage ? Boolean(row.stockRegisterRef && row.centralRegisterRef) : Boolean(row.centralRegisterRef)).length;
  const columnCount = coverage.requiresStockStage ? 5 : 3;

  return (
    <section className="detail-card">
      <header className="detail-card-head">
        <div>
          <div className="eyebrow">Register trail</div>
          <h2>Department and central register snapshot</h2>
        </div>
        <div className="detail-card-head-meta">{rows.length} accepted line{rows.length === 1 ? "" : "s"}</div>
      </header>
      <div className="detail-card-body">
        <div className="inspection-lines-foot">
          <div className="inspection-lines-foot-meta">
            {coverage.requiresStockStage
              ? "Departmental stock details show the register, page number, and recording date captured before the certificate moved to central register review."
              : "Root-level inspections skip departmental stock details and only require central register references."}
          </div>
          <div className="inspection-lines-foot-totals">
            {coverage.requiresStockStage ? (
              <div className="detail-total-block">
                <div className="detail-total-label">Dept. coverage</div>
                <div className="detail-total-value">{stockCoveredCount} / {acceptedCount}</div>
              </div>
            ) : null}
            <div className="detail-total-block">
              <div className="detail-total-label">Central coverage</div>
              <div className="detail-total-value">{centralCoveredCount} / {acceptedCount}</div>
            </div>
            <div className="detail-total-block">
              <div className="detail-total-label">Fully linked</div>
              <div className="detail-total-value">{fullyLinkedCount} / {acceptedCount}</div>
            </div>
          </div>
        </div>
      </div>
      <div className="h-scroll">
        <table className="inspection-line-table inspection-line-table-review">
          <thead>
            <tr>
              <th>Item</th>
              <th className="num center">Accepted</th>
              {coverage.requiresStockStage ? (
                <>
                  <th>Department register</th>
                  <th>Recorded on</th>
                </>
              ) : null}
              <th>Central register</th>
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? rows.map((row, index) => (
              <tr key={`${row.itemLabel}-${index}`}>
                <td className="item-cell">
                  <div className="inspection-line-primary">{row.itemLabel}</div>
                </td>
                <td className="num center">{row.acceptedQuantity}</td>
                {coverage.requiresStockStage ? (
                  <>
                    <td className="mono">{row.stockRegisterRef ?? "Pending"}</td>
                    <td>{formatInspectionDate(row.stockEntryDate)}</td>
                  </>
                ) : null}
                <td className="mono">{row.centralRegisterRef ?? "Pending"}</td>
              </tr>
            )) : (
              <tr>
                <td colSpan={columnCount}>
                  <div className="detail-empty-copy">No accepted items require register tracking yet.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <footer className="detail-card-foot">
        <div style={{ display: "grid", gap: 12, width: "100%" }}>
          {coverage.requiresStockStage ? (
            <div>
              <div className="eyebrow">Department refs</div>
              <div className="group-cell">
                {stockRefs.length > 0 ? stockRefs.map(ref => <span key={ref} className="chip mono">{ref}</span>) : <span className="detail-muted-row">Department register pending</span>}
              </div>
            </div>
          ) : null}
          <div>
            <div className="eyebrow">Central refs</div>
            <div className="group-cell">
              {centralRefs.length > 0 ? centralRefs.map(ref => <span key={ref} className="chip mono">{ref}</span>) : <span className="detail-muted-row">Central register pending</span>}
            </div>
          </div>
        </div>
      </footer>
    </section>
  );
}

function SupportingDocuments({ inspection }: { inspection: InspectionRecord }) {
  return (
    <section className="detail-card">
      <header className="detail-card-head">
        <div>
          <div className="eyebrow">Supporting documents</div>
          <h2>Attachments and evidence</h2>
        </div>
        <div className="detail-card-head-meta">{inspection.documents.length} files</div>
      </header>
      <div className="detail-card-body">
        <div className="detail-doc-list">
          {inspection.documents.length > 0 ? inspection.documents.map(document => (
            <a className="detail-doc-row" key={document.id} href={getDocumentHref(document.file)} target="_blank" rel="noopener noreferrer">
              <span className="detail-doc-icon">{getDocumentBadge(document.file, document.label)}</span>
              <span className="detail-doc-copy">
                <span className="detail-doc-name">{document.label || "Inspection document"}</span>
                <span className="detail-doc-sub">{formatInspectionDateTime(document.uploaded_at)}</span>
              </span>
              <span className="detail-doc-arrow">
                <InspectionIcon d="M7 17L17 7M7 7h10v10" size={14} />
              </span>
            </a>
          )) : (
            <div className="detail-empty-copy">No supporting documents are attached.</div>
          )}
        </div>
      </div>
    </section>
  );
}

function StageActionCue({ inspection }: { inspection: InspectionRecord }) {
  if (inspection.stage === "COMPLETED" || inspection.stage === "REJECTED") return null;

  return (
    <a className="inspection-stage-cue" href="#active-stage-form" aria-label={`Jump to ${INSPECTION_STAGE_LABELS[inspection.stage]} form`}>
      <span className="inspection-stage-cue-icon">!</span>
      <span className="inspection-stage-cue-copy">
        <span className="inspection-stage-cue-title">{INSPECTION_STAGE_LABELS[inspection.stage]} requires input</span>
        <span className="inspection-stage-cue-sub">Jump to the active form before moving this certificate forward.</span>
      </span>
    </a>
  );
}

function ActiveStageCard({
  inspection,
  editableInspection,
  canEdit,
  canActStage1,
  canActStage2,
  canActStage3,
  canActStage4,
  canReturn,
  returnLabel,
  busyAction,
  onChange,
  onSave,
  onSubmit,
  onReturn,
}: {
  inspection: InspectionRecord;
  editableInspection: InspectionRecord;
  canEdit: boolean;
  canActStage1: boolean;
  canActStage2: boolean;
  canActStage3: boolean;
  canActStage4: boolean;
  canReturn: boolean;
  returnLabel: string | null;
  busyAction: string | null;
  onChange: (data: InspectionRecord) => void;
  onSave: () => void;
  onSubmit: () => void;
  onReturn: () => void;
}) {
  const readOnly = !canEdit || busyAction !== null;
  const actionLabel = inspection.stage === "DRAFT"
    ? "Initiate workflow"
    : inspection.stage === "STOCK_DETAILS"
      ? "Submit to Central"
      : inspection.stage === "CENTRAL_REGISTER"
        ? "Submit to Finance"
        : inspection.stage === "FINANCE_REVIEW"
          ? "Final approval"
          : null;
  const canSubmit =
    (inspection.stage === "DRAFT" && canActStage1) ||
    (inspection.stage === "STOCK_DETAILS" && canActStage2) ||
    (inspection.stage === "CENTRAL_REGISTER" && canActStage3) ||
    (inspection.stage === "FINANCE_REVIEW" && canActStage4);

  return (
    <section className="detail-card" id="active-stage-form">
      <header className="detail-card-head">
        <div>
          <div className="eyebrow">Active stage form</div>
          <h2>{getInspectionStageDisplayLabel(inspection)}</h2>
          <div className="detail-card-head-meta">{getInspectionStageGuidance(inspection)}</div>
        </div>
      </header>
      <div className="detail-card-body">
        {inspection.stage === "DRAFT" ? (
          <Stage1Form data={editableInspection} onChange={onChange} readOnly={readOnly} />
        ) : inspection.stage === "STOCK_DETAILS" ? (
          <Stage2Form data={editableInspection} onChange={onChange} readOnly={readOnly} />
        ) : inspection.stage === "CENTRAL_REGISTER" ? (
          <Stage3Form data={editableInspection} onChange={onChange} readOnly={readOnly} />
        ) : inspection.stage === "FINANCE_REVIEW" ? (
          <Stage4Form data={editableInspection} onChange={onChange} readOnly={readOnly} />
        ) : (
          <Stage4Form data={editableInspection} onChange={onChange} readOnly />
        )}
      </div>
      {inspection.stage !== "COMPLETED" && inspection.stage !== "REJECTED" ? (
        <footer className="detail-card-foot">
          <div className="stage-action-foot">
            <div className="stage-action-foot-meta">
              Save progress keeps the current stage open. Return asks for a revision reason and sends the certificate back one workflow step without clearing the recorded stage data — save current edits first if you need to keep them.
            </div>
            <div className="stage-action-foot-actions">
              {canReturn && returnLabel ? (
                <button type="button" className="btn btn-sm btn-ghost" onClick={onReturn} disabled={busyAction !== null}>
                  <InspectionIcon d="M15 18l-6-6 6-6" size={14} />
                  {returnLabel}
                </button>
              ) : null}
              <button type="button" className="btn btn-sm" onClick={onSave} disabled={readOnly}>
                <InspectionIcon d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2zM17 21v-8H7v8M7 3v5h8" size={14} />
                Save progress
              </button>
              {actionLabel && canSubmit ? (
                <button type="button" className="btn btn-sm btn-primary" onClick={onSubmit} disabled={busyAction !== null}>
                  <InspectionIcon d="M20 6L9 17l-5-5" size={14} />
                  {busyAction ? "Processing..." : actionLabel}
                </button>
              ) : null}
            </div>
          </div>
        </footer>
      ) : null}
    </section>
  );
}

function WorkflowHistory({ inspection }: { inspection: InspectionRecord }) {
  const entries = getInspectionAuditEntries(inspection);
  return (
    <section className="detail-card">
      <header className="detail-card-head">
        <div>
          <div className="eyebrow">Approval trail</div>
          <h2>Workflow history</h2>
        </div>
        <div className="detail-card-head-meta">{entries.length} events</div>
      </header>
      <div className="detail-card-body">
        <ol className="trail">
          {entries.map((entry, index) => (
            <li key={entry.key} className={`trail-entry trail-${entry.tone}`}>
              <div className="trail-marker">
                <span className="trail-dot">{entry.tone === "danger" ? "!" : entry.tone === "pending" ? index + 1 : "✓"}</span>
                {index < entries.length - 1 ? <span className="trail-line" /> : null}
              </div>
              <div className="trail-content">
                <div className="trail-row">
                  <span className="trail-label">{entry.label}</span>
                  <span className="trail-when">{formatInspectionDateTime(entry.when)}</span>
                </div>
                <div className="detail-audit-actor">{entry.actor}</div>
                <div className="detail-audit-note">{entry.note}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function RelatedStockEntries({ inspection }: { inspection: InspectionRecord }) {
  return (
    <section className="detail-card">
      <header className="detail-card-head">
        <div>
          <div className="eyebrow">Related entries</div>
          <h2>Generated stock entries</h2>
        </div>
        <div className="detail-card-head-meta">{inspection.stock_entries.length} entries</div>
      </header>
      <div className="detail-card-body">
        {inspection.stock_entries.length > 0 ? (
          <div className="related-stock-entry-list">
            {inspection.stock_entries.map(entry => (
              <Link key={entry.id} href={`/stock-entries/${entry.id}`} className="related-stock-entry-row">
                <span className="related-stock-entry-icon">{entry.entry_type.slice(0, 2)}</span>
                <span className="related-stock-entry-copy">
                  <span className="related-stock-entry-number">{entry.entry_number}</span>
                  <span className="related-stock-entry-meta">{entry.entry_type} · {entry.status}</span>
                </span>
                <span className="related-stock-entry-date">{formatInspectionDate(entry.entry_date)}</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="detail-empty-copy">No stock entries have been generated from this certificate yet.</div>
        )}
      </div>
    </section>
  );
}

function buildDraftPayload(inspection: InspectionRecord) {
  return {
    date: inspection.date,
    contract_no: inspection.contract_no,
    contract_date: inspection.contract_date || null,
    contractor_name: inspection.contractor_name,
    contractor_address: inspection.contractor_address || null,
    indenter: inspection.indenter,
    indent_no: inspection.indent_no,
    department: inspection.department || null,
    date_of_delivery: inspection.date_of_delivery || null,
    delivery_type: inspection.delivery_type,
    remarks: inspection.remarks || null,
    inspected_by: inspection.inspected_by || null,
    date_of_inspection: inspection.date_of_inspection || null,
    consignee_name: inspection.consignee_name || null,
    consignee_designation: inspection.consignee_designation || null,
    items: normalizeStageItems(inspection.items).map(item => ({
      ...(item.id ? { id: item.id } : {}),
      item: item.item || null,
      item_description: item.item_description,
      item_specifications: item.item_specifications || null,
      tendered_quantity: item.tendered_quantity,
      accepted_quantity: item.accepted_quantity,
      rejected_quantity: item.rejected_quantity,
      unit_price: item.unit_price,
      remarks: item.remarks || null,
    })),
  };
}

function buildStagePayload(inspection: InspectionRecord) {
  if (inspection.stage === "DRAFT") return buildDraftPayload(inspection);
  if (inspection.stage === "STOCK_DETAILS") {
    return { items: buildStageItemsPayload(normalizeStageItems(inspection.items), "stock") };
  }
  if (inspection.stage === "CENTRAL_REGISTER") {
    return { items: buildStageItemsPayload(normalizeStageItems(inspection.items), "central") };
  }
  if (inspection.stage === "FINANCE_REVIEW") {
    return {
      items: buildStageItemsPayload(normalizeStageItems(inspection.items), "finance"),
      finance_check_date: inspection.finance_check_date || null,
    };
  }
  return {};
}

function getTransitionPath(inspection: InspectionRecord) {
  if (inspection.stage === "DRAFT") return "initiate";
  if (inspection.stage === "STOCK_DETAILS") return "submit_to_central_register";
  if (inspection.stage === "CENTRAL_REGISTER") return "submit_to_finance_review";
  if (inspection.stage === "FINANCE_REVIEW") return "complete";
  return null;
}

export default function InspectionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { can, hasInspectionStage, isLoading: capsLoading, isSuperuser } = useCapabilities();

  const canView = can("inspections", "view");
  const canManage = can("inspections", "manage");
  const canFull = can("inspections", "full");

  const [inspection, setInspection] = useState<InspectionRecord | null>(null);
  const [editableInspection, setEditableInspection] = useState<InspectionRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);

  const loadInspection = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<InspectionRecord>(`/api/inventory/inspections/${params.id}/`);
      setInspection(data);
      setEditableInspection(data);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load inspection certificate");
      return null;
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
    loadInspection();
  }, [canView, capsLoading, loadInspection, router]);

  const canEdit = inspection ? canResumeInspectionEditor(inspection, canManage, hasInspectionStage) : false;
  const canDelete = Boolean(inspection && canFull && inspection.stage === "DRAFT");
  const canActStage1 = Boolean(inspection && inspection.stage === "DRAFT" && hasInspectionStage("initiate_inspection"));
  const canActStage2 = Boolean(inspection && inspection.stage === "STOCK_DETAILS" && hasInspectionStage("fill_stock_details"));
  const canActStage3 = Boolean(inspection && inspection.stage === "CENTRAL_REGISTER" && hasInspectionStage("fill_central_register"));
  const canActStage4 = Boolean(inspection && inspection.stage === "FINANCE_REVIEW" && hasInspectionStage("review_finance"));
  const returnLabel = inspection ? getInspectionReturnActionLabel(inspection) : null;
  const canReturn = Boolean(
    inspection
      && returnLabel
      && (
        (inspection.stage === "STOCK_DETAILS" && canActStage2)
        || (inspection.stage === "CENTRAL_REGISTER" && canActStage3)
        || (inspection.stage === "FINANCE_REVIEW" && canActStage4)
      )
  );
  const canCancel = Boolean(
    inspection
      && !["COMPLETED", "REJECTED", "DRAFT"].includes(inspection.stage)
      && (isSuperuser || hasInspectionStage("review_finance"))
  );
  const activeRevisionRequest = inspection ? getInspectionActiveRevisionRequest(inspection) : null;

  const saveProgress = useCallback(async () => {
    if (!editableInspection) return;
    setBusyAction("save");
    setError(null);
    try {
      await apiFetch(`/api/inventory/inspections/${editableInspection.id}/`, {
        method: "PATCH",
        body: JSON.stringify(buildStagePayload(editableInspection)),
      });
      await loadInspection();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save inspection");
    } finally {
      setBusyAction(null);
    }
  }, [editableInspection, loadInspection]);

  const submitStage = useCallback(async () => {
    if (!editableInspection) return;
    const transition = getTransitionPath(editableInspection);
    if (!transition) return;
    setBusyAction("transition");
    setError(null);
    try {
      await apiFetch(`/api/inventory/inspections/${editableInspection.id}/`, {
        method: "PATCH",
        body: JSON.stringify(buildStagePayload(editableInspection)),
      });
      await apiFetch(`/api/inventory/inspections/${editableInspection.id}/${transition}/`, { method: "POST" });
      await loadInspection();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to transition stage. Check required details and register links.");
    } finally {
      setBusyAction(null);
    }
  }, [editableInspection, loadInspection]);

  const handleCancelConfirm = useCallback(async (reason: string) => {
    if (!inspection) return;
    setBusyAction("cancel");
    setError(null);
    try {
      await apiFetch(`/api/inventory/inspections/${inspection.id}/cancel/`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      setCancelOpen(false);
      await loadInspection();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Cancellation failed");
    } finally {
      setBusyAction(null);
    }
  }, [inspection, loadInspection]);

  const returnToPreviousStage = useCallback(async (reason: string) => {
    if (!inspection || !returnLabel) return;

    setBusyAction("return");
    setError(null);
    try {
      await apiFetch(`/api/inventory/inspections/${inspection.id}/return_to_previous_stage/`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      setReturnOpen(false);
      await loadInspection();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to return the inspection to the previous stage");
    } finally {
      setBusyAction(null);
    }
  }, [inspection, loadInspection, returnLabel]);

  const handleDelete = useCallback(async () => {
    if (!inspection) return;
    if (!window.confirm(`Delete inspection ${inspection.contract_no}? This cannot be undone.`)) return;
    setBusyAction("delete");
    setError(null);
    try {
      await apiFetch(`/api/inventory/inspections/${inspection.id}/`, { method: "DELETE" });
      router.push("/inspections");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setBusyAction(null);
    }
  }, [inspection, router]);

  const openPdf = useCallback(() => {
    if (!inspection) return;
    window.open(`${API_BASE}/api/inventory/inspections/${inspection.id}/view_pdf/`, "_blank");
  }, [inspection]);

  const activeStageLabel = useMemo(() => {
    if (!inspection) return "Detail";
    return getInspectionStageDisplayLabel(inspection);
  }, [inspection]);

  return (
    <div>
      <RejectInspectionModal open={cancelOpen} onClose={() => setCancelOpen(false)} onConfirm={handleCancelConfirm} />
      <ReturnInspectionModal
        open={returnOpen}
        onClose={() => setReturnOpen(false)}
        onConfirm={returnToPreviousStage}
        targetLabel={returnLabel ?? "Return to previous stage"}
        submitting={busyAction === "return"}
      />
      <Topbar breadcrumb={["Operations", "Inspection Certificates", inspection?.contract_no ?? activeStageLabel]} />

      <div className="page" id="page-ins" data-density="balanced">
        <Link className="detail-page-back" href="/inspections">
          <InspectionIcon d="M19 12H5M12 19l-7-7 7-7" size={12} />
          Back to Inspections
        </Link>

        {error ? (
          <div className="detail-alert">
            <strong>Action failed</strong>
            <span>{error}</span>
          </div>
        ) : null}

        {loading ? (
          <div className="detail-card detail-card-body">Synchronizing lifecycle state...</div>
        ) : inspection && editableInspection ? (
          <>
            <div className="page-head-detail">
              <div className="page-title-group">
                <div className="eyebrow">Inspection Certificate - Acceptance</div>
                <h1>{getDisplayTitle(inspection)}</h1>
                <div className="page-sub">{getDisplaySubtitle(inspection)}</div>
                <div className="page-id-row">
                  <span className="doc-no">{inspection.contract_no}</span>
                  <StageStatusPill inspection={inspection} />
                  <span className="doc-meta">
                    <span>Opened <strong>{formatInspectionDateTime(inspection.created_at)}</strong></span>
                  </span>
                </div>
              </div>

              <div className="page-head-actions">
                <button type="button" className="btn btn-sm" onClick={openPdf}>
                  <InspectionIcon d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" size={14} />
                  Export PDF
                </button>
                {canCancel ? (
                  <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => setCancelOpen(true)} disabled={busyAction !== null}>
                    <InspectionIcon d={<><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" /></>} size={14} />
                    Cancel inspection
                  </button>
                ) : null}
                {canDelete ? (
                  <button type="button" className="btn btn-sm btn-danger-ghost" onClick={handleDelete} disabled={busyAction !== null}>
                    <InspectionIcon d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0l1 12h6l1-12" size={14} />
                    Delete draft
                  </button>
                ) : null}
              </div>
            </div>

            {activeRevisionRequest ? (
              <div className="detail-notice detail-notice-warn">
                <InspectionIcon d={<><path d="M12 3v12" /><path d="M12 19h.01" /><path d="M10.3 4.8L3.86 16a2 2 0 001.74 3h12.8a2 2 0 001.74-3L13.7 4.8a2 2 0 00-3.4 0z" /></>} size={16} />
                <div className="detail-notice-body">
                  <div className="detail-notice-title">Revisions Requested</div>
                  <div className="detail-notice-text">{activeRevisionRequest.reason}</div>
                  <div className="detail-notice-text" style={{ marginTop: 6 }}>
                    Returned from {INSPECTION_STAGE_LABELS[activeRevisionRequest.fromStage]} by {activeRevisionRequest.actor}
                    {activeRevisionRequest.requestedAt ? ` on ${formatInspectionDateTime(activeRevisionRequest.requestedAt)}` : ""}.
                  </div>
                </div>
              </div>
            ) : null}

            <WorkflowTracker inspection={inspection} />

            {inspection.stage === "REJECTED" ? (
              <div className="detail-notice detail-notice-danger">
                <InspectionIcon d={<><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" /></>} size={16} />
                <div className="detail-notice-body">
                  <div className="detail-notice-title">{inspection.status === "CANCELLED" ? "Workflow cancelled" : "Workflow rejected"}</div>
                  <div className="detail-notice-text">{inspection.rejection_reason || (inspection.status === "CANCELLED" ? "This certificate was cancelled." : "This certificate was rejected.")}</div>
                </div>
              </div>
            ) : null}

            <div className="inspection-detail-grid" style={{ marginTop: 16 }}>
              <main className="inspection-detail-main">
                <div className="inspection-stage-cue-track">
                  <StageActionCue inspection={inspection} />
                  <CertificateInfoCard inspection={editableInspection} />
                  <ItemsSummary inspection={editableInspection} />
                  <RegisterTrailCard inspection={editableInspection} />
                  <SupportingDocuments inspection={inspection} />
                </div>
                <ActiveStageCard
                  inspection={inspection}
                  editableInspection={editableInspection}
                  canEdit={canEdit}
                  canActStage1={canActStage1}
                  canActStage2={canActStage2}
                  canActStage3={canActStage3}
                  canActStage4={canActStage4}
                  canReturn={canReturn}
                  returnLabel={returnLabel}
                  busyAction={busyAction}
                  onChange={next => {
                    setEditableInspection({
                      ...next,
                      items: next.items.map((item: InspectionItemRecord) => ({ ...item })),
                    });
                  }}
                  onSave={saveProgress}
                  onSubmit={submitStage}
                  onReturn={() => setReturnOpen(true)}
                />
              </main>

              <aside className="inspection-detail-aside">
                <WorkflowHistory inspection={inspection} />
                <RelatedStockEntries inspection={inspection} />
              </aside>
            </div>
          </>
        ) : (
          <div className="detail-card detail-card-body">Entry not found.</div>
        )}
      </div>
    </div>
  );
}
