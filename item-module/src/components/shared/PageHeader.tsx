"use client";

import { memo, ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

interface PageHeaderProps {
  title: ReactNode;
  subtitle: ReactNode;
}

export const PageHeader = memo(function PageHeader({ title, subtitle }: PageHeaderProps) {
  const { user } = useAuth();

  // PRESERVED: All user display logic
  const getInitials = (firstName: string, lastName: string) => {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  };

  const displayName = user ? `${user.first_name} ${user.last_name}` : "Guest User";
  const displayInitials = user ? getInitials(user.first_name, user.last_name) : "G";
  const displayRole = (user?.groups_display && user.groups_display.length > 0) 
    ? user.groups_display.join(', ') 
    : user?.is_superuser ? "Administrator" : "Staff Member";

  return (
    <header className="flex items-center justify-between py-4 px-6 bg-card border-b border-border">
      <div>
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      <div className="flex items-center gap-4">
        {/* User Avatar */}
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarImage src="" /> 
            <AvatarFallback className="bg-primary text-primary-foreground text-sm">
              {displayInitials}
            </AvatarFallback>
          </Avatar>
          <div className="hidden lg:block">
            <p className="text-sm font-medium text-foreground">{displayName}</p>
            <p className="text-xs text-muted-foreground">{displayRole}</p>
          </div>
        </div>
      </div>
    </header>
  );
});
