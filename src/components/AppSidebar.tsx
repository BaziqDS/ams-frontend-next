"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Image from "next/image";
import { useAuth } from "@/contexts/AuthContext";
import { useCapabilities, type CapabilityLevel } from "@/contexts/CapabilitiesContext";
import { useNotifications } from "@/contexts/NotificationsContext";

type NavItem = {
  key: string;
  label: string;
  href: string;
  icon: React.ReactNode | string;
  module?: string;
  level?: CapabilityLevel;
};

type NavGroup = {
  group: string;
  items: NavItem[];
};

const IMPLEMENTED_ROUTES = new Set(["/dashboard", "/users", "/roles", "/locations", "/categories", "/items", "/stock-entries", "/stock-registers", "/inspections", "/maintenance", "/depreciation"]);

const NavIcon = ({ d, size = 18 }: { d: React.ReactNode | string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }} aria-hidden="true" focusable="false">
    {typeof d === "string" ? <path d={d} /> : d}
  </svg>
);

const LockIcon = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <rect x="4" y="11" width="16" height="10" rx="2" />
    <path d="M8 11V7a4 4 0 018 0v4" />
  </svg>
);

const SidebarToggleIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <rect x="4" y="5" width="16" height="14" rx="2" />
    <path d="M10 5v14" />
  </svg>
);

const NAV_ITEMS: NavGroup[] = [
  {
    group: "Overview",
    items: [
      { key: "dashboard", label: "Dashboard", href: "/dashboard", icon: "M3 12l9-8 9 8M5 10v10h14V10" },
    ],
  },
  {
    group: "Inventory",
    items: [
      { key: "locations", label: "Locations", href: "/locations", module: "locations", icon: <><path d="M12 21s-7-6.5-7-12a7 7 0 1114 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></> },
      { key: "categories", label: "Categories", href: "/categories", module: "categories", icon: <><path d="M20.5 13.5l-7 7a1.5 1.5 0 01-2.12 0L3 12.12V3h9.12l8.38 8.38a1.5 1.5 0 010 2.12z"/><circle cx="7.5" cy="7.5" r="1.2" fill="currentColor"/></> },
      { key: "items", label: "Items", href: "/items", module: "items", icon: <><path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/><path d="M3.3 7L12 12l8.7-5M12 22V12"/></> },
    ],
  },
  {
    group: "Operations",
    items: [
      { key: "stock-entries", label: "Stock Entries", href: "/stock-entries", module: "stock-entries", icon: <><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6M9 13h6M9 17h4"/></> },
      { key: "inspections", label: "Inspections", href: "/inspections", module: "inspections", icon: <><path d="M9 11l3 3 7-7"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></> },
      { key: "maintenance", label: "Maintenance", href: "/maintenance", module: "maintenance", icon: <><path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.1-3.1a5 5 0 01-6.6 6.6l-6 6a2.1 2.1 0 01-3-3l6-6a5 5 0 016.6-6.6z"/><path d="M4 20l4-4"/></> },
      { key: "stock-registers", label: "Stock Registers", href: "/stock-registers", module: "stock-registers", icon: <><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></> },
      { key: "depreciation", label: "Depreciation", href: "/depreciation", module: "depreciation", icon: <><path d="M4 19h16"/><path d="M7 16V8M12 16V5M17 16v-3"/><path d="M5 8l5-5 4 4 5-5"/></> },
    ],
  },
  {
    group: "Administration",
    items: [
      { key: "users", label: "User Management", href: "/users", module: "users", icon: <><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="7" r="2.6"/><path d="M21 19c0-2.7-1.8-5-4.5-5"/></> },
      { key: "roles", label: "Roles", href: "/roles", module: "roles", icon: <><rect x="4" y="5" width="16" height="14" rx="3"/><path d="M8 9h8M8 13h5"/></> },
      { key: "audit", label: "Audit Log", href: "/audit", module: "audit", icon: <><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/></> },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();
  const { can } = useCapabilities();
  const { getModuleCount } = useNotifications();
  const [collapsed, setCollapsed] = useState(false);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const isAllowed = (item: NavItem) => {
    if (!item.module) return true;
    return can(item.module, item.level ?? "view");
  };

  const isImplemented = (item: NavItem) => IMPLEMENTED_ROUTES.has(item.href);

  const handleSignOut = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <aside className={"sidebar" + (collapsed ? " collapsed" : "")}>
      {/* Brand */}
      <div className="sb-brand">
        <div className="sb-brand-mark">
          <Image src="/ned_seal.webp" alt="NED" width={28} height={28} style={{ width: "100%", height: "100%", objectFit: "contain", padding: 3 }} />
        </div>
        {!collapsed && (
          <div className="sb-brand-copy">
            <div className="sb-brand-title">NED University</div>
            <div className="sb-brand-sub">Asset Management</div>
          </div>
        )}
        <button type="button" className="sb-brand-toggle" onClick={() => setCollapsed(!collapsed)} title={collapsed ? "Expand sidebar" : "Collapse sidebar"} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          <SidebarToggleIcon size={18} />
        </button>
      </div>

      {/* Nav */}
      <nav className="sb-nav">
        {NAV_ITEMS.map(group => (
          <div key={group.group} className="sb-group">
            {!collapsed && <div className="sb-group-label">{group.group}</div>}
            {group.items.map(item => {
              const allowed = isAllowed(item);
              const implemented = isImplemented(item);
              const locked = !allowed || !implemented;
              const reason = !implemented
                ? "Coming soon"
                : !allowed
                  ? "You don't have access to this section"
                  : undefined;
              const className =
                "sb-item" +
                (isActive(item.href) && !locked ? " active" : "") +
                (locked ? " locked" : "");
              const alertCount = !locked && item.module ? getModuleCount(item.module) : 0;
              const badge = alertCount > 99 ? "99+" : String(alertCount);

              if (locked) {
                return (
                  <span
                    key={item.key}
                    className={className}
                    aria-disabled="true"
                    title={reason}
                  >
                    <span className="sb-rail" />
                    <span className="sb-icon">
                      <NavIcon d={item.icon} size={16} />
                    </span>
                    {!collapsed && (
                      <>
                        <span className="sb-label">{item.label}</span>
                        <span className="sb-lock" aria-hidden="true">
                          <LockIcon size={12} />
                        </span>
                      </>
                    )}
                  </span>
                );
              }

              return (
                <Link key={item.key} href={item.href} className={className}>
                  <span className="sb-rail" />
                  <span className="sb-icon">
                    <NavIcon d={item.icon} size={16} />
                    {collapsed && alertCount > 0 ? <span className="sb-icon-badge">{badge}</span> : null}
                  </span>
                  {!collapsed && <span className="sb-label">{item.label}</span>}
                  {!collapsed && alertCount > 0 ? <span className="sb-badge">{badge}</span> : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="sb-footer">
        <button type="button" className="sb-item" onClick={handleSignOut}>
          <span className="sb-rail" />
          <span className="sb-icon">
            <NavIcon d={<><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></>} size={16} />
          </span>
          {!collapsed && <span className="sb-label">Sign Out</span>}
        </button>
        {!collapsed && <div className="sb-ver"><span className="mono" style={{ fontSize: 10 }}>v4.1.0</span></div>}
      </div>
    </aside>
  );
}
