import type { InspectionStage } from "@/lib/inspectionUi";

type CopilotFilters = Record<string, unknown>;
type CopilotActions = Record<string, unknown>;
type CopilotVisibleRow = Record<string, unknown>;
type CopilotReadableLike = {
  id: string;
  value: unknown;
};

export const COPILOT_SYSTEM_READABLE_IDS = new Set([
  "__ams_runtime_context",
  "__ams_activity_context",
  "__ams_permission_context",
]);

export type CopilotListContext = {
  route: string;
  page_kind: "list";
  entity: string;
  total: number;
  filtered_total: number;
  filters: CopilotFilters;
  pagination: {
    page: number;
    page_size: number;
    total_pages: number;
  };
  visible_rows: Array<CopilotVisibleRow & { row_number: number }>;
  actions?: CopilotActions;
  [key: string]: unknown;
};

export type CopilotDetailContext = {
  route: string;
  page_kind: "detail";
  entity: string;
  selected_record: Record<string, unknown> | null;
  workflow?: Record<string, unknown> | null;
  actions?: CopilotActions;
  [key: string]: unknown;
};

type BuildListContextArgs = {
  route: string;
  entity: string;
  total: number;
  filteredTotal: number;
  filters: CopilotFilters;
  pagination: {
    page: number;
    pageSize: number;
    totalPages: number;
  };
  rows: CopilotVisibleRow[];
  actions?: CopilotActions;
  extra?: Record<string, unknown>;
};

type BuildDetailContextArgs = {
  route: string;
  entity: string;
  selectedRecord: Record<string, unknown> | null;
  workflow?: Record<string, unknown> | null;
  actions?: CopilotActions;
  extra?: Record<string, unknown>;
};

const INSPECTION_STAGE_ORDER: InspectionStage[] = [
  "DRAFT",
  "STOCK_DETAILS",
  "CENTRAL_REGISTER",
  "FINANCE_REVIEW",
  "COMPLETED",
];

const INSPECTION_STAGE_LABELS: Record<InspectionStage, string> = {
  DRAFT: "Draft",
  STOCK_DETAILS: "Stock Details",
  CENTRAL_REGISTER: "Central Register",
  FINANCE_REVIEW: "Finance Review",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
};

const INSPECTION_TRANSITIONS: Partial<Record<InspectionStage, string>> = {
  DRAFT: "initiate",
  STOCK_DETAILS: "submit_to_central_register",
  CENTRAL_REGISTER: "submit_to_finance_review",
  FINANCE_REVIEW: "complete",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function getReadableRoute(readable: CopilotReadableLike): string | null {
  if (!isRecord(readable.value)) return null;
  return typeof readable.value.route === "string" ? readable.value.route : null;
}

export function filterCopilotReadablesForRoute<T extends CopilotReadableLike>(
  readables: T[],
  currentRoute: string | null | undefined,
): T[] {
  if (!currentRoute) return readables;
  return readables.filter((readable) => {
    if (COPILOT_SYSTEM_READABLE_IDS.has(readable.id)) return true;
    return getReadableRoute(readable) === currentRoute;
  });
}

function withRowNumbers(rows: CopilotVisibleRow[]) {
  return rows.map((row, index) => ({ row_number: index + 1, ...row }));
}

export function buildCopilotListContext({
  route,
  entity,
  total,
  filteredTotal,
  filters,
  pagination,
  rows,
  actions,
  extra,
}: BuildListContextArgs): CopilotListContext {
  return {
    route,
    page_kind: "list",
    entity,
    total,
    filtered_total: filteredTotal,
    filters,
    pagination: {
      page: pagination.page,
      page_size: pagination.pageSize,
      total_pages: pagination.totalPages,
    },
    visible_rows: withRowNumbers(rows),
    ...(actions ? { actions } : {}),
    ...(extra ?? {}),
  };
}

export function buildCopilotDetailContext({
  route,
  entity,
  selectedRecord,
  workflow,
  actions,
  extra,
}: BuildDetailContextArgs): CopilotDetailContext {
  return {
    route,
    page_kind: "detail",
    entity,
    selected_record: selectedRecord,
    ...(workflow ? { workflow } : {}),
    ...(actions ? { actions } : {}),
    ...(extra ?? {}),
  };
}

export function buildInspectionWorkflowContext(stage: InspectionStage) {
  const currentIndex = INSPECTION_STAGE_ORDER.indexOf(stage);
  const previousStage = currentIndex > 0 ? INSPECTION_STAGE_ORDER[currentIndex - 1] : null;
  const nextStage =
    currentIndex >= 0 && currentIndex < INSPECTION_STAGE_ORDER.length - 1
      ? INSPECTION_STAGE_ORDER[currentIndex + 1]
      : null;

  return {
    current_stage: stage,
    current_stage_label: INSPECTION_STAGE_LABELS[stage],
    previous_stage: previousStage,
    previous_stage_label: previousStage ? INSPECTION_STAGE_LABELS[previousStage] : null,
    next_stage: nextStage,
    next_stage_label: nextStage ? INSPECTION_STAGE_LABELS[nextStage] : null,
    transition_action: INSPECTION_TRANSITIONS[stage] ?? null,
    submit_intent: INSPECTION_TRANSITIONS[stage] ? "submit" : null,
  };
}
