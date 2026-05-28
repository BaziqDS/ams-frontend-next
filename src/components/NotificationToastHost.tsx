"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Bell, AlertTriangle, ShieldAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications, type NotificationFeedItem } from "@/contexts/NotificationsContext";
import { notificationBus, useNotificationBusIngest } from "@/lib/notificationBus";
import type { TypedNotificationEvent } from "@/lib/notificationEvents";

// Toast lifetime. Long enough to read a one-liner, short enough to feel
// non-intrusive. The user can dismiss earlier via the × button.
const TOAST_LIFETIME_MS = 5_000;
// Maximum toasts visible at once. Bursts beyond this drop the oldest first
// so the stack stays bounded and the newest event is always the most
// prominent.
const MAX_STACKED_TOASTS = 3;

interface VisibleToast {
  /** Stable id from the originating notification — for dedup + react keys. */
  id: number;
  title: string;
  message: string;
  severity: string;
  href: string;
  /** Timer handle so we can clear it when the user dismisses early. */
  timer: ReturnType<typeof setTimeout>;
}

function severityIcon(severity: string) {
  if (severity === "critical") return ShieldAlert;
  if (severity === "warning") return AlertTriangle;
  return Bell;
}

/**
 * NotificationToastHost — light-weight in-app toast layer for new
 * notifications. Mounted once near the dashboard root, it:
 *
 *  - Subscribes to the same NotificationBus the proactive dispatcher uses,
 *    so burst-coalescing and id-dedup are already applied upstream.
 *  - Shows a brief popup (auto-dismiss after TOAST_LIFETIME_MS) with the
 *    notification title and an explicit × close button.
 *  - Skips toasts for events the current user triggered themselves
 *    (same self-action principle as the proactive agent — you know what
 *    you just did).
 *  - Skips toasts when the document is hidden so the user does not return
 *    to a stack of stale toasts; they will still see the items in the
 *    feed when they reopen the panel.
 *
 * The host renders no UI when there are no toasts — zero layout cost.
 */
export function NotificationToastHost() {
  const { user } = useAuth();
  const { feed, markRead } = useNotifications();
  // Ensure the bus is primed from the live feed. Safe to call alongside the
  // CopilotSidePanel host — primeFromInitialFeed is idempotent and
  // .ingest() dedups by event id, so the bus never emits the same event
  // twice even with two ingesters.
  useNotificationBusIngest(feed);

  const [toasts, setToasts] = useState<VisibleToast[]>([]);
  // Ref-mirrored copy of the latest user id so the bus subscription closure
  // always reads the current value without needing to re-subscribe whenever
  // auth state changes.
  const currentUserIdRef = useRef<number | null>(null);
  useEffect(() => {
    currentUserIdRef.current = typeof user?.id === "number" ? user.id : null;
  }, [user?.id]);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => {
      const remaining: VisibleToast[] = [];
      for (const toast of prev) {
        if (toast.id === id) {
          clearTimeout(toast.timer);
        } else {
          remaining.push(toast);
        }
      }
      return remaining;
    });
  }, []);

  const present = useCallback((event: TypedNotificationEvent) => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      // Tab is in the background — pushing a toast would just stack stale
      // popups for when they return. The feed remains authoritative.
      return;
    }
    const actorId = event.raw.actor_id;
    const currentUserId = currentUserIdRef.current;
    if (currentUserId !== null && actorId !== null && actorId === currentUserId) {
      // Self-action: do not surface a toast for an event you triggered.
      return;
    }

    const id = event.raw.id;
    const timer = setTimeout(() => dismiss(id), TOAST_LIFETIME_MS);

    setToasts(prev => {
      if (prev.some(toast => toast.id === id)) {
        // Already showing this exact event (e.g., bus replay) — skip.
        clearTimeout(timer);
        return prev;
      }
      const next: VisibleToast = {
        id,
        title: event.raw.title,
        message: event.raw.message,
        severity: event.raw.severity,
        href: event.raw.href,
        timer,
      };
      // Cap stack length, drop oldest first. Clear its timer so it doesn't
      // try to dismiss an id that's no longer present.
      const stacked = [...prev, next];
      while (stacked.length > MAX_STACKED_TOASTS) {
        const removed = stacked.shift();
        if (removed) clearTimeout(removed.timer);
      }
      return stacked;
    });
  }, [dismiss]);

  useEffect(() => {
    const unsubscribe = notificationBus.subscribe(present);
    return unsubscribe;
  }, [present]);

  // Clear all timers on unmount so stale callbacks don't fire after the
  // component is gone (HMR, layout change, etc.).
  useEffect(() => () => {
    setToasts(prev => {
      for (const toast of prev) clearTimeout(toast.timer);
      return prev;
    });
  }, []);

  const handleClick = (toast: VisibleToast) => {
    if (!toast.href) return;
    // Mark read so the badge count drops and the row in the feed loses its
    // unread dot. Navigation itself is handled by the anchor wrapping the
    // body so the user can also middle-click / open-in-new-tab.
    void markRead(toast.id);
  };

  if (toasts.length === 0) return null;

  return (
    <div className="ams-toast-host" role="region" aria-label="Recent notifications" aria-live="polite">
      {toasts.map(toast => {
        const Icon = severityIcon(toast.severity);
        const body = (
          <div className="ams-toast-body" onClick={() => handleClick(toast)}>
            <span className={`ams-toast-icon ams-toast-icon--${toast.severity}`} aria-hidden="true">
              <Icon size={14} strokeWidth={2.1} />
            </span>
            <span className="ams-toast-text">
              <span className="ams-toast-title">{toast.title}</span>
              {toast.message ? <span className="ams-toast-message">{toast.message}</span> : null}
            </span>
          </div>
        );
        return (
          <div key={toast.id} className={`ams-toast ams-toast--${toast.severity}`}>
            {toast.href ? (
              <a href={toast.href} className="ams-toast-link">{body}</a>
            ) : body}
            <button
              type="button"
              className="ams-toast-close"
              aria-label="Dismiss notification"
              onClick={() => dismiss(toast.id)}
            >
              <X size={13} strokeWidth={2.2} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
