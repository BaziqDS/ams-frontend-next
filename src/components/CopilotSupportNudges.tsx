"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  useNotifications,
  type NotificationAlertRecord,
} from "@/contexts/NotificationsContext";
import {
  useCopilotSupportNudge,
  type CopilotSupportNudge,
} from "@/contexts/CopilotContext";
import { createCopilotSupportNudge } from "@/lib/copilotSupportNudgeTemplates";

const STORAGE_KEY = "ams.copilot.support-nudges.seen.v1";

function readSeenNudges() {
  if (typeof window === "undefined") return new Set<string>();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === "string")
        : [],
    );
  } catch {
    return new Set<string>();
  }
}

function storeSeenNudges(seen: ReadonlySet<string>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...seen].slice(-200)));
}

function normalizeRoute(href: string | undefined) {
  if (!href || !href.startsWith("/")) return undefined;
  if (href.startsWith("//")) return undefined;
  return href;
}

function buildPrompt(alert: NotificationAlertRecord, route: string | undefined) {
  const target = route ? ` at ${route}` : "";
  if (alert.module === "inspections" || route?.startsWith("/inspections/")) {
    return [
      `Help me handle this inspection update${target}.`,
      `Update: ${alert.title}.`,
      alert.message,
      "If I am not on the inspection page, help me navigate there first. If I am already there, use the current page context and active stage form.",
    ].join(" ");
  }

  return [
    `Help me handle this ${alert.module || "AMS"} update${target}.`,
    `Update: ${alert.title}.`,
    alert.message,
    "Use the current page context if it is relevant; otherwise help me navigate to the right page first.",
  ].join(" ");
}

function buildNudge(alert: NotificationAlertRecord): CopilotSupportNudge | null {
  const route = normalizeRoute(alert.href);
  const isInspection = alert.module === "inspections" || route?.startsWith("/inspections/");
  const moduleName = alert.module || "general";

  return createCopilotSupportNudge({
    id: `alert:${alert.key}`,
    kind: isInspection ? "inspection_update" : "module_update",
    title: isInspection
      ? alert.title || "Inspection update needs attention"
      : alert.title || `${moduleName} update needs attention`,
    message: isInspection
      ? "This inspection may have a workflow stage or record update the assistant can help with."
      : alert.message || `There is a ${moduleName} update the assistant can help with.`,
    route,
    module: moduleName,
    severity: alert.severity,
    prompt: buildPrompt(alert, route),
  });
}

export function CopilotSupportNudges() {
  const pathname = usePathname();
  const { alerts } = useNotifications();
  const emitSupportNudge = useCopilotSupportNudge();
  const seenRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!seenRef.current) seenRef.current = readSeenNudges();

    const actionable = alerts
      .map(buildNudge)
      .filter((nudge): nudge is CopilotSupportNudge => Boolean(nudge))
      .sort((left, right) => {
        const leftWeight = left.severity === "critical" ? 0 : left.severity === "warning" ? 1 : 2;
        const rightWeight = right.severity === "critical" ? 0 : right.severity === "warning" ? 1 : 2;
        return leftWeight - rightWeight;
      });

    const candidate = actionable.find((nudge) => !seenRef.current?.has(nudge.id));
    if (!candidate) return;

    seenRef.current.add(candidate.id);
    storeSeenNudges(seenRef.current);

    emitSupportNudge({
      ...candidate,
      message:
        candidate.route && candidate.route !== pathname
          ? `${candidate.message} You are currently on a different page.`
          : candidate.message,
    });
  }, [alerts, emitSupportNudge, pathname]);

  return null;
}
