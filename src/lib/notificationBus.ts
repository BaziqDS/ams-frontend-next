"use client";

/**
 * In-memory notification event bus.
 *
 * The NotificationsContext is the source of truth for the raw feed. The bus
 * sits on top: it watches the feed for newly-arrived items, lifts them
 * through the typed parser, applies debouncing + per-entity coalescing +
 * id-level dedup, and pushes one clean event per "burst" to its subscribers.
 *
 * This is the layer the ProactiveAgentDispatcher consumes — it never reads
 * the raw feed directly. Splitting the bus from the dispatcher keeps the
 * "what to emit" logic separate from the "should we fire" logic, so each
 * can be tested independently.
 *
 * No backend transport here — the bus is transport-agnostic. Today the feed
 * is polled (15s tick). Tomorrow when SSE/WebSocket lands, only the
 * NotificationsContext changes; the bus and everything above stays the same.
 */

import { useEffect, useMemo, useRef } from "react";
import {
  parseNotificationEvent,
  type TypedNotificationEvent,
} from "@/lib/notificationEvents";
import type { NotificationFeedItem } from "@/contexts/NotificationsContext";

/** Time window after the latest event in a burst before the bus flushes. */
const DEBOUNCE_MS = 1500;
/** Window in which events targeting the same entity are coalesced into one. */
const COALESCE_WINDOW_MS = 60_000;

type BusListener = (event: TypedNotificationEvent) => void;

interface EmitRecord {
  emittedAt: number;
  eventId: number;
}

/**
 * A single bus instance is sufficient for the whole app. We keep it module-
 * private so consumers go through `useNotificationBus()` and cannot mutate
 * internal state from outside.
 */
class NotificationBus {
  private listeners = new Set<BusListener>();
  // Highest seen feed id so we can ignore re-renders that include historical
  // items. Anything <= this id has already been processed (or skipped on
  // purpose during the initial backfill).
  private highestSeenId: number | null = null;
  // Pending events keyed by entity coordinate. A new event for the same
  // entity REPLACES the pending one (latest wins). When the debounce timer
  // fires we flush whatever is pending.
  private pending = new Map<string, TypedNotificationEvent>();
  // Recent emits — used to coalesce bursts: if the same entity emitted in
  // the last COALESCE_WINDOW_MS we skip the duplicate. Stored as a Map for
  // O(1) get; pruned lazily when checked.
  private recentEmits = new Map<string, EmitRecord>();
  // Ids we've already processed (emitted OR intentionally suppressed). Keeps
  // the bus idempotent if React renders the same item twice.
  private processedIds = new Set<number>();
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  subscribe(listener: BusListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Initialise the bus from the first observed feed. This MUST be called
   * before processing any deltas — the initial snapshot is treated as
   * "already known" and is never re-emitted as a proactive event. Otherwise
   * every page refresh would replay the entire feed.
   */
  primeFromInitialFeed(feed: NotificationFeedItem[]) {
    if (this.highestSeenId !== null) return;
    let highest = -1;
    for (const item of feed) {
      if (item.id > highest) highest = item.id;
      this.processedIds.add(item.id);
    }
    this.highestSeenId = highest;
  }

  /**
   * Feed the bus a fresh snapshot. Only items with id > highestSeenId are
   * considered new — historical items in the snapshot are ignored. New
   * items get parsed, deduped by id, then queued through the per-entity
   * debouncer.
   */
  ingest(feed: NotificationFeedItem[]) {
    if (this.highestSeenId === null) {
      this.primeFromInitialFeed(feed);
      return;
    }
    let nextHighest = this.highestSeenId;
    for (const item of feed) {
      if (item.id <= this.highestSeenId) continue;
      if (this.processedIds.has(item.id)) continue;
      this.processedIds.add(item.id);
      if (item.id > nextHighest) nextHighest = item.id;

      const event = parseNotificationEvent(item);
      this.queue(event);
    }
    this.highestSeenId = nextHighest;
  }

  /**
   * Internal: enqueue a typed event for the per-entity debouncer. If another
   * event targeting the same entity is already pending, the newer event
   * replaces it (latest wins). After every queue() call we (re)start the
   * flush timer so the burst is emitted as one batch when the dust settles.
   */
  private queue(event: TypedNotificationEvent) {
    const key = this.entityKey(event);
    this.pending.set(key, event);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => this.flush(), DEBOUNCE_MS);
  }

  /** Coalescing key — same entity within a window collapses to one emit. */
  private entityKey(event: TypedNotificationEvent): string {
    const target = event.intentTarget;
    const formId = target?.form_id ?? "";
    const recordId = target?.record_id ?? "";
    const entityType = event.raw.entity_type ?? "";
    const entityId = event.raw.entity_id ?? "";
    // Fall back to the raw event id so events with no entity coordinate
    // still get a unique key and don't accidentally collapse together.
    return `${event.kind}|${entityType}|${entityId}|${formId}|${recordId}` || `id:${event.raw.id}`;
  }

  private flush() {
    this.flushTimer = null;
    const now = Date.now();
    this.pruneRecent(now);
    const events = Array.from(this.pending.values());
    this.pending.clear();
    for (const event of events) {
      const key = this.entityKey(event);
      const recent = this.recentEmits.get(key);
      if (recent && now - recent.emittedAt < COALESCE_WINDOW_MS) {
        // Skip — we already emitted for this entity recently. The newest
        // event still updates the recency timestamp so a long-running
        // burst doesn't sneak through after the window expires by accident.
        this.recentEmits.set(key, { emittedAt: recent.emittedAt, eventId: event.raw.id });
        continue;
      }
      this.recentEmits.set(key, { emittedAt: now, eventId: event.raw.id });
      for (const listener of this.listeners) {
        try {
          listener(event);
        } catch {
          // A throwing listener must not break the bus for other listeners.
          // (Wrapping in try/catch keeps the bus resilient to consumer bugs.)
        }
      }
    }
  }

  /** Drop recency records older than the coalesce window so the map doesn't grow without bound. */
  private pruneRecent(now: number) {
    for (const [key, record] of this.recentEmits) {
      if (now - record.emittedAt >= COALESCE_WINDOW_MS) {
        this.recentEmits.delete(key);
      }
    }
  }

  /** Test/teardown helper. Not used in production code. */
  reset() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = null;
    this.pending.clear();
    this.recentEmits.clear();
    this.processedIds.clear();
    this.highestSeenId = null;
    this.listeners.clear();
  }
}

export const notificationBus = new NotificationBus();

// Dev-only console helper. Lets you trigger a proactive event from the
// browser DevTools without waiting for a real backend notification:
//
//   window.__amsTestProactive({
//     kind: "inspection.submitted_to_central_register",
//     intent: "fill_next_stage",
//     recordId: 5,
//     route: "/inspections/5",
//     title: "Inspection IC-2025-0001 needs Central Register",
//   })
//
// Gated on NODE_ENV so production builds never expose it.
if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
  let counter = 1_000_000;
  (window as unknown as { __amsTestProactive?: unknown }).__amsTestProactive = (
    overrides: {
      kind?: string;
      intent?: string;
      recordId?: number;
      route?: string;
      title?: string;
      message?: string;
      severity?: string;
    } = {},
  ) => {
    const id = ++counter;
    const fake: NotificationFeedItem = {
      id,
      event_id: id,
      module: "inspections",
      kind: overrides.kind ?? "inspection.submitted_to_central_register",
      severity: overrides.severity ?? "warning",
      title: overrides.title ?? "Test proactive event",
      message: overrides.message ?? "Synthetic event from __amsTestProactive",
      href: overrides.route ?? "/inspections/1",
      entity_type: "inspection",
      entity_id: overrides.recordId ?? 1,
      actor_id: null,
      actor_name: null,
      metadata: {
        suggested_intent: overrides.intent ?? "fill_next_stage",
        intent_target: {
          form_id: `inspection_detail_${overrides.recordId ?? 1}_central_register`,
          record_id: overrides.recordId ?? 1,
          route: overrides.route ?? `/inspections/${overrides.recordId ?? 1}`,
        },
      },
      created_at: new Date().toISOString(),
      is_read: false,
      read_at: null,
    };
    notificationBus.ingest([fake]);
    return id;
  };
}

/**
 * React glue. Mount this once near the root (alongside NotificationsProvider)
 * to keep the bus in sync with the live feed. Consumers subscribe via
 * `notificationBus.subscribe(listener)` directly — the hook only handles
 * priming and incremental ingestion.
 */
export function useNotificationBusIngest(feed: NotificationFeedItem[]) {
  const hasPrimedRef = useRef(false);

  useEffect(() => {
    if (!hasPrimedRef.current) {
      notificationBus.primeFromInitialFeed(feed);
      hasPrimedRef.current = true;
      return;
    }
    notificationBus.ingest(feed);
  }, [feed]);
}

/**
 * Convenience hook for consumers that want a stable subscribe handle. Returns
 * the bus singleton so the caller can attach/detach listeners themselves.
 */
export function useNotificationBus() {
  return useMemo(() => notificationBus, []);
}
