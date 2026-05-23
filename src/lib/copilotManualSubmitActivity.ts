import type { CopilotActivityEventInput } from "./copilotActivity";

export type ManualSubmitIntent = "save" | "submit" | "save_draft";

type ManualSubmitActivityArgs = {
  formId: string;
  formTitle: string;
  intent: ManualSubmitIntent;
  route?: string;
};

type ManualSubmitResultActivityArgs = ManualSubmitActivityArgs & {
  result: unknown;
};

function actionLabel(intent: ManualSubmitIntent) {
  if (intent === "save") return "save";
  if (intent === "save_draft") return "draft save";
  return "submit";
}

function resultSucceeded(result: unknown) {
  return Boolean(
    result &&
      typeof result === "object" &&
      !Array.isArray(result) &&
      (result as { ok?: unknown }).ok === true,
  );
}

export function buildManualSubmitRequestedActivity({
  formId,
  formTitle,
  intent,
  route,
}: ManualSubmitActivityArgs): CopilotActivityEventInput {
  return {
    kind: "form_submit_requested",
    actor: "user",
    title: `Manual ${actionLabel(intent)} requested for ${formTitle}`,
    route,
    formId,
    formTitle,
    details: { intent, source: "manual" },
  };
}

export function buildManualSubmitResultActivity({
  formId,
  formTitle,
  intent,
  route,
  result,
}: ManualSubmitResultActivityArgs): CopilotActivityEventInput {
  return {
    kind: "form_submit_result",
    actor: "user",
    title: `Manual ${actionLabel(intent)} ${
      resultSucceeded(result) ? "succeeded" : "failed"
    } for ${formTitle}`,
    route,
    formId,
    formTitle,
    result,
    details: { intent, source: "manual" },
  };
}
