import type { Page } from "@/lib/api";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type InspectionStage =
  | "DRAFT"
  | "STOCK_DETAILS"
  | "CENTRAL_REGISTER"
  | "FINANCE_REVIEW"
  | "COMPLETED"
  | "REJECTED";

export type InspectionWorkflowState = "complete" | "current" | "upcoming" | "rejected";

export interface InspectionItemRecord {
  id?: number;
  item: number | null;
  item_name?: string;
  item_code?: string;
  item_category_type?: string | null;
  item_tracking_type?: string | null;
  item_description: string;
  item_specifications: string;
  tendered_quantity: number;
  accepted_quantity: number;
  rejected_quantity: number;
  unit_price: number | string;
  remarks: string;
  stock_register: number | null;
  stock_register_name?: string;
  stock_register_no: string;
  stock_register_page_no: string;
  stock_entry_date: string;
  central_register: number | null;
  central_register_name?: string;
  central_register_no: string;
  central_register_page_no: string;
  batch_number: string;
  manufactured_date: string;
  expiry_date: string;
  depreciation_asset_class?: number | null;
  depreciation_asset_class_name?: string | null;
  capitalization_cost?: number | string | null;
  capitalization_date?: string | null;
}

export interface InspectionDocumentRecord {
  id: number;
  file: string;
  label: string;
  uploaded_at: string;
}

export interface InspectionStockEntryRecord {
  id: number;
  entry_number: string;
  entry_type: "RECEIPT" | "ISSUE" | "RETURN";
  status: string;
  entry_date: string;
}

export interface InspectionRecord {
  id: number;
  date: string;
  contract_no: string;
  contract_date: string | null;
  contractor_name: string;
  contractor_address: string;
  indenter: string;
  indent_no: string;
  department: number;
  department_name: string;
  department_hierarchy_level: number;
  date_of_delivery: string | null;
  delivery_type: "PART" | "FULL";
  remarks: string;
  inspected_by: string;
  date_of_inspection: string | null;
  consignee_name: string;
  consignee_designation: string;
  stage: InspectionStage;
  status: string;
  items: InspectionItemRecord[];
  documents: InspectionDocumentRecord[];
  stock_entries: InspectionStockEntryRecord[];
  initiated_by: number | null;
  initiated_by_name: string | null;
  initiated_at: string | null;
  stock_filled_by: number | null;
  stock_filled_by_name: string | null;
  stock_filled_at: string | null;
  central_store_filled_by: number | null;
  central_store_filled_by_name: string | null;
  central_store_filled_at: string | null;
  finance_reviewed_by: number | null;
  finance_reviewed_by_name: string | null;
  finance_reviewed_at: string | null;
  finance_check_date: string | null;
  revision_requested_by: number | null;
  revision_requested_by_name: string | null;
  revision_requested_at: string | null;
  revision_requested_reason: string | null;
  revision_requested_from_stage: InspectionStage | null;
  rejected_by: number | null;
  rejected_by_name?: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  rejection_stage: InspectionStage | null;
  created_at: string;
  updated_at: string;
}

export interface InspectionLocationOption {
  id: number;
  name: string;
  parent_location?: number | null;
  hierarchy_path?: string | null;
  hierarchy_level: number;
  is_standalone: boolean;
  main_store_id?: number | null;
  main_store_display?: string | null;
  main_store_code?: string | null;
  root_main_store_id?: number | null;
  root_main_store_display?: string | null;
}

export interface InspectionItemOption {
  id: number;
  name: string;
  code: string;
  category_display?: string | null;
  category_type?: string | null;
  tracking_type?: string | null;
  description?: string | null;
  acct_unit?: string | null;
  specifications?: string | null;
}

export interface InspectionStockRegisterOption {
  id: number;
  register_number: string;
  register_type?: string;
  store?: number;
  store_name?: string;
  location_name?: string;
}

export interface InspectionWorkflowStep {
  key: Exclude<InspectionStage, "REJECTED">;
  label: string;
  state: InspectionWorkflowState;
  ownerLabel?: string;
  activityAt?: string | null;
}

export interface InspectionRegisterCoverage {
  totalItems: number;
  fullyCoveredItems: number;
  stockCoveredItems: number;
  centralCoveredItems: number;
  requiresStockStage: boolean;
}

export interface InspectionRegisterDetailRow {
  itemLabel: string;
  acceptedQuantity: number;
  stockRegisterRef: string | null;
  stockEntryDate: string | null;
  centralRegisterRef: string | null;
}

export interface InspectionActiveRevisionRequest {
  actor: string;
  reason: string;
  requestedAt: string | null;
  fromStage: InspectionStage;
  toStage: InspectionStage;
}

export type InspectionAuditTone = "default" | "pending" | "danger";

export interface InspectionAuditEntry {
  key: string;
  label: string;
  actor: string;
  when: string | null;
  note: string;
  tone: InspectionAuditTone;
}

type InspectionRegisterKind = "stock" | "central";

export const INSPECTION_STAGE_LABELS: Record<InspectionStage, string> = {
  DRAFT: "Draft",
  STOCK_DETAILS: "Stock Details",
  CENTRAL_REGISTER: "Central Register",
  FINANCE_REVIEW: "Finance Review",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
};

export const INSPECTION_STAGE_PILL: Record<InspectionStage, string> = {
  DRAFT: "pill-neutral",
  STOCK_DETAILS: "pill-info",
  CENTRAL_REGISTER: "pill-warning",
  FINANCE_REVIEW: "pill-accent",
  COMPLETED: "pill-success",
  REJECTED: "pill-danger",
};

export type InspectionStagePermissionKey =
  | "initiate_inspection"
  | "fill_stock_details"
  | "fill_central_register"
  | "review_finance";

const DEPARTMENTAL_WORKFLOW: Array<Exclude<InspectionStage, "REJECTED">> = [
  "DRAFT",
  "STOCK_DETAILS",
  "CENTRAL_REGISTER",
  "FINANCE_REVIEW",
  "COMPLETED",
];

const ROOT_WORKFLOW: Array<Exclude<InspectionStage, "REJECTED">> = [
  "DRAFT",
  "CENTRAL_REGISTER",
  "FINANCE_REVIEW",
  "COMPLETED",
];

export function normalizeInspectionList(data: Page<InspectionRecord> | InspectionRecord[]) {
  return Array.isArray(data) ? data : data.results;
}

export function requiresDepartmentalStockStage(
  inspection: Pick<InspectionRecord, "department_hierarchy_level">,
) {
  return inspection.department_hierarchy_level !== 0;
}

export function getCreateInspectionSubmitLabel(departmentHierarchyLevel: number | null | undefined) {
  return departmentHierarchyLevel === 0
    ? "Submit to Central Register"
    : "Submit to Stock Details";
}

export function getInspectionStageDisplayLabel(
  inspection: Pick<InspectionRecord, "stage" | "status"> | { stage: InspectionStage; status?: string | null },
) {
  if (inspection.stage === "REJECTED" && inspection.status === "CANCELLED") {
    return "Cancelled";
  }
  return INSPECTION_STAGE_LABELS[inspection.stage];
}

export function getInspectionPreviousStage(
  inspection: Pick<InspectionRecord, "stage" | "department_hierarchy_level">,
): InspectionStage | null {
  if (inspection.stage === "FINANCE_REVIEW") return "CENTRAL_REGISTER";
  if (inspection.stage === "CENTRAL_REGISTER") {
    return requiresDepartmentalStockStage(inspection) ? "STOCK_DETAILS" : "DRAFT";
  }
  if (inspection.stage === "STOCK_DETAILS") return "DRAFT";
  return null;
}

export function getInspectionReturnActionLabel(
  inspection: Pick<InspectionRecord, "stage" | "department_hierarchy_level">,
) {
  const previousStage = getInspectionPreviousStage(inspection);
  return previousStage ? `Return to ${INSPECTION_STAGE_LABELS[previousStage]}` : null;
}

export function getInspectionActiveRevisionRequest(
  inspection: Pick<
    InspectionRecord,
    | "stage"
    | "department_hierarchy_level"
    | "revision_requested_by"
    | "revision_requested_by_name"
    | "revision_requested_at"
    | "revision_requested_reason"
    | "revision_requested_from_stage"
  >,
): InspectionActiveRevisionRequest | null {
  const reason = inspection.revision_requested_reason?.trim();
  const fromStage = inspection.revision_requested_from_stage;
  if (!reason || !fromStage) return null;

  const toStage = getInspectionPreviousStage({
    stage: fromStage,
    department_hierarchy_level: inspection.department_hierarchy_level,
  });

  if (!toStage || inspection.stage !== toStage) return null;

  return {
    actor: getWorkflowActor(inspection.revision_requested_by_name, inspection.revision_requested_by) ?? "Pending",
    reason,
    requestedAt: inspection.revision_requested_at,
    fromStage,
    toStage,
  };
}

export function getInspectionWorkflowSteps(
  inspection: Pick<
    InspectionRecord,
    | "department_hierarchy_level"
    | "stage"
    | "rejection_stage"
    | "created_at"
    | "updated_at"
    | "initiated_at"
    | "initiated_by_name"
    | "initiated_by"
    | "stock_filled_by"
    | "stock_filled_by_name"
    | "stock_filled_at"
    | "central_store_filled_by"
    | "central_store_filled_by_name"
    | "central_store_filled_at"
    | "finance_reviewed_by"
    | "finance_reviewed_by_name"
    | "finance_reviewed_at"
  >,
): InspectionWorkflowStep[] {
  const sequence = requiresDepartmentalStockStage(inspection) ? DEPARTMENTAL_WORKFLOW : ROOT_WORKFLOW;
  const effectiveStage = inspection.stage === "REJECTED"
    ? inspection.rejection_stage ?? sequence[0]
    : inspection.stage;
  const activeIndex = Math.max(sequence.indexOf(effectiveStage as Exclude<InspectionStage, "REJECTED">), 0);

  return sequence.map((key, index) => {
    let state: InspectionWorkflowState = "upcoming";

    if (inspection.stage === "REJECTED" && index === activeIndex) {
      state = "rejected";
    } else if (index < activeIndex) {
      state = "complete";
    } else if (index === activeIndex) {
      state = "current";
    }

    return {
      key,
      label: INSPECTION_STAGE_LABELS[key],
      state,
      ownerLabel: getInspectionWorkflowOwnerLabel(inspection, key, state),
      activityAt: getInspectionWorkflowActivityAt(inspection, key, state),
    };
  });
}

export function getInspectionStageEditorLabel(stage: InspectionStage) {
  if (stage === "DRAFT") return "Edit draft";
  if (stage === "STOCK_DETAILS") return "Fill stock details";
  if (stage === "CENTRAL_REGISTER") return "Fill central register";
  if (stage === "FINANCE_REVIEW") return "Review finance";
  return null;
}

export function canResumeInspectionEditor(
  inspection: Pick<InspectionRecord, "stage">,
  canManage: boolean,
  hasStage: (stage: string) => boolean,
) {
  if (inspection.stage === "DRAFT") return hasStage("initiate_inspection") || canManage;
  if (!canManage) return false;
  if (inspection.stage === "STOCK_DETAILS") return hasStage("fill_stock_details");
  if (inspection.stage === "CENTRAL_REGISTER") return hasStage("fill_central_register");
  if (inspection.stage === "FINANCE_REVIEW") return hasStage("review_finance");
  return false;
}

export function getInspectionStageGuidance(inspection: InspectionRecord) {
  if (inspection.stage === "DRAFT") {
    return "Review contract information, line items, and supporting documents before initiating the certificate.";
  }
  if (inspection.stage === "STOCK_DETAILS") {
    return "Record departmental stock register details for the accepted quantities before moving to central register.";
  }
  if (inspection.stage === "CENTRAL_REGISTER") {
    return "Link accepted items to the system item catalog and capture central register references, page numbers, and tracking details.";
  }
  if (inspection.stage === "FINANCE_REVIEW") {
    return "Finance validates the recorded stock and register trail before the certificate is completed.";
  }
  if (inspection.stage === "COMPLETED") {
    return "This certificate is complete. The record is now part of the downstream stock flow.";
  }
  if (inspection.status === "CANCELLED") {
    return inspection.rejection_reason
      ? `This certificate was cancelled. Reason: ${inspection.rejection_reason}`
      : "This certificate was cancelled before completion.";
  }
  return inspection.rejection_reason
    ? `This certificate was rejected. Reason: ${inspection.rejection_reason}`
    : "This certificate was rejected before completion.";
}

export function getInspectionTotals(inspection: Pick<InspectionRecord, "items">) {
  return inspection.items.reduce((totals, item) => {
    totals.lines += 1;
    totals.tendered += item.tendered_quantity || 0;
    totals.accepted += item.accepted_quantity || 0;
    totals.rejected += item.rejected_quantity || 0;
    return totals;
  }, { lines: 0, tendered: 0, accepted: 0, rejected: 0 });
}

function trimInspectionText(value: string | null | undefined) {
  const next = value?.trim();
  return next ? next : null;
}

function buildInspectionRegisterRef(
  primary: string | null | undefined,
  fallback: string | null | undefined,
  page: string | null | undefined,
) {
  const register = trimInspectionText(primary) ?? trimInspectionText(fallback);
  if (!register) return null;
  const pageValue = trimInspectionText(page);
  return pageValue ? `${register} / p.${pageValue}` : register;
}

export function getInspectionItemSecondaryLine(
  item: Pick<InspectionItemRecord, "item_specifications" | "item_code">,
) {
  return trimInspectionText(item.item_specifications) ?? trimInspectionText(item.item_code) ?? null;
}

export function getInspectionRegisterDetailRows(
  inspection: Pick<InspectionRecord, "items">,
) {
  return inspection.items
    .filter(item => Number(item.accepted_quantity || 0) > 0)
    .map<InspectionRegisterDetailRow>(item => ({
      itemLabel: trimInspectionText(item.item_description) ?? trimInspectionText(item.item_name) ?? "Unnamed item",
      acceptedQuantity: Number(item.accepted_quantity || 0),
      stockRegisterRef: buildInspectionRegisterRef(
        item.stock_register_name,
        item.stock_register_no,
        item.stock_register_page_no,
      ),
      stockEntryDate: trimInspectionText(item.stock_entry_date),
      centralRegisterRef: buildInspectionRegisterRef(
        item.central_register_name,
        item.central_register_no,
        item.central_register_page_no,
      ),
    }));
}

export function getInspectionRegisterRefs(
  items: Array<
    Pick<
      InspectionItemRecord,
      | "stock_register_name"
      | "stock_register_no"
      | "stock_register_page_no"
      | "central_register_name"
      | "central_register_no"
      | "central_register_page_no"
    >
  >,
  kind: InspectionRegisterKind,
) {
  const refs = items
    .map(item => kind === "stock"
      ? buildInspectionRegisterRef(item.stock_register_name, item.stock_register_no, item.stock_register_page_no)
      : buildInspectionRegisterRef(item.central_register_name, item.central_register_no, item.central_register_page_no))
    .filter((value): value is string => Boolean(value));

  return Array.from(new Set(refs));
}

export function getInspectionValueTotals(inspection: Pick<InspectionRecord, "items">) {
  return inspection.items.reduce((totals, item) => {
    const unitPrice = typeof item.unit_price === "number"
      ? item.unit_price
      : Number.parseFloat(item.unit_price);
    const safeUnitPrice = Number.isFinite(unitPrice) ? unitPrice : 0;

    totals.tendered += safeUnitPrice * (item.tendered_quantity || 0);
    totals.accepted += safeUnitPrice * (item.accepted_quantity || 0);
    totals.rejected += safeUnitPrice * (item.rejected_quantity || 0);

    return totals;
  }, { tendered: 0, accepted: 0, rejected: 0 });
}

export function getInspectionRegisterCoverage(
  inspection: Pick<InspectionRecord, "department_hierarchy_level" | "items">,
): InspectionRegisterCoverage {
  const requiresStockStage = requiresDepartmentalStockStage(inspection);

  return inspection.items.reduce<InspectionRegisterCoverage>((coverage, item) => {
    const hasStockRegister = Boolean(item.stock_register_name || item.stock_register_no);
    const hasCentralRegister = Boolean(item.central_register_name || item.central_register_no);
    const isFullyCovered = requiresStockStage ? hasStockRegister && hasCentralRegister : hasCentralRegister;

    coverage.totalItems += 1;
    coverage.stockCoveredItems += hasStockRegister ? 1 : 0;
    coverage.centralCoveredItems += hasCentralRegister ? 1 : 0;
    coverage.fullyCoveredItems += isFullyCovered ? 1 : 0;

    return coverage;
  }, {
    totalItems: 0,
    fullyCoveredItems: 0,
    stockCoveredItems: 0,
    centralCoveredItems: 0,
    requiresStockStage,
  });
}

function getWorkflowActor(name: string | null | undefined, id: number | null | undefined) {
  if (name) return name;
  if (id != null) return `User #${id}`;
  return null;
}

function getInspectionWorkflowOwnerLabel(
  inspection: Pick<
    InspectionRecord,
    | "initiated_by_name"
    | "initiated_by"
    | "stock_filled_by"
    | "stock_filled_by_name"
    | "central_store_filled_by"
    | "central_store_filled_by_name"
    | "finance_reviewed_by"
    | "finance_reviewed_by_name"
  >,
  step: Exclude<InspectionStage, "REJECTED">,
  state: InspectionWorkflowState,
) {
  if (step === "DRAFT") {
    return getWorkflowActor(inspection.initiated_by_name, inspection.initiated_by) ?? "Awaiting initiation";
  }

  if (step === "STOCK_DETAILS") {
    return getWorkflowActor(inspection.stock_filled_by_name, inspection.stock_filled_by)
      ?? (state === "current" ? "Stock details pending" : "Department register pending");
  }

  if (step === "CENTRAL_REGISTER") {
    return getWorkflowActor(inspection.central_store_filled_by_name, inspection.central_store_filled_by)
      ?? (state === "current" ? "Central register pending" : "Central register pending");
  }

  if (step === "FINANCE_REVIEW") {
    return getWorkflowActor(inspection.finance_reviewed_by_name, inspection.finance_reviewed_by)
      ?? (state === "current" ? "Finance review in progress" : "Finance review pending");
  }

  return getWorkflowActor(inspection.finance_reviewed_by_name, inspection.finance_reviewed_by)
    ?? (state === "current" ? "Pending finalization" : "Pending finalization");
}

function getInspectionWorkflowActivityAt(
  inspection: Pick<
    InspectionRecord,
    | "created_at"
    | "updated_at"
    | "initiated_at"
    | "stock_filled_at"
    | "central_store_filled_at"
    | "finance_reviewed_at"
  >,
  step: Exclude<InspectionStage, "REJECTED">,
  state: InspectionWorkflowState,
) {
  if (step === "DRAFT") return inspection.initiated_at ?? inspection.created_at;
  if (step === "STOCK_DETAILS") return inspection.stock_filled_at;
  if (step === "CENTRAL_REGISTER") return inspection.central_store_filled_at ?? (state === "current" ? inspection.updated_at : null);
  if (step === "FINANCE_REVIEW") return inspection.finance_reviewed_at ?? (state === "current" ? inspection.updated_at : null);
  return inspection.finance_reviewed_at ?? inspection.updated_at;
}

function getAuditActor(name: string | null | undefined, id?: number | null) {
  if (name) return name;
  if (id != null) return `User #${id}`;
  return "Pending";
}

export function getInspectionAuditEntries(
  inspection: Pick<
    InspectionRecord,
    | "stage"
    | "status"
    | "department_hierarchy_level"
    | "created_at"
    | "initiated_at"
    | "initiated_by_name"
    | "initiated_by"
    | "stock_filled_by"
    | "stock_filled_by_name"
    | "stock_filled_at"
    | "central_store_filled_by"
    | "central_store_filled_by_name"
    | "central_store_filled_at"
    | "finance_reviewed_by"
    | "finance_reviewed_by_name"
    | "finance_reviewed_at"
    | "finance_check_date"
    | "rejected_by"
    | "rejected_by_name"
    | "rejected_at"
    | "rejection_reason"
    | "updated_at"
  >,
): InspectionAuditEntry[] {
  const entries: InspectionAuditEntry[] = [
    {
      key: "created",
      label: "Created / Initiated",
      actor: getAuditActor(inspection.initiated_by_name, inspection.initiated_by),
      when: inspection.initiated_at ?? inspection.created_at,
      note: inspection.stage === "DRAFT"
        ? "Certificate record created"
        : "Certificate record created and moved into the inspection workflow",
      tone: "default",
    },
  ];

  if (requiresDepartmentalStockStage(inspection)) {
    entries.push({
      key: "stock_details",
      label: "Stock Details",
      actor: getAuditActor(inspection.stock_filled_by_name, inspection.stock_filled_by),
      when: inspection.stock_filled_at,
      note: "Department register details",
      tone: inspection.stock_filled_at ? "default" : "pending",
    });
  }

  entries.push({
    key: "central_register",
    label: "Central Register",
    actor: getAuditActor(inspection.central_store_filled_by_name, inspection.central_store_filled_by),
    when: inspection.central_store_filled_at,
    note: "Central register mapping",
    tone: inspection.central_store_filled_at ? "default" : "pending",
  });

  entries.push({
    key: "finance_review",
    label: "Finance Review",
    actor: getAuditActor(inspection.finance_reviewed_by_name, inspection.finance_reviewed_by),
    when: inspection.finance_reviewed_at,
    note: inspection.finance_check_date
      ? `Finance check date ${formatInspectionDate(inspection.finance_check_date)}`
      : "Awaiting finance confirmation",
    tone: inspection.finance_reviewed_at ? "default" : "pending",
  });

  if (inspection.stage === "REJECTED") {
    const wasCancelled = inspection.status === "CANCELLED";
    entries.push({
      key: "rejected",
      label: wasCancelled ? "Cancelled" : "Rejected",
      actor: getAuditActor(inspection.rejected_by_name, inspection.rejected_by),
      when: inspection.rejected_at,
      note: inspection.rejection_reason || (wasCancelled ? "No cancellation reason recorded" : "No rejection reason recorded"),
      tone: "danger",
    });
  }

  entries.push({
    key: "updated",
    label: "Last Updated",
    actor: "Record state",
    when: inspection.updated_at,
    note: inspection.stage === "COMPLETED"
      ? "Certificate finalized"
      : "Most recent update",
    tone: "default",
  });

  return entries;
}

export function relTime(iso: string) {
  const date = new Date(iso);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "2-digit" });
}

export function formatInspectionDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function formatInspectionDateShort(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
  });
}
