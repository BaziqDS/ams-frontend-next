"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiFetch, type Page } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import {
  buildVisibleAlertModuleCounts,
  getActiveSeenAlertKeys,
  getSeenAlertKeysAfterViewing,
  getSeenAlertKeysAfterViewingModule,
} from "@/lib/notificationAlertVisibility";

export interface NotificationModuleSummary {
  count: number;
  critical: number;
}

export interface NotificationSummary {
  unread_notifications: number;
  open_alerts: number;
  modules: Record<string, NotificationModuleSummary>;
}

export interface NotificationAlertRecord {
  key: string;
  module: string;
  severity: "info" | "warning" | "critical" | string;
  title: string;
  message: string;
  href: string;
  count: number;
  meta?: Record<string, unknown>;
}

export interface NotificationFeedItem {
  id: number;
  event_id: number;
  module: string;
  /**
   * Backend-emitted event kind. Kept as a plain string so unknown future
   * values never break parsing. Use `parseNotificationEvent` from
   * `@/lib/notificationEvents` to lift this to a typed enum when you need
   * to dispatch on it (proactive agent, routing, etc.).
   */
  kind: string;
  severity: "info" | "warning" | "critical" | string;
  title: string;
  message: string;
  href: string;
  entity_type: string;
  entity_id: number | null;
  actor_id: number | null;
  actor_name: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  is_read: boolean;
  read_at: string | null;
  /**
   * Optional, may be omitted by older backends or absent for events that
   * carry no proactive suggestion. The proactive-agent layer reads this to
   * decide what to OFFER; if absent, the event is still shown in the feed
   * but is not auto-surfaced as a proactive card. See `notificationEvents.ts`
   * for the canonical union of values.
   */
  suggested_intent?: string | null;
  /**
   * Optional structured pointer the suggested intent should act on
   * (form id, record id, module, or route). Backend may put this here as a
   * first-class field OR keep it inside `metadata` during transition — the
   * parser checks both locations.
   */
  intent_target?: {
    form_id?: string;
    record_id?: number | string;
    module?: string;
    route?: string;
  } | null;
}

interface NotificationsContextValue {
  summary: NotificationSummary;
  alerts: NotificationAlertRecord[];
  feed: NotificationFeedItem[];
  isSummaryLoading: boolean;
  isPanelLoading: boolean;
  isPanelRefreshing: boolean;
  refreshSummary: () => Promise<void>;
  loadPanelData: () => Promise<void>;
  markRead: (notificationId: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  clearFeed: () => Promise<void>;
  getModuleCount: (module: string) => number;
  markModuleAlertsViewed: (module: string) => void;
}

const EMPTY_SUMMARY: NotificationSummary = {
  unread_notifications: 0,
  open_alerts: 0,
  modules: {},
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);
const SUMMARY_POLL_MS = 15_000;
const POLL_BACKOFF_MAX_MS = 120_000;
const POLL_BACKOFF_FACTOR = 2;
const SEEN_ALERT_KEYS_STORAGE_KEY_PREFIX = "ams.sidebar.seen-alert-keys.v1";
const BROADCAST_CHANNEL_PREFIX = "ams.notifications.v1";

// Messages broadcast between same-origin tabs so a mutation in one tab is
// reflected in siblings without a server round-trip. The channel name is
// per-user (see useEffect below) so logout/login cannot leak data.
type NotificationsBroadcast =
  | { type: "mark_read"; notificationId: number }
  | { type: "mark_all_read" }
  | { type: "clear_feed" }
  | { type: "panel_data"; alerts: NotificationAlertRecord[]; feed: NotificationFeedItem[]; summary: NotificationSummary }
  | { type: "summary"; summary: NotificationSummary };

function normalizeList<T>(data: Page<T> | T[]) {
  return Array.isArray(data) ? data : data.results;
}

function buildSummaryFromAlerts(alerts: NotificationAlertRecord[], unreadNotifications: number): NotificationSummary {
  const modules = alerts.reduce<Record<string, NotificationModuleSummary>>((acc, alert) => {
    const moduleName = alert.module || "general";
    const current = acc[moduleName] ?? { count: 0, critical: 0 };
    acc[moduleName] = {
      count: current.count + 1,
      critical: current.critical + (alert.severity === "critical" ? 1 : 0),
    };
    return acc;
  }, {});

  return {
    unread_notifications: Math.max(0, unreadNotifications),
    open_alerts: alerts.length,
    modules,
  };
}

function readStoredSeenAlertKeys(storageKey: string) {
  if (typeof window === "undefined") return new Set<string>();

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    const parsedValue = rawValue ? JSON.parse(rawValue) : [];
    return new Set(Array.isArray(parsedValue) ? parsedValue.filter((key): key is string => typeof key === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function storeSeenAlertKeys(storageKey: string, seenAlertKeys: ReadonlySet<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify([...seenAlertKeys]));
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const seenAlertKeysStorageKey = `${SEEN_ALERT_KEYS_STORAGE_KEY_PREFIX}.${user?.id ?? "anonymous"}`;
  const broadcastChannelName = `${BROADCAST_CHANNEL_PREFIX}.${user?.id ?? "anonymous"}`;
  const [summary, setSummary] = useState<NotificationSummary>(EMPTY_SUMMARY);
  const [alerts, setAlerts] = useState<NotificationAlertRecord[]>([]);
  const [feed, setFeed] = useState<NotificationFeedItem[]>([]);
  const [seenAlertKeys, setSeenAlertKeys] = useState<Set<string>>(() => readStoredSeenAlertKeys(seenAlertKeysStorageKey));
  const [hasLoadedAlerts, setHasLoadedAlerts] = useState(false);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);
  const [isPanelLoading, setIsPanelLoading] = useState(false);
  const [isPanelRefreshing, setIsPanelRefreshing] = useState(false);
  const hasLoadedPanelDataRef = useRef(false);
  const viewedModulesRef = useRef(new Set<string>());

  // AbortControllers for in-flight polls. A new poll aborts the previous one
  // so slow networks cannot create a fan-in of stale responses overwriting
  // newer state.
  const summaryAbortRef = useRef<AbortController | null>(null);
  const alertsAbortRef = useRef<AbortController | null>(null);
  const feedAbortRef = useRef<AbortController | null>(null);

  // Monotonic generation counter for summary writes. Each fetch captures the
  // generation in flight; only the write whose generation === current can
  // commit. Prevents races between refreshSummary (interval) and
  // loadPanelData (panel open) — the older response cannot clobber the
  // fresher one even when they finish out of order.
  const summaryGenerationRef = useRef(0);

  // Exponential backoff state. Consecutive failures double the poll interval
  // up to POLL_BACKOFF_MAX_MS. A single successful fetch resets it. This
  // protects the backend when it is degraded and prevents the client from
  // hammering it.
  const consecutiveFailuresRef = useRef(0);

  // Last feed event id we know about. Sent as ?since=<id> so the backend can
  // return only newer items if it supports incremental fetch. If the backend
  // ignores the parameter the call still returns the full list — safe either
  // way. The frontend de-dups on item.id when merging.
  const lastSeenEventIdRef = useRef<number | null>(null);

  // BroadcastChannel for same-origin sibling tabs. A mutation in tab A
  // (markRead, clearFeed, etc.) is reflected in tab B without a server
  // round-trip. The channel is per-user (see broadcastChannelName) so a
  // logout/login in one tab cannot leak the previous user's events.
  const broadcastRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    setSeenAlertKeys(readStoredSeenAlertKeys(seenAlertKeysStorageKey));
  }, [seenAlertKeysStorageKey]);

  const applyAlerts = useCallback((nextAlerts: NotificationAlertRecord[], markViewed: boolean) => {
    setAlerts(nextAlerts);
    setHasLoadedAlerts(true);
    setSeenAlertKeys(prev => {
      const activeSeenAlertKeys = getActiveSeenAlertKeys(prev, nextAlerts);
      let nextSeenAlertKeys = markViewed
        ? getSeenAlertKeysAfterViewing(activeSeenAlertKeys, nextAlerts)
        : activeSeenAlertKeys;
      viewedModulesRef.current.forEach(module => {
        nextSeenAlertKeys = getSeenAlertKeysAfterViewingModule(nextSeenAlertKeys, nextAlerts, module);
      });
      storeSeenAlertKeys(seenAlertKeysStorageKey, nextSeenAlertKeys);
      return nextSeenAlertKeys;
    });
  }, [seenAlertKeysStorageKey]);

  const refreshSummary = useCallback(async () => {
    // Abort any in-flight summary fetch so we never race two parallel polls.
    summaryAbortRef.current?.abort();
    const controller = new AbortController();
    summaryAbortRef.current = controller;
    const generation = ++summaryGenerationRef.current;

    try {
      const data = await apiFetch<NotificationSummary>(
        "/api/notifications/summary/",
        { signal: controller.signal },
      );
      // Freshness guard: a slower in-flight response from earlier must not
      // overwrite a faster newer response. Same logic for the backoff reset.
      if (generation !== summaryGenerationRef.current) return;
      const normalized: NotificationSummary = {
        unread_notifications: data.unread_notifications ?? 0,
        open_alerts: data.open_alerts ?? 0,
        modules: data.modules ?? {},
      };
      setSummary(normalized);
      consecutiveFailuresRef.current = 0;
      broadcastRef.current?.postMessage({ type: "summary", summary: normalized } satisfies NotificationsBroadcast);
    } catch (err) {
      if ((err as { name?: string } | null)?.name === "AbortError") return;
      // Track failures for exponential backoff. The interval reads
      // consecutiveFailuresRef when scheduling the next tick.
      consecutiveFailuresRef.current = Math.min(consecutiveFailuresRef.current + 1, 8);
    } finally {
      if (generation === summaryGenerationRef.current) {
        setIsSummaryLoading(false);
      }
    }
  }, []);

  const loadPanelData = useCallback(async () => {
    const isInitialLoad = !hasLoadedPanelDataRef.current;

    if (isInitialLoad) {
      setIsPanelLoading(true);
    } else {
      setIsPanelRefreshing(true);
    }

    // Abort any in-flight panel fetches so the latest panel-open wins.
    alertsAbortRef.current?.abort();
    feedAbortRef.current?.abort();
    const alertsController = new AbortController();
    const feedController = new AbortController();
    alertsAbortRef.current = alertsController;
    feedAbortRef.current = feedController;

    // Bump the summary generation too, because we write summary here from
    // alerts. An older refreshSummary response must not clobber this write.
    const generation = ++summaryGenerationRef.current;

    // Incremental feed fetch when we already have a watermark. Backend may
    // ignore ?since= and return the full list; either way we de-dup by id.
    const sinceParam = lastSeenEventIdRef.current !== null
      ? `&since=${encodeURIComponent(lastSeenEventIdRef.current)}`
      : "";

    try {
      const [alertsData, feedData] = await Promise.all([
        apiFetch<NotificationAlertRecord[]>(
          "/api/notifications/alerts/",
          { signal: alertsController.signal },
        ),
        apiFetch<Page<NotificationFeedItem> | NotificationFeedItem[]>(
          `/api/notifications/feed/?page_size=200${sinceParam}`,
          { signal: feedController.signal },
        ),
      ]);
      const nextAlerts = alertsData ?? [];
      applyAlerts(nextAlerts, true);

      // Merge incremental feed: de-dup by id, keep newest first by id desc.
      const incoming = normalizeList(feedData);
      setFeed(prev => {
        if (lastSeenEventIdRef.current === null) return incoming;
        const byId = new Map<number, NotificationFeedItem>();
        for (const item of prev) byId.set(item.id, item);
        for (const item of incoming) byId.set(item.id, item);
        return Array.from(byId.values()).sort((a, b) => b.id - a.id);
      });
      const maxId = incoming.reduce(
        (acc, item) => (item.id > acc ? item.id : acc),
        lastSeenEventIdRef.current ?? -1,
      );
      if (maxId >= 0) lastSeenEventIdRef.current = maxId;

      // Only write summary if this is still the freshest generation.
      if (generation === summaryGenerationRef.current) {
        const nextSummary = buildSummaryFromAlerts(nextAlerts, /* placeholder */ 0);
        setSummary(prev => ({
          ...nextSummary,
          unread_notifications: prev.unread_notifications ?? 0,
        }));
        setIsSummaryLoading(false);
      }
      hasLoadedPanelDataRef.current = true;
      consecutiveFailuresRef.current = 0;

      // Broadcast to sibling tabs so they update without a separate fetch.
      const broadcastSummary = buildSummaryFromAlerts(nextAlerts, summary.unread_notifications ?? 0);
      broadcastRef.current?.postMessage({
        type: "panel_data",
        alerts: nextAlerts,
        feed: incoming,
        summary: broadcastSummary,
      } satisfies NotificationsBroadcast);
    } catch (err) {
      if ((err as { name?: string } | null)?.name === "AbortError") return;
      consecutiveFailuresRef.current = Math.min(consecutiveFailuresRef.current + 1, 8);
    } finally {
      if (isInitialLoad) {
        setIsPanelLoading(false);
      } else {
        setIsPanelRefreshing(false);
      }
    }
  }, [applyAlerts, summary.unread_notifications]);

  useEffect(() => {
    // Cross-tab broadcast: only same-origin tabs, channel scoped per user so
    // logout/login swaps the channel and old data cannot cross. Reads must
    // be defensive — a malformed payload (e.g., from a future schema)
    // should never throw and crash the listener.
    const channel = typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(broadcastChannelName)
      : null;
    broadcastRef.current = channel;
    const alertsAbortController = new AbortController();
    const fetchInitialAlerts = (signal: AbortSignal) => {
      apiFetch<NotificationAlertRecord[]>(
        "/api/notifications/alerts/",
        { signal },
      )
        .then(nextAlerts => applyAlerts(nextAlerts ?? [], false))
        .catch(err => {
          if ((err as { name?: string } | null)?.name === "AbortError") return;
          consecutiveFailuresRef.current = Math.min(consecutiveFailuresRef.current + 1, 8);
        });
    };
    alertsAbortRef.current = alertsAbortController;

    void refreshSummary();
    fetchInitialAlerts(alertsAbortController.signal);

    if (channel) {
      channel.onmessage = (event) => {
        const msg = event.data as NotificationsBroadcast | null;
        if (!msg || typeof msg !== "object") return;
        switch (msg.type) {
          case "summary":
            setSummary(msg.summary);
            break;
          case "panel_data":
            applyAlerts(msg.alerts, false);
            setFeed(msg.feed);
            setSummary(msg.summary);
            break;
          case "mark_read":
            setFeed(prev => prev.map(item => item.id === msg.notificationId
              ? { ...item, is_read: true, read_at: item.read_at ?? new Date().toISOString() }
              : item));
            setSummary(prev => ({
              ...prev,
              unread_notifications: Math.max(0, (prev.unread_notifications ?? 0) - 1),
            }));
            break;
          case "mark_all_read":
            setFeed(prev => prev.map(item => item.is_read
              ? item
              : { ...item, is_read: true, read_at: new Date().toISOString() }));
            setSummary(prev => ({ ...prev, unread_notifications: 0 }));
            break;
          case "clear_feed":
            setFeed([]);
            setSummary(prev => ({ ...prev, unread_notifications: 0 }));
            break;
        }
      };
    }

    // Self-scheduling timeout (not setInterval) so the next tick can use a
    // longer delay when the previous tick failed. Exponential backoff:
    // 15s → 30s → 60s → 120s (clamp), reset on success via the failure
    // counter in refreshSummary / loadPanelData.
    let timeoutId: number | null = null;
    const scheduleNext = () => {
      const failures = consecutiveFailuresRef.current;
      const delay = failures === 0
        ? SUMMARY_POLL_MS
        : Math.min(SUMMARY_POLL_MS * POLL_BACKOFF_FACTOR ** failures, POLL_BACKOFF_MAX_MS);
      timeoutId = window.setTimeout(tick, delay);
    };
    const tick = () => {
      if (document.visibilityState === "visible") {
        void refreshSummary();
        const tickController = new AbortController();
        alertsAbortRef.current?.abort();
        alertsAbortRef.current = tickController;
        fetchInitialAlerts(tickController.signal);
      }
      scheduleNext();
    };
    scheduleNext();

    const handleFocus = () => {
      void refreshSummary();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshSummary();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      summaryAbortRef.current?.abort();
      alertsAbortRef.current?.abort();
      feedAbortRef.current?.abort();
      summaryAbortRef.current = null;
      alertsAbortRef.current = null;
      feedAbortRef.current = null;
      if (channel) {
        channel.onmessage = null;
        channel.close();
      }
      broadcastRef.current = null;
    };
  }, [applyAlerts, broadcastChannelName, refreshSummary]);

  const markRead = useCallback(async (notificationId: number) => {
    setFeed(prev => prev.map(item => item.id === notificationId ? { ...item, is_read: true, read_at: item.read_at ?? new Date().toISOString() } : item));
    setSummary(prev => ({
      ...prev,
      unread_notifications: Math.max(0, (prev.unread_notifications ?? 0) - 1),
    }));
    broadcastRef.current?.postMessage({ type: "mark_read", notificationId } satisfies NotificationsBroadcast);

    try {
      const updated = await apiFetch<NotificationFeedItem>(`/api/notifications/feed/${notificationId}/read/`, {
        method: "POST",
        body: "{}",
      });
      setFeed(prev => prev.map(item => item.id === updated.id ? updated : item));
      await refreshSummary();
    } catch {
      await loadPanelData();
      await refreshSummary();
    }
  }, [loadPanelData, refreshSummary]);

  const markAllRead = useCallback(async () => {
    setFeed(prev => prev.map(item => item.is_read ? item : { ...item, is_read: true, read_at: new Date().toISOString() }));
    setSummary(prev => ({ ...prev, unread_notifications: 0 }));
    broadcastRef.current?.postMessage({ type: "mark_all_read" } satisfies NotificationsBroadcast);

    try {
      await apiFetch<{ updated: number }>("/api/notifications/feed/read-all/", {
        method: "POST",
        body: "{}",
      });
      await refreshSummary();
    } catch {
      await loadPanelData();
      await refreshSummary();
    }
  }, [loadPanelData, refreshSummary]);

  const clearFeed = useCallback(async () => {
    const previousFeed = feed;
    const previousSummary = summary;
    setFeed([]);
    setSummary(prev => ({ ...prev, unread_notifications: 0 }));
    broadcastRef.current?.postMessage({ type: "clear_feed" } satisfies NotificationsBroadcast);

    try {
      await apiFetch<{ deleted: number }>("/api/notifications/feed/clear/", {
        method: "POST",
        body: "{}",
      });
      await refreshSummary();
    } catch {
      setFeed(previousFeed);
      setSummary(previousSummary);
      // Rolled back locally — also let siblings know so they re-sync.
      await loadPanelData();
      await refreshSummary();
    }
  }, [feed, loadPanelData, refreshSummary, summary]);

  const visibleAlertModuleCounts = useMemo(
    () => hasLoadedAlerts ? buildVisibleAlertModuleCounts(alerts, seenAlertKeys) : {},
    [alerts, hasLoadedAlerts, seenAlertKeys],
  );

  const getModuleCount = useCallback((module: string) => (
    hasLoadedAlerts ? visibleAlertModuleCounts[module]?.count ?? 0 : summary.modules?.[module]?.count ?? 0
  ), [hasLoadedAlerts, summary.modules, visibleAlertModuleCounts]);

  const markModuleAlertsViewed = useCallback((module: string) => {
    viewedModulesRef.current.add(module);
    setSeenAlertKeys(prev => {
      if (!hasLoadedAlerts) return prev;
      const activeSeenAlertKeys = getActiveSeenAlertKeys(prev, alerts);
      const nextSeenAlertKeys = getSeenAlertKeysAfterViewingModule(activeSeenAlertKeys, alerts, module);
      storeSeenAlertKeys(seenAlertKeysStorageKey, nextSeenAlertKeys);
      return nextSeenAlertKeys;
    });
  }, [alerts, hasLoadedAlerts, seenAlertKeysStorageKey]);

  const value = useMemo<NotificationsContextValue>(() => ({
    summary,
    alerts,
    feed,
    isSummaryLoading,
    isPanelLoading,
    isPanelRefreshing,
    refreshSummary,
    loadPanelData,
    markRead,
    markAllRead,
    clearFeed,
    getModuleCount,
    markModuleAlertsViewed,
  }), [summary, alerts, feed, isSummaryLoading, isPanelLoading, isPanelRefreshing, refreshSummary, loadPanelData, markRead, markAllRead, clearFeed, getModuleCount, markModuleAlertsViewed]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error("useNotifications must be used inside <NotificationsProvider>");
  return context;
}
