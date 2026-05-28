import { describe, expect, it } from "vitest";
import type { NotificationFeedItem } from "@/contexts/NotificationsContext";
import { parseNotificationEvent } from "@/lib/notificationEvents";
import {
  buildEntityKey,
  decideProactiveAction,
  EMPTY_HISTORY,
  PER_ENTITY_DEDUP_MS,
  RATE_LIMIT_MAX,
  RATE_LIMIT_WINDOW_MS,
  recordProactiveFire,
  type ProactiveHistory,
} from "@/lib/proactiveAgentDispatcher";

function makeActionableEvent(overrides: Partial<NotificationFeedItem> = {}) {
  return parseNotificationEvent({
    id: 100,
    event_id: 100,
    module: "inspections",
    kind: "inspection.submitted_to_central_register",
    severity: "info",
    title: "Inspection moved to Central Register",
    message: "...",
    href: "/inspections/42",
    entity_type: "inspection",
    entity_id: 42,
    actor_id: null,
    actor_name: null,
    metadata: {},
    created_at: new Date().toISOString(),
    is_read: false,
    read_at: null,
    suggested_intent: "fill_next_stage",
    intent_target: { form_id: "inspection_detail_42_central_register", record_id: 42 },
    ...overrides,
  });
}

const NOW = 1_700_000_000_000;

describe("decideProactiveAction", () => {
  it("fires when state is idle and event is actionable", () => {
    const decision = decideProactiveAction({
      event: makeActionableEvent(),
      state: "idle",
      history: EMPTY_HISTORY,
      now: NOW,
      currentUserId: null,
    });
    expect(decision.action).toBe("fire");
  });

  it("drops non-actionable events even when idle", () => {
    const decision = decideProactiveAction({
      event: makeActionableEvent({ suggested_intent: undefined, intent_target: undefined }),
      state: "idle",
      history: EMPTY_HISTORY,
      now: NOW,
      currentUserId: null,
    });
    expect(decision.action).toBe("drop");
    if (decision.action === "drop") {
      expect(decision.reason).toBe("not_agent_actionable");
    }
  });

  it("defers when the agent is running", () => {
    const decision = decideProactiveAction({
      event: makeActionableEvent(),
      state: "running",
      history: EMPTY_HISTORY,
      now: NOW,
      currentUserId: null,
    });
    expect(decision.action).toBe("defer");
    if (decision.action === "defer") {
      expect(decision.reason).toBe("agent_busy");
    }
  });

  it("defers when the user is awaiting an approval", () => {
    const decision = decideProactiveAction({
      event: makeActionableEvent(),
      state: "awaiting_user",
      history: EMPTY_HISTORY,
      now: NOW,
      currentUserId: null,
    });
    expect(decision.action).toBe("defer");
  });

  it("defers when the user is typing", () => {
    const decision = decideProactiveAction({
      event: makeActionableEvent(),
      state: "user_typing",
      history: EMPTY_HISTORY,
      now: NOW,
      currentUserId: null,
    });
    expect(decision.action).toBe("defer");
  });

  it("defers when the tab is hidden (replay on visibility)", () => {
    const decision = decideProactiveAction({
      event: makeActionableEvent(),
      state: "tab_hidden",
      history: EMPTY_HISTORY,
      now: NOW,
      currentUserId: null,
    });
    expect(decision.action).toBe("defer");
  });

  it("drops when snoozed (no backlog when user un-snoozes)", () => {
    const decision = decideProactiveAction({
      event: makeActionableEvent(),
      state: "snoozed",
      history: EMPTY_HISTORY,
      now: NOW,
      currentUserId: null,
    });
    expect(decision.action).toBe("drop");
  });

  it("drops a duplicate within the per-entity dedup window", () => {
    const event = makeActionableEvent();
    const history: ProactiveHistory = {
      recentFireTimestamps: [NOW - 1000],
      lastFireByEntity: new Map([[buildEntityKey(event), NOW - 1000]]),
    };
    const decision = decideProactiveAction({ event, state: "idle", history, now: NOW, currentUserId: null });
    expect(decision.action).toBe("drop");
    if (decision.action === "drop") {
      expect(decision.reason).toBe("duplicate_in_window");
    }
  });

  it("allows the same entity again after the dedup window expires", () => {
    const event = makeActionableEvent();
    const history: ProactiveHistory = {
      recentFireTimestamps: [],
      lastFireByEntity: new Map([[buildEntityKey(event), NOW - PER_ENTITY_DEDUP_MS - 1]]),
    };
    const decision = decideProactiveAction({ event, state: "idle", history, now: NOW, currentUserId: null });
    expect(decision.action).toBe("fire");
  });

  it("drops once rate limit is hit", () => {
    const history: ProactiveHistory = {
      recentFireTimestamps: Array.from({ length: RATE_LIMIT_MAX }, (_, i) => NOW - i * 1000),
      lastFireByEntity: new Map(),
    };
    const decision = decideProactiveAction({
      event: makeActionableEvent({ id: 200, event_id: 200, entity_id: 99 }),
      state: "idle",
      history,
      now: NOW,
    });
    expect(decision.action).toBe("drop");
    if (decision.action === "drop") {
      expect(decision.reason).toBe("rate_limited");
    }
  });

  it("allows new fires once rate-limit window has rolled past", () => {
    const history: ProactiveHistory = {
      recentFireTimestamps: Array.from({ length: RATE_LIMIT_MAX }, () => NOW - RATE_LIMIT_WINDOW_MS - 1),
      lastFireByEntity: new Map(),
    };
    const decision = decideProactiveAction({
      event: makeActionableEvent({ id: 300, event_id: 300, entity_id: 7 }),
      state: "idle",
      history,
      now: NOW,
    });
    expect(decision.action).toBe("fire");
  });
});

describe("decideProactiveAction — self-action suppression", () => {
  it("drops events whose actor matches the current user", () => {
    const decision = decideProactiveAction({
      event: makeActionableEvent({ actor_id: 42 }),
      state: "idle",
      history: EMPTY_HISTORY,
      now: NOW,
      currentUserId: 42,
    });
    expect(decision.action).toBe("drop");
    if (decision.action === "drop") {
      expect(decision.reason).toBe("self_action");
    }
  });

  it("still fires for the same event when a different user is signed in", () => {
    const decision = decideProactiveAction({
      event: makeActionableEvent({ actor_id: 42 }),
      state: "idle",
      history: EMPTY_HISTORY,
      now: NOW,
      currentUserId: 7,
    });
    expect(decision.action).toBe("fire");
  });

  it("does not suppress when currentUserId is unknown (signed-out / boot)", () => {
    const decision = decideProactiveAction({
      event: makeActionableEvent({ actor_id: 42 }),
      state: "idle",
      history: EMPTY_HISTORY,
      now: NOW,
      currentUserId: null,
    });
    expect(decision.action).toBe("fire");
  });

  it("does not suppress when the notification has no actor", () => {
    const decision = decideProactiveAction({
      event: makeActionableEvent({ actor_id: null }),
      state: "idle",
      history: EMPTY_HISTORY,
      now: NOW,
      currentUserId: 42,
    });
    expect(decision.action).toBe("fire");
  });

  it("self-action wins over busy / snoozed / hidden state (drop, not defer)", () => {
    for (const state of ["running", "snoozed", "tab_hidden", "awaiting_user", "user_typing"] as const) {
      const decision = decideProactiveAction({
        event: makeActionableEvent({ actor_id: 42 }),
        state,
        history: EMPTY_HISTORY,
        now: NOW,
        currentUserId: 42,
      });
      expect(decision.action).toBe("drop");
      if (decision.action === "drop") {
        expect(decision.reason).toBe("self_action");
      }
    }
  });
});

describe("recordProactiveFire", () => {
  it("trims the rate-limit list and updates the per-entity map", () => {
    const event = makeActionableEvent();
    const history: ProactiveHistory = {
      recentFireTimestamps: [NOW - RATE_LIMIT_WINDOW_MS - 1, NOW - 1000],
      lastFireByEntity: new Map(),
    };
    const next = recordProactiveFire(history, event, NOW);
    expect(next.recentFireTimestamps).toEqual([NOW - 1000, NOW]);
    expect(next.lastFireByEntity.get(buildEntityKey(event))).toBe(NOW);
  });

  it("prunes per-entity entries older than the dedup window", () => {
    const event = makeActionableEvent();
    const staleKey = "stale|x|1|f|1";
    const history: ProactiveHistory = {
      recentFireTimestamps: [],
      lastFireByEntity: new Map([[staleKey, NOW - PER_ENTITY_DEDUP_MS - 1000]]),
    };
    const next = recordProactiveFire(history, event, NOW);
    expect(next.lastFireByEntity.has(staleKey)).toBe(false);
    expect(next.lastFireByEntity.has(buildEntityKey(event))).toBe(true);
  });
});
