"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
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
  refreshSummary: () => Promise<void>;
  loadPanelData: () => Promise<void>;
  markRead: (notificationId: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  getModuleCount: (module: string) => number;
}

const EMPTY_SUMMARY: NotificationSummary = {
  unread_notifications: 0,
  open_alerts: 0,
  modules: {},
};

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

function normalizeList<T>(data: Page<T> | T[]) {
  return Array.isArray(data) ? data : data.results;
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const [summary, setSummary] = useState<NotificationSummary>(EMPTY_SUMMARY);
  const [alerts, setAlerts] = useState<NotificationAlertRecord[]>([]);
  const [feed, setFeed] = useState<NotificationFeedItem[]>([]);
  const [isSummaryLoading, setIsSummaryLoading] = useState(true);
  const [isPanelLoading, setIsPanelLoading] = useState(false);

  const refreshSummary = useCallback(async () => {
    try {
      const data = await apiFetch<NotificationSummary>("/api/notifications/summary/");
      setSummary({
        unread_notifications: data.unread_notifications ?? 0,
        open_alerts: data.open_alerts ?? 0,
        modules: data.modules ?? {},
      });
    } catch {
      setSummary(EMPTY_SUMMARY);
    } finally {
      setIsSummaryLoading(false);
    }
  }, []);

  const loadPanelData = useCallback(async () => {
    setIsPanelLoading(true);
    try {
      const [alertsData, feedData] = await Promise.all([
        apiFetch<NotificationAlertRecord[]>("/api/notifications/alerts/"),
        apiFetch<Page<NotificationFeedItem> | NotificationFeedItem[]>("/api/notifications/feed/?page_size=50"),
      ]);
      setAlerts(alertsData ?? []);
      setFeed(normalizeList(feedData));
    } catch {
      setAlerts([]);
      setFeed([]);
    } finally {
      setIsPanelLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSummary();

    const intervalId = window.setInterval(() => {
      void refreshSummary();
    }, 60_000);

    const handleFocus = () => {
      void refreshSummary();
    };

    window.addEventListener("focus", handleFocus);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
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

  const getModuleCount = useCallback((module: string) => summary.modules?.[module]?.count ?? 0, [summary.modules]);

  const value = useMemo<NotificationsContextValue>(() => ({
    summary,
    alerts,
    feed,
    isSummaryLoading,
    isPanelLoading,
    refreshSummary,
    loadPanelData,
    markRead,
    markAllRead,
    getModuleCount,
  }), [summary, alerts, feed, isSummaryLoading, isPanelLoading, refreshSummary, loadPanelData, markRead, markAllRead, getModuleCount]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) throw new Error("useNotifications must be used inside <NotificationsProvider>");
  return context;
}
