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
const SEEN_ALERT_KEYS_STORAGE_KEY_PREFIX = "ams.sidebar.seen-alert-keys.v1";

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
    try {
      const data = await apiFetch<NotificationSummary>("/api/notifications/summary/");
      setSummary({
        unread_notifications: data.unread_notifications ?? 0,
        open_alerts: data.open_alerts ?? 0,
        modules: data.modules ?? {},
      });
    } catch {
      // Keep the last known summary instead of dropping the badge during transient polling errors.
    } finally {
      setIsSummaryLoading(false);
    }
  }, []);

  const loadPanelData = useCallback(async () => {
    const isInitialLoad = !hasLoadedPanelDataRef.current;

    if (isInitialLoad) {
      setIsPanelLoading(true);
    } else {
      setIsPanelRefreshing(true);
    }

    try {
      const [alertsData, feedData] = await Promise.all([
        apiFetch<NotificationAlertRecord[]>("/api/notifications/alerts/"),
        apiFetch<Page<NotificationFeedItem> | NotificationFeedItem[]>("/api/notifications/feed/?page_size=200"),
      ]);
      const nextAlerts = alertsData ?? [];
      applyAlerts(nextAlerts, true);
      setFeed(normalizeList(feedData));
      setSummary(prev => buildSummaryFromAlerts(nextAlerts, prev.unread_notifications ?? 0));
      setIsSummaryLoading(false);
      hasLoadedPanelDataRef.current = true;
    } catch {
      // Keep the last loaded panel state during transient polling errors.
    } finally {
      if (isInitialLoad) {
        setIsPanelLoading(false);
      } else {
        setIsPanelRefreshing(false);
      }
    }
  }, [applyAlerts]);

  useEffect(() => {
    void refreshSummary();
    apiFetch<NotificationAlertRecord[]>("/api/notifications/alerts/")
      .then(nextAlerts => applyAlerts(nextAlerts ?? [], false))
      .catch(() => {
        // The server summary remains available if the richer alert list cannot load yet.
      });

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshSummary();
        apiFetch<NotificationAlertRecord[]>("/api/notifications/alerts/")
          .then(nextAlerts => applyAlerts(nextAlerts ?? [], false))
          .catch(() => {
            // Keep the last alert list during transient polling errors.
          });
      }
    }, SUMMARY_POLL_MS);

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
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [applyAlerts, refreshSummary]);

  const markRead = useCallback(async (notificationId: number) => {
    setFeed(prev => prev.map(item => item.id === notificationId ? { ...item, is_read: true, read_at: item.read_at ?? new Date().toISOString() } : item));
    setSummary(prev => ({
      ...prev,
      unread_notifications: Math.max(0, (prev.unread_notifications ?? 0) - 1),
    }));

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

    try {
      await apiFetch<{ deleted: number }>("/api/notifications/feed/clear/", {
        method: "POST",
        body: "{}",
      });
      await refreshSummary();
    } catch {
      setFeed(previousFeed);
      setSummary(previousSummary);
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
