"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Topbar } from "@/components/Topbar";
import { useNotifications, type NotificationAlertRecord, type NotificationFeedItem } from "@/contexts/NotificationsContext";

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

function NotificationAlertRow({ alert }: { alert: NotificationAlertRecord }) {
  return (
    <Link href={alert.href || "#"} className="tb-notify-row">
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

function NotificationFeedRow({ item, onOpen }: { item: NotificationFeedItem; onOpen: (item: NotificationFeedItem) => void }) {
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
      <Link href={item.href} className={"tb-notify-row" + (item.is_read ? " is-read" : "")} onClick={() => onOpen(item)}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" className={"tb-notify-row" + (item.is_read ? " is-read" : "")} onClick={() => onOpen(item)}>
      {content}
    </button>
  );
}

export default function NotificationsPage() {
  const { summary, alerts, feed, isPanelLoading, isPanelRefreshing, loadPanelData, refreshSummary, markRead, markAllRead, clearFeed } = useNotifications();

  useEffect(() => {
    void loadPanelData();
    void refreshSummary();
  }, [loadPanelData, refreshSummary]);

  const criticalAlertCount = Object.values(summary.modules ?? {}).reduce((total, moduleSummary) => total + (moduleSummary.critical ?? 0), 0);

  const handleRefresh = () => {
    void loadPanelData();
    void refreshSummary();
  };

  const handleOpenNotification = (item: NotificationFeedItem) => {
    if (!item.is_read) {
      void markRead(item.id);
    }
  };

  return (
    <div>
      <Topbar breadcrumb={["Operations", "Notifications"]} />
      <div className="page">
        <div className="page-head">
          <div className="page-title-group">
            <div className="eyebrow">Workspace activity</div>
            <h1>Notifications & alerts</h1>
            <div className="page-sub">Review operational alerts and recent updates across the modules currently visible to your role.</div>
          </div>
        </div>

        <div className="detail-stat-strip notifications-summary-strip">
          <div className="detail-stat">
            <div className="detail-stat-label">Needs action</div>
            <div className="detail-stat-value">{summary.open_alerts}</div>
            <div className="detail-stat-sub">Active system alerts</div>
          </div>
          <div className="detail-stat">
            <div className="detail-stat-label">Unread updates</div>
            <div className="detail-stat-value">{summary.unread_notifications}</div>
            <div className="detail-stat-sub">Feed items not opened yet</div>
          </div>
          <div className="detail-stat">
            <div className="detail-stat-label">Critical alerts</div>
            <div className="detail-stat-value">{criticalAlertCount}</div>
            <div className="detail-stat-sub">Highest-priority items awaiting review</div>
          </div>
        </div>

        <div className="notifications-page-stack">
          <section className="table-card">
            <div className="table-card-head notifications-section-head">
              <div className="table-card-head-left">
                <div>
                  <div className="eyebrow">Alerts</div>
                  <div className="notifications-section-title">Needs action</div>
                  <div className="notifications-section-sub">Curated alerts that still require operational attention.</div>
                </div>
              </div>
              <button type="button" className="btn btn-xs btn-ghost" onClick={handleRefresh} disabled={isPanelLoading || isPanelRefreshing}>
                {isPanelRefreshing ? "Refreshing…" : "Refresh"}
              </button>
            </div>
            <div className="notifications-section-body">
              {isPanelLoading ? (
                <div className="tb-notify-empty">Loading alerts…</div>
              ) : alerts.length > 0 ? (
                <div className="tb-notify-list">
                  {alerts.map(alert => (
                    <NotificationAlertRow key={alert.key} alert={alert} />
                  ))}
                </div>
              ) : (
                <div className="tb-notify-empty">No alerts need action right now.</div>
              )}
            </div>
          </section>

          <section className="table-card">
            <div className="table-card-head notifications-section-head">
              <div className="table-card-head-left">
                <div>
                  <div className="eyebrow">Updates</div>
                  <div className="notifications-section-title">Notification feed</div>
                  <div className="notifications-section-sub">Recent updates from inspections, stock entries, depreciation, items, and other modules.</div>
                </div>
              </div>
              <div className="notifications-section-actions">
                <button type="button" className="btn btn-xs btn-ghost" onClick={() => void markAllRead()} disabled={summary.unread_notifications === 0}>
                  Mark all read
                </button>
                <button type="button" className="btn btn-xs btn-ghost" onClick={() => void clearFeed()} disabled={feed.length === 0}>
                  Clear updates
                </button>
              </div>
            </div>
            <div className="notifications-section-body">
              {isPanelLoading ? (
                <div className="tb-notify-empty">Loading notifications…</div>
              ) : feed.length > 0 ? (
                <div className="tb-notify-list">
                  {feed.map(item => (
                    <NotificationFeedRow key={item.id} item={item} onOpen={handleOpenNotification} />
                  ))}
                </div>
              ) : (
                <div className="tb-notify-empty">No notification updates are stored right now.</div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
