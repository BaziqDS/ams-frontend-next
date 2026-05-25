"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { BellIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications, type NotificationAlertRecord, type NotificationFeedItem } from "@/contexts/NotificationsContext";
import {
  buildNotificationAlertDisplay,
  buildNotificationFeedDisplay,
  getNotificationInitials,
  notificationToneClass,
} from "@/lib/notificationDisplay";

interface TopbarProps {
  breadcrumb: string[];
}

type NotificationPanelTab = "inbox" | "unread";

function NotificationAvatar({
  label,
  severity,
  unread,
}: {
  label: string | null | undefined;
  severity: string;
  unread?: boolean;
}) {
  return (
    <span className={`tb-notify-avatar ${notificationToneClass(severity)}${unread ? " is-unread" : ""}`} aria-hidden="true">
      {getNotificationInitials(label, severity === "critical" ? "!" : "AM")}
    </span>
  );
}

function DismissButton({ label, onDismiss }: { label: string; onDismiss: () => void }) {
  return (
    <Button variant="ghost" size="icon-xs" className="tb-notify-dismiss" onClick={onDismiss} aria-label={label} title={label}>
      <XIcon aria-hidden="true" />
    </Button>
  );
}

function NotificationAlertRow({
  alert,
  onNavigate,
  onDismiss,
}: {
  alert: NotificationAlertRecord;
  onNavigate: () => void;
  onDismiss: () => void;
}) {
  const display = buildNotificationAlertDisplay(alert);

  return (
    <div className={`tb-notify-row has-dismiss is-alert ${notificationToneClass(alert.severity)}`}>
      <NotificationAvatar label={display.avatarLabel} severity={alert.severity} unread />
      <Link href={alert.href || "/notifications"} className="tb-notify-main" onClick={onNavigate}>
        <span className="tb-notify-copy">
          <span className="tb-notify-line">
            <strong>{display.headline}</strong>
          </span>
          <span className="tb-notify-preview">{display.preview}</span>
          <span className="tb-notify-meta">
            {display.metaParts.map((part, index) => (
              <span key={`${part}-${index}`}>
                {index > 0 ? <span aria-hidden="true"> - </span> : null}
                {part}
              </span>
            ))}
          </span>
        </span>
      </Link>
      <DismissButton label={`Dismiss ${alert.title}`} onDismiss={onDismiss} />
    </div>
  );
}

function NotificationFeedRow({
  item,
  onNavigate,
  onDismiss,
}: {
  item: NotificationFeedItem;
  onNavigate: (item: NotificationFeedItem) => void;
  onDismiss: (item: NotificationFeedItem) => void;
}) {
  const display = buildNotificationFeedDisplay(item);
  const rowClassName = `tb-notify-row has-dismiss ${notificationToneClass(item.severity)}${item.is_read ? " is-read" : ""}`;
  const content = (
    <span className="tb-notify-copy">
      <span className="tb-notify-line">
        <strong>{display.headline}</strong>
        {!item.is_read ? <span className="tb-notify-unread-dot" aria-hidden="true" /> : null}
      </span>
      {display.preview ? <span className="tb-notify-preview">{display.preview}</span> : null}
      <span className="tb-notify-meta">
        {display.metaParts.map((part, index) => (
          <span key={`${part}-${index}`}>
            {index > 0 ? <span aria-hidden="true"> - </span> : null}
            {part}
          </span>
        ))}
      </span>
    </span>
  );

  if (item.href) {
    return (
      <div className={rowClassName}>
        <NotificationAvatar label={display.avatarLabel} severity={item.severity} unread={!item.is_read} />
        <Link href={item.href} className="tb-notify-main" onClick={() => onNavigate(item)}>
          {content}
        </Link>
        <DismissButton label={`Dismiss ${item.title}`} onDismiss={() => onDismiss(item)} />
      </div>
    );
  }

  return (
    <div className={rowClassName}>
      <NotificationAvatar label={display.avatarLabel} severity={item.severity} unread={!item.is_read} />
      <button type="button" className="tb-notify-main" onClick={() => onNavigate(item)}>
        {content}
      </button>
      <DismissButton label={`Dismiss ${item.title}`} onDismiss={() => onDismiss(item)} />
    </div>
  );
}

const PANEL_POLL_MS = 15_000;

export function Topbar({ breadcrumb }: TopbarProps) {
  const { user } = useAuth();
  const { summary, alerts, feed, isPanelLoading, loadPanelData, markRead, markAllRead } = useNotifications();
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<NotificationPanelTab>("inbox");
  const [dismissedPanelAlertKeys, setDismissedPanelAlertKeys] = useState<Set<string>>(new Set());
  const [dismissedPanelFeedIds, setDismissedPanelFeedIds] = useState<Set<number>>(new Set());
  const panelRef = useRef<HTMLDivElement | null>(null);

  const { initials, displayName, displayRole } = useMemo(() => {
    const rawName = [user?.first_name, user?.last_name].filter(Boolean).join(" ").trim();
    const name = rawName || user?.username || "Unknown User";
    const computedInitials = name
      .split(/\s+/)
      .filter(Boolean)
      .map(part => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "UU";

    const role = user?.is_superuser
      ? "Superuser"
      : user?.groups_display?.[0]
        ? user.groups_display[0]
        : user?.is_staff
          ? "Staff"
          : "Authenticated User";

    return {
      initials: computedInitials,
      displayName: name,
      displayRole: role,
    };
  }, [user]);

  const attentionCount = (summary.unread_notifications ?? 0) + (summary.open_alerts ?? 0);
  const bellBadge = attentionCount > 99 ? "99+" : String(attentionCount);
  const panelAlerts = useMemo(
    () => alerts.filter(alert => !dismissedPanelAlertKeys.has(alert.key)),
    [alerts, dismissedPanelAlertKeys],
  );
  const panelFeed = useMemo(
    () => feed.filter(item => !dismissedPanelFeedIds.has(item.id)),
    [feed, dismissedPanelFeedIds],
  );
  const unreadPanelFeed = useMemo(
    () => panelFeed.filter(item => !item.is_read),
    [panelFeed],
  );
  const inboxCount = panelAlerts.length + panelFeed.length;
  const unreadCount = panelAlerts.length + unreadPanelFeed.length;

  useEffect(() => {
    if (!panelOpen) return;

    const intervalId = window.setInterval(() => {
      void loadPanelData();
    }, PANEL_POLL_MS);

    return () => window.clearInterval(intervalId);
  }, [loadPanelData, panelOpen]);

  useEffect(() => {
    if (!panelOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setPanelOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPanelOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [panelOpen]);

  const handleTogglePanel = () => {
    const nextPanelOpen = !panelOpen;
    setPanelOpen(nextPanelOpen);

    if (!nextPanelOpen) return;

    setActiveTab("inbox");
    void loadPanelData();
  };

  const handleFeedNavigate = (item: NotificationFeedItem) => {
    if (!item.is_read) {
      void markRead(item.id);
    }
    setPanelOpen(false);
  };

  const handleDismissFeedItem = (item: NotificationFeedItem) => {
    setDismissedPanelFeedIds(prev => new Set(prev).add(item.id));
    if (!item.is_read) {
      void markRead(item.id);
    }
  };

  const handleTabChange = (value: string) => {
    if (value === "inbox" || value === "unread") {
      setActiveTab(value);
    }
  };

  return (
    <div className="topbar">
      <div className="topbar-inner">
        <div className="tb-breadcrumb">
          {breadcrumb.map((crumb, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {i > 0 && <span className="tb-sep">&gt;</span>}
              <span className={"tb-crumb" + (i === breadcrumb.length - 1 ? " current" : "")}>{crumb}</span>
            </span>
          ))}
        </div>

        <div className="tb-actions">
          <div className="tb-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
            </svg>
            <input placeholder="Search anything... Ctrl+K" />
          </div>

          <div className="tb-divider" />

          <div className="tb-notify" ref={panelRef}>
            <Button variant="ghost" size="icon" className="tb-notify-trigger" title="Notifications and alerts" onClick={handleTogglePanel} aria-expanded={panelOpen} aria-haspopup="dialog">
              <BellIcon aria-hidden="true" />
              {attentionCount > 0 ? <span className="tb-notify-badge">{bellBadge}</span> : null}
            </Button>

            {panelOpen ? (
              <div className="tb-notify-panel" role="dialog" aria-label="Notifications and alerts">
                <div className="tb-notify-panel-head">
                  <div className="tb-notify-panel-title">Notifications</div>
                  <button type="button" className="tb-notify-header-action" onClick={() => void markAllRead()} disabled={summary.unread_notifications === 0}>
                    Mark all as read
                  </button>
                </div>

                <Tabs value={activeTab} onValueChange={handleTabChange} className="tb-notify-tabs-root">
                  <TabsList className="tb-notify-tabs" aria-label="Notifications panel tabs">
                    <TabsTrigger value="inbox" className="tb-notify-tab">
                      Inbox
                      {inboxCount > 0 ? <span className="tb-tab-count">{inboxCount > 99 ? "99+" : inboxCount}</span> : null}
                    </TabsTrigger>
                    <TabsTrigger value="unread" className="tb-notify-tab">
                      Unread
                      {unreadCount > 0 ? <span className="tb-tab-count">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
                    </TabsTrigger>
                  </TabsList>

                  <div className="tb-notify-panel-body">
                    {isPanelLoading ? (
                      <div className="tb-notify-empty">Loading workspace activity...</div>
                    ) : (
                      <>
                        <TabsContent value="inbox" className="tb-notify-tab-content">
                          {inboxCount > 0 ? (
                            <div className="tb-notify-list">
                              {panelAlerts.map(alert => (
                                <NotificationAlertRow
                                  key={alert.key}
                                  alert={alert}
                                  onNavigate={() => setPanelOpen(false)}
                                  onDismiss={() => setDismissedPanelAlertKeys(prev => new Set(prev).add(alert.key))}
                                />
                              ))}
                              {panelFeed.map(item => (
                                <NotificationFeedRow
                                  key={item.id}
                                  item={item}
                                  onNavigate={handleFeedNavigate}
                                  onDismiss={handleDismissFeedItem}
                                />
                              ))}
                            </div>
                          ) : (
                            <div className="tb-notify-empty">No notifications yet.</div>
                          )}
                        </TabsContent>

                        <TabsContent value="unread" className="tb-notify-tab-content">
                          {unreadCount > 0 ? (
                            <div className="tb-notify-list">
                              {panelAlerts.map(alert => (
                                <NotificationAlertRow
                                  key={alert.key}
                                  alert={alert}
                                  onNavigate={() => setPanelOpen(false)}
                                  onDismiss={() => setDismissedPanelAlertKeys(prev => new Set(prev).add(alert.key))}
                                />
                              ))}
                              {unreadPanelFeed.map(item => (
                                <NotificationFeedRow
                                  key={item.id}
                                  item={item}
                                  onNavigate={handleFeedNavigate}
                                  onDismiss={handleDismissFeedItem}
                                />
                              ))}
                            </div>
                          ) : (
                            <div className="tb-notify-empty">No unread notifications.</div>
                          )}
                        </TabsContent>
                      </>
                    )}
                  </div>
                </Tabs>
                <div className="tb-notify-panel-foot">
                  <Link href="/notifications" className="tb-notify-footer-link" onClick={() => setPanelOpen(false)}>
                    View all notifications
                  </Link>
                </div>
              </div>
            ) : null}
          </div>

          <div className="tb-divider" />

          <div className="tb-user">
            <div className="tb-avatar">{initials}</div>
            <div className="tb-user-text">
              <div className="tb-user-name">{displayName}</div>
              <div className="tb-user-role">{displayRole}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
