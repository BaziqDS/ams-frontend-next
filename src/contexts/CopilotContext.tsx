"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import {
  type CapabilityLevel,
  useCapabilities,
} from "@/contexts/CapabilitiesContext";
import { normalizeCopilotRoute } from "@/lib/copilotNavigation";
import {
  dispatchSamePageOpen,
  queuePendingOpen,
} from "@/lib/copilotPendingAction";
import {
  appendCopilotActivity,
  buildCopilotActivitySnapshot,
  createCopilotActivityEvent,
  type CopilotActivityEvent,
  type CopilotActivityEventInput,
} from "@/lib/copilotActivity";
import {
  buildCopilotPermissionSnapshot,
  getCopilotActionAccess,
} from "@/lib/copilotPermissionContext";
import { filterCopilotReadablesForRoute } from "@/lib/copilotPageContext";

const TRUSTED_ORIGIN =
  process.env.NEXT_PUBLIC_COPILOT_URL?.replace(/\/$/, "") ??
  "http://localhost:3001";
const ACTIVITY_READABLE_ID = "__ams_activity_context";
const PERMISSION_READABLE_ID = "__ams_permission_context";

function currentRouteHref(pathname: string) {
  if (typeof window === "undefined") return pathname;
  return `${window.location.origin}${pathname}${window.location.search}${window.location.hash}`;
}

type Readable = {
  id: string;
  description: string;
  value: unknown;
};

type CopilotCapabilityRequirement = {
  module: string;
  level?: CapabilityLevel;
};

type ActionDef = {
  name: string;
  description: string;
  parameters: Record<
    string,
    { type: string; description?: string; required?: boolean }
  >;
  requiredPermissions?: string[];
  requiredCapabilities?: CopilotCapabilityRequirement[];
  allowed?: boolean;
  blockedReason?: string;
};

export type CopilotAction = ActionDef & {
  handler: (args: any) => unknown | Promise<unknown>;
};

type CopilotContextValue = {
  registerReadable: (readable: Readable) => () => void;
  registerAction: (action: CopilotAction) => () => void;
  setIframe: (element: HTMLIFrameElement | null) => void;
  trackActivity: (event: CopilotActivityEventInput) => CopilotActivityEvent;
  emitSupportNudge: (nudge: CopilotSupportNudge) => void;
  sendVoiceCommand: (text: string) => CopilotVoiceCommand;
  sendHitlDecision: (decision: "approve" | "reject") => boolean;
};

export type CopilotSupportNudge = {
  id: string;
  kind: string;
  title: string;
  message: string;
  route?: string;
  module?: string;
  severity?: string;
  prompt?: string;
  createdAt?: string;
};

export type CopilotVoiceCommand = {
  id: string;
  text: string;
  source: "voice";
  createdAt: string;
};

export type CopilotAssistantMessageEvent = {
  messageId?: string;
  text: string;
};

export type CopilotHitlActionRequest = {
  name: string;
  args: Record<string, unknown>;
  description?: string;
};

export type CopilotHitlInterrupt = {
  actionRequests: CopilotHitlActionRequest[];
  reviewConfigs?: unknown[];
};

export const COPILOT_ASSISTANT_MESSAGE_EVENT =
  "ams-copilot-assistant-message";
export const COPILOT_HITL_INTERRUPT_EVENT = "ams-copilot-hitl-interrupt";

const CopilotContext = createContext<CopilotContextValue | null>(null);

export function CopilotProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const capabilities = useCapabilities();
  const readablesRef = useRef<Map<string, Readable>>(new Map());
  const actionsRef = useRef<Map<string, CopilotAction>>(new Map());
  const activityEventsRef = useRef<CopilotActivityEvent[]>([]);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const iframeLoadCleanupRef = useRef<(() => void) | null>(null);
  const pushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingSupportNudgesRef = useRef<CopilotSupportNudge[]>([]);
  const pendingVoiceCommandsRef = useRef<CopilotVoiceCommand[]>([]);

  const getActionAccess = useCallback(
    (action: ActionDef) => {
      return getCopilotActionAccess(action, {
        permissionValues: user?.permissions ?? [],
        capabilities: {
          modules: capabilities.modules,
          manifest: capabilities.manifest,
          isSuperuser: capabilities.isSuperuser,
          inspectionStages: capabilities.inspectionStages,
        },
      });
    },
    [capabilities, user],
  );

  const canRunAction = useCallback(
    (action: ActionDef) => getActionAccess(action).allowed,
    [getActionAccess],
  );

  const pushContextToIframe = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;

    const readables = filterCopilotReadablesForRoute(
      Array.from(readablesRef.current.values()),
      pathname,
    );
    const actions: ActionDef[] = Array.from(actionsRef.current.values()).map(
      ({
        name,
        description,
        parameters,
        requiredPermissions,
        requiredCapabilities,
        allowed,
      }) => {
        const access = getActionAccess({
          name,
          description,
          parameters,
          requiredPermissions,
          requiredCapabilities,
          allowed,
        });
        return {
          name,
          description,
          parameters,
          requiredPermissions,
          requiredCapabilities,
          allowed: access.allowed,
          blockedReason: access.blockedReason,
        };
      },
    );

    iframe.contentWindow.postMessage(
      {
        source: "ams-copilot",
        type: "CONTEXT_UPDATE",
        readables,
        actions,
      },
      TRUSTED_ORIGIN,
    );
  }, [getActionAccess, pathname]);

  const schedulePush = useCallback(() => {
    if (pushTimerRef.current) clearTimeout(pushTimerRef.current);
    pushTimerRef.current = setTimeout(pushContextToIframe, 100);
  }, [pushContextToIframe]);

  const registerReadable = useCallback(
    (readable: Readable) => {
      readablesRef.current.set(readable.id, readable);
      schedulePush();
      return () => {
        readablesRef.current.delete(readable.id);
        schedulePush();
      };
    },
    [schedulePush],
  );

  const publishPermissionSnapshot = useCallback(() => {
    readablesRef.current.set(PERMISSION_READABLE_ID, {
      id: PERMISSION_READABLE_ID,
      description:
        "Current signed-in user's AMS permissions, module capabilities, inspection-stage access, and allowed/blocked registered frontend actions with reasons.",
      value: buildCopilotPermissionSnapshot({
        user,
        permissionValues: user?.permissions ?? [],
        capabilities: {
          modules: capabilities.modules,
          manifest: capabilities.manifest,
          isSuperuser: capabilities.isSuperuser,
          inspectionStages: capabilities.inspectionStages,
        },
        actions: Array.from(actionsRef.current.values()),
      }),
    });
    schedulePush();
  }, [capabilities, schedulePush, user]);

  const registerAction = useCallback(
    (action: CopilotAction) => {
      actionsRef.current.set(action.name, action);
      publishPermissionSnapshot();
      schedulePush();
      return () => {
        actionsRef.current.delete(action.name);
        publishPermissionSnapshot();
        schedulePush();
      };
    },
    [publishPermissionSnapshot, schedulePush],
  );

  const publishActivitySnapshot = useCallback(() => {
    readablesRef.current.set(ACTIVITY_READABLE_ID, {
      id: ACTIVITY_READABLE_ID,
      description:
        "Compact AMS activity memory: recent business events, active form, last user edit, and last submit result. This is intentionally summarized; do not assume it contains every historical action.",
      value: buildCopilotActivitySnapshot(activityEventsRef.current, {
        currentRoute: pathname,
        recentLimit: 20,
      }),
    });
    schedulePush();
  }, [pathname, schedulePush]);

  const trackActivity = useCallback(
    (input: CopilotActivityEventInput) => {
      const event = createCopilotActivityEvent({
        route: input.route ?? pathname,
        ...input,
      });
      activityEventsRef.current = appendCopilotActivity(
        activityEventsRef.current,
        event,
        500,
      );
      readablesRef.current.set(ACTIVITY_READABLE_ID, {
        id: ACTIVITY_READABLE_ID,
        description:
          "Compact AMS activity memory: recent business events, active form, last user edit, and last submit result. This is intentionally summarized; do not assume it contains every historical action.",
        value: buildCopilotActivitySnapshot(activityEventsRef.current, {
          currentRoute: pathname,
          recentLimit: 20,
        }),
      });
      schedulePush();
      return event;
    },
    [pathname, schedulePush],
  );

  const postSupportNudge = useCallback((nudge: CopilotSupportNudge) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return false;

    iframe.contentWindow.postMessage(
      {
        source: "ams-copilot",
        type: "SUPPORT_NUDGE",
        nudge,
      },
      TRUSTED_ORIGIN,
    );
    return true;
  }, []);

  const postVoiceCommand = useCallback((command: CopilotVoiceCommand) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return false;

    iframe.contentWindow.postMessage(
      {
        source: "ams-copilot",
        type: "VOICE_COMMAND",
        command,
      },
      TRUSTED_ORIGIN,
    );
    return true;
  }, []);

  const flushPendingSupportNudges = useCallback(() => {
    if (pendingSupportNudgesRef.current.length === 0) return;
    const pending = pendingSupportNudgesRef.current;
    pendingSupportNudgesRef.current = [];
    for (const nudge of pending) {
      if (!postSupportNudge(nudge)) {
        pendingSupportNudgesRef.current.push(nudge);
      }
    }
  }, [postSupportNudge]);

  const flushPendingVoiceCommands = useCallback(() => {
    if (pendingVoiceCommandsRef.current.length === 0) return;
    const pending = pendingVoiceCommandsRef.current;
    pendingVoiceCommandsRef.current = [];
    for (const command of pending) {
      if (!postVoiceCommand(command)) {
        pendingVoiceCommandsRef.current.push(command);
      }
    }
  }, [postVoiceCommand]);

  const emitSupportNudge = useCallback((nudge: CopilotSupportNudge) => {
    if (!postSupportNudge(nudge)) {
      pendingSupportNudgesRef.current = [
        ...pendingSupportNudgesRef.current.filter((item) => item.id !== nudge.id),
        nudge,
      ].slice(-10);
    }

    trackActivity({
      kind: "support_nudge",
      actor: "system",
      title: `Support nudge: ${nudge.title}`,
      route: nudge.route,
      details: {
        id: nudge.id,
        kind: nudge.kind,
        module: nudge.module,
        severity: nudge.severity,
      },
    });
  }, [postSupportNudge, trackActivity]);

  const sendVoiceCommand = useCallback((text: string) => {
    const command: CopilotVoiceCommand = {
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `voice-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      text,
      source: "voice",
      createdAt: new Date().toISOString(),
    };

    if (!postVoiceCommand(command)) {
      pendingVoiceCommandsRef.current = [
        ...pendingVoiceCommandsRef.current,
        command,
      ].slice(-5);
    }

    trackActivity({
      kind: "voice_command",
      actor: "user",
      title: "Voice command sent to assistant",
      details: {
        id: command.id,
        transcript: text,
      },
    });

    return command;
  }, [postVoiceCommand, trackActivity]);

  const sendHitlDecision = useCallback((decision: "approve" | "reject") => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return false;

    iframe.contentWindow.postMessage(
      {
        source: "ams-copilot",
        type: "HITL_DECISION",
        decision,
      },
      TRUSTED_ORIGIN,
    );

    trackActivity({
      kind: "approval_decision",
      actor: "user",
      title: `User ${decision === "approve" ? "approved" : "rejected"} assistant action`,
      details: { decision },
    });

    return true;
  }, [trackActivity]);

  useLayoutEffect(() => {
    publishActivitySnapshot();
    return () => {
      readablesRef.current.delete(ACTIVITY_READABLE_ID);
      schedulePush();
    };
  }, [publishActivitySnapshot, schedulePush]);

  useLayoutEffect(() => {
    publishPermissionSnapshot();
    return () => {
      readablesRef.current.delete(PERMISSION_READABLE_ID);
      schedulePush();
    };
  }, [publishPermissionSnapshot, schedulePush]);

  useEffect(() => {
    trackActivity({
      kind: "route_changed",
      actor: "user",
      title: `Current page changed to ${pathname}`,
      route: pathname,
      details: {
        href: currentRouteHref(pathname),
      },
    });
  }, [pathname, trackActivity]);

  useEffect(() => {
    return registerAction({
      name: "navigate_to_route",
      description:
        "Navigate the AMS browser to a relative route such as /inspections, /locations, or /categories. Use ONLY for navigation without opening a form. To open a create form from any page, prefer the open_form action. Accepts the path under arg key 'path' (preferred) or 'route' (alias).",
      parameters: {
        path: {
          type: "string",
          description:
            "Safe relative AMS route beginning with /. Alias arg 'route' is also accepted.",
          required: true,
        },
      },
      handler: (rawArgs: Record<string, unknown> | undefined) => {
        const args = (rawArgs ?? {}) as Record<string, unknown>;
        const candidate =
          args.path ?? args.route ?? args.url ?? args.href ?? args.target;
        const route = normalizeCopilotRoute(candidate);
        if (!route) {
          return {
            ok: false,
            errorType: "invalid_route",
            message:
              "Invalid AMS route. Pass a relative path starting with '/' under the arg key 'path' (e.g., { path: '/inspections/13' }).",
            received: args,
          };
        }
        router.push(route);
        return { ok: true, route };
      },
    });
  }, [registerAction, router]);

  // Registry of "create form" → route mappings. Each entry lets the agent
  // open that form FROM ANY PAGE — the handler navigates if needed and queues
  // a token that the destination page reads on mount.
  useEffect(() => {
    const FORM_ROUTES: Record<
      string,
      { route: string; capability: CopilotCapabilityRequirement }
    > = {
      inspection_create: {
        route: "/inspections",
        capability: { module: "inspections", level: "manage" },
      },
      category_create: {
        route: "/categories",
        capability: { module: "categories", level: "manage" },
      },
      item_create: {
        route: "/items",
        capability: { module: "items", level: "manage" },
      },
      // Subcategory must be opened from a parent category's detail page —
      // we can't navigate generically, so it's resolved on-page only.
      // Inspection stage forms live on /inspections/[id] and are auto-active
      // once the user navigates to a specific inspection detail page — they
      // are not registered here because they need an inspection ID.
    };

    return registerAction({
      name: "open_form",
      description:
        "Open a create form anywhere in the AMS. If the user is not on the form's page, this " +
        "automatically navigates first and opens the form once the page is ready. Use this " +
        "instead of chaining navigate_to_route with open_create_*_form. Supported form_id values: " +
        "'inspection_create' (opens New Inspection modal on /inspections), 'category_create' " +
        "(opens Add Category modal on /categories), 'item_create' (opens Add Item modal on /items). " +
        "For subcategory create, the user must first be on a parent category's detail page " +
        "(/categories/[id]). For inspection stage forms, the user must first be on the " +
        "inspection detail page (/inspections/[id]) — call navigate_to_route with path " +
        "'/inspections/{id}' to get there.",
      parameters: {
        form_id: {
          type: "string",
          description:
            "Form identifier. Supported: inspection_create | category_create | item_create. Alias arg 'formId' is also accepted.",
          required: true,
        },
      },
      handler: (rawArgs: Record<string, unknown> | undefined) => {
        const args = (rawArgs ?? {}) as Record<string, unknown>;
        // Accept form_id flat, formId camelCase, or nested under args.{form_id|formId}.
        const nested = (args.args ?? {}) as Record<string, unknown>;
        const rawFormId =
          args.form_id ??
          args.formId ??
          nested.form_id ??
          nested.formId ??
          "";
        const formId = typeof rawFormId === "string" ? rawFormId : "";

        if (!formId) {
          return {
            ok: false,
            errorType: "missing_form_id",
            message:
              "open_form requires a 'form_id' string. Supported values: " +
              `${Object.keys(FORM_ROUTES).join(", ")}.`,
            received: args,
          };
        }

        const target = FORM_ROUTES[formId];
        if (!target) {
          return {
            ok: false,
            errorType: "unknown_form_id",
            message:
              `Unknown form_id "${formId}". Supported via open_form: ${Object.keys(FORM_ROUTES).join(", ")}. ` +
              "Subcategory and inspection-stage forms must be opened from their respective parent pages.",
          };
        }

        if (
          !capabilities.can(
            target.capability.module,
            target.capability.level ?? "view",
          )
        ) {
          return {
            ok: false,
            errorType: "permission_denied",
            message: `You need ${target.capability.module}:${target.capability.level ?? "view"} capability to open ${formId}.`,
            requiredCapabilities: [target.capability],
          };
        }

        const route = target.route;
        const onTargetRoute = pathname === route;
        if (onTargetRoute) {
          dispatchSamePageOpen(formId);
          return { ok: true, opened: true };
        }

        // Queue the open intent, then navigate. The destination page checks
        // sessionStorage on mount and triggers its open handler.
        queuePendingOpen(formId);
        router.push(route);
        return {
          ok: true,
          navigated: true,
          message: `Navigating to ${route}; ${formId} will open once the page loads.`,
        };
      },
    });
  }, [capabilities, registerAction, router, pathname]);

  const setIframe = useCallback(
    (element: HTMLIFrameElement | null) => {
      iframeLoadCleanupRef.current?.();
      iframeLoadCleanupRef.current = null;
      iframeRef.current = element;
      if (element) {
        const handleLoad = () => {
          setTimeout(pushContextToIframe, 250);
          setTimeout(flushPendingSupportNudges, 300);
          setTimeout(flushPendingVoiceCommands, 300);
        };
        element.addEventListener("load", handleLoad);
        iframeLoadCleanupRef.current = () => {
          element.removeEventListener("load", handleLoad);
        };
        if (element.contentWindow) {
          setTimeout(pushContextToIframe, 250);
          setTimeout(flushPendingSupportNudges, 300);
          setTimeout(flushPendingVoiceCommands, 300);
        }
      }
    },
    [flushPendingSupportNudges, flushPendingVoiceCommands, pushContextToIframe],
  );

  const systemContext = useMemo<Readable>(() => {
    const permissionList = user?.permissions ?? [];
    return {
      id: "__ams_runtime_context",
      description:
        "Current live AMS route, signed-in user, permission summary, capability modules, and assigned locations.",
      value: {
        route: {
          pathname,
          href: currentRouteHref(pathname),
          observed_at: new Date().toISOString(),
        },
        user: user
          ? {
              id: user.id,
              username: user.username,
              is_superuser: user.is_superuser,
              is_staff: user.is_staff,
              groups: user.groups_display,
              assigned_locations: user.assigned_locations,
            }
          : null,
        permissions: {
          count: permissionList.length,
          values: permissionList.slice(0, 40),
        },
        capabilities: {
          is_superuser: capabilities.isSuperuser,
          modules: capabilities.modules,
          inspection_stages: capabilities.inspectionStages,
        },
      },
    };
  }, [
    capabilities.inspectionStages,
    capabilities.isSuperuser,
    capabilities.modules,
    pathname,
    user,
  ]);

  useLayoutEffect(() => {
    readablesRef.current.set(systemContext.id, systemContext);
    schedulePush();
    return () => {
      readablesRef.current.delete(systemContext.id);
      schedulePush();
    };
  }, [schedulePush, systemContext]);

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      if (event.origin !== TRUSTED_ORIGIN) return;
      if (event.data?.source !== "ams-copilot-iframe") return;

      const post = (msg: Record<string, unknown>) => {
        (event.source as Window | null)?.postMessage(
          { source: "ams-copilot", ...msg },
          event.origin,
        );
      };

      if (event.data.type === "REQUEST_CONTEXT") {
        pushContextToIframe();
        return;
      }

      if (event.data.type === "ASSISTANT_MESSAGE") {
        const detail: CopilotAssistantMessageEvent = {
          messageId:
            typeof event.data.messageId === "string"
              ? event.data.messageId
              : undefined,
          text: typeof event.data.text === "string" ? event.data.text : "",
        };
        window.dispatchEvent(
          new CustomEvent<CopilotAssistantMessageEvent>(
            COPILOT_ASSISTANT_MESSAGE_EVENT,
            { detail },
          ),
        );
        return;
      }

      if (event.data.type === "HITL_INTERRUPT") {
        const interrupt = event.data.interrupt;
        if (
          interrupt &&
          typeof interrupt === "object" &&
          Array.isArray(interrupt.actionRequests)
        ) {
          window.dispatchEvent(
            new CustomEvent<CopilotHitlInterrupt>(
              COPILOT_HITL_INTERRUPT_EVENT,
              { detail: interrupt as CopilotHitlInterrupt },
            ),
          );
          trackActivity({
            kind: "approval_requested",
            actor: "assistant",
            title: "Assistant requested approval",
            details: {
              actionCount: interrupt.actionRequests.length,
            },
          });
        }
        return;
      }

      if (event.data.type === "HITL_INTERRUPT_CLEARED") {
        window.dispatchEvent(
          new CustomEvent<CopilotHitlInterrupt | null>(
            COPILOT_HITL_INTERRUPT_EVENT,
            { detail: null },
          ),
        );
        return;
      }

      if (event.data.type === "CALL_ACTION") {
        const { callId, name, args } = event.data;
        if (typeof name === "string") {
          trackActivity({
            kind: "frontend_action_requested",
            actor: "assistant",
            title: `Assistant requested ${name}`,
            details: { args },
          });
        }

        const action =
          typeof name === "string" ? actionsRef.current.get(name) : undefined;
        if (!action) {
          trackActivity({
            kind: "frontend_action_failed",
            actor: "system",
            title: `Unknown frontend action: ${String(name)}`,
            details: { name },
          });
          post({
            type: "ACTION_RESULT",
            callId,
            error: `Unknown action: ${name}`,
          });
          return;
        }

        if (!canRunAction(action)) {
          const access = getActionAccess(action);
          const message =
            access.blockedReason ??
            `Permission denied for frontend action: ${action.name}`;
          const deniedResult = {
            ok: false,
            errorType: "permission_denied",
            message,
            requiredPermissions: action.requiredPermissions ?? [],
            requiredCapabilities: action.requiredCapabilities ?? [],
          };
          trackActivity({
            kind: "frontend_action_denied",
            actor: "system",
            title: `Permission denied for ${action.name}`,
            result: deniedResult,
            details: { name: action.name },
          });
          post({
            type: "ACTION_RESULT",
            callId,
            result: deniedResult,
          });
          return;
        }

        try {
          const result = await action.handler(args ?? {});
          trackActivity({
            kind: "frontend_action_result",
            actor: "assistant",
            title: `Frontend action completed: ${action.name}`,
            result,
            details: { name: action.name },
          });
          post({ type: "ACTION_RESULT", callId, result: result ?? null });
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          trackActivity({
            kind: "frontend_action_failed",
            actor: "system",
            title: `Frontend action failed: ${action.name}`,
            result: { ok: false, message },
            details: { name: action.name },
          });
          post({ type: "ACTION_RESULT", callId, error: message });
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [canRunAction, getActionAccess, pushContextToIframe, trackActivity]);

  return (
    <CopilotContext.Provider
      value={{
        registerReadable,
        registerAction,
        setIframe,
        trackActivity,
        emitSupportNudge,
        sendVoiceCommand,
        sendHitlDecision,
      }}
    >
      {children}
    </CopilotContext.Provider>
  );
}

export function useCopilotInternal(): CopilotContextValue {
  const ctx = useContext(CopilotContext);
  if (!ctx) {
    throw new Error("useCopilot hooks must be used within <CopilotProvider>");
  }
  return ctx;
}

export function useCopilotActivity() {
  return useCopilotInternal().trackActivity;
}

export function useCopilotSupportNudge() {
  return useCopilotInternal().emitSupportNudge;
}

export function useCopilotVoiceCommand() {
  return useCopilotInternal().sendVoiceCommand;
}

export function useCopilotHitlDecision() {
  return useCopilotInternal().sendHitlDecision;
}
