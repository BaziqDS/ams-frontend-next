import type {
  CopilotSupportNudge,
} from "@/contexts/CopilotContext";

type Severity = "info" | "warning" | "critical" | string;

export type SupportNudgeInput = {
  id: string;
  kind: string;
  module: string;
  title: string;
  message: string;
  route?: string;
  severity?: Severity;
  prompt?: string;
};

export type InspectionWorkflowNudgeInput = {
  inspectionId: number | string;
  contractNo?: string | null;
  fromStage?: string | null;
  toStage?: string | null;
  transition?: string | null;
};

function normalizeRoute(route: string | undefined) {
  if (!route || !route.startsWith("/") || route.startsWith("//")) return undefined;
  return route;
}

function moduleLabel(moduleName: string) {
  return moduleName
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function stageLabel(stage: string | null | undefined) {
  if (!stage) return "next stage";
  const labels: Record<string, string> = {
    DRAFT: "Draft",
    STOCK_DETAILS: "Stock Details",
    CENTRAL_REGISTER: "Central Register",
    FINANCE_REVIEW: "Finance Review",
    COMPLETED: "Completed",
    REJECTED: "Rejected",
  };
  return labels[stage] ?? moduleLabel(stage);
}

export function createCopilotSupportNudge(input: SupportNudgeInput): CopilotSupportNudge {
  return {
    id: input.id,
    kind: input.kind,
    title: input.title,
    message: input.message,
    route: normalizeRoute(input.route),
    module: input.module,
    severity: input.severity ?? "info",
    prompt:
      input.prompt ??
      [
        `Help me handle this ${moduleLabel(input.module)} update`,
        input.route ? `at ${input.route}.` : ".",
        `Update: ${input.title}.`,
        input.message,
      ].join(" "),
    createdAt: new Date().toISOString(),
  };
}

export function createInspectionWorkflowNudge({
  inspectionId,
  contractNo,
  fromStage,
  toStage,
  transition,
}: InspectionWorkflowNudgeInput): CopilotSupportNudge {
  const route = `/inspections/${inspectionId}`;
  const recordLabel = contractNo?.trim() || `Inspection #${inspectionId}`;
  const nextStage = stageLabel(toStage);
  const previousStage = stageLabel(fromStage);
  const completed = toStage === "COMPLETED";
  const title = completed
    ? `${recordLabel} completed`
    : `${recordLabel} moved to ${nextStage}`;
  const message = completed
    ? "The inspection workflow is complete. I can help review the certificate, items, register coverage, or distribution details."
    : `The inspection moved from ${previousStage} to ${nextStage}. I can help with the next stage, required fields, or record review.`;

  return createCopilotSupportNudge({
    id: `inspection-workflow:${inspectionId}:${transition ?? toStage ?? "stage"}`,
    kind: "inspection_workflow_update",
    module: "inspections",
    severity: toStage === "FINANCE_REVIEW" ? "critical" : "warning",
    title,
    message,
    route,
    prompt: [
      `Help me with inspection ${recordLabel} on ${route}.`,
      completed
        ? "Review the completed inspection certificate and summarize anything important."
        : `It just moved to ${nextStage}. Use the current page context and active form if available. If I am not on the page, help me navigate there first.`,
    ].join(" "),
  });
}
