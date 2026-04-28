"use client";

import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";

interface TopbarProps {
  breadcrumb: string[];
}

export function Topbar({ breadcrumb }: TopbarProps) {
  const { user } = useAuth();

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

          <button className="btn btn-ghost btn-icon" title="Notifications">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/>
            </svg>
          </button>

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
