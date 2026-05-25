"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import {
  AlertTriangle,
  Bell,
  ClipboardList,
  type LucideIcon,
  ShieldAlert,
} from "lucide-react";
import { Topbar } from "@/components/Topbar";
import { useNotifications, type NotificationAlertRecord, type NotificationFeedItem } from "@/contexts/NotificationsContext";
import {
  buildNotificationAlertDisplay,
  buildNotificationFeedDisplay,
  formatNotificationModuleLabel,
  getNotificationInitials,
  notificationToneClass,
} from "@/lib/notificationDisplay";
import { Button } from "@/components/ui/button";


type StatCardProps = {
  title: string;
  value: number | string;
  hint: string;
  badge?: { label: string; tone: "neutral" | "warning" | "critical" | "ok" };
  icon: LucideIcon;
  iconTone: "neutral" | "warning" | "critical" | "ok";
};

function StatCard({ title, value, hint, badge, icon: Icon, iconTone }: StatCardProps) {
  return (
    <div className="notif-stat" data-tone={iconTone}>
      <div className="notif-stat-body">
        <div className="notif-stat-title">{title}</div>
        <div className="notif-stat-value">{value}</div>
        <div className="notif-stat-meta">
          <span className="notif-stat-hint">{hint}</span>
          {badge ? (
            <span className={`notif-stat-badge is-${badge.tone}`}>{badge.label}</span>
          ) : null}
        </div>
      </div>
      <div className="notif-stat-icon" aria-hidden="true">
        <Icon size={16} strokeWidth={2} />
      </div>
    </div>
  );
}

function NotificationAvatar({ label, severity, unread }: { label: string; severity: string; unread?: boolean }) {
  return (
    <span className={`tb-notify-avatar ${notificationToneClass(severity)}${unread ? " is-unread" : ""}`} aria-hidden="true">
      {getNotificationInitials(label, severity === "critical" ? "!" : "AM")}
    </span>
  );
}

function NotificationMeta({ parts }: { parts: string[] }) {
  return (
    <span className="tb-notify-meta">
      {parts.map((part, index) => (
        <span key={`${part}-${index}`}>
          {index > 0 ? <span aria-hidden="true"> - </span> : null}
          {part}
        </span>
      ))}
    </span>
  );
}

function NotificationAlertRow({ alert }: { alert: NotificationAlertRecord }) {
  const display = buildNotificationAlertDisplay(alert);

  return (
    <Link href={alert.href || "#"} className={`tb-notify-row ${notificationToneClass(alert.severity)}`}>
      <NotificationAvatar label={display.avatarLabel} severity={alert.severity} unread />
      <span className="tb-notify-copy">
        <span className="tb-notify-line">
          <strong>{display.headline}</strong>
        </span>
        <span className="tb-notify-preview">{display.preview}</span>
        <NotificationMeta parts={display.metaParts} />
      </span>
    </Link>
  );
}

function NotificationFeedRow({ item, onOpen }: { item: NotificationFeedItem; onOpen: (item: NotificationFeedItem) => void }) {
  const display = buildNotificationFeedDisplay(item);
  const content = (
    <>
      <NotificationAvatar label={display.avatarLabel} severity={item.severity} unread={!item.is_read} />
      <span className="tb-notify-copy">
        <span className="tb-notify-line">
          <strong>{display.headline}</strong>
          {!item.is_read ? <span className="tb-notify-unread-dot" aria-hidden="true" /> : null}
        </span>
        {display.preview ? <span className="tb-notify-preview">{display.preview}</span> : null}
        <NotificationMeta parts={display.metaParts} />
      </span>
    </>
  );

  if (item.href) {
    return (
      <Link href={item.href} className={`tb-notify-row ${notificationToneClass(item.severity)}${item.is_read ? " is-read" : ""}`} onClick={() => onOpen(item)}>
        {content}
      </Link>
    );
  }

  return (
    <button type="button" className={`tb-notify-row ${notificationToneClass(item.severity)}${item.is_read ? " is-read" : ""}`} onClick={() => onOpen(item)}>
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
  const topModule = useMemo(() => {
    const entries = Object.entries(summary.modules ?? {});
    if (entries.length === 0) return null;
    const sorted = [...entries].sort((a, b) => (b[1]?.count ?? 0) - (a[1]?.count ?? 0));
    const [moduleKey, moduleSummary] = sorted[0];
    if (!moduleSummary || (moduleSummary.count ?? 0) === 0) return null;
    return {
      key: moduleKey,
      label: formatNotificationModuleLabel(moduleKey),
      count: moduleSummary.count,
      critical: moduleSummary.critical ?? 0,
    };
  }, [summary.modules]);

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

        <div className="notif-stat-grid">
          <StatCard
            title="Needs action"
            value={summary.open_alerts}
            hint="Active alerts"
            badge={summary.open_alerts > 0
              ? { label: `${summary.open_alerts} open`, tone: "warning" }
              : { label: "All clear", tone: "ok" }}
            icon={ShieldAlert}
            iconTone={summary.open_alerts > 0 ? "warning" : "ok"}
          />
          <StatCard
            title="Critical"
            value={criticalAlertCount}
            hint="Highest priority"
            badge={criticalAlertCount > 0
              ? { label: "Review now", tone: "critical" }
              : { label: "None", tone: "ok" }}
            icon={AlertTriangle}
            iconTone={criticalAlertCount > 0 ? "critical" : "ok"}
          />
          <StatCard
            title="Unread updates"
            value={summary.unread_notifications}
            hint="Feed items not opened"
            badge={summary.unread_notifications > 0
              ? { label: `${summary.unread_notifications} new`, tone: "neutral" }
              : { label: "Caught up", tone: "ok" }}
            icon={Bell}
            iconTone="neutral"
          />
          <StatCard
            title={topModule ? topModule.label : "Top module"}
            value={topModule ? topModule.count : 0}
            hint={topModule ? "Most alerts in this module" : "No module breakdowns yet"}
            badge={topModule && topModule.critical > 0
              ? { label: `${topModule.critical} critical`, tone: "critical" }
              : topModule
                ? { label: "Open", tone: "warning" }
                : undefined}
            icon={ClipboardList}
            iconTone={topModule && topModule.critical > 0 ? "critical" : topModule ? "warning" : "neutral"}
          />
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
              <Button type="button" variant="ghost" size="xs" onClick={handleRefresh} disabled={isPanelLoading || isPanelRefreshing}>
                {isPanelRefreshing ? "Refreshing..." : "Refresh"}
              </Button>
            </div>
            <div className="notifications-section-body">
              {isPanelLoading ? (
                <div className="tb-notify-empty">Loading alerts...</div>
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
                <Button type="button" variant="ghost" size="xs" onClick={() => void markAllRead()} disabled={summary.unread_notifications === 0}>
                  Mark all read
                </Button>
                <Button type="button" variant="ghost" size="xs" onClick={() => void clearFeed()} disabled={feed.length === 0}>
                  Clear updates
                </Button>
              </div>
            </div>
            <div className="notifications-section-body">
              {isPanelLoading ? (
                <div className="tb-notify-empty">Loading notifications...</div>
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
