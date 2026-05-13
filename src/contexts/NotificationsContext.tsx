"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { apiFetch, type Page } from "@/lib/api";

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
}

const EMPTY_SUMMARY: NotificationSummary = {
  unread_notifications: 0,
  open_alerts: 0,
  modules: {},
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);
const SUMMARY_POLL_MS = 15_000;

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

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [summary, setSummary] = useState<NotificationSummary>(EMPTY_SUMMARY);
  const [alerts, setAlerts] = useState<NotificationAlertRecord[]>([]);
  const [feed, setFeed] = useState<NotificationFeedItem[]>([]);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);
  const [isPanelLoading, setIsPanelLoading] = useState(false);
  const [isPanelRefreshing, setIsPanelRefreshing] = useState(false);
  const hasLoadedPanelDataRef = useRef(false);

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
      setAlerts(nextAlerts);
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
  }, []);

  useEffect(() => {
    void refreshSummary();

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshSummary();
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
  }, [refreshSummary]);

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

  const getModuleCount = useCallback((module: string) => summary.modules?.[module]?.count ?? 0, [summary.modules]);

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
  }), [summary, alerts, feed, isSummaryLoading, isPanelLoading, isPanelRefreshing, refreshSummary, loadPanelData, markRead, markAllRead, clearFeed, getModuleCount]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error("useNotifications must be used inside <NotificationsProvider>");
  return context;
}
