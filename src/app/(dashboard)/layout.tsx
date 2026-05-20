"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { CapabilitiesProvider } from "@/contexts/CapabilitiesContext";
import { NotificationsProvider } from "@/contexts/NotificationsContext";
import { AppSidebar } from "@/components/AppSidebar";
import { CopilotSidePanel } from "@/components/CopilotSidePanel";
import { CopilotSupportNudges } from "@/components/CopilotSupportNudges";
import { CopilotVoiceOverlay } from "@/components/CopilotVoiceOverlay";
import { CopilotProvider } from "@/contexts/CopilotContext";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="app-frame">
        <div style={{ width: 248, background: "var(--card)", borderRight: "1px solid var(--hairline)", height: "100dvh" }} />
        <div style={{ flex: 1, padding: 24 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 40, background: "var(--surface-2)", borderRadius: 6, marginBottom: 12, animation: "pulse 1.5s infinite" }} />
          ))}
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <CapabilitiesProvider>
      <NotificationsProvider>
        <CopilotProvider>
          <div className="app-frame">
            <AppSidebar />
            <div className="main-col">
              {children}
              <CopilotSupportNudges />
              <CopilotVoiceOverlay />
              <CopilotSidePanel />
            </div>
          </div>
        </CopilotProvider>
      </NotificationsProvider>
    </CapabilitiesProvider>
  );
}
