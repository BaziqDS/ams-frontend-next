"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { useAuth, type AuthUser } from "@/contexts/AuthContext";
import { useNotifications, type NotificationAlertRecord, type NotificationFeedItem } from "@/contexts/NotificationsContext";
import { API_BASE, apiFetch } from "@/lib/api";

interface TopbarProps {
  breadcrumb: string[];
}

type ProfileSettingsPreferences = {
  notificationsEnabled: boolean;
};

const DEFAULT_PROFILE_PREFERENCES: ProfileSettingsPreferences = {
  notificationsEnabled: true,
};

function mediaUrl(value: string | null | undefined) {
  if (!value) return null;
  return /^(https?:|blob:|data:)/.test(value) ? value : `${API_BASE}${value}`;
}

function readProfilePreferences(storageKey: string): ProfileSettingsPreferences {
  if (typeof window === "undefined") return DEFAULT_PROFILE_PREFERENCES;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return DEFAULT_PROFILE_PREFERENCES;
    return { ...DEFAULT_PROFILE_PREFERENCES, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PROFILE_PREFERENCES;
  }
}

function writeProfilePreferences(storageKey: string, preferences: ProfileSettingsPreferences) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(storageKey, JSON.stringify(preferences));
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

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="profile-toggle-row">
      <span>
        <span className="profile-toggle-title">{title}</span>
        <span className="profile-toggle-description">{description}</span>
      </span>
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
    </label>
  );
}

type ProfileSettingsResult = {
  user: AuthUser;
  preferences: ProfileSettingsPreferences;
};

function UserAvatar({ src, initials, className }: { src?: string | null; initials: string; className: string }) {
  const href = mediaUrl(src);
  return (
    <div className={className}>
      {href ? <img src={href} alt="" /> : initials}
    </div>
  );
}

function ChangePasswordModal({
  open,
  userId,
  onClose,
}: {
  open: boolean;
  userId: number | null;
  onClose: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setSubmitting(false);
    setError(null);
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    if (!userId || submitting) return;
    if (!currentPassword.trim()) {
      setError("Enter your current password.");
      return;
    }
    if (!newPassword.trim()) {
      setError("Enter a new password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await apiFetch<AuthUser>(`/api/users/management/${userId}/`, {
        method: "PATCH",
        body: JSON.stringify({
          current_password: currentPassword,
          password: newPassword,
        }),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change password.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="profile-password-layer" role="presentation">
      <div className="modal profile-password-modal" role="dialog" aria-modal="true" aria-labelledby="profile-password-title">
        <header className="modal-head">
          <div>
            <div className="eyebrow">Security</div>
            <h2 id="profile-password-title">Change password</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close change password">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </header>
        <form
          onSubmit={event => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="modal-body profile-password-body">
            <div className="field">
              <div className="field-label">Current password</div>
              <input type="password" value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} autoComplete="current-password" />
            </div>
            <div className="field">
              <div className="field-label">New password</div>
              <input type="password" value={newPassword} onChange={event => setNewPassword(event.target.value)} autoComplete="new-password" />
            </div>
            <div className="field">
              <div className="field-label">Confirm new password</div>
              <input type="password" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" />
            </div>
          </div>
          <footer className="modal-foot">
            <div className="modal-foot-meta mono">{error ? <span className="foot-err">{error}</span> : "Current password is required"}</div>
            <div className="modal-foot-actions">
              <button type="button" className="btn btn-md" onClick={onClose} disabled={submitting}>Cancel</button>
              <button type="submit" className="btn btn-md btn-primary" disabled={submitting}>{submitting ? "Saving..." : "Change password"}</button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}

function ProfileSettingsModal({
  open,
  displayName,
  displayRole,
  initials,
  username,
  userId,
  avatarUrl,
  firstName,
  lastName,
  preferences,
  onClose,
  onSave,
}: {
  open: boolean;
  displayName: string;
  displayRole: string;
  initials: string;
  username: string;
  userId: number | null;
  avatarUrl?: string | null;
  firstName: string;
  lastName: string;
  preferences: ProfileSettingsPreferences;
  onClose: () => void;
  onSave: (result: ProfileSettingsResult) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(preferences.notificationsEnabled);
  const [draftFirstName, setDraftFirstName] = useState(firstName);
  const [draftLastName, setDraftLastName] = useState(lastName);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setNotificationsEnabled(preferences.notificationsEnabled);
    setDraftFirstName(firstName);
    setDraftLastName(lastName);
    setPasswordModalOpen(false);
    setAvatarFile(null);
    setAvatarPreview(null);
    setSubmitError(null);
  }, [firstName, lastName, open, preferences]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open || typeof document === "undefined") return null;

  const selectedAvatarUrl = avatarPreview ?? avatarUrl;
  const canSave = !submitting && Boolean(userId);

  const submit = async () => {
    if (!userId || !canSave) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const formData = new FormData();
      formData.set("first_name", draftFirstName.trim());
      formData.set("last_name", draftLastName.trim());
      if (avatarFile) formData.set("avatar", avatarFile);
      const saved = await apiFetch<AuthUser>(`/api/users/management/${userId}/`, {
        method: "PATCH",
        body: formData,
      });
      onSave({ user: saved, preferences: { notificationsEnabled } });
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed to save profile settings.");
    } finally {
      setSubmitting(false);
    }
  };

  return createPortal((
    <div className="modal-backdrop profile-settings-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <ChangePasswordModal
        open={passwordModalOpen}
        userId={userId}
        onClose={() => setPasswordModalOpen(false)}
      />
      <div className="modal modal-lg profile-settings-modal" role="dialog" aria-modal="true" aria-labelledby="profile-settings-title">
        <header className="modal-head">
          <div>
            <div className="eyebrow">Account</div>
            <h2 id="profile-settings-title">Profile settings</h2>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close profile settings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          </button>
        </header>

        <form
          onSubmit={event => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="modal-body profile-settings-body">
            <aside className="profile-settings-card">
              <UserAvatar src={selectedAvatarUrl} initials={initials} className="profile-settings-avatar" />
              <div className="profile-settings-name">{displayName}</div>
              <div className="profile-settings-role">{displayRole}</div>
              <div className="profile-settings-meta mono">@{username}</div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="sr-only"
                onChange={event => {
                  const file = event.target.files?.[0] ?? null;
                  setAvatarFile(file);
                  setAvatarPreview(file ? URL.createObjectURL(file) : null);
                }}
              />
              <button type="button" className="btn btn-sm btn-ghost profile-avatar-action" onClick={() => fileInputRef.current?.click()}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <path d="M17 8l-5-5-5 5" />
                  <path d="M12 3v12" />
                </svg>
                Update avatar
              </button>
              <div className="profile-settings-note">PNG, JPG, WebP, or GIF.</div>
            </aside>

            <div className="profile-settings-main">
              <section className="form-section profile-settings-section">
                <header className="form-section-head">
                  <div className="form-section-n mono">01</div>
                  <div>
                    <h3>Personal details</h3>
                    <div className="form-section-sub">These values come from your AMS account.</div>
                  </div>
                </header>
                <div className="form-section-body">
                  <div className="form-grid cols-2">
                    <div className="field">
                      <div className="field-label">First name</div>
                      <input value={draftFirstName} onChange={event => setDraftFirstName(event.target.value)} autoComplete="given-name" />
                    </div>
                    <div className="field">
                      <div className="field-label">Last name</div>
                      <input value={draftLastName} onChange={event => setDraftLastName(event.target.value)} autoComplete="family-name" />
                    </div>
                    <div className="field profile-password-action-field">
                      <div className="field-label">Password</div>
                      <button type="button" className="btn btn-sm" onClick={() => setPasswordModalOpen(true)}>
                        Change password
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <section className="form-section profile-settings-section">
                <header className="form-section-head">
                  <div className="form-section-n mono">02</div>
                  <div>
                    <h3>Notification preferences</h3>
                    <div className="form-section-sub">Control how much activity the topbar surfaces for this browser.</div>
                  </div>
                </header>
                <div className="form-section-body">
                  <ToggleRow
                    title="Enable notifications"
                    description="Show the bell badge and allow the notification panel to open."
                    checked={notificationsEnabled}
                    onChange={setNotificationsEnabled}
                  />
                </div>
              </section>
            </div>
          </div>

          <footer className="modal-foot">
            <div className="modal-foot-meta mono">
              {submitError ? <span className="foot-err">{submitError}</span> : "Profile changes sync to your account"}
            </div>
            <div className="modal-foot-actions">
              <button type="button" className="btn btn-md" onClick={onClose} disabled={submitting}>
                Close
              </button>
              <button type="submit" className="btn btn-md btn-primary" disabled={!canSave}>
                {submitting ? "Saving..." : "Save settings"}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  ), document.body);
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
  const router = useRouter();
  const { user, logout, updateUser } = useAuth();
  const { summary, alerts, feed, isPanelLoading, loadPanelData, markRead, markAllRead, clearFeed } = useNotifications();
  const [panelOpen, setPanelOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"alerts" | "feed">("alerts");
  const panelRef = useRef<HTMLDivElement | null>(null);
  const accountRef = useRef<HTMLDivElement | null>(null);
  const preferencesStorageKey = `ams.profile-settings.v1.${user?.id ?? "anonymous"}`;
  const [profilePreferences, setProfilePreferences] = useState<ProfileSettingsPreferences>(() => readProfilePreferences(preferencesStorageKey));

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

  useEffect(() => {
    setProfilePreferences(readProfilePreferences(preferencesStorageKey));
  }, [preferencesStorageKey]);

  const notificationsMuted = !profilePreferences.notificationsEnabled;
  const attentionCount = notificationsMuted ? 0 : (summary.unread_notifications ?? 0) + (summary.open_alerts ?? 0);
  const bellBadge = attentionCount > 99 ? "99+" : String(attentionCount);

  const handleSaveProfileSettings = ({ user: savedUser, preferences }: ProfileSettingsResult) => {
    updateUser(savedUser);
    setProfilePreferences(preferences);
    writeProfilePreferences(preferencesStorageKey, preferences);
    if (!preferences.notificationsEnabled) setPanelOpen(false);
    setProfileOpen(false);
  };

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

  useEffect(() => {
    if (!accountMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) {
        setAccountMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccountMenuOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [accountMenuOpen]);

  const handleTogglePanel = () => {
    if (notificationsMuted) return;
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

  const handleLogout = async () => {
    setAccountMenuOpen(false);
    await logout();
    router.push("/login");
  };

  return (
    <div className="topbar">
      <ProfileSettingsModal
        open={profileOpen}
        displayName={displayName}
        displayRole={displayRole}
        initials={initials}
        username={user?.username ?? "unknown"}
        userId={user?.id ?? null}
        avatarUrl={user?.avatar_url}
        firstName={user?.first_name || ""}
        lastName={user?.last_name || ""}
        preferences={profilePreferences}
        onClose={() => setProfileOpen(false)}
        onSave={handleSaveProfileSettings}
      />
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
            <button className="btn btn-ghost btn-icon tb-notify-trigger" title={notificationsMuted ? "Notifications muted in profile settings" : "Notifications and alerts"} type="button" onClick={handleTogglePanel} aria-expanded={panelOpen} aria-haspopup="dialog" data-muted={notificationsMuted}>
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

          <div className="tb-account" ref={accountRef}>
            <button type="button" className="tb-user" onClick={() => setAccountMenuOpen(current => !current)} aria-haspopup="menu" aria-expanded={accountMenuOpen} title="Open account menu">
              <UserAvatar src={user?.avatar_url} initials={initials} className="tb-avatar" />
              <div className="tb-user-text">
                <div className="tb-user-name">{displayName}</div>
                <div className="tb-user-role">{displayRole}</div>
              </div>
            </button>
            {accountMenuOpen ? (
              <div className="tb-account-menu" role="menu" aria-label="Account menu">
                <button type="button" className="tb-account-menu-item" role="menuitem" onClick={() => { setAccountMenuOpen(false); setProfileOpen(true); }}>
                  <span className="tb-account-menu-icon">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                      <path d="M20 21a8 8 0 0 0-16 0" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </span>
                  Profile
                </button>
                <button type="button" className="tb-account-menu-item" role="menuitem" onClick={() => void handleLogout()}>
                  <span className="tb-account-menu-icon">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <path d="M16 17l5-5-5-5" />
                      <path d="M21 12H9" />
                    </svg>
                  </span>
                  Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
