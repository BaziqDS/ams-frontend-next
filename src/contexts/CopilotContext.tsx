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
import { isSameCopilotRoute, normalizeCopilotRoute } from "@/lib/copilotNavigation";
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
import {
  buildCopilotAppMap,
  COPILOT_APP_MAP_READABLE_ID,
} from "@/lib/copilotAppMap";
import {
  COPILOT_GET_APP_MAP_DESCRIPTION,
  COPILOT_NAVIGATE_ROUTE_PARAMETER_DESCRIPTION,
  COPILOT_NAVIGATE_TO_ROUTE_DESCRIPTION,
  COPILOT_OPEN_FORM_DESCRIPTION,
  COPILOT_OPEN_FORM_ID_PARAMETER_DESCRIPTION,
} from "@/lib/copilotActionCopy";
import {
  actionNeedsReadyBeforeExecution,
  actionNeedsReadyPageContext,
  buildCopilotInterruptionActionResult,
  getCopilotActionReadiness,
} from "@/lib/copilotActionReadiness";
import {
  getCopilotOpenFormContract,
  getCopilotOpenFormIds,
  routeMatchesCopilotPattern,
} from "@/lib/copilotModuleManifest";
import {
  getHitlAutoRejectReason,
  type HitlRejectionReason,
  type PendingCopilotHitl,
} from "@/lib/copilotHitlAutoResolve";

const TRUSTED_ORIGIN =
  process.env.NEXT_PUBLIC_COPILOT_URL?.replace(/\/$/, "") ??
  "http://localhost:3001";
const ACTIVITY_READABLE_ID = "__ams_activity_context";
const PERMISSION_READABLE_ID = "__ams_permission_context";
const ACTION_CONTEXT_READY_TIMEOUT_MS = 10000;
const SUPPORTED_OPEN_FORM_IDS = getCopilotOpenFormIds();

function currentRouteHref(pathname: string) {
  if (typeof window === "undefined") return pathname;
  return `${window.location.origin}${pathname}${window.location.search}${window.location.hash}`;
}

function isFailedActionResult(result: unknown) {
  return (
    Boolean(result) &&
    typeof result === "object" &&
    !Array.isArray(result) &&
    (result as { ok?: unknown }).ok === false
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function successfulSubmitRedirect(result: unknown) {
  if (!isRecord(result) || result.ok !== true) return null;
  return typeof result.redirectTo === "string" && result.redirectTo.trim()
    ? result.redirectTo
    : null;
}

function runtimePathname(readables: Readable[]) {
  const runtime = readables.find(
    readable => readable.id === "__ams_runtime_context",
  );
  if (!isRecord(runtime?.value)) return null;

  const route = runtime.value.route;
  if (typeof route === "string") return route;
  if (isRecord(route) && typeof route.pathname === "string") {
    return route.pathname;
  }
  return null;
}

function submitRedirectTarget(
  name: string,
  result: unknown,
  readables: Readable[],
) {
  if (name !== "request_form_submit") return null;
  const redirectTo = successfulSubmitRedirect(result);
  if (!redirectTo) return null;

  const currentRoute = runtimePathname(readables);
  return currentRoute === null || isSameCopilotRoute(currentRoute, redirectTo)
    ? null
    : redirectTo;
}

function submitRedirectReadiness(
  name: string,
  result: unknown,
  readables: Readable[],
) {
  if (name !== "request_form_submit") return null;

  const redirectTo = successfulSubmitRedirect(result);
  if (!redirectTo) return null;

  const currentRoute = runtimePathname(readables);
  return {
    ready: currentRoute !== null && isSameCopilotRoute(currentRoute, redirectTo),
    summary: {
      currentRoute,
      redirectTo,
      routeMatchesRedirect:
        currentRoute !== null && isSameCopilotRoute(currentRoute, redirectTo),
    },
  };
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
  parameters: Record<string, Record<string, unknown>>;
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
  getContextSnapshot: () => {
    readables: Readable[];
    actions: ActionDef[];
    contextVersion: number;
    contextObservedAt: string;
  };
  trackActivity: (event: CopilotActivityEventInput) => CopilotActivityEvent;
  sendVoiceCommand: (text: string) => CopilotVoiceCommand;
  sendHitlDecision: (
    decision: "approve" | "reject",
    reason?: HitlRejectionReason,
  ) => boolean;
};

type ActionResultPost = (msg: Record<string, unknown>) => void;

type PendingActionResult = {
  callId: unknown;
  name: string;
  args: unknown;
  result: unknown;
  post: ActionResultPost;
  timeoutId: ReturnType<typeof setTimeout>;
  actionStartedAt: string;
};

type PendingActionExecution = {
  callId: unknown;
  name: string;
  args: unknown;
  post: ActionResultPost;
  timeoutId: ReturnType<typeof setTimeout>;
  actionStartedAt: string;
};

type PostActionResultWhenContextReadyArgs = {
  callId: unknown;
  name: string;
  args: unknown;
  result: unknown;
  post: ActionResultPost;
  actionStartedAt: string;
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
export const COPILOT_START_VOICE_EVENT = "ams-copilot-start-voice";

const CopilotContext = createContext<CopilotContextValue | null>(null);

function findActiveFormIdInReadables(
  readables: Map<string, Readable>,
): string | null {
  for (const readable of readables.values()) {
    const value = readable.value;
    if (!value || typeof value !== "object") continue;
    const activeForm = (value as Record<string, unknown>).activeForm;
    if (activeForm && typeof activeForm === "object") {
      const formId = (activeForm as Record<string, unknown>).formId;
      if (typeof formId === "string" && formId.trim()) return formId;
    }
  }
  return null;
}

function readableHasActiveForm(readable: Readable): boolean {
  const value = readable.value;
  if (!value || typeof value !== "object") return false;
  const activeForm = (value as Record<string, unknown>).activeForm;
  return Boolean(activeForm && typeof activeForm === "object");
}

function prioritizeActiveFormReadables(readables: Readable[]): Readable[] {
  const activeForms = readables.filter(readableHasActiveForm);
  if (activeForms.length === 0) return readables;

  const rest = readables.filter(readable => !readableHasActiveForm(readable));
  return [...activeForms, ...rest];
}

function extractHitlTargetFormId(
  interrupt: CopilotHitlInterrupt,
): string | null {
  for (const request of interrupt.actionRequests) {
    if (request.name !== "request_form_submit") continue;
    const args = request.args as Record<string, unknown> | undefined;
    const formId = args?.formId ?? args?.form_id;
    if (typeof formId === "string" && formId.trim()) return formId;
  }
  return null;
}

function hasFormSubmitHitlRequest(interrupt: CopilotHitlInterrupt): boolean {
  return interrupt.actionRequests.some(
    request => request.name === "request_form_submit",
  );
}

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
  const pendingVoiceCommandsRef = useRef<CopilotVoiceCommand[]>([]);
  const pendingActionResultsRef = useRef<PendingActionResult[]>([]);
  const pendingActionExecutionsRef = useRef<PendingActionExecution[]>([]);
  const pendingHitlRef = useRef<PendingCopilotHitl | null>(null);
  const trackActivityRef =
    useRef<((input: CopilotActivityEventInput) => CopilotActivityEvent) | null>(
      null,
    );
  const postActionResultWhenContextReadyRef =
    useRef<((args: PostActionResultWhenContextReadyArgs) => void) | null>(null);
  const contextVersionRef = useRef(0);

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

  const buildContextPayload = useCallback(() => {
    const readables = prioritizeActiveFormReadables(
      filterCopilotReadablesForRoute(
        Array.from(readablesRef.current.values()),
        pathname,
      ),
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

    contextVersionRef.current += 1;
    return {
      readables,
      actions,
      contextVersion: contextVersionRef.current,
      contextObservedAt: new Date().toISOString(),
    };
  }, [getActionAccess, pathname]);

  const postContextNotReadyResult = useCallback(
    ({
      callId,
      name,
      args,
      result,
      post,
      readables,
    }: {
      callId: unknown;
      name: string;
      args: unknown;
      result?: unknown;
      post: ActionResultPost;
      readables: Readable[];
    }) => {
      const latestReadiness = getCopilotActionReadiness(
        name,
        args,
        readables,
      );
      const actionRegistered = actionsRef.current.has(name);
      post({
        type: "ACTION_RESULT",
        callId,
        result: {
          ok: false,
          errorType: "context_not_ready",
          message:
            `Page context was not ready after frontend action "${name}". ` +
            `Expected ${latestReadiness.requirement ?? `registered frontend action "${name}"`} before resuming the agent.`,
          actionRegistered,
          actionResult: result ?? null,
          contextReady: false,
          contextSummary: latestReadiness.summary ?? {},
        },
      });
    },
    [],
  );

  const postPermissionDeniedResult = useCallback(
    ({
      action,
      callId,
      post,
    }: {
      action: CopilotAction;
      callId: unknown;
      post: ActionResultPost;
    }) => {
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
      trackActivityRef.current?.({
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
    },
    [getActionAccess],
  );

  const executeActionRequest = useCallback(
    async ({
      callId,
      name,
      args,
      post,
    }: {
      callId: unknown;
      name: string;
      args: unknown;
      post: ActionResultPost;
    }) => {
      const action = actionsRef.current.get(name);
      if (!action) return false;

      if (!canRunAction(action)) {
        postPermissionDeniedResult({ action, callId, post });
        return true;
      }

      const payload = buildContextPayload();
      const readiness = getCopilotActionReadiness(name, args, payload.readables);
      if (actionNeedsReadyBeforeExecution(name) && !readiness.ready) {
        const interruptedResult = buildCopilotInterruptionActionResult(readiness);
        if (interruptedResult) {
          post({
            type: "ACTION_RESULT",
            callId,
            result: interruptedResult,
          });
          return true;
        }
        return false;
      }

      try {
        const actionStartedAt = new Date().toISOString();
        const result = await action.handler(args ?? {});
        trackActivityRef.current?.({
          kind: "frontend_action_result",
          actor: "assistant",
          title: `Frontend action completed: ${action.name}`,
          result,
          details: { name: action.name },
        });
        const postWhenReady = postActionResultWhenContextReadyRef.current;
        if (!postWhenReady) {
          post({ type: "ACTION_RESULT", callId, result: result ?? null });
          return true;
        }
        postWhenReady({
          callId,
          name: action.name,
          args: args ?? {},
          result: result ?? null,
          post,
          actionStartedAt,
        });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : String(error);
        trackActivityRef.current?.({
          kind: "frontend_action_failed",
          actor: "system",
          title: `Frontend action failed: ${action.name}`,
          result: { ok: false, message },
          details: { name: action.name },
        });
        post({ type: "ACTION_RESULT", callId, error: message });
      }

      return true;
    },
    [
      buildContextPayload,
      canRunAction,
      postPermissionDeniedResult,
    ],
  );

  const flushReadyActionExecutions = useCallback((readables: Readable[]) => {
    if (pendingActionExecutionsRef.current.length === 0) return;

    const stillPending: PendingActionExecution[] = [];
    for (const pending of pendingActionExecutionsRef.current) {
      const action = actionsRef.current.get(pending.name);
      const readiness = getCopilotActionReadiness(
        pending.name,
        pending.args,
        readables,
      );
      const interruptedResult = buildCopilotInterruptionActionResult(readiness, null, {
        occurredAfter: pending.actionStartedAt,
      });
      if (interruptedResult) {
        clearTimeout(pending.timeoutId);
        pending.post({
          type: "ACTION_RESULT",
          callId: pending.callId,
          result: interruptedResult,
        });
        continue;
      }
      if (!action || !readiness.ready) {
        stillPending.push(pending);
        continue;
      }

      clearTimeout(pending.timeoutId);
      void executeActionRequest(pending);
    }

    pendingActionExecutionsRef.current = stillPending;
  }, [executeActionRequest]);

  const flushReadyActionResults = useCallback((readables: Readable[]) => {
    if (pendingActionResultsRef.current.length === 0) return;

    const stillPending: PendingActionResult[] = [];
    for (const pending of pendingActionResultsRef.current) {
      const postSubmitReadiness = submitRedirectReadiness(
        pending.name,
        pending.result,
        readables,
      );
      const readiness = postSubmitReadiness ?? getCopilotActionReadiness(
          pending.name,
          pending.args,
          readables,
        );
      const interruptedResult = buildCopilotInterruptionActionResult(
        readiness,
        pending.result,
        { occurredAfter: pending.actionStartedAt },
      );
      if (interruptedResult) {
        clearTimeout(pending.timeoutId);
        pending.post({
          type: "ACTION_RESULT",
          callId: pending.callId,
          result: interruptedResult,
        });
        continue;
      }
      if (!readiness.ready) {
        stillPending.push(pending);
        continue;
      }

      clearTimeout(pending.timeoutId);
      pending.post({
        type: "ACTION_RESULT",
        callId: pending.callId,
        result: {
          ...(typeof pending.result === "object" &&
          pending.result !== null &&
          !Array.isArray(pending.result)
            ? pending.result
            : { value: pending.result }),
          contextReady: true,
          contextSummary: readiness.summary ?? {},
        },
      });
    }

    pendingActionResultsRef.current = stillPending;
  }, []);

  const pushContextToIframe = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;

    const payload = buildContextPayload();
    flushReadyActionExecutions(payload.readables);
    flushReadyActionResults(payload.readables);
    iframe.contentWindow.postMessage(
      {
        source: "ams-copilot",
        type: "CONTEXT_UPDATE",
        ...payload,
      },
      TRUSTED_ORIGIN,
    );
  }, [buildContextPayload, flushReadyActionExecutions, flushReadyActionResults]);

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

  const buildAppMapSnapshot = useCallback(
    (observedAt = new Date().toISOString()) =>
      buildCopilotAppMap({
        currentRoute: pathname,
        observedAt,
        canAccess: (capability) =>
          capabilities.can(capability.module, capability.level),
      }),
    [capabilities, pathname],
  );

  const publishAppMapSnapshot = useCallback(() => {
    readablesRef.current.set(COPILOT_APP_MAP_READABLE_ID, {
      id: COPILOT_APP_MAP_READABLE_ID,
      description:
        "AMS app map: machine-readable module, route, create-form, and capability catalog. Use this before guessing routes or form ids. It does not contain writable form fields; use activeForm after opening a form.",
      value: buildAppMapSnapshot(),
    });
    schedulePush();
  }, [buildAppMapSnapshot, schedulePush]);

  const publishActivitySnapshot = useCallback(() => {
    readablesRef.current.set(ACTIVITY_READABLE_ID, {
      id: ACTIVITY_READABLE_ID,
      description:
        "Compact AMS activity memory: recent business events, active form, last user edit, and last submit result. This is intentionally summarized; do not assume it contains every historical action.",
      value: buildCopilotActivitySnapshot(activityEventsRef.current, {
        currentRoute: pathname,
        recentLimit: 40,
      }),
    });
    schedulePush();
  }, [pathname, schedulePush]);

  const postHitlDecision = useCallback((
    decision: "approve" | "reject",
    reason?: HitlRejectionReason,
  ) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return false;

    iframe.contentWindow.postMessage(
      {
        source: "ams-copilot",
        type: "HITL_DECISION",
        decision,
        ...(decision === "reject" && reason ? { reason } : {}),
      },
      TRUSTED_ORIGIN,
    );
    return true;
  }, []);

  const trackActivity = useCallback(
    (input: CopilotActivityEventInput) => {
      const event = createCopilotActivityEvent({
        route: input.route ?? pathname,
        ...input,
      });
      let nextEvents = appendCopilotActivity(activityEventsRef.current, event, 500);
      const autoRejectReason = getHitlAutoRejectReason({
        pending: pendingHitlRef.current,
        event,
        currentRoute: pathname,
      });
      if (autoRejectReason && postHitlDecision("reject", autoRejectReason)) {
        const pending = pendingHitlRef.current;
        pendingHitlRef.current = null;
        nextEvents = appendCopilotActivity(
          nextEvents,
          createCopilotActivityEvent({
            kind: "approval_decision",
            actor: "system",
            title: "Auto-rejected stale assistant approval",
            route: event.route ?? pathname,
            details: {
              decision: "reject",
              reason: autoRejectReason,
              triggerKind: event.kind,
              triggerFormId: event.formId,
              pendingFormId: pending?.formId ?? null,
            },
          }),
          500,
        );
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent<CopilotHitlInterrupt | null>(
              COPILOT_HITL_INTERRUPT_EVENT,
              { detail: null },
            ),
          );
        }
      }
      activityEventsRef.current = nextEvents;
      readablesRef.current.set(ACTIVITY_READABLE_ID, {
        id: ACTIVITY_READABLE_ID,
        description:
          "Compact AMS activity memory: recent business events, active form, last user edit, and last submit result. This is intentionally summarized; do not assume it contains every historical action.",
        value: buildCopilotActivitySnapshot(activityEventsRef.current, {
          currentRoute: pathname,
          recentLimit: 40,
        }),
      });
      schedulePush();
      return event;
    },
    [pathname, postHitlDecision, schedulePush],
  );
  trackActivityRef.current = trackActivity;

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

  const sendHitlDecision = useCallback((
    decision: "approve" | "reject",
    reason?: HitlRejectionReason,
  ) => {
    if (!postHitlDecision(decision, reason)) return false;
    pendingHitlRef.current = null;

    trackActivity({
      kind: "approval_decision",
      actor: "user",
      title: `User ${decision === "approve" ? "approved" : "rejected"} assistant action`,
      details: {
        decision,
        ...(reason ? { reason } : {}),
      },
    });

    return true;
  }, [postHitlDecision, trackActivity]);

  const postActionResultWhenContextReady = useCallback(
    ({
      callId,
      name,
      args,
      result,
      post,
      actionStartedAt,
    }: {
      callId: unknown;
      name: string;
      args: unknown;
      result: unknown;
      post: ActionResultPost;
      actionStartedAt: string;
    }) => {
      const payload = buildContextPayload();
      const redirectTarget = submitRedirectTarget(
        name,
        result,
        payload.readables,
      );
      if (redirectTarget) router.push(redirectTarget);

      const postSubmitReadiness = submitRedirectReadiness(
        name,
        result,
        payload.readables,
      );
      if (
        (!postSubmitReadiness && !actionNeedsReadyPageContext(name)) ||
        isFailedActionResult(result)
      ) {
        post({ type: "ACTION_RESULT", callId, result: result ?? null });
        return;
      }

      const readiness = postSubmitReadiness ?? getCopilotActionReadiness(
        name,
        args,
        payload.readables,
      );
      const interruptedResult = buildCopilotInterruptionActionResult(
        readiness,
        result,
        { occurredAfter: actionStartedAt },
      );
      if (interruptedResult) {
        post({ type: "ACTION_RESULT", callId, result: interruptedResult });
        return;
      }
      if (readiness.ready) {
        post({
          type: "ACTION_RESULT",
          callId,
          result: {
            ...(typeof result === "object" &&
            result !== null &&
            !Array.isArray(result)
              ? result
              : { value: result }),
            contextReady: true,
            contextSummary: readiness.summary ?? {},
          },
        });
        return;
      }

      const pending: PendingActionResult = {
        callId,
        name,
        args,
        result,
        post,
        actionStartedAt,
        timeoutId: setTimeout(() => {
          pendingActionResultsRef.current =
            pendingActionResultsRef.current.filter((item) => item !== pending);
          const latest = buildContextPayload();
          postContextNotReadyResult({
            callId,
            name,
            args,
            result,
            post,
            readables: latest.readables,
          });
        }, ACTION_CONTEXT_READY_TIMEOUT_MS),
      };

      pendingActionResultsRef.current.push(pending);
      pushContextToIframe();
    },
    [buildContextPayload, postContextNotReadyResult, pushContextToIframe, router],
  );
  postActionResultWhenContextReadyRef.current = postActionResultWhenContextReady;

  const queueActionExecutionUntilReady = useCallback(
    ({
      callId,
      name,
      args,
      post,
    }: {
      callId: unknown;
      name: string;
      args: unknown;
      post: ActionResultPost;
    }) => {
      const pending: PendingActionExecution = {
        callId,
        name,
        args,
        post,
        actionStartedAt: new Date().toISOString(),
        timeoutId: setTimeout(() => {
          pendingActionExecutionsRef.current =
            pendingActionExecutionsRef.current.filter((item) => item !== pending);
          const latest = buildContextPayload();
          postContextNotReadyResult({
            callId,
            name,
            args,
            post,
            readables: latest.readables,
          });
        }, ACTION_CONTEXT_READY_TIMEOUT_MS),
      };

      pendingActionExecutionsRef.current.push(pending);
      pushContextToIframe();
    },
    [buildContextPayload, postContextNotReadyResult, pushContextToIframe],
  );

  useLayoutEffect(() => {
    publishAppMapSnapshot();
    return () => {
      readablesRef.current.delete(COPILOT_APP_MAP_READABLE_ID);
      schedulePush();
    };
  }, [publishAppMapSnapshot, schedulePush]);

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
    return () => {
      for (const pending of pendingActionResultsRef.current) {
        clearTimeout(pending.timeoutId);
      }
      pendingActionResultsRef.current = [];
      for (const pending of pendingActionExecutionsRef.current) {
        clearTimeout(pending.timeoutId);
      }
      pendingActionExecutionsRef.current = [];
    };
  }, []);

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
      name: "get_app_map",
      description: COPILOT_GET_APP_MAP_DESCRIPTION,
      parameters: {},
      handler: () => ({
        ok: true,
        appMap: buildAppMapSnapshot(),
      }),
    });
  }, [buildAppMapSnapshot, registerAction]);

  useEffect(() => {
    return registerAction({
      name: "navigate_to_route",
      description: COPILOT_NAVIGATE_TO_ROUTE_DESCRIPTION,
      parameters: {
        path: {
          type: "string",
          description: COPILOT_NAVIGATE_ROUTE_PARAMETER_DESCRIPTION,
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
              "Invalid AMS route. Pass a relative path starting with '/' under the arg key 'path'. Call get_app_map if you need route options.",
            received: args,
          };
        }
        if (isSameCopilotRoute(pathname, route)) {
          return {
            ok: false,
            errorType: "duplicate_navigation",
            message:
              `Already on ${route}. Use the current page context, active form, or same-page actions instead of navigating again.`,
            route,
          };
        }
        router.push(route);
        return { ok: true, route };
      },
    });
  }, [pathname, registerAction, router]);

  // Registry-backed form opener. Module contracts live in
  // copilotModuleManifest so new modules can reuse the same route/open flow.
  useEffect(() => {
    return registerAction({
      name: "open_form",
      description: COPILOT_OPEN_FORM_DESCRIPTION,
      parameters: {
        form_id: {
          type: "string",
          description: COPILOT_OPEN_FORM_ID_PARAMETER_DESCRIPTION,
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
              "open_form requires a 'form_id' string. Call get_app_map to discover supported form ids.",
            supportedFormIds: SUPPORTED_OPEN_FORM_IDS,
            received: args,
          };
        }

        const target = getCopilotOpenFormContract(formId);
        if (!target) {
          return {
            ok: false,
            errorType: "unknown_form_id",
            message:
              `Unknown form_id "${formId}". Call get_app_map to discover supported form ids and scoped route rules.`,
            supportedFormIds: SUPPORTED_OPEN_FORM_IDS,
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

        if (target.samePageOnly) {
          const routeMatches = routeMatchesCopilotPattern(
            pathname,
            target.routePattern,
          );
          if (!routeMatches) {
            return {
              ok: false,
              errorType: "wrong_route_for_scoped_form",
              message:
                `${formId} is scoped to ${target.routePattern}. Navigate to the parent detail page first, ` +
                "then call open_form again.",
              expectedRoutePattern: target.routePattern,
              currentRoute: pathname,
            };
          }
          dispatchSamePageOpen(formId);
          return { ok: true, opened: true, scoped: true };
        }

        if (!target.route) {
          return {
            ok: false,
            errorType: "missing_form_route",
            message: `Form ${formId} does not define a cross-page route.`,
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
          setTimeout(flushPendingVoiceCommands, 300);
        };
        element.addEventListener("load", handleLoad);
        iframeLoadCleanupRef.current = () => {
          element.removeEventListener("load", handleLoad);
        };
        if (element.contentWindow) {
          setTimeout(pushContextToIframe, 250);
          setTimeout(flushPendingVoiceCommands, 300);
        }
      }
    },
    [flushPendingVoiceCommands, pushContextToIframe],
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

      if (event.data.type === "START_VOICE_CAPTURE") {
        window.dispatchEvent(new Event(COPILOT_START_VOICE_EVENT));
        return;
      }

      if (event.data.type === "OPEN_OPENUI_PREVIEW") {
        return;
      }

      if (event.data.type === "HITL_INTERRUPT") {
        const interrupt = event.data.interrupt;
        if (
          interrupt &&
          typeof interrupt === "object" &&
          Array.isArray(interrupt.actionRequests)
        ) {
          const typedInterrupt = interrupt as CopilotHitlInterrupt;
          pendingHitlRef.current = hasFormSubmitHitlRequest(typedInterrupt)
            ? {
                formId:
                  extractHitlTargetFormId(typedInterrupt) ??
                  findActiveFormIdInReadables(readablesRef.current),
                route: pathname,
                at: Date.now(),
              }
            : null;
          window.dispatchEvent(
            new CustomEvent<CopilotHitlInterrupt>(
              COPILOT_HITL_INTERRUPT_EVENT,
              { detail: typedInterrupt },
            ),
          );
          trackActivity({
            kind: "approval_requested",
            actor: "assistant",
            title: "Assistant requested approval",
            details: {
              actionCount: typedInterrupt.actionRequests.length,
              targetFormId: pendingHitlRef.current?.formId ?? null,
            },
          });
        }
        return;
      }

      if (event.data.type === "HITL_INTERRUPT_CLEARED") {
        pendingHitlRef.current = null;
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

        if (typeof name !== "string") {
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

        const ran = await executeActionRequest({
          callId,
          name,
          args: args ?? {},
          post,
        });
        if (ran) return;

        if (actionNeedsReadyPageContext(name)) {
          queueActionExecutionUntilReady({
            callId,
            name,
            args: args ?? {},
            post,
          });
          return;
        }

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
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [
    executeActionRequest,
    pathname,
    queueActionExecutionUntilReady,
    trackActivity,
  ]);

  return (
    <CopilotContext.Provider
      value={{
        registerReadable,
        registerAction,
        setIframe,
        getContextSnapshot: buildContextPayload,
        trackActivity,
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

export function useCopilotVoiceCommand() {
  return useCopilotInternal().sendVoiceCommand;
}

export function useCopilotHitlDecision() {
  return useCopilotInternal().sendHitlDecision;
}
