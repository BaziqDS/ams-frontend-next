/**
 * Proactive agent dispatcher — pure decision logic.
 *
 * Given a typed notification event and a snapshot of the current copilot
 * state, decides whether the event should trigger a proactive agent card,
 * be deferred for later, or be dropped entirely.
 *
 * The dispatcher is intentionally a pure function: it owns NO state, has no
 * side effects, and returns a Decision describing what (and why). Callers
 * are responsible for actually firing the postMessage and updating the
 * rate-limit / dedup history that this module reads.
 *
 * Keeping this pure makes the suppression rules testable in isolation and
 * lets the same logic run from anywhere (React component, web worker,
 * future server-side proactive scheduler).
 */

import {
  isAgentActionableEvent,
  type TypedNotificationEvent,
} from "@/lib/notificationEvents";

/** Coarse-grained agent state. Drives suppression decisions. */
export type CopilotProactiveState =
  | "idle"
  | "running"
  | "awaiting_user"
  | "snoozed"
  | "user_typing"
  | "tab_hidden";

/** Reason a proactive event was deferred or dropped (telemetry + debug logs). */
export type SuppressReason =
  | "not_agent_actionable"
  | "self_action"
  | "duplicate_in_window"
  | "rate_limited"
  | "snoozed"
  | "agent_busy"
  | "awaiting_user_action"
  | "user_typing"
  | "tab_hidden";

export type Decision =
  | { action: "fire"; event: TypedNotificationEvent }
  | { action: "defer"; reason: SuppressReason; event: TypedNotificationEvent }
  | { action: "drop"; reason: SuppressReason; event: TypedNotificationEvent };

/** Snapshot of the most recent proactive fires — driver maintains this. */
export interface ProactiveHistory {
  /** Epoch ms of every proactive fire in the last RATE_LIMIT_WINDOW_MS. */
  recentFireTimestamps: readonly number[];
  /** entityKey → last fire timestamp. Used for per-entity dedup. */
  lastFireByEntity: ReadonlyMap<string, number>;
}

export interface DispatchInput {
  event: TypedNotificationEvent;
  state: CopilotProactiveState;
  history: ProactiveHistory;
  now: number;
  /**
   * The currently signed-in user's id, or null when unknown. Used by the
   * self-action suppression rule: a notification triggered BY this user (the
   * actor) is dropped — the user knows what they just did and an auto-card
   * would be redundant noise. Notifications about OTHER users' actions still
   * fire normally because actor_id won't match.
   */
  currentUserId: number | null;
}

// Tuneable knobs — these are the levers if "too noisy" / "too quiet" feedback
// comes from real users. Conservative defaults intentionally err toward
// "too quiet" because over-firing is the more disruptive failure mode.

/** Max proactive cards in any rolling RATE_LIMIT_WINDOW_MS. */
export const RATE_LIMIT_MAX = 3;
/** Window over which RATE_LIMIT_MAX is measured. */
export const RATE_LIMIT_WINDOW_MS = 10 * 60_000;
/** Per-entity dedup: same entity cannot fire twice within this window. */
export const PER_ENTITY_DEDUP_MS = 5 * 60_000;

/**
 * Stable cross-window identifier for the entity an event points at. Must
 * match the bus's coalescing key so the dispatcher can detect "this entity
 * already fired recently" even when bus-level coalescing has expired.
 */
export function buildEntityKey(event: TypedNotificationEvent): string {
  const target = event.intentTarget;
  const formId = target?.form_id ?? "";
  const recordId = target?.record_id ?? "";
  const entityType = event.raw.entity_type ?? "";
  const entityId = event.raw.entity_id ?? "";
  const key = `${event.kind}|${entityType}|${entityId}|${formId}|${recordId}`;
  return key === "||||" ? `id:${event.raw.id}` : key;
}

/**
 * The decision function. Order of checks matters: state-based suppressions
 * come BEFORE rate/dedup checks because we never want to "burn" a rate-limit
 * slot on an event that was going to be deferred anyway. Deferred events
 * are kept by the caller for later replay; dropped events are gone forever.
 */
export function decideProactiveAction(input: DispatchInput): Decision {
  const { event, state, history, now, currentUserId } = input;

  // 1. The event itself must be agent-actionable. Without a typed kind AND
  //    a suggested_intent AND a non-null intent_target, the agent has
  //    nothing concrete to offer — we'd just generate a generic "want
  //    help?" card. Drop it; the user still sees it in the notification
  //    feed normally.
  if (!isAgentActionableEvent(event)) {
    return { action: "drop", reason: "not_agent_actionable", event };
  }

  // 2. Self-action suppression. If THIS user triggered the action that
  //    produced the notification, they already know what they did — a
  //    proactive card would be redundant noise (especially for admins with
  //    cross-stage permissions who get notified about their own submits).
  //    The notification still appears in the feed for record-keeping; we
  //    just don't auto-pop the agent card. Other recipients (collaborators
  //    with the same permission) still get the card because their
  //    currentUserId won't match the actor.
  //
  //    Dropped, not deferred — replaying it later would not help, the user
  //    will have moved on. This check sits ahead of state checks so a
  //    busy/snoozed/hidden state doesn't change the outcome: self-actions
  //    never need a card.
  if (
    currentUserId !== null
    && event.raw.actor_id !== null
    && event.raw.actor_id === currentUserId
  ) {
    return { action: "drop", reason: "self_action", event };
  }

  // 3. Tab hidden — defer. Never proactive-fire into a hidden tab; the user
  //    won't see it and the card just clutters the chat when they return.
  //    On visibility-restored the caller replays deferred events.
  if (state === "tab_hidden") {
    return { action: "defer", reason: "tab_hidden", event };
  }

  // 4. User explicitly snoozed proactive offers. Drop, not defer — when the
  //    snooze ends the user does NOT want a backlog of stale cards from
  //    the snoozed window. Recent events that matter will re-emit if still
  //    relevant.
  if (state === "snoozed") {
    return { action: "drop", reason: "snoozed", event };
  }

  // 5. Agent currently running. Defer — the agent is in the middle of work
  //    and interrupting with a proactive card mid-run would look chaotic.
  //    The caller replays the queue when state flips back to "idle".
  if (state === "running") {
    return { action: "defer", reason: "agent_busy", event };
  }

  // 6. HITL approval card visible. Defer — the user is actively reviewing
  //    something the agent asked for. A second card on top would compete
  //    for attention with the existing approval.
  if (state === "awaiting_user") {
    return { action: "defer", reason: "awaiting_user_action", event };
  }

  // 7. User is typing into the composer. Defer — they're already
  //    composing input and a card popping in would be jarring.
  if (state === "user_typing") {
    return { action: "defer", reason: "user_typing", event };
  }

  // 8. Per-entity dedup. The same entity (e.g., inspection #42) cannot fire
  //    twice within PER_ENTITY_DEDUP_MS. Drop, not defer — if we kept
  //    deferring duplicates the queue would balloon. The user will see
  //    coalesced bursts in the next eligible event for this entity.
  const entityKey = buildEntityKey(event);
  const lastForEntity = history.lastFireByEntity.get(entityKey);
  if (lastForEntity !== undefined && now - lastForEntity < PER_ENTITY_DEDUP_MS) {
    return { action: "drop", reason: "duplicate_in_window", event };
  }

  // 9. Rate limit. Look back RATE_LIMIT_WINDOW_MS — if we've already fired
  //    RATE_LIMIT_MAX cards, drop. Same reasoning as dedup: a backlog of
  //    rate-limited events is worse than skipping them. Telemetry counts
  //    these so we can tune RATE_LIMIT_MAX from real usage.
  const recentCount = history.recentFireTimestamps.filter(
    ts => now - ts < RATE_LIMIT_WINDOW_MS,
  ).length;
  if (recentCount >= RATE_LIMIT_MAX) {
    return { action: "drop", reason: "rate_limited", event };
  }

  return { action: "fire", event };
}

/**
 * Helper for callers: produce the next history snapshot after a fire,
 * trimming the rate-limit list so it doesn't grow without bound.
 */
export function recordProactiveFire(
  history: ProactiveHistory,
  event: TypedNotificationEvent,
  now: number,
): ProactiveHistory {
  const nextTimestamps = [
    ...history.recentFireTimestamps.filter(ts => now - ts < RATE_LIMIT_WINDOW_MS),
    now,
  ];
  const nextEntityMap = new Map(history.lastFireByEntity);
  nextEntityMap.set(buildEntityKey(event), now);
  // Prune old per-entity entries so the map doesn't grow forever.
  for (const [key, ts] of nextEntityMap) {
    if (now - ts > PER_ENTITY_DEDUP_MS) nextEntityMap.delete(key);
  }
  return {
    recentFireTimestamps: nextTimestamps,
    lastFireByEntity: nextEntityMap,
  };
}

export const EMPTY_HISTORY: ProactiveHistory = Object.freeze({
  recentFireTimestamps: Object.freeze([]) as unknown as readonly number[],
  lastFireByEntity: new Map<string, number>(),
});
