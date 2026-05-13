"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications, type NotificationAlertRecord, type NotificationFeedItem } from "@/contexts/NotificationsContext";

interface TopbarProps {
  breadcrumb: string[];
}

function formatRelativeTime(value: string) {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

function formatModuleLabel(module: string) {
  return module.replace(/[_-]+/g, " ").replace(/\b\w/g, char => char.toUpperCase());
}

function alertToneClass(severity: string) {
  if (severity === "critical") return "is-critical";
  if (severity === "warning") return "is-warning";
  return "is-info";
}

function NotificationAlertRow({ alert, onNavigate }: { alert: NotificationAlertRecord; onNavigate: () => void }) {
  return (
    <Link href={alert.href || "#"} className="tb-notify-row" onClick={onNavigate}>
      <span className={`tb-notify-indicator ${alertToneClass(alert.severity)}`} />
      <span className="tb-notify-copy">
        <span className="tb-notify-topline">
          <span className="tb-notify-title">{alert.title}</span>
          <span className={`tb-notify-chip ${alertToneClass(alert.severity)}`}>{formatModuleLabel(alert.module)}</span>
        </span>
        <span className="tb-notify-text">{alert.message}</span>
      </span>
      <span className="tb-notify-count mono">{alert.count > 99 ? "99+" : alert.count}</span>
    </Link>
  );
}

function NotificationFeedRow({ item, onNavigate }: { item: NotificationFeedItem; onNavigate: (item: NotificationFeedItem) => void }) {
  const content = (
    <>
      <span className={`tb-notify-indicator ${alertToneClass(item.severity)}`} />
      <span className="tb-notify-copy">
        <span className="tb-notify-topline">
          <span className="tb-notify-title">{item.title}</span>
          {!item.is_read ? <span className="tb-notify-unread-dot" aria-hidden="true" /> : null}
        </span>
        <span className="tb-notify-text">{item.message}</span>
        <span className="tb-notify-meta">
          <span>{formatModuleLabel(item.module)}</span>
          {item.actor_name ? <><span>•</span><span>{item.actor_name}</span></> : null}
          <span>•</span>
          <span>{formatRelativeTime(item.created_at)}</span>
        </span>
      </span>
    </>
  );

  if (item.href) {
    return (
      <Link href={item.href} className={"tb-notify-row" + (item.is_read ? " is-read" : "")} onClick={() => onNavigate(item)}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" className={"tb-notify-row" + (item.is_read ? " is-read" : "")} onClick={() => onNavigate(item)}>
      {content}
    </button>
  );
}

const PANEL_POLL_MS = 15_000;

export function Topbar({ breadcrumb }: TopbarProps) {
  const { user } = useAuth();
  const { summary, alerts, feed, isPanelLoading, loadPanelData, markRead, markAllRead, clearFeed } = useNotifications();
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"alerts" | "feed">("alerts");
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

    setActiveTab((summary.open_alerts ?? 0) > 0 ? "alerts" : "feed");
    void loadPanelData();
  };

  const handleFeedNavigate = (item: NotificationFeedItem) => {
    if (!item.is_read) {
      void markRead(item.id);
    }
    setPanelOpen(false);
  };

  return (
    <div className="topbar">
      <div className="topbar-inner">
        <div className="tb-breadcrumb">
          {breadcrumb.map((crumb, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {i > 0 && <span className="tb-sep">›</span>}
              <span className={"tb-crumb" + (i === breadcrumb.length - 1 ? " current" : "")}>{crumb}</span>
            </span>
          ))}
        </div>

        <div className="tb-actions">
          <div className="tb-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>
            </svg>
            <input placeholder="Search anything… ⌘K" />
          </div>

          <div className="tb-divider" />

          <div className="tb-notify" ref={panelRef}>
            <button className="btn btn-ghost btn-icon tb-notify-trigger" title="Notifications and alerts" type="button" onClick={handleTogglePanel} aria-expanded={panelOpen} aria-haspopup="dialog">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
              </svg>
              {attentionCount > 0 ? <span className="tb-notify-badge">{bellBadge}</span> : null}
            </button>

            {panelOpen ? (
              <div className="tb-notify-panel" role="dialog" aria-label="Notifications and alerts">
                <div className="tb-notify-panel-head">
                  <div>
                    <div className="eyebrow">Workspace activity</div>
                    <div className="tb-notify-panel-title">Notifications & alerts</div>
                    <div className="tb-notify-panel-sub">{summary.open_alerts} needs action • {summary.unread_notifications} unread updates</div>
                  </div>
                  <button type="button" className="btn btn-xs btn-ghost" onClick={() => setPanelOpen(false)}>
                    Close
                  </button>
                </div>

                <div className="tb-notify-tabs" role="tablist" aria-label="Notifications panel tabs">
                  <button type="button" className={"tb-notify-tab" + (activeTab === "alerts" ? " active" : "")} onClick={() => setActiveTab("alerts")} role="tab" aria-selected={activeTab === "alerts"}>
                    Needs action
                    {summary.open_alerts > 0 ? <span className="tb-tab-count">{summary.open_alerts > 99 ? "99+" : summary.open_alerts}</span> : null}
                  </button>
                  <button type="button" className={"tb-notify-tab" + (activeTab === "feed" ? " active" : "")} onClick={() => setActiveTab("feed")} role="tab" aria-selected={activeTab === "feed"}>
                    Updates
                    {summary.unread_notifications > 0 ? <span className="tb-tab-count">{summary.unread_notifications > 99 ? "99+" : summary.unread_notifications}</span> : null}
                  </button>
                </div>

                <div className="tb-notify-panel-body">
                  {isPanelLoading ? (
                    <div className="tb-notify-empty">Loading workspace activity…</div>
                  ) : activeTab === "alerts" ? (
                    alerts.length > 0 ? (
                      <div className="tb-notify-list">
                        {alerts.map(alert => (
                          <NotificationAlertRow key={alert.key} alert={alert} onNavigate={() => setPanelOpen(false)} />
                        ))}
                      </div>
                    ) : (
                      <div className="tb-notify-empty">No alerts need action right now.</div>
                    )
                  ) : (
                    <>
                      <div className="tb-notify-feed-head">
                        <div className="tb-notify-feed-copy">Recent updates for the modules in your current scope.</div>
                        <div className="tb-notify-feed-actions">
                          <button type="button" className="btn btn-xs btn-ghost" onClick={() => void markAllRead()} disabled={summary.unread_notifications === 0}>
                            Mark all read
                          </button>
                          <button type="button" className="btn btn-xs btn-ghost" onClick={() => void clearFeed()} disabled={feed.length === 0}>
                            Clear updates
                          </button>
                        </div>
                      </div>
                      {feed.length > 0 ? (
                        <div className="tb-notify-list">
                          {feed.map(item => (
                            <NotificationFeedRow key={item.id} item={item} onNavigate={handleFeedNavigate} />
                          ))}
                        </div>
                      ) : (
                        <div className="tb-notify-empty">No notification updates yet.</div>
                      )}
                    </>
                  )}
                </div>
                <div className="tb-notify-panel-foot">
                  <Link href="/notifications" className="btn btn-xs btn-ghost" onClick={() => setPanelOpen(false)}>
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
