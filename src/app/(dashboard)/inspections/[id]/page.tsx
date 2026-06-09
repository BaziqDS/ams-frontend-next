"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Topbar } from "@/components/Topbar";
import { useCopilotForm, type CopilotFormField } from "@/hooks/useCopilotForm";
import { useCopilotReadable } from "@/hooks/useCopilotReadable";
import { normalizeCopilotSubmitError } from "@/lib/copilotFormRuntime";
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
import { ApiError, apiFetch, type Page } from "@/lib/api";
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
  getInspectionReturnActionLabel,
  getInspectionStageDisplayLabel,
  getInspectionStageGuidance,
  getInspectionTotals,
  getInspectionWorkflowContract,
  getInspectionValueTotals,
  getInspectionWorkflowSteps,
  INSPECTION_STAGE_LABELS,
  type InspectionItemOption,
  type InspectionItemRecord,
  type InspectionRecord,
  type InspectionStockRegisterOption,
  type InspectionWorkflowStep,
} from "@/lib/inspectionUi";
import {
  buildStageItemsPayload,
  getInspectionCentralStoreRegisters,
  getInspectionItemFinancials,
  getInspectionMainStoreRegisters,
  normalizeStageItems,
  validateInspectionStageRequiredFields,
} from "@/lib/inspectionStageForms";
import {
  applyInspectionItemCopilotPatches,
  buildInspectionFinanceCopilotFields,
  buildInspectionItemArrayCopilotFields,
  buildInspectionItemCopilotFields,
  syncInspectionItemReferences,
} from "@/lib/inspectionCopilotForm";
import { buildCopilotDetailContext } from "@/lib/copilotPageContext";
import { Button } from "@/components/ui/button";


type InspectionLocationDetail = {
  id: number;
  hierarchy_level?: number | null;
  main_store_id?: number | string | null;
  main_store_display?: string | null;
  root_main_store_id?: number | string | null;
  root_main_store_display?: string | null;
};

type CopilotDepreciationAssetClassOption = {
  id: number;
  name: string;
  code: string;
  display_name?: string | null;
  display_code?: string | null;
  current_rate?: string | null;
};

function normalizeApiList<T>(data: Page<T> | T[]) {
  return Array.isArray(data) ? data : data.results;
}

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
  const effectiveStageLabel = getInspectionStageDisplayLabel({
    stage: effectiveStage ?? inspection.stage,
    status: inspection.status,
  });
  const label = inspection.stage === "DRAFT" || index < 0
    ? getInspectionStageDisplayLabel(inspection)
    : inspection.stage === "REJECTED"
      ? `${getInspectionStageDisplayLabel(inspection)} at Stage ${index + 1} of ${steps.length} - ${effectiveStageLabel}`
      : `Stage ${index + 1} of ${steps.length} - ${effectiveStageLabel}`;

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
  const stageLabel = getInspectionStageDisplayLabel(inspection);

  return (
    <a className="inspection-stage-cue" href="#active-stage-form" aria-label={`Jump to ${stageLabel} form`}>
      <span className="inspection-stage-cue-icon">!</span>
      <span className="inspection-stage-cue-copy">
        <span className="inspection-stage-cue-title">{stageLabel} requires input</span>
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
  fieldErrors,
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
  fieldErrors?: Record<string, string>;
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
          <Stage1Form data={editableInspection} onChange={onChange} readOnly={readOnly} errors={fieldErrors} />
        ) : inspection.stage === "STOCK_DETAILS" ? (
          <Stage2Form data={editableInspection} onChange={onChange} readOnly={readOnly} errors={fieldErrors} />
        ) : inspection.stage === "CENTRAL_REGISTER" ? (
          <Stage3Form data={editableInspection} onChange={onChange} readOnly={readOnly} errors={fieldErrors} />
        ) : inspection.stage === "FINANCE_REVIEW" ? (
          <Stage4Form data={editableInspection} onChange={onChange} readOnly={readOnly} errors={fieldErrors} />
        ) : (
          <Stage4Form data={editableInspection} onChange={onChange} readOnly errors={fieldErrors} />
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
                <Button type="button" variant="ghost" size="sm" onClick={onReturn} disabled={busyAction !== null}>
                  <InspectionIcon d="M15 18l-6-6 6-6" size={14} />
                  {returnLabel}
                </Button>
              ) : null}
              <Button type="button" variant="outline" size="sm" onClick={onSave} disabled={readOnly}>
                <InspectionIcon d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2zM17 21v-8H7v8M7 3v5h8" size={14} />
                Save progress
              </Button>
              {actionLabel && canSubmit ? (
                <Button type="button" size="sm" onClick={onSubmit} disabled={busyAction !== null}>
                  <InspectionIcon d="M20 6L9 17l-5-5" size={14} />
                  {busyAction ? "Processing..." : actionLabel}
                </Button>
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

function blankInspectionItem(): InspectionItemRecord {
  return {
    item: null,
    item_description: "",
    item_specifications: "",
    tendered_quantity: 1,
    accepted_quantity: 0,
    rejected_quantity: 0,
    unit_price: "0.00",
    remarks: "",
    stock_register: null,
    stock_register_no: "",
    stock_register_page_no: "",
    stock_entry_date: "",
    central_register: null,
    central_register_no: "",
    central_register_page_no: "",
    batch_number: "",
    manufactured_date: "",
    expiry_date: "",
    depreciation_asset_class: null,
    capitalization_cost: "",
    capitalization_date: "",
  };
}

function getTransitionPath(inspection: InspectionRecord) {
  if (inspection.stage === "DRAFT") return "initiate";
  if (inspection.stage === "STOCK_DETAILS") return "submit_to_central_register";
  if (inspection.stage === "CENTRAL_REGISTER") return "submit_to_finance_review";
  if (inspection.stage === "FINANCE_REVIEW") return "complete";
  return null;
}

function getInspectionDetailCopilotFormId(inspection: InspectionRecord | null) {
  return inspection
    ? `inspection-detail-${inspection.id}-${inspection.stage.toLowerCase()}`
    : "inspection-detail";
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
  const [stageFieldErrors, setStageFieldErrors] = useState<Record<string, string>>({});
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);
  const [copilotItems, setCopilotItems] = useState<InspectionItemOption[]>([]);
  const [copilotRegisters, setCopilotRegisters] = useState<InspectionStockRegisterOption[]>([]);
  const [copilotLocation, setCopilotLocation] = useState<InspectionLocationDetail | null>(null);
  const [copilotAssetClasses, setCopilotAssetClasses] = useState<CopilotDepreciationAssetClassOption[]>([]);

  const loadInspection = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch<InspectionRecord>(`/api/inventory/inspections/${params.id}/`);
      setInspection(data);
      setEditableInspection(data);
      setStageFieldErrors({});
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

  useEffect(() => {
    if (!editableInspection || !["STOCK_DETAILS", "CENTRAL_REGISTER"].includes(editableInspection.stage)) {
      setCopilotItems([]);
      setCopilotRegisters([]);
      setCopilotLocation(null);
      return;
    }

    let ignored = false;
    Promise.all([
      editableInspection.stage === "CENTRAL_REGISTER"
        ? apiFetch<Page<InspectionItemOption> | InspectionItemOption[]>("/api/inventory/items/?page_size=500").then(normalizeApiList)
        : Promise.resolve([] as InspectionItemOption[]),
      apiFetch<Page<InspectionStockRegisterOption> | InspectionStockRegisterOption[]>("/api/inventory/stock-registers/?page_size=500").then(normalizeApiList),
      editableInspection.department
        ? apiFetch<InspectionLocationDetail>(`/api/inventory/locations/${editableInspection.department}/`).catch(() => null)
        : Promise.resolve(null),
    ])
      .then(([loadedItems, loadedRegisters, loadedLocation]) => {
        if (ignored) return;
        setCopilotItems(loadedItems);
        setCopilotRegisters(loadedRegisters);
        setCopilotLocation(loadedLocation);
      })
      .catch(() => {
        if (ignored) return;
        setCopilotItems([]);
        setCopilotRegisters([]);
        setCopilotLocation(null);
      });

    return () => {
      ignored = true;
    };
  }, [editableInspection?.department, editableInspection?.stage]);

  useEffect(() => {
    if (!editableInspection || editableInspection.stage !== "FINANCE_REVIEW") {
      setCopilotAssetClasses([]);
      return;
    }

    let ignored = false;
    apiFetch<Page<CopilotDepreciationAssetClassOption> | CopilotDepreciationAssetClassOption[]>("/api/inventory/depreciation/asset-classes/?page_size=500")
      .then(data => {
        if (ignored) return;
        setCopilotAssetClasses(normalizeApiList(data).filter(assetClass => assetClass.code && assetClass.name));
      })
      .catch(() => {
        if (!ignored) setCopilotAssetClasses([]);
      });

    return () => {
      ignored = true;
    };
  }, [editableInspection?.id, editableInspection?.stage]);

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
    if (!editableInspection) {
      return {
        ok: false,
        errorType: "no_active_record",
        message: "No active inspection is loaded.",
      };
    }
    setBusyAction("save");
    setError(null);
    setStageFieldErrors({});
    try {
      await apiFetch(`/api/inventory/inspections/${editableInspection.id}/`, {
        method: "PATCH",
        body: JSON.stringify(buildStagePayload(editableInspection)),
      });
      await loadInspection();
      return {
        ok: true,
        message: "Inspection progress saved.",
        recordId: editableInspection.id,
        redirectTo: `/inspections/${editableInspection.id}`,
      };
    } catch (err) {
      const failure = normalizeCopilotSubmitError(err);
      setError(failure.message || "Failed to save inspection");
      setStageFieldErrors(failure.fieldErrors ?? {});
      return failure;
    } finally {
      setBusyAction(null);
    }
  }, [editableInspection, loadInspection]);

  const submitStage = useCallback(async () => {
    if (!editableInspection) {
      return {
        ok: false,
        errorType: "no_active_record",
        message: "No active inspection is loaded.",
      };
    }
    const transition = getTransitionPath(editableInspection);
    if (!transition) {
      return {
        ok: false,
        errorType: "transition_unavailable",
        message: "This inspection stage cannot be submitted from the current state.",
      };
    }
    const fieldErrors = validateInspectionStageRequiredFields(editableInspection);
    if (Object.keys(fieldErrors).length > 0) {
      const message = "Resolve highlighted inspection stage fields before submitting.";
      setStageFieldErrors(fieldErrors);
      setError(message);
      const failure = {
        ok: false,
        errorType: "validation_error",
        message,
        fieldErrors,
      };
      return failure;
    }
    setBusyAction("transition");
    setError(null);
    setStageFieldErrors({});
    try {
      await apiFetch(`/api/inventory/inspections/${editableInspection.id}/`, {
        method: "PATCH",
        body: JSON.stringify(buildStagePayload(editableInspection)),
      });
      await apiFetch(`/api/inventory/inspections/${editableInspection.id}/${transition}/`, { method: "POST" });
      await loadInspection();
      return {
        ok: true,
        message: "Inspection stage submitted successfully.",
        recordId: editableInspection.id,
        redirectTo: `/inspections/${editableInspection.id}`,
        transition,
      };
    } catch (err) {
      const failure = normalizeCopilotSubmitError(err);
      setError(failure.message || "Failed to transition stage. Check required details and register links.");
      setStageFieldErrors(failure.fieldErrors ?? {});
      return failure;
    } finally {
      setBusyAction(null);
    }
  }, [editableInspection, loadInspection]);

  const departmentRegisterOptions = useMemo(
    () => getInspectionMainStoreRegisters(copilotRegisters, copilotLocation),
    [copilotLocation, copilotRegisters],
  );

  const centralRegisterOptions = useMemo(
    () => getInspectionCentralStoreRegisters(copilotRegisters, copilotLocation),
    [copilotLocation, copilotRegisters],
  );

  const copilotItemOptions = useMemo(() => {
    const byId = new Map(copilotItems.map(option => [option.id, option]));
    (editableInspection?.items ?? []).forEach(item => {
      if (!item.item || byId.has(item.item)) return;
      byId.set(item.item, {
        id: item.item,
        name: item.item_name || item.item_description || `Item #${item.item}`,
        code: item.item_code || "",
        category_type: item.item_category_type ?? null,
        tracking_type: item.item_tracking_type ?? null,
        description: null,
        acct_unit: null,
        specifications: null,
      });
    });
    return Array.from(byId.values());
  }, [copilotItems, editableInspection?.items]);

  // Expose the catalog options that back the stage form dropdowns so the
  // agent can resolve "core i5" → catalog item id, etc., without firing SQL.
  useCopilotReadable({
    description:
      "Inspection detail dropdown catalogs (loaded for the current stage). Use 'items' to resolve inspection row 'item' foreign-key IDs by matching item_description/item_name AND item description/specifications against catalog name/code/description/specifications — similar names can be different products, so compare descriptions and specifications before deciding two items differ; use 'stock_registers' for stock_register/central_register IDs; use 'asset_classes' for finance-review depreciation_asset_class IDs. When filling stage-2/stage-3 item rows, ALWAYS set the row's 'item' field to the catalog id from items[].id, do NOT leave it null when a name+description match exists. Never silently create a new item when a catalog match exists; if no genuine match exists, ask the user before opening item_create. The items array is empty when the current stage does not need it.",
    value: {
      route: `/inspections/${params.id}`,
      stage: editableInspection?.stage ?? null,
      department_id: editableInspection?.department ?? null,
      items: copilotItemOptions.map(o => ({
        id: o.id,
        name: o.name,
        code: o.code,
        category_type: o.category_type,
        tracking_type: o.tracking_type,
        category_display: o.category_display ?? null,
        description: o.description ?? null,
        specifications: o.specifications ?? null,
        acct_unit: o.acct_unit ?? null,
      })),
      stock_registers: copilotRegisters.map(r => ({
        id: r.id,
        ...(r as unknown as Record<string, unknown>),
      })),
      asset_classes: copilotAssetClasses.map(assetClass => ({
        id: assetClass.id,
        name: assetClass.display_name || assetClass.name,
        code: assetClass.display_code || assetClass.code,
        current_rate: assetClass.current_rate ?? null,
      })),
      department_stock_registers: departmentRegisterOptions.map(r => r.id),
      central_stock_registers: centralRegisterOptions.map(r => r.id),
    },
  });

  const copilotFields = useMemo<CopilotFormField[]>(() => {
    if (!editableInspection) return [];

    const stageFields = buildInspectionItemCopilotFields({
      items: editableInspection.items ?? [],
      canEditStock: canEdit && editableInspection.stage === "STOCK_DETAILS",
      canEditCentral: canEdit && editableInspection.stage === "CENTRAL_REGISTER",
      departmentRegisterOptions,
      centralRegisterOptions,
      itemOptions: copilotItemOptions,
    });

    if (stageFields.length > 0) {
      return [
        {
          name: "items",
          label: "Inspection item rows",
          type: "array",
          description:
            "Current item rows. Prefer exact per-row fields like items.0.central_register and items.0.central_register_page_no; bulk item patches are merged over existing rows.",
          arrayItemFields: buildInspectionItemArrayCopilotFields({
            canEditItems: false,
            canEditStock: canEdit && editableInspection.stage === "STOCK_DETAILS",
            canEditCentral: canEdit && editableInspection.stage === "CENTRAL_REGISTER",
          }),
        },
        ...stageFields,
      ];
    }

    if (canEdit && editableInspection.stage === "FINANCE_REVIEW") {
      const financeFields = buildInspectionFinanceCopilotFields({
        items: editableInspection.items ?? [],
        assetClassOptions: copilotAssetClasses,
      });

      return [
        {
          name: "finance_check_date",
          label: "Finance Check Date",
          type: "date",
          required: true,
        },
        ...(financeFields.length > 0
          ? [
              {
                name: "items",
                label: "Inspection item rows",
                type: "array" as const,
                description:
                  "Current item rows. Prefer exact per-row finance fields like items.0.depreciation_asset_class, items.0.capitalization_date, and items.0.capitalization_cost; bulk item patches are merged over existing rows.",
                arrayItemFields: buildInspectionItemArrayCopilotFields({
                  canEditItems: false,
                  canEditStock: false,
                  canEditCentral: false,
                  canEditFinance: true,
                }),
              },
              ...financeFields,
            ]
          : []),
      ];
    }

    return [];
  }, [
    canEdit,
    centralRegisterOptions,
    copilotAssetClasses,
    copilotItemOptions,
    departmentRegisterOptions,
    editableInspection,
  ]);

  const inspectionDetailReadable = useMemo(() => buildCopilotDetailContext({
    route: `/inspections/${params.id}`,
    entity: "inspection",
    selectedRecord: editableInspection
      ? {
          id: editableInspection.id,
          contract_no: editableInspection.contract_no,
          indent_no: editableInspection.indent_no,
          contractor_name: editableInspection.contractor_name,
          contractor_address: editableInspection.contractor_address,
          certificate_date: editableInspection.date,
          contract_date: editableInspection.contract_date,
          department: editableInspection.department,
          department_name: editableInspection.department_name,
          department_hierarchy_level: editableInspection.department_hierarchy_level,
          delivery_type: editableInspection.delivery_type,
          date_of_delivery: editableInspection.date_of_delivery,
          inspected_by: editableInspection.inspected_by,
          date_of_inspection: editableInspection.date_of_inspection,
          consignee_name: editableInspection.consignee_name,
          consignee_designation: editableInspection.consignee_designation,
          stage: editableInspection.stage,
          status: editableInspection.status,
          remarks: editableInspection.remarks,
        }
      : null,
    workflow: editableInspection
      ? getInspectionWorkflowContract(editableInspection, {
          canManage,
          hasStage: hasInspectionStage,
          busyAction,
        })
      : null,
    actions: {
      save_progress: Boolean(canEdit && busyAction === null),
      submit_current_stage: Boolean(canEdit && busyAction === null),
      return_stage: canReturn,
      cancel: canCancel,
      delete: canDelete,
    },
    extra: {
      active_revision_request: activeRevisionRequest,
      guidance: editableInspection ? getInspectionStageGuidance(editableInspection) : null,
      writable_field_names: copilotFields.map(field => field.name),
      readonly_context_fields: ["items", "stage"],
      totals: editableInspection
        ? {
            quantities: getInspectionTotals(editableInspection),
            values: getInspectionValueTotals(editableInspection),
          }
        : null,
      register_coverage: editableInspection
        ? getInspectionRegisterCoverage(editableInspection)
        : null,
      register_rows: editableInspection
        ? getInspectionRegisterDetailRows(editableInspection)
        : [],
      items: editableInspection
        ? editableInspection.items.map((item, index) => ({
            index,
            id: item.id,
            item: item.item,
            item_name: item.item_name,
            item_code: item.item_code,
            item_description: item.item_description,
            item_specifications: item.item_specifications,
            tendered_quantity: item.tendered_quantity,
            accepted_quantity: item.accepted_quantity,
            rejected_quantity: item.rejected_quantity,
            unit_price: item.unit_price,
            stock_register: item.stock_register,
            stock_register_name: item.stock_register_name,
            stock_register_no: item.stock_register_no,
            stock_register_page_no: item.stock_register_page_no,
            stock_entry_date: item.stock_entry_date,
            central_register: item.central_register,
            central_register_name: item.central_register_name,
            central_register_no: item.central_register_no,
            central_register_page_no: item.central_register_page_no,
            batch_number: item.batch_number,
            manufactured_date: item.manufactured_date,
            expiry_date: item.expiry_date,
            depreciation_asset_class: item.depreciation_asset_class,
            capitalization_cost: item.capitalization_cost,
            capitalization_date: item.capitalization_date,
            depreciation_asset_class_name: item.depreciation_asset_class_name,
            distribution_route: `/inspections/${editableInspection.id}/items/${item.id}/distribution`,
          }))
        : [],
      documents: editableInspection
        ? editableInspection.documents.map(document => ({
            id: document.id,
            label: document.label,
            file: document.file,
            uploaded_at: document.uploaded_at,
          }))
        : [],
      stock_entries: editableInspection
        ? editableInspection.stock_entries.map(entry => ({
            id: entry.id,
            entry_number: entry.entry_number,
            entry_type: entry.entry_type,
            status: entry.status,
            entry_date: entry.entry_date,
          }))
        : [],
      audit_entries: editableInspection ? getInspectionAuditEntries(editableInspection) : [],
    },
  }), [
    activeRevisionRequest,
    busyAction,
    canCancel,
    canDelete,
    canEdit,
    canManage,
    canReturn,
    copilotFields,
    editableInspection,
    hasInspectionStage,
    params.id,
  ]);

  useCopilotReadable({
    description:
      "Inspection detail page contract. Use selected_record for the current inspection, workflow for current/next stage and transition, and writable_field_names plus the active form schema before setting values.",
    value: inspectionDetailReadable,
  });

  const copilotFormValues = useMemo(
    () => editableInspection
      ? {
          stage: editableInspection.stage,
          finance_check_date: editableInspection.finance_check_date,
          items: normalizeStageItems(editableInspection.items ?? []).map((item, index) => ({
            index,
            id: item.id,
            item_description: item.item_description,
            accepted_quantity: item.accepted_quantity,
            stock_register: item.stock_register,
            stock_register_no: item.stock_register_no,
            stock_register_page_no: item.stock_register_page_no,
            stock_entry_date: item.stock_entry_date,
            central_register: item.central_register,
            central_register_no: item.central_register_no,
            central_register_page_no: item.central_register_page_no,
            item: item.item,
            item_name: item.item_name,
            item_category_type: item.item_category_type,
            unit_price: item.unit_price,
            batch_number: item.batch_number,
            manufactured_date: item.manufactured_date,
            expiry_date: item.expiry_date,
            depreciation_asset_class: item.depreciation_asset_class,
            depreciation_asset_class_name: item.depreciation_asset_class_name,
            capitalization_cost: item.capitalization_cost,
            capitalization_date: item.capitalization_date,
          })),
        }
      : {},
    [editableInspection],
  );

  const applyDetailCopilotValues = useCallback(
    (values: Record<string, unknown>) => {
      if (!editableInspection) {
        return { applied: [], ignored: Object.keys(values), reason: "No active inspection loaded." };
      }

      const applied: string[] = [];
      const ignored: string[] = [];
      let nextInspection: InspectionRecord = {
        ...editableInspection,
        items: normalizeStageItems(editableInspection.items ?? []),
      };

      if (
        editableInspection.stage === "FINANCE_REVIEW" &&
        Object.prototype.hasOwnProperty.call(values, "finance_check_date")
      ) {
        nextInspection = {
          ...nextInspection,
          finance_check_date: String(values.finance_check_date ?? ""),
        };
        applied.push("finance_check_date");
      }

      const itemPatch = applyInspectionItemCopilotPatches({
        currentItems: nextInspection.items,
        values,
        blankItem: blankInspectionItem,
      });

      if (itemPatch.applied.length > 0) {
        nextInspection = {
          ...nextInspection,
          items: syncInspectionItemReferences({
            items: itemPatch.nextItems,
            departmentRegisterOptions,
            centralRegisterOptions,
            itemOptions: copilotItemOptions,
          }),
        };
        applied.push(...itemPatch.applied);
      }
      ignored.push(...itemPatch.ignored);

      if (applied.length === 0) {
        return { applied, ignored: Object.keys(values), reason: "No editable stage fields were provided." };
      }

      setEditableInspection(nextInspection);
      setStageFieldErrors(prev => {
        const next = { ...prev };
        applied.forEach(field => delete next[field]);
        if (Array.isArray(values.items)) {
          values.items.forEach((row, fallbackIndex) => {
            if (!row || typeof row !== "object" || Array.isArray(row)) return;
            const rowRecord = row as Record<string, unknown>;
            const targetIndex = typeof rowRecord.index === "number" ? rowRecord.index : fallbackIndex;
            Object.keys(rowRecord).forEach(key => delete next[`items.${targetIndex}.${key}`]);
          });
        }
        return next;
      });
      return { applied, ignored };
    },
    [
      centralRegisterOptions,
      copilotItemOptions,
      departmentRegisterOptions,
      editableInspection,
    ],
  );

  const { submitManually } = useCopilotForm({
    formId: getInspectionDetailCopilotFormId(editableInspection),
    title: editableInspection
      ? `Inspection Detail - ${getInspectionStageDisplayLabel(editableInspection)}`
      : "Inspection Detail",
    description:
      "Active inspection detail stage form. The assistant patches the same editable stage state used by the visible form; Save Progress and workflow transition still use the existing page buttons and backend validation.",
    mode: editableInspection?.stage,
    active: Boolean(editableInspection && inspection && !["COMPLETED", "REJECTED"].includes(inspection.stage)),
    canSetValues: Boolean(canEdit && busyAction === null && copilotFields.length > 0),
    canValidate: Boolean(copilotFields.length > 0),
    canSubmit: Boolean(canEdit && busyAction === null),
    fields: copilotFields,
    values: copilotFormValues,
    errors: stageFieldErrors,
    requirements: {
      setValues: { requiredCapabilities: [{ module: "inspections", level: "manage" }] },
      validate: { requiredCapabilities: [{ module: "inspections", level: "manage" }] },
      submit: { requiredCapabilities: [{ module: "inspections", level: "manage" }] },
    },
    setValues: applyDetailCopilotValues,
    validate: () => {
      if (!editableInspection) {
        return { ok: false, errors: { inspection: "No active inspection is loaded." } };
      }
      const fieldErrors = validateInspectionStageRequiredFields(editableInspection);
      setStageFieldErrors(fieldErrors);
      return {
        ok: Object.keys(fieldErrors).length === 0,
        errors: fieldErrors,
      };
    },
    submit: intent => intent === "submit" ? submitStage() : saveProgress(),
  });

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
                <Button asChild variant="outline" size="sm" className="page-head-back">
                  <Link href="/inspections">
                    <InspectionIcon d="M19 12H5M12 19l-7-7 7-7" size={12} />
                    Back to Inspections
                  </Link>
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={openPdf}>
                  <InspectionIcon d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" size={14} />
                  Export PDF
                </Button>
                {canCancel ? (
                  <Button type="button" variant="outline" size="sm" className="btn-danger-ghost" onClick={() => setCancelOpen(true)} disabled={busyAction !== null}>
                    <InspectionIcon d={<><circle cx="12" cy="12" r="10" /><path d="M15 9l-6 6M9 9l6 6" /></>} size={14} />
                    Cancel inspection
                  </Button>
                ) : null}
                {canDelete ? (
                  <Button type="button" variant="outline" size="sm" className="btn-danger-ghost" onClick={handleDelete} disabled={busyAction !== null}>
                    <InspectionIcon d="M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-8 0l1 12h6l1-12" size={14} />
                    Delete draft
                  </Button>
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
                    setStageFieldErrors({});
                    setEditableInspection({
                      ...next,
                      items: next.items.map((item: InspectionItemRecord) => ({ ...item })),
                    });
                  }}
                  onSave={() => { void submitManually("save"); }}
                  onSubmit={() => { void submitManually("submit"); }}
                  onReturn={() => setReturnOpen(true)}
                  fieldErrors={stageFieldErrors}
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
