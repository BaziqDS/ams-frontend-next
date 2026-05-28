import { describe, expect, it } from "vitest";
import type { NotificationFeedItem } from "@/contexts/NotificationsContext";
import {
  isAgentActionableEvent,
  parseNotificationEvent,
} from "@/lib/notificationEvents";

function makeFeedItem(overrides: Partial<NotificationFeedItem> = {}): NotificationFeedItem {
  return {
    id: 1,
    event_id: 1,
    module: "inspections",
    kind: "inspection.submitted_to_central_register",
    severity: "info",
    title: "Inspection moved to Central Register",
    message: "IC-2025-0042 advanced from STOCK_DETAILS to CENTRAL_REGISTER",
    href: "/inspections/42",
    entity_type: "inspection",
    entity_id: 42,
    actor_id: null,
    actor_name: null,
    metadata: {},
    created_at: new Date().toISOString(),
    is_read: false,
    read_at: null,
    ...overrides,
  };
}

describe("parseNotificationEvent", () => {
  it("normalizes a known kind to the typed enum", () => {
    const event = parseNotificationEvent(makeFeedItem());
    expect(event.kind).toBe("inspection.submitted_to_central_register");
  });

  it("maps unknown kinds to 'unknown' without throwing", () => {
    const event = parseNotificationEvent(makeFeedItem({ kind: "future_kind_v9" }));
    expect(event.kind).toBe("unknown");
    expect(event.isAgentActionable).toBe(false);
  });

  it("reads suggested_intent from a top-level column when present", () => {
    const event = parseNotificationEvent(
      makeFeedItem({ suggested_intent: "fill_next_stage" }),
    );
    expect(event.suggestedIntent).toBe("fill_next_stage");
  });

  it("falls back to metadata.suggested_intent when no top-level field exists", () => {
    const event = parseNotificationEvent(
      makeFeedItem({
        metadata: { suggested_intent: "fill_next_stage" },
      }),
    );
    expect(event.suggestedIntent).toBe("fill_next_stage");
  });

  it("ignores unknown suggested_intent values", () => {
    const event = parseNotificationEvent(
      makeFeedItem({ suggested_intent: "make_coffee" }),
    );
    expect(event.suggestedIntent).toBeNull();
  });

  it("sanitizes intent_target and drops empty objects", () => {
    const event = parseNotificationEvent(
      makeFeedItem({
        intent_target: { form_id: "inspection_detail_42_central_register", record_id: 42 },
      }),
    );
    expect(event.intentTarget).toEqual({
      form_id: "inspection_detail_42_central_register",
      record_id: 42,
    });
  });

  it("returns null intentTarget when every field is empty", () => {
    const event = parseNotificationEvent(
      makeFeedItem({ intent_target: { form_id: "  ", record_id: undefined } }),
    );
    expect(event.intentTarget).toBeNull();
  });

  it("isAgentActionable requires both kind and suggestedIntent", () => {
    const noIntent = parseNotificationEvent(makeFeedItem());
    expect(noIntent.isAgentActionable).toBe(false);

    const ready = parseNotificationEvent(
      makeFeedItem({
        suggested_intent: "fill_next_stage",
        intent_target: { form_id: "inspection_detail_42_central_register", record_id: 42 },
      }),
    );
    expect(ready.isAgentActionable).toBe(true);
    expect(isAgentActionableEvent(ready)).toBe(true);
  });

  it("isAgentActionableEvent narrows the target to non-null", () => {
    const event = parseNotificationEvent(
      makeFeedItem({
        suggested_intent: "fill_next_stage",
        intent_target: { record_id: 42 },
      }),
    );
    if (isAgentActionableEvent(event)) {
      // Type-narrowed: TypeScript now knows these are non-null.
      expect(event.intentTarget.record_id).toBe(42);
      expect(event.suggestedIntent).toBe("fill_next_stage");
    } else {
      throw new Error("expected event to be agent-actionable");
    }
  });
});
