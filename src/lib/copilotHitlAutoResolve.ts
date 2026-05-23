import type { CopilotActivityEvent } from "./copilotActivity";

export type HitlRejectionReason =
  | "user_submitted_manually"
  | "user_closed_form"
  | "user_navigated_away";

export type PendingCopilotHitl = {
  formId: string | null;
  route: string | null;
  at: number;
};

function normalizeFormIdForMatch(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/[-_]/g, "").toLowerCase();
}

export function hitlFormIdsEqual(left: unknown, right: unknown): boolean {
  const a = normalizeFormIdForMatch(left);
  const b = normalizeFormIdForMatch(right);
  if (!a || !b) return false;
  return a === b;
}

function resultSucceeded(result: unknown) {
  return Boolean(
    result &&
      typeof result === "object" &&
      !Array.isArray(result) &&
      (result as { ok?: unknown }).ok === true,
  );
}

function samePendingForm(
  pending: PendingCopilotHitl,
  formId: unknown,
): boolean {
  if (!pending.formId) return Boolean(formId);
  return hitlFormIdsEqual(pending.formId, formId);
}

function normalizeRoute(route: string | null | undefined) {
  if (!route) return null;
  return route.length > 1 && route.endsWith("/") ? route.slice(0, -1) : route;
}

export function getHitlAutoRejectReason({
  pending,
  event,
  currentRoute,
}: {
  pending: PendingCopilotHitl | null;
  event: CopilotActivityEvent;
  currentRoute: string | null;
}): HitlRejectionReason | null {
  if (!pending || event.actor !== "user") return null;

  if (
    event.kind === "form_submit_result" &&
    resultSucceeded(event.result) &&
    samePendingForm(pending, event.formId)
  ) {
    return "user_submitted_manually";
  }

  if (
    event.kind === "form_closed" &&
    samePendingForm(pending, event.formId)
  ) {
    return "user_closed_form";
  }

  if (event.kind === "route_changed") {
    const fromRoute = normalizeRoute(pending.route);
    const toRoute = normalizeRoute(event.route ?? currentRoute);
    if (fromRoute && toRoute && fromRoute !== toRoute) {
      return "user_navigated_away";
    }
  }

  return null;
}
