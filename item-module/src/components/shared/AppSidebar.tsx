"use client";

import React, { useState, useMemo, useCallback } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";

import {
  LayoutDashboard,
  MapPin,
  Tags,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Users,
  Package,
  ClipboardList,
  FileText,
  BookOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/features/auth/hooks/usePermissions";

interface NavItem {
  title: string;
  href: string;
  icon: React.ElementType;
  badge?: number;
  permission?: string;
}

const mainNavItems: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Locations", href: "/locations", icon: MapPin, permission: "view_location" },
  { title: "Categories", href: "/categories", icon: Tags, permission: "view_category" },
  { title: "Items", href: "/items", icon: Package, permission: "view_item" },
  { title: "Stock Entries", href: "/stock-entries", icon: FileText, permission: "view_stockentry" },
  { title: "Inspections", href: "/inspections", icon: ClipboardList, permission: "view_inspectioncertificate" },
  { title: "Stock Registers", href: "/stock-registers", icon: BookOpen, permission: "view_stockregister" },
];

// Memoized NavLink component to prevent re-renders
interface NavLinkProps {
  href: string;
  icon: React.ElementType;
  title: string;
  collapsed: boolean;
  isActive: boolean;
}

const NavLink = React.memo(function NavLink({ href, icon: Icon, title, collapsed, isActive }: NavLinkProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 relative",
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
        collapsed && "justify-center px-0"
      )}
    >
      {isActive && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-sidebar-foreground" />
      )}
      <Icon className={cn("w-5 h-5 flex-shrink-0", isActive ? "text-sidebar-foreground" : "text-sidebar-foreground/70")} />
      {!collapsed && (
        <span className="truncate">{title}</span>
      )}
    </Link>
  );
});

export function AppSidebar() {
  const pathname = usePathname();
  const { logout } = useAuth();
  const { getViewLevel } = usePermissions();
  const [collapsed, setCollapsed] = useState(false);

  // Memoize isActive function with pathname dependency
  const isActive = useCallback((href: string) => pathname === href, [pathname]);

  // Memoize filtered navigation items
  // PRESERVED: All permission filtering logic
  const filteredNavItems = useMemo(() => {
    return mainNavItems.filter(item => {
      if (!item.permission) return true;
      if (item.permission.startsWith("view_")) {
        const resource = item.permission.replace("view_", "");
        return getViewLevel(resource) !== "NONE";
      }
      return false;
    });
  }, [getViewLevel]);

  // Memoize user view level for user management link
  // PRESERVED: Logic for showing user management
  const userViewLevel = useMemo(() => getViewLevel("user"), [getViewLevel]);

  // Toggle handler
  const handleToggle = useCallback(() => {
    setCollapsed(prev => !prev);
  }, []);

  return (
    <aside
      className={cn(
        "flex flex-col bg-sidebar border-r border-sidebar-border transition-[width] duration-200 h-screen sticky top-0 relative z-20",
        collapsed ? "w-[72px]" : "w-64"
      )}
    >
      {/* NED Orange accent strip at the very top */}
      <div className="h-[3px] w-full bg-sidebar-foreground/20 flex-shrink-0" />

      {/* Institutional Branding Header */}
      <div className={cn(
        "flex items-center gap-3 px-4 py-5 border-b border-sidebar-border",
        collapsed && "px-2 justify-center"
      )}>
        <div className="w-9 h-9 flex items-center justify-center overflow-hidden rounded-lg bg-white shadow-sm border border-sidebar-border">
          <picture>
            <source srcSet="/ned_logo_bg.webp" type="image/webp" />
            <img src="/ned_logo_bg.png" alt="NED UET Logo" className="w-full h-full object-contain" loading="eager" decoding="async" />
          </picture>
        </div>
        {!collapsed && (
          <div className="flex flex-col min-w-0">
            <span className="font-semibold text-sidebar-foreground text-sm truncate">
              NED University
            </span>
            <span className="text-xs text-sidebar-foreground/60 truncate">
              Asset Management System
            </span>
          </div>
        )}
      </div>

      {/* Navigation Layer */}
      <nav className={cn("flex-1 py-4 px-3 space-y-1", collapsed && "px-2")}>
        {filteredNavItems.map((item) => (
          <NavLink
            key={item.href}
            href={item.href}
            icon={item.icon}
            title={item.title}
            collapsed={collapsed}
            isActive={isActive(item.href)}
          />
        ))}

        {userViewLevel !== "NONE" && (
          <NavLink
            href="/users"
            icon={Users}
            title="User Management"
            collapsed={collapsed}
            isActive={isActive("/users")}
          />
        )}
      </nav>

      {/* System Control Section */}
      <div className="py-4 px-3 border-t border-sidebar-border space-y-1">
        <button
          onClick={logout}
          className={cn(
            "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 text-sidebar-foreground/70 hover:bg-destructive/10 hover:text-destructive w-full",
            collapsed && "justify-center px-0"
          )}
        >
          <LogOut className="w-5 h-5 flex-shrink-0" />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>

      {/* Versioning */}
      {!collapsed && (
        <div className="px-4 py-2 text-xs text-sidebar-muted">
          
        </div>
      )}

      {/* Interaction Toggle */}
      <button
        onClick={handleToggle}
        className="absolute -right-3 top-20 w-6 h-6 rounded-full flex items-center justify-center bg-sidebar border border-sidebar-border text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-all"
      >
        {collapsed ? (
          <ChevronRight className="w-3 h-3" />
        ) : (
          <ChevronLeft className="w-3 h-3" />
        )}
      </button>
    </aside>
  );
}
