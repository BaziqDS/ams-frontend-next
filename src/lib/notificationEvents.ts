/**
 * Typed notification event surface.
 *
 * The raw API still uses `kind: string` so unknown future event types never
 * break parsing. This module layers a typed schema on top: callers that need
 * structured reasoning (the proactive agent, badge logic, deep-link routing)
 * use `parseNotificationEvent` to get a typed envelope, while callers that
 * only need to display the title/message read the raw record directly.
 *
 * Backend rollout is gradual — `suggested_intent` and `intent_target` are
 * optional. If the backend hasn't started emitting them yet, the parser
 * returns `null` and the agent integration falls back to generic prompting.
 */

import type { NotificationFeedItem } from "@/contexts/NotificationsContext";

/**
 * Canonical event kinds. Add new kinds here as the backend emits them. When
 * an unknown kind arrives at runtime, the parser maps it to `"unknown"` so
 * downstream code can decide whether to drop the event or surface it
 * generically — neither path crashes.
 */
// Kept in lockstep with the backend's NotificationEvent.kind values. See
// ams-backend/notifications/services.py — every notify_* helper there must
// have a corresponding entry here (otherwise the parser maps it to
// "unknown" and the proactive dispatcher drops it as not-actionable).
export const NOTIFICATION_KINDS = [
  // Inspection workflow — emitted by notify_inspection_*.
  "inspection.initiated",
  "inspection.submitted_to_central_register",
  "inspection.submitted_to_finance_review",
  "inspection.completed",
  "inspection.rejected",
  // Stock movement — emitted by notify_stock_entry_*.
  "stock_entry.pending_ack",
  "stock_entry.acknowledged",
  // Stock corrections — emitted by notify_correction_*.
  "stock_correction.requested",
  "stock_correction.approved",
  "stock_correction.rejected",
  "stock_correction.applied",
  // Stock registers — emitted by notify_stock_register_*.
  "stock_register.closed",
  "stock_register.reopened",
  // Depreciation — emitted by notify_depreciation_* and notify_fixed_asset_*.
  "depreciation.run_created",
  "depreciation.run_posted",
  "depreciation.run_reversed",
  "depreciation.asset_capitalized",
  "depreciation.adjustment_created",
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number] | "unknown";

const KNOWN_KINDS = new Set<string>(NOTIFICATION_KINDS);

/**
 * The agent uses `suggested_intent` to decide what to *offer* the user when
 * a proactive event arrives — without it, the agent has only the event
 * title/message and tends to produce a generic "want help?" card.
 *
 * Each intent maps to a small family of orchestrator behaviours described in
 * the agent prompt. Intents are deliberately coarse — the orchestrator does
 * the fine-grained routing using `intent_target`.
 */
export const SUGGESTED_INTENTS = [
  "fill_next_stage",
  "fill_form",
  "review_record",
  "create_record",
  "correct_form",
  "suggest_restock",
  "review_maintenance",
  "no_action",
] as const;

export type SuggestedIntent = (typeof SUGGESTED_INTENTS)[number];

const KNOWN_INTENTS = new Set<string>(SUGGESTED_INTENTS);

/**
 * Structured pointer to the thing the suggested intent should act on. Every
 * field is optional because not every kind has every coordinate (e.g., a
 * low-balance alert has no form_id; an HITL rejection has no list view).
 */
export interface IntentTarget {
  /** Form id the agent should open (matches the AMS form_id registry). */
  form_id?: string;
  /** Record id the form should bind to / the route should resolve. */
  record_id?: number | string;
  /** Module name for top-level routing fallbacks (e.g., "inspections"). */
  module?: string;
  /** Frontend route the agent can navigate to via navigate_to_route. */
  route?: string;
}

/**
 * Typed envelope returned by `parseNotificationEvent`. It wraps the raw item
 * with strongly-typed `kind` and the optional agent-routing fields. The raw
 * record is still exposed via `raw` so renderers that just want title/message
 * don't need to re-derive them.
 */
export interface TypedNotificationEvent {
  raw: NotificationFeedItem;
  kind: NotificationKind;
  /** Resolved when the backend emits the optional field; null otherwise. */
  suggestedIntent: SuggestedIntent | null;
  /** Resolved from `metadata.intent_target` when present, sanitized. */
  intentTarget: IntentTarget | null;
  /** True when both kind and suggestedIntent are concrete (agent-ready). */
  isAgentActionable: boolean;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readIdValue(value: unknown): number | string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return readString(value);
}

function sanitizeIntentTarget(value: unknown): IntentTarget | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Record<string, unknown>;
  const target: IntentTarget = {
    form_id: readString(source.form_id),
    record_id: readIdValue(source.record_id),
    module: readString(source.module),
    route: readString(source.route),
  };
  // Drop the object if every field is missing — saves consumers from null
  // checks on every field. An empty target carries no signal.
  const hasAny = Object.values(target).some(field => field !== undefined);
  return hasAny ? target : null;
}

function parseKind(raw: string | undefined): NotificationKind {
  if (!raw) return "unknown";
  return KNOWN_KINDS.has(raw) ? (raw as NotificationKind) : "unknown";
}

function parseIntent(raw: unknown): SuggestedIntent | null {
  const candidate = readString(raw);
  if (!candidate) return null;
  return KNOWN_INTENTS.has(candidate) ? (candidate as SuggestedIntent) : null;
}

/**
 * Lift a raw feed item to a typed envelope. Never throws — unknown values
 * are normalized to safe defaults. Use this whenever you need to *act* on
 * the event (route, dispatch, agent prompt) rather than just display it.
 *
 * The optional fields are read from two locations, in priority order:
 * 1. Top-level `suggested_intent` / `intent_target` if the backend exposes
 *    them as first-class columns.
 * 2. `metadata.suggested_intent` / `metadata.intent_target` for the
 *    transitional period where they live inside the existing JSON blob.
 *
 * This dual-source read lets the backend roll out new columns gradually
 * without coordinating a single big migration.
 */
export function parseNotificationEvent(
  item: NotificationFeedItem,
): TypedNotificationEvent {
  const kind = parseKind(item.kind);
  const meta = item.metadata ?? {};
  const intentSource =
    (item as unknown as { suggested_intent?: unknown }).suggested_intent
    ?? (meta as { suggested_intent?: unknown }).suggested_intent;
  const targetSource =
    (item as unknown as { intent_target?: unknown }).intent_target
    ?? (meta as { intent_target?: unknown }).intent_target;
  const suggestedIntent = parseIntent(intentSource);
  const intentTarget = sanitizeIntentTarget(targetSource);
  return {
    raw: item,
    kind,
    suggestedIntent,
    intentTarget,
    isAgentActionable: kind !== "unknown" && suggestedIntent !== null,
  };
}

/**
 * Convenience predicate for filters. Returns true only when the event has
 * everything the proactive agent needs: typed kind, a suggested intent, and
 * an intent target. The proactive layer should only auto-fire on actionable
 * events; non-actionable ones still surface in the user-facing feed but are
 * ignored for proactive offers.
 */
export function isAgentActionableEvent(
  event: TypedNotificationEvent,
): event is TypedNotificationEvent & {
  suggestedIntent: SuggestedIntent;
  intentTarget: IntentTarget;
} {
  return event.isAgentActionable && event.intentTarget !== null;
}
