"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type CSSProperties,
} from "react";
import {
  ArrowUpIcon,
  Check,
  Clock3,
  LoaderCircle,
  MessageCircle,
  Mic,
  Maximize2,
  SquarePen,
  UserRound,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  COPILOT_HITL_INTERRUPT_EVENT,
  type CopilotHitlInterrupt,
  useCopilotInternal,
} from "@/contexts/CopilotContext";
import { CopilotOpenUiPreviewModal } from "@/components/CopilotOpenUiPreviewModal";
import { buildDetachedApprovalReview } from "@/lib/copilotDetachedApproval";
// TEMP: translation disabled in submitQuickMessage to test raw Urdu/English
// mix against the model. Restore this import when re-enabling translation.
// import { translateText } from "@/lib/voiceTranslate";
import { useAuth } from "@/contexts/AuthContext";
import { useNotifications } from "@/contexts/NotificationsContext";
import {
  notificationBus,
  useNotificationBusIngest,
} from "@/lib/notificationBus";
import {
  EMPTY_HISTORY,
  decideProactiveAction,
  recordProactiveFire,
  type CopilotProactiveState,
  type ProactiveHistory,
} from "@/lib/proactiveAgentDispatcher";
import { useProactiveSnooze } from "@/lib/proactiveSnooze";
import type { TypedNotificationEvent } from "@/lib/notificationEvents";

const CHAT_URL = process.env.NEXT_PUBLIC_COPILOT_URL ?? "http://localhost:3001";
const CHAT_ORIGIN = CHAT_URL.replace(/\/$/, "");
const DOCK_STORAGE_KEY = "ams-copilot-open";
const DOCK_POS_KEY = "ams-copilot-pos";
const DETACHED_PENDING_KEY = "ams-copilot-detached-pending";
const VOICE_REPLIES_KEY = "ams-copilot-voice-replies";
const DOCK_DRAG_MARGIN = 8;
const DOCK_DEFAULT_MAX_WIDTH_REM = 32.5;
const DOCK_MOBILE_MAX_WIDTH_REM = 26.25;
const DOCK_MOBILE_BREAKPOINT_REM = 45;
const DOCK_WIDTH_VIEWPORT_GUTTER_REM = 3;
const DOCK_DRAGGED_HEIGHT_GUTTER_REM = 4.75;
const DETACHED_PENDING_TTL_MS = 10 * 60 * 1000;
// After the user clicks stop, ignore any straggler ASSISTANT_LOADING=true /
// HUMAN_MESSAGE events from the iframe for this many milliseconds. The
// langgraph stream may emit one last "loading" tick while winding down, and
// without this guard the parent re-locks the composer immediately after stop.
const STOP_GUARD_MS = 2000;
// Safety net: if the parent thinks the agent is still running but no events
// arrive for this long, auto-unlock the composer. Prevents the textarea from
// being permanently stuck if a postMessage is missed. Pending now covers the
// WHOLE run (it is no longer dropped on the first streamed token), so this
// window must survive quiet stretches between iframe events — each
// ASSISTANT_MESSAGE / TODO_STATE event re-arms it as an activity heartbeat.
const PENDING_SAFETY_TIMEOUT_MS = 120 * 1000;
const VOICE_AUDIO_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    channelCount: { ideal: 1 },
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: false,
    sampleRate: { ideal: 48000 },
    sampleSize: { ideal: 16 },
  },
};
const DEFAULT_AUDIO_DEVICE_ID = "default";

type AudioInputDevice = {
  deviceId: string;
  label: string;
};

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionResultEventLike = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      length: number;
      [index: number]: { transcript: string };
    };
  };
};

type SpeechRecognitionWindow = typeof window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

function buildVoiceAudioConstraints(deviceId: string): MediaStreamConstraints {
  const audio =
    typeof VOICE_AUDIO_CONSTRAINTS.audio === "object"
      ? { ...VOICE_AUDIO_CONSTRAINTS.audio }
      : {};
  return {
    audio: {
      ...audio,
      ...(deviceId && deviceId !== DEFAULT_AUDIO_DEVICE_ID
        ? { deviceId: { exact: deviceId } }
        : {}),
    },
  };
}

function normalizeUrduVoicePreview(text: string): string {
  return text
    .replace(/\binspections?\b/gi, "انسپیکشن")
    .replace(/\bitems?\b/gi, "آئٹم")
    .replace(/\blocations?\b/gi, "لوکیشن")
    .replace(/\bstores?\b/gi, "اسٹور")
    .replace(/\bstock\b/gi, "اسٹاک")
    .replace(/\bentries\b/gi, "انٹریز")
    .replace(/\bentry\b/gi, "انٹری")
    .replace(/\bregisters?\b/gi, "رجسٹر")
    .replace(/\bcategories?\b/gi, "کیٹیگری")
    .replace(/\bserials?\b/gi, "سیریل")
    .replace(/\bnumbers?\b/gi, "نمبر")
    .replace(/\bapproval\b/gi, "اپروول")
    .replace(/\bapprove\b/gi, "اپروو")
    .replace(/\breject\b/gi, "ریجیکٹ")
    .replace(/\bfinance\b/gi, "فنانس")
    .replace(/\bmaintenance\b/gi, "مینٹیننس")
    .replace(/\bemployee\b/gi, "ایمپلائی")
    .replace(/\bemployees\b/gi, "ایمپلائز")
    .replace(/\bdepartment\b/gi, "ڈیپارٹمنٹ")
    .replace(/\bdepartments\b/gi, "ڈیپارٹمنٹس")
    .replace(/\bCSIT\b/g, "سی ایس آئی ٹی")
    .replace(/\bAMS\b/g, "اے ایم ایس");
}

const PLACEHOLDER_PHRASES = [
  "Ask about inspections...",
  "Search stock entries...",
  "Find items by category...",
  "Check maintenance schedules...",
  "Ask about locations...",
  "Ask AMS anything...",
];

type Pos = { left: number; top: number };
type DockSize = { width: number; height: number };
type DetachedTodo = { content?: unknown; status?: unknown } | null;
type DetachedPending = { text: string; at: number } | null;
type ApprovalContextSnapshot = {
  readables?: Array<{ id?: string; description?: string; value?: unknown }>;
};

function getRootRemPx(): number {
  if (typeof window === "undefined") return 16;
  const value = Number.parseFloat(
    window.getComputedStyle(document.documentElement).fontSize,
  );
  return Number.isFinite(value) && value > 0 ? value : 16;
}

function clampValue(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function readStoredPos(value: unknown): Pos | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("left" in value) ||
    !("top" in value)
  ) {
    return null;
  }

  const left = Number(value.left);
  const top = Number(value.top);
  if (!Number.isFinite(left) || !Number.isFinite(top)) return null;
  return { left, top };
}

function estimateDockSize(): DockSize {
  const rem = getRootRemPx();
  const mobileWidthQuery = `(max-width: ${DOCK_MOBILE_BREAKPOINT_REM}rem)`;
  const maxWidthRem =
    window.matchMedia(mobileWidthQuery).matches
      ? DOCK_MOBILE_MAX_WIDTH_REM
      : DOCK_DEFAULT_MAX_WIDTH_REM;

  return {
    width: Math.min(
      maxWidthRem * rem,
      Math.max(
        DOCK_DRAG_MARGIN * 2,
        window.innerWidth - DOCK_WIDTH_VIEWPORT_GUTTER_REM * rem,
      ),
    ),
    height: Math.max(
      DOCK_DRAG_MARGIN * 2,
      window.innerHeight - DOCK_DRAGGED_HEIGHT_GUTTER_REM * rem,
    ),
  };
}

function clampDockPos(pos: Pos, size = estimateDockSize()): Pos {
  const maxLeft = Math.max(
    DOCK_DRAG_MARGIN,
    window.innerWidth - size.width - DOCK_DRAG_MARGIN,
  );
  const maxTop = Math.max(
    DOCK_DRAG_MARGIN,
    window.innerHeight - size.height - DOCK_DRAG_MARGIN,
  );

  return {
    left: clampValue(pos.left, DOCK_DRAG_MARGIN, maxLeft),
    top: clampValue(pos.top, DOCK_DRAG_MARGIN, maxTop),
  };
}

function saveDockPos(pos: Pos) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DOCK_POS_KEY, JSON.stringify(pos));
}

function loadPos(): Pos | null {
  if (typeof window === "undefined") return null;
  try {
    const pos = readStoredPos(
      JSON.parse(window.localStorage.getItem(DOCK_POS_KEY) ?? "null"),
    );
    return pos ? clampDockPos(pos) : null;
  } catch {
    return null;
  }
}

function loadDetachedPending(): DetachedPending {
  if (typeof window === "undefined") return null;
  try {
    const value = JSON.parse(
      window.localStorage.getItem(DETACHED_PENDING_KEY) ?? "null",
    ) as { text?: unknown; at?: unknown } | null;
    if (
      !value ||
      typeof value.text !== "string" ||
      !value.text.trim() ||
      typeof value.at !== "number" ||
      Date.now() - value.at > DETACHED_PENDING_TTL_MS
    ) {
      window.localStorage.removeItem(DETACHED_PENDING_KEY);
      return null;
    }
    return { text: value.text, at: value.at };
  } catch {
    window.localStorage.removeItem(DETACHED_PENDING_KEY);
    return null;
  }
}

function saveDetachedPending(text: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    DETACHED_PENDING_KEY,
    JSON.stringify({ text, at: Date.now() }),
  );
}

function clearDetachedPending() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(DETACHED_PENDING_KEY);
}

export function CopilotSidePanel() {
  const restoredPendingRef = useRef<DetachedPending>(loadDetachedPending());
  const [isOpen, setIsOpen] = useState(
    () =>
      typeof window !== "undefined" &&
      window.localStorage.getItem(DOCK_STORAGE_KEY) === "true",
  );
  const [quickMessage, setQuickMessage] = useState(
    () => restoredPendingRef.current?.text ?? "",
  );
  const [quickMessagePending, setQuickMessagePending] = useState(() =>
    Boolean(restoredPendingRef.current),
  );
  const [currentTodo, setCurrentTodo] = useState<DetachedTodo>(null);
  const [approvalInterrupt, setApprovalInterrupt] =
    useState<CopilotHitlInterrupt | null>(null);
  const [approvalBusy, setApprovalBusy] = useState<"approve" | "reject" | null>(
    null,
  );
  const [approvalReviewContext, setApprovalReviewContext] =
    useState<ApprovalContextSnapshot | null>(null);
  const [approvalRequestedAt, setApprovalRequestedAt] = useState<Date | null>(
    null,
  );
  const [hideToolCalls, setHideToolCalls] = useState(false);
  const [placeholder, setPlaceholder] = useState(PLACEHOLDER_PHRASES[0]);
  const [dragPos, setDragPos] = useState<Pos | null>(loadPos);
  const [isDragging, setIsDragging] = useState(false);
  const [openUiPreview, setOpenUiPreview] = useState<{
    id: string;
    code: string;
    isStreaming: boolean;
  } | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const composerFormRef = useRef<HTMLFormElement>(null);
  const searchTextareaRef = useRef<HTMLTextAreaElement>(null);
  const loadingStartedRef = useRef(false);
  const iframeReadyRef = useRef(false);
  const queuedQuickMessageRef = useRef<string | null>(null);
  const restoredPendingSentRef = useRef(false);
  // Timestamp (ms) until which incoming "loading=true" / HUMAN_MESSAGE events
  // are treated as stragglers from a just-stopped run and ignored.
  const stopGuardUntilRef = useRef(0);
  // Safety timer that auto-clears a stuck pending state.
  const pendingSafetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  // The text the user last sent. The composer keeps showing this text while
  // the agent runs (visual receipt that "I sent this"), and auto-clears it
  // only when the run truly completes — and only if the user has NOT edited
  // the input in the meantime (we never want to clobber a new draft).
  const lastSubmittedTextRef = useRef<string | null>(null);
  const userEditedSinceSubmitRef = useRef(false);
  const { setIframe, getContextSnapshot, sendHitlDecision } =
    useCopilotInternal();

  const showApprovalInterrupt = useCallback(
    (interrupt: CopilotHitlInterrupt | null) => {
      setApprovalInterrupt(interrupt);
      setApprovalReviewContext(interrupt ? getContextSnapshot() : null);
      setApprovalRequestedAt(interrupt ? new Date() : null);
      setApprovalBusy(null);
    },
    [getContextSnapshot],
  );

  // Centralized setter for quickMessagePending that also arms / disarms the
  // safety timeout. Use this everywhere instead of setQuickMessagePending so
  // the composer can never get permanently locked if a postMessage is missed.
  const setPendingWithSafety = useCallback((next: boolean) => {
    setQuickMessagePending(next);
    if (pendingSafetyTimerRef.current) {
      clearTimeout(pendingSafetyTimerRef.current);
      pendingSafetyTimerRef.current = null;
    }
    if (next) {
      pendingSafetyTimerRef.current = setTimeout(() => {
        // Timed out — assume the iframe missed sending a "done" event.
        // Unlock the composer so the user can keep working.
        loadingStartedRef.current = false;
        clearDetachedPending();
        setQuickMessagePending(false);
        pendingSafetyTimerRef.current = null;
        if (typeof console !== "undefined") {
          console.warn(
            "[CopilotSidePanel] auto-clearing stuck pending state after %sms with no iframe activity",
            PENDING_SAFETY_TIMEOUT_MS,
          );
        }
      }, PENDING_SAFETY_TIMEOUT_MS);
    }
  }, []);

  const closePanel = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(
    () => () => {
      if (pendingSafetyTimerRef.current) {
        clearTimeout(pendingSafetyTimerRef.current);
        pendingSafetyTimerRef.current = null;
      }
    },
    [],
  );

  useEffect(() => {
    setIframe(iframeRef.current);
    return () => setIframe(null);
  }, [setIframe]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("ams-copilot-docked", isOpen);
    window.localStorage.setItem(DOCK_STORAGE_KEY, isOpen ? "true" : "false");
    return () => {
      document.documentElement.classList.remove("ams-copilot-docked");
    };
  }, [isOpen]);


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) closePanel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closePanel, isOpen]);

  // Close panel whenever the user clicks outside it, including active AMS modals/forms.
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (target && panelRef.current?.contains(target)) return;
      closePanel();
    };
    document.addEventListener("mousedown", onPointerDown, true);
    return () => document.removeEventListener("mousedown", onPointerDown, true);
  }, [closePanel, isOpen]);

  // ── Voice replies (Uplift AI TTS) ──────────────────────────────────────
  // The chat iframe posts SPEAK_TEXT once per completed agent run with the
  // reply's speakable text. The parent owns playback so narration works even
  // when the chat panel is closed (detached/hands-free use). Synthesis goes
  // through /api/copilot/voice/speak (translate to Urdu → Uplift Orator).
  const [voiceRepliesEnabled, setVoiceRepliesEnabled] = useState(true);
  const [isSpeakingReply, setIsSpeakingReply] = useState(false);
  // Notification-style block above the detached composer showing the reply
  // text being narrated. Dismissed with its ✕ (which also stops playback),
  // replaced by the next spoken reply, or cleared when the panel opens.
  const [voiceToast, setVoiceToast] = useState<string | null>(null);
  const voiceRepliesEnabledRef = useRef(true);
  const replyAudioRef = useRef<HTMLAudioElement | null>(null);
  const replyAudioUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (window.localStorage.getItem(VOICE_REPLIES_KEY) === "0") {
      setVoiceRepliesEnabled(false);
      voiceRepliesEnabledRef.current = false;
    }
  }, []);

  const stopReplyPlayback = useCallback(() => {
    setIsSpeakingReply(false);
    const audio = replyAudioRef.current;
    replyAudioRef.current = null;
    if (audio) {
      try {
        audio.pause();
      } catch {
        /* ignore */
      }
    }
    if (replyAudioUrlRef.current) {
      URL.revokeObjectURL(replyAudioUrlRef.current);
      replyAudioUrlRef.current = null;
    }
  }, []);

  const dismissVoiceToast = useCallback(() => {
    setVoiceToast(null);
    stopReplyPlayback();
  }, [stopReplyPlayback]);

  const toggleVoiceReplies = useCallback(() => {
    setVoiceRepliesEnabled(prev => {
      const next = !prev;
      voiceRepliesEnabledRef.current = next;
      window.localStorage.setItem(VOICE_REPLIES_KEY, next ? "1" : "0");
      if (!next) stopReplyPlayback();
      return next;
    });
  }, [stopReplyPlayback]);

  const speakReplyText = useCallback(
    async (text: string) => {
      if (!voiceRepliesEnabledRef.current) return;
      try {
        const response = await fetch("/api/copilot/voice/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!response.ok) {
          console.warn("[CopilotSidePanel] voice reply synthesis failed:", response.status);
          return;
        }
        const blob = await response.blob();
        // The user may have muted while synthesis was in flight.
        if (!voiceRepliesEnabledRef.current) return;
        stopReplyPlayback();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        replyAudioRef.current = audio;
        replyAudioUrlRef.current = url;
        audio.onended = () => {
          // Only clean up if a newer reply hasn't replaced this audio.
          if (replyAudioRef.current === audio) stopReplyPlayback();
        };
        audio
          .play()
          .then(() => {
            if (replyAudioRef.current === audio) setIsSpeakingReply(true);
          })
          .catch(err => {
            console.warn("[CopilotSidePanel] voice reply playback blocked:", err);
            if (replyAudioRef.current === audio) stopReplyPlayback();
          });
      } catch (err) {
        console.warn("[CopilotSidePanel] voice reply failed:", err);
      }
    },
    [stopReplyPlayback],
  );

  useEffect(() => () => stopReplyPlayback(), [stopReplyPlayback]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== CHAT_ORIGIN) return;
      if (event.data?.source !== "ams-copilot-iframe") return;
      if (event.data?.type === "OPEN_OPENUI_PREVIEW") {
        if (typeof event.data.code === "string" && event.data.code.trim()) {
          setOpenUiPreview({
            id:
              typeof event.data.previewId === "string"
                ? event.data.previewId
                : "openui-preview",
            code: event.data.code,
            isStreaming: event.data.isStreaming === true,
          });
        }
        return;
      }
      if (event.data?.type === "UPDATE_OPENUI_PREVIEW") {
        if (typeof event.data.code === "string" && event.data.code.trim()) {
          setOpenUiPreview((current) => {
            if (!current) return current;
            if (
              typeof event.data.previewId === "string" &&
              event.data.previewId !== current.id
            ) {
              return current;
            }
            return {
              ...current,
              code: event.data.code,
              isStreaming: event.data.isStreaming === true,
            };
          });
        }
        return;
      }
      if (event.data?.type === "COPILOT_READY") {
        iframeReadyRef.current = true;
        const queued = queuedQuickMessageRef.current;
        if (queued && iframeRef.current?.contentWindow) {
          queuedQuickMessageRef.current = null;
          iframeRef.current.contentWindow.postMessage(
            { source: "ams-copilot", type: "QUICK_MESSAGE", text: queued },
            CHAT_ORIGIN,
          );
        }
        return;
      }
      if (event.data?.type === "ASSISTANT_LOADING") {
        if (event.data.isLoading === true) {
          // Ignore stragglers from a just-stopped run — they would re-lock the
          // composer immediately after stop and trap the user.
          if (Date.now() < stopGuardUntilRef.current) return;
          loadingStartedRef.current = true;
          setPendingWithSafety(true);
          return;
        }
        loadingStartedRef.current = false;
        setPendingWithSafety(false);
        // Run truly ended. Auto-clear the visual-receipt text the user sent
        // — but only if they have not started typing a new draft. We use a
        // ref because the message-handler closure captures stale state.
        if (
          lastSubmittedTextRef.current !== null &&
          !userEditedSinceSubmitRef.current
        ) {
          setQuickMessage("");
        }
        lastSubmittedTextRef.current = null;
        userEditedSinceSubmitRef.current = false;
        return;
      }
      if (event.data?.type === "HUMAN_MESSAGE") {
        const text =
          typeof event.data.text === "string" ? event.data.text.trim() : "";
        if (!text) return;
        // After stop, don't re-lock from an echo of the cancelled message.
        if (Date.now() < stopGuardUntilRef.current) return;
        loadingStartedRef.current = true;
        queuedQuickMessageRef.current = null;
        saveDetachedPending(text);
        // Do NOT write the just-sent text back into the composer here. The
        // detached input clears immediately on submit (same UX as the chat
        // panel composer), and the user may already be typing the next
        // message — echoing the previous text would clobber their draft.
        setPendingWithSafety(true);
        return;
      }
      if (event.data?.type === "TODO_STATE") {
        const current = event.data.current;
        setCurrentTodo(current && typeof current === "object" ? current : null);
        // Mid-run activity heartbeat: re-arm the pending safety timer so a
        // long run is not auto-unlocked while the iframe is clearly alive.
        if (
          loadingStartedRef.current &&
          Date.now() >= stopGuardUntilRef.current
        ) {
          setPendingWithSafety(true);
        }
        return;
      }
      if (event.data?.type === "HITL_INTERRUPT") {
        loadingStartedRef.current = false;
        queuedQuickMessageRef.current = null;
        const interrupt = event.data.interrupt;
        showApprovalInterrupt(
          interrupt &&
            typeof interrupt === "object" &&
            Array.isArray((interrupt as CopilotHitlInterrupt).actionRequests)
            ? (interrupt as CopilotHitlInterrupt)
            : null,
        );
        clearDetachedPending();
        setPendingWithSafety(false);
        return;
      }
      if (event.data?.type === "HITL_INTERRUPT_CLEARED") {
        showApprovalInterrupt(null);
        return;
      }
      if (event.data?.type === "SPEAK_TEXT") {
        const speakText =
          typeof event.data.text === "string" ? event.data.text.trim() : "";
        if (speakText) {
          void speakReplyText(speakText);
          // Detached mode: surface the narrated reply as a dismissable
          // notification-style block above the composer so the user can
          // read along (or catch what they missed) without opening the
          // panel. When the panel is open the reply is already visible
          // in the chat thread, so no toast.
          if (!isOpen) setVoiceToast(speakText);
        }
        return;
      }
      if (event.data?.type !== "ASSISTANT_MESSAGE") return;
      queuedQuickMessageRef.current = null;
      clearDetachedPending();
      // This event fires on the FIRST assistant token (mid-stream) — the
      // agent is still working. Do NOT unlock the composer here: dropping
      // pending at this point flipped the stop/spinner button back to an
      // idle send arrow while the run continued (most visible on
      // voice-initiated runs, where the user is watching the detached
      // composer hands-free). The true end-of-run signal is the
      // ASSISTANT_LOADING=false branch above. Re-arm the safety timer
      // instead — streaming is proof the run is alive.
      if (
        loadingStartedRef.current &&
        Date.now() >= stopGuardUntilRef.current
      ) {
        setPendingWithSafety(true);
      }
      // Do NOT clear quickMessage here either: the user may already be
      // typing the next message — clearing would wipe their draft. The
      // input was already cleared at submit time.
      //
      // The "new reply" badge is NOT raised here: this fires on the first
      // streamed token while the agent is still working, so showing it now
      // reads as "done" prematurely. It is raised in the ASSISTANT_LOADING=
      // false branch above, which marks the true end of the run.
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [isOpen, setPendingWithSafety, showApprovalInterrupt, speakReplyText]);

  useEffect(() => {
    const onHitlInterrupt = (event: Event) => {
      showApprovalInterrupt(
        (event as CustomEvent<CopilotHitlInterrupt | null>).detail ?? null,
      );
    };

    window.addEventListener(COPILOT_HITL_INTERRUPT_EVENT, onHitlInterrupt);
    return () => {
      window.removeEventListener(COPILOT_HITL_INTERRUPT_EVENT, onHitlInterrupt);
    };
  }, [showApprovalInterrupt]);

  // Typewriter cycling placeholder
  useEffect(() => {
    if (isOpen) return;
    let phraseIdx = 0,
      charIdx = 0,
      deleting = false;
    let tid: ReturnType<typeof setTimeout>;
    const tick = () => {
      const phrase = PLACEHOLDER_PHRASES[phraseIdx];
      if (!deleting) {
        charIdx++;
        setPlaceholder(phrase.slice(0, charIdx));
        if (charIdx === phrase.length) {
          deleting = true;
          tid = setTimeout(tick, 1800);
        } else tid = setTimeout(tick, 55);
      } else {
        charIdx--;
        setPlaceholder(phrase.slice(0, charIdx));
        if (charIdx === 0) {
          deleting = false;
          phraseIdx = (phraseIdx + 1) % PLACEHOLDER_PHRASES.length;
          tid = setTimeout(tick, 400);
        } else tid = setTimeout(tick, 32);
      }
    };
    tid = setTimeout(tick, 900);
    return () => clearTimeout(tid);
  }, [isOpen]);

  // Focus rescue: pull focus out of iframe when panel closes
  useEffect(() => {
    if (!isOpen) {
      const t = window.setTimeout(
        () => searchTextareaRef.current?.focus(),
        120,
      );
      return () => window.clearTimeout(t);
    }
  }, [isOpen]);

  // ── Drag ────────────────────────────────────────────────────────────────────
  const clampSavedDragPos = useCallback(() => {
    setDragPos((current) => {
      if (!current) return current;

      const rect = panelRef.current?.getBoundingClientRect();
      const size =
        rect && rect.width > 0 && rect.height > 0
          ? { width: rect.width, height: rect.height }
          : undefined;
      const next = clampDockPos(current, size);
      if (next.left === current.left && next.top === current.top) {
        return current;
      }

      saveDockPos(next);
      return next;
    });
  }, []);

  useEffect(() => {
    clampSavedDragPos();
    window.addEventListener("resize", clampSavedDragPos);
    return () => window.removeEventListener("resize", clampSavedDragPos);
  }, [clampSavedDragPos]);

  const startPanelDrag = useCallback((e: React.MouseEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    // Don't drag when clicking a button inside the header
    if ((e.target as HTMLElement).closest("button")) return;

    const panel = panelRef.current;
    if (!panel) return;

    const r = panel.getBoundingClientRect();
    const sx = e.clientX,
      sy = e.clientY;
    const sl = r.left,
      st = r.top;

    setIsDragging(true);
    e.preventDefault();
    const panelSize = { width: r.width, height: r.height };

    const onMove = (ev: MouseEvent) => {
      setDragPos(
        clampDockPos(
          { left: sl + ev.clientX - sx, top: st + ev.clientY - sy },
          panelSize,
        ),
      );
    };

    const onUp = (ev: MouseEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      const pos = clampDockPos(
        { left: sl + ev.clientX - sx, top: st + ev.clientY - sy },
        panelSize,
      );
      setDragPos(pos);
      setIsDragging(false);
      saveDockPos(pos);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);
  // ────────────────────────────────────────────────────────────────────────────

  const openPanel = useCallback(() => {
    // The reply is visible in the chat thread once the panel opens — drop
    // the toast so it doesn't reappear stale when the panel closes later.
    setVoiceToast(null);
    setIsOpen(true);
  }, []);


  const handleDetachedApproval = useCallback(
    (decision: "approve" | "reject") => {
      setApprovalBusy(decision);
      const sent = sendHitlDecision(decision);
      if (sent) {
        showApprovalInterrupt(null);
        return;
      }
      setApprovalBusy(null);
      openPanel();
    },
    [openPanel, sendHitlDecision, showApprovalInterrupt],
  );

  const postQuickMessage = useCallback(
    (text: string, attempt = 0) => {
      const iframe = iframeRef.current;
      if (!iframe?.contentWindow) {
        if (attempt < 6)
          window.setTimeout(() => postQuickMessage(text, attempt + 1), 120);
        else {
          clearDetachedPending();
          loadingStartedRef.current = false;
          setPendingWithSafety(false);
          setQuickMessage(text);
        }
        return;
      }
      if (!iframeReadyRef.current) {
        queuedQuickMessageRef.current = text;
        return;
      }
      iframe.contentWindow.postMessage(
        { source: "ams-copilot", type: "QUICK_MESSAGE", text },
        CHAT_ORIGIN,
      );
    },
    [setPendingWithSafety],
  );

  useEffect(() => {
    const restored = restoredPendingRef.current;
    if (!restored || restoredPendingSentRef.current) return;
    restoredPendingSentRef.current = true;
    postQuickMessage(restored.text);
    // The restored text stays visible in the composer as a receipt — it
    // will auto-clear when the resumed run completes, same as any other
    // submit, unless the user starts typing a new draft.
    lastSubmittedTextRef.current = restored.text;
    userEditedSinceSubmitRef.current = false;
  }, [postQuickMessage]);

  const submitQuickMessage = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const text = quickMessage.trim();
      if (!text || quickMessagePending) return;

      const sendText = (finalText: string) => {
        setQuickMessage(finalText);
        lastSubmittedTextRef.current = finalText;
        userEditedSinceSubmitRef.current = false;
        // A new run supersedes the previous reply's spoken-text toast.
        setVoiceToast(null);
        setPendingWithSafety(true);
        loadingStartedRef.current = true;
        saveDetachedPending(finalText);
        postQuickMessage(finalText);
      };

      // TEMP: translation disabled — send the raw Urdu/English mix straight to
      // the model to observe how it handles code-switching without a pre-pass.
      // Re-enable the block below to restore English-only input to the agent.
      sendText(text);

      // Translate to English whenever the message contains Urdu/Arabic script
      // (U+0600..U+06FF) or Devanagari (U+0900..U+097F). Whisper's language
      // auto-detection often labels spoken Urdu as Hindi and emits Devanagari,
      // so both scripts must hit the translate path — the agent always
      // receives English whether the text came from the mic, a paste, or a
      // manual type.
      // const hasUrduScript = /[؀-ۿ]/.test(text);
      // const hasDevanagari = /[ऀ-ॿ]/.test(text);
      // if (!hasUrduScript && !hasDevanagari) {
      //   sendText(text);
      //   return;
      // }

      // setPendingWithSafety(true);
      // lastSubmittedTextRef.current = text;
      // userEditedSinceSubmitRef.current = false;
      // translateText(text, "en", hasUrduScript ? "ur" : "hi")
      //   .then((result) => {
      //     if (!result.ok || !result.translatedText.trim()) {
      //       console.warn("[CopilotSidePanel] translate failed, sending original:", result.error);
      //       sendText(text);
      //       return;
      //     }
      //     console.info("[CopilotSidePanel] translated:", text, "→", result.translatedText);
      //     sendText(result.translatedText.trim());
      //   })
      //   .catch((err) => {
      //     console.warn("[CopilotSidePanel] translate threw, sending original:", err);
      //     sendText(text);
      //   });
    },
    [postQuickMessage, quickMessage, quickMessagePending, setPendingWithSafety],
  );

  const stopDetachedRun = useCallback(() => {
    // Open a short guard window so any straggler "loading=true" events from
    // the dying agent run do not immediately re-lock the composer.
    stopGuardUntilRef.current = Date.now() + STOP_GUARD_MS;
    loadingStartedRef.current = false;
    queuedQuickMessageRef.current = null;
    clearDetachedPending();
    setPendingWithSafety(false);
    // Clear stale text so the user starts from an empty composer and is not
    // confused by the half-sent message lingering in the input.
    setQuickMessage("");
    lastSubmittedTextRef.current = null;
    userEditedSinceSubmitRef.current = false;
    iframeRef.current?.contentWindow?.postMessage(
      { source: "ams-copilot", type: "STOP_RUN" },
      CHAT_ORIGIN,
    );
  }, [setPendingWithSafety]);

  // ── Voice input ────────────────────────────────────────────────────────
  // Pure browser SpeechRecognition. While the mic is live the recognizer
  // streams its interim transcript straight into the composer textarea, and
  // whatever is shown when the user stops simply stays — there is no separate
  // audio recording and no server round-trip, so the text never changes out
  // from under the user on stop. A short-lived getUserMedia stream is opened
  // only to drive the on-screen mic-level meter (it is not recorded anywhere).
  const [isRecording, setIsRecording] = useState(false);
  const [isStartingVoice, setIsStartingVoice] = useState(false);
  const [audioInputDevices, setAudioInputDevices] = useState<AudioInputDevice[]>([]);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState(DEFAULT_AUDIO_DEVICE_ID);
  const [voiceLevel, setVoiceLevel] = useState(0);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const pendingMicStreamRef = useRef<Promise<MediaStream> | null>(null);
  const voiceStartCancelledRef = useRef(false);
  const recordingBaseTextRef = useRef("");
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const speechRecognitionFinalRef = useRef("");
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const voiceMeterFrameRef = useRef<number | null>(null);

  const refreshAudioInputDevices = useCallback(async () => {
    if (typeof window === "undefined" || !navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices
        .filter(device => device.kind === "audioinput")
        .map((device, index) => ({
          deviceId: device.deviceId || DEFAULT_AUDIO_DEVICE_ID,
          label: device.label || `Microphone ${index + 1}`,
        }));
      setAudioInputDevices(inputs);
      setSelectedAudioDeviceId(current =>
        current === DEFAULT_AUDIO_DEVICE_ID || inputs.some(device => device.deviceId === current)
          ? current
          : DEFAULT_AUDIO_DEVICE_ID,
      );
    } catch (err) {
      console.warn("[CopilotSidePanel] could not enumerate audio devices:", err);
    }
  }, []);

  useEffect(() => {
    void refreshAudioInputDevices();
    if (typeof window === "undefined" || !navigator.mediaDevices?.addEventListener) return;
    navigator.mediaDevices.addEventListener("devicechange", refreshAudioInputDevices);
    return () => navigator.mediaDevices.removeEventListener("devicechange", refreshAudioInputDevices);
  }, [refreshAudioInputDevices]);

  const stopVoiceMeter = useCallback(() => {
    if (voiceMeterFrameRef.current !== null) {
      cancelAnimationFrame(voiceMeterFrameRef.current);
      voiceMeterFrameRef.current = null;
    }
    analyserRef.current = null;
    const context = audioContextRef.current;
    audioContextRef.current = null;
    if (context && context.state !== "closed") {
      void context.close().catch(() => undefined);
    }
    setVoiceLevel(0);
  }, []);

  const startVoiceMeter = useCallback((stream: MediaStream) => {
    stopVoiceMeter();
    const AudioContextCtor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    try {
      const context = new AudioContextCtor();
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.72;
      const source = context.createMediaStreamSource(stream);
      source.connect(analyser);
      const samples = new Uint8Array(analyser.fftSize);
      audioContextRef.current = context;
      analyserRef.current = analyser;
      const tick = () => {
        analyser.getByteTimeDomainData(samples);
        let sum = 0;
        for (const value of samples) {
          const normalized = (value - 128) / 128;
          sum += normalized * normalized;
        }
        const rms = Math.sqrt(sum / samples.length);
        setVoiceLevel(Math.min(1, rms * 4.5));
        voiceMeterFrameRef.current = requestAnimationFrame(tick);
      };
      tick();
    } catch (err) {
      console.warn("[CopilotSidePanel] could not start voice meter:", err);
    }
  }, [stopVoiceMeter]);

  const stopRealtimeTranscriptPreview = useCallback(() => {
    const recognition = speechRecognitionRef.current;
    speechRecognitionRef.current = null;
    if (recognition) {
      recognition.onend = null;
      recognition.onerror = null;
      recognition.onresult = null;
      try {
        recognition.stop();
      } catch {
        try {
          recognition.abort();
        } catch {
          /* ignore */
        }
      }
    }
    speechRecognitionFinalRef.current = "";
  }, []);

  const startRealtimeTranscriptPreview = useCallback(() => {
    if (typeof window === "undefined") return;
    const Recognition =
      (window as SpeechRecognitionWindow).SpeechRecognition ??
      (window as SpeechRecognitionWindow).webkitSpeechRecognition;
    if (!Recognition) return;
    stopRealtimeTranscriptPreview();
    try {
      const recognition = new Recognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "ur-PK";
      speechRecognitionFinalRef.current = "";
      recognition.onresult = (event) => {
        let interim = "";
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const transcript = result[0]?.transcript?.trim() ?? "";
          if (!transcript) continue;
          if (result.isFinal) {
            speechRecognitionFinalRef.current = `${speechRecognitionFinalRef.current} ${transcript}`.trim();
          } else {
            interim = `${interim} ${transcript}`.trim();
          }
        }
        // Stream the interim transcript straight into the composer textarea
        // so it shows in the same spot (and expands/scrolls the same way) as
        // typed text. recordingBaseTextRef holds whatever was already typed
        // before recording started, so we always rebuild from that base
        // rather than appending to the growing preview.
        const preview = normalizeUrduVoicePreview(`${speechRecognitionFinalRef.current} ${interim}`.trim());
        setQuickMessage(`${recordingBaseTextRef.current}${preview}`);
      };
      recognition.onerror = () => {
        speechRecognitionRef.current = null;
      };
      recognition.onend = () => {
        speechRecognitionRef.current = null;
      };
      recognition.start();
      speechRecognitionRef.current = recognition;
    } catch (err) {
      console.warn("[CopilotSidePanel] realtime speech preview unavailable:", err);
    }
  }, [stopRealtimeTranscriptPreview]);

  const stopVoiceRecognition = useCallback(() => {
    voiceStartCancelledRef.current = true;
    setIsRecording(false);
    setIsStartingVoice(false);
    stopVoiceMeter();
    // Whatever the recognizer last streamed into the composer simply stays —
    // we just stop listening and release the mic stream used for the meter.
    stopRealtimeTranscriptPreview();
    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    mediaStreamRef.current = null;
    // Put the cursor at the end of the captured text so the user can edit it.
    const textarea = searchTextareaRef.current;
    if (textarea) {
      requestAnimationFrame(() => {
        textarea.focus();
        const end = textarea.value.length;
        try {
          textarea.setSelectionRange(end, end);
        } catch {
          /* ignore */
        }
      });
    }
  }, [stopRealtimeTranscriptPreview, stopVoiceMeter]);

  // Opening the capture device adds 100–500ms latency (longer on Bluetooth
  // headsets). Kick getUserMedia off on pointerdown so the mic-level meter is
  // ready by the time the click handler runs.
  const prewarmMicrophone = useCallback(() => {
    if (typeof window === "undefined") return;
    if (mediaStreamRef.current || pendingMicStreamRef.current) return;
    if (!navigator.mediaDevices?.getUserMedia) return;
    const promise = navigator.mediaDevices.getUserMedia(buildVoiceAudioConstraints(selectedAudioDeviceId));
    pendingMicStreamRef.current = promise;
    promise.then(stream => {
      void refreshAudioInputDevices();
      // If the press never became a click (pointer dragged away), don't hold
      // the mic open in the background.
      setTimeout(() => {
        if (pendingMicStreamRef.current === promise && !mediaStreamRef.current) {
          pendingMicStreamRef.current = null;
          stream.getTracks().forEach(track => track.stop());
        }
      }, 10_000);
    }).catch(() => {
      if (pendingMicStreamRef.current === promise) pendingMicStreamRef.current = null;
    });
  }, [refreshAudioInputDevices, selectedAudioDeviceId]);

  const startVoiceFromSearch = useCallback(() => {
    if (typeof window === "undefined") return;
    if (mediaStreamRef.current || isStartingVoice) {
      stopVoiceRecognition();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      console.warn("[CopilotSidePanel] microphone not available in this browser");
      return;
    }
    voiceStartCancelledRef.current = false;
    setIsStartingVoice(true);
    const streamPromise =
      pendingMicStreamRef.current ?? navigator.mediaDevices.getUserMedia(buildVoiceAudioConstraints(selectedAudioDeviceId));
    pendingMicStreamRef.current = null;
    streamPromise.then(stream => {
      if (voiceStartCancelledRef.current) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }
      mediaStreamRef.current = stream;
      startVoiceMeter(stream);
      void refreshAudioInputDevices();
      // Remember whatever was already typed so the live transcript appends to
      // it rather than replacing it.
      recordingBaseTextRef.current = quickMessage ? `${quickMessage} ` : "";
      setIsStartingVoice(false);
      setIsRecording(true);
      startRealtimeTranscriptPreview();
    }).catch(err => {
      setIsStartingVoice(false);
      console.warn("[CopilotSidePanel] microphone access denied:", err);
    });
  }, [isStartingVoice, quickMessage, refreshAudioInputDevices, selectedAudioDeviceId, startRealtimeTranscriptPreview, startVoiceMeter, stopVoiceRecognition]);

  useEffect(() => () => stopVoiceRecognition(), [stopVoiceRecognition]);

  // ── Proactive notification dispatcher ──────────────────────────────────────
  //
  // The NotificationsContext feed flows through the NotificationBus
  // (debounce + per-entity coalesce + id dedup) and arrives here as discrete
  // typed events. For each event we compute the current copilot state
  // (idle / running / awaiting_user / snoozed / user_typing / tab_hidden)
  // and ask the pure-function dispatcher whether to fire, defer, or drop.
  //
  // Fire → postMessage PROACTIVE_EVENT to the iframe and bump rate-limit /
  //   per-entity history so subsequent events within the windows are
  //   automatically suppressed.
  // Defer → push to the queue. When state flips to idle the queue drains
  //   in arrival order so the user sees a coherent sequence, not a flood.
  // Drop → discard; the event is still visible in the notification feed
  //   for the user to read normally — we just don't auto-pop a card.
  //
  // The dispatcher itself owns NO state. We hold the rate-limit + per-entity
  // history in a ref so re-renders don't lose accumulated counts.
  const { user } = useAuth();
  const { feed } = useNotifications();
  useNotificationBusIngest(feed);
  const { isSnoozed, snoozeFor, clearSnooze } = useProactiveSnooze(user?.id);
  const proactiveHistoryRef = useRef<ProactiveHistory>(EMPTY_HISTORY);
  const deferredProactiveQueueRef = useRef<TypedNotificationEvent[]>([]);
  const lastUserKeypressAtRef = useRef<number>(0);

  // Track user typing in the detached composer textarea. Typing within the
  // last 1.5s suppresses proactive fires so a card doesn't pop in over
  // their cursor. Refresh on each keypress.
  useEffect(() => {
    const textarea = searchTextareaRef.current;
    if (!textarea) return;
    const onKeyDown = () => {
      lastUserKeypressAtRef.current = Date.now();
    };
    textarea.addEventListener("keydown", onKeyDown);
    return () => textarea.removeEventListener("keydown", onKeyDown);
  }, []);

  // Compute the current proactive state from observable conditions. We don't
  // store this as React state — the dispatcher reads it from a callback at
  // event-handling time, so it's always fresh and never stale due to closure
  // capture.
  const computeProactiveState = useCallback((): CopilotProactiveState => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      return "tab_hidden";
    }
    if (isSnoozed) return "snoozed";
    if (approvalInterrupt?.actionRequests?.length) return "awaiting_user";
    if (quickMessagePending) return "running";
    if (Date.now() - lastUserKeypressAtRef.current < 1500) return "user_typing";
    return "idle";
  }, [approvalInterrupt, isSnoozed, quickMessagePending]);

  // Convert an internal TypedNotificationEvent into the wire shape the iframe
  // expects. Kept here (not in the dispatcher) so the dispatcher stays pure.
  const fireProactiveEvent = useCallback((typed: TypedNotificationEvent) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return false;
    if (!typed.suggestedIntent || !typed.intentTarget) return false;
    iframe.contentWindow.postMessage(
      {
        source: "ams-copilot",
        type: "PROACTIVE_EVENT",
        event: {
          id: typed.raw.id,
          kind: typed.kind,
          suggestedIntent: typed.suggestedIntent,
          intentTarget: typed.intentTarget,
          title: typed.raw.title,
          message: typed.raw.message,
          severity: typed.raw.severity,
        },
      },
      CHAT_ORIGIN,
    );
    proactiveHistoryRef.current = recordProactiveFire(
      proactiveHistoryRef.current,
      typed,
      Date.now(),
    );
    return true;
  }, []);

  const handleProactiveEvent = useCallback((typed: TypedNotificationEvent) => {
    const decision = decideProactiveAction({
      event: typed,
      state: computeProactiveState(),
      history: proactiveHistoryRef.current,
      now: Date.now(),
      // Self-action suppression: when this user triggered the event, the
      // dispatcher drops the fire so we don't pop a card for something
      // they just did themselves. Other recipients still get cards.
      currentUserId: typeof user?.id === "number" ? user.id : null,
    });
    if (decision.action === "fire") {
      const sent = fireProactiveEvent(typed);
      if (!sent) {
        // Iframe wasn't ready (race during mount) — defer so we don't lose it.
        deferredProactiveQueueRef.current.push(typed);
      }
      return;
    }
    if (decision.action === "defer") {
      deferredProactiveQueueRef.current.push(typed);
    }
    // "drop" → no-op. The event is still in the user-visible feed.
  }, [computeProactiveState, fireProactiveEvent]);

  // Subscribe to the bus. The unsubscribe on cleanup keeps the bus listener
  // set tidy across mounts (e.g., HMR, route changes).
  useEffect(() => {
    const unsubscribe = notificationBus.subscribe(handleProactiveEvent);
    return unsubscribe;
  }, [handleProactiveEvent]);

  // Drain deferred queue whenever the state likely flipped back to idle.
  // Triggers: agent finished, approval cleared, snooze ended, tab returned
  // to visible. We run the queue through the dispatcher AGAIN so a long
  // queue can't slip past the rate limit just because state is now idle.
  useEffect(() => {
    if (deferredProactiveQueueRef.current.length === 0) return;
    if (computeProactiveState() !== "idle") return;
    const queue = deferredProactiveQueueRef.current;
    deferredProactiveQueueRef.current = [];
    for (const event of queue) {
      handleProactiveEvent(event);
    }
  }, [computeProactiveState, handleProactiveEvent, quickMessagePending, isSnoozed, approvalInterrupt]);

  // Re-evaluate on tab-visibility change too. Without this, events deferred
  // because the tab was hidden would only fire on the next state-flip.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const queue = deferredProactiveQueueRef.current;
      if (queue.length === 0) return;
      deferredProactiveQueueRef.current = [];
      for (const event of queue) handleProactiveEvent(event);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [handleProactiveEvent]);

  // Listen for snooze commands from the iframe (the agent's proactive card
  // offers snooze buttons; clicking them postMessages back here). One thin
  // protocol — keeps snooze state authoritative in the parent.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== CHAT_ORIGIN) return;
      if (event.data?.source !== "ams-copilot-iframe") return;
      if (event.data.type === "PROACTIVE_SNOOZE") {
        const ms = typeof event.data.durationMs === "number" ? event.data.durationMs : 0;
        if (ms > 0) snoozeFor(ms);
      } else if (event.data.type === "PROACTIVE_RESUME") {
        clearSnooze();
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [snoozeFor, clearSnooze]);

  const toggleHideToolCalls = useCallback(() => {
    setHideToolCalls((current) => {
      const next = !current;
      iframeRef.current?.contentWindow?.postMessage(
        { source: "ams-copilot", type: "SET_HIDE_TOOL_CALLS", value: next },
        CHAT_ORIGIN,
      );
      return next;
    });
  }, []);

  const startNewChat = useCallback(() => {
    stopGuardUntilRef.current = Date.now() + STOP_GUARD_MS;
    loadingStartedRef.current = false;
    queuedQuickMessageRef.current = null;
    clearDetachedPending();
    setQuickMessage("");
    lastSubmittedTextRef.current = null;
    userEditedSinceSubmitRef.current = false;
    setPendingWithSafety(false);
    setCurrentTodo(null);
    setVoiceToast(null);
    showApprovalInterrupt(null);
    iframeRef.current?.contentWindow?.postMessage(
      { source: "ams-copilot", type: "START_NEW_THREAD" },
      CHAT_ORIGIN,
    );
  }, [setPendingWithSafety, showApprovalInterrupt]);

  // ── Computed styles ─────────────────────────────────────────────────────────
  // Panel: when dragged, override the CSS-based centering with exact left/top.
  // Hide via opacity only (not slide-off-screen transform) so it fades in/out
  // from its custom position rather than animating to/from center-bottom.
  const panelStyle: CSSProperties | undefined = dragPos
    ? {
        left: dragPos.left,
        top: dragPos.top,
        right: "auto",
        bottom: "auto",
        transform: "none",
      }
    : undefined;
  const currentTodoText =
    typeof currentTodo?.content === "string" ? currentTodo.content.trim() : "";
  const hasApproval = Boolean(approvalInterrupt?.actionRequests?.length);
  const approvalAction = approvalInterrupt?.actionRequests[0] ?? null;
  const approvalReview = useMemo(
    () =>
      approvalAction
        ? buildDetachedApprovalReview(approvalAction, {
            context: approvalReviewContext,
            now: approvalRequestedAt ?? undefined,
          })
        : null,
    [approvalAction, approvalRequestedAt, approvalReviewContext],
  );
  const approvalFieldCount = approvalReview?.fields.length ?? 0;
  const approvalBubbleText = approvalReview
    ? approvalFieldCount > 0
      ? `${approvalReview.title} - ${approvalFieldCount} field${approvalFieldCount === 1 ? "" : "s"} to review`
      : approvalReview.title
    : "";
  // Overlay: appear at the same horizontal position as the panel so it feels
  // like the panel "collapsed" in place.
  const overlayStyle: CSSProperties | undefined = dragPos
    ? {
        left: dragPos.left,
        bottom: "18px",
        transform: "none", // override the default translateX(-50%)
      }
    : undefined;
  // ────────────────────────────────────────────────────────────────────────────

  return (
    <>
      {!isOpen ? (
        <form
          ref={composerFormRef}
          className={`copilot-search-overlay${hasApproval ? " has-approval" : ""}`}
          style={overlayStyle}
          onSubmit={submitQuickMessage}
        >
          {hasApproval && approvalReview ? (
            <section
              className="copilot-search-approval-bubble"
              aria-label={`Human approval required for ${approvalReview.title}. ${approvalBubbleText}`}
              aria-live="polite"
            >
              <button
                type="button"
                className="copilot-search-approval-bubble-main"
                aria-label={`Open chat panel to review ${approvalReview.title}`}
                onClick={openPanel}
              >
                <span
                  className="copilot-search-approval-bubble-icon"
                  aria-hidden="true"
                >
                  <UserRound size={16} strokeWidth={2.1} />
                  <span className="copilot-search-approval-bubble-check">
                    <Check size={8} strokeWidth={2.4} />
                  </span>
                </span>
                <span
                  className="copilot-search-approval-bubble-divider"
                  aria-hidden="true"
                />
                <span className="copilot-search-approval-bubble-copy">
                  <span className="copilot-search-approval-bubble-heading">
                    <span className="copilot-search-approval-bubble-eyebrow">
                      HITL
                    </span>
                    <span className="copilot-search-approval-bubble-title">
                      Human approval required
                    </span>
                  </span>
                  <span className="copilot-search-approval-bubble-text">
                    The agent is waiting for your approval to proceed.
                  </span>
                  <span className="copilot-search-approval-bubble-status">
                    <Clock3 size={13} strokeWidth={1.9} />
                    Pending your response
                  </span>
                </span>
              </button>
              <span className="copilot-search-approval-bubble-actions">
                <button
                  type="button"
                  className="copilot-search-approval-bubble-action is-reject"
                  onClick={() => handleDetachedApproval("reject")}
                  disabled={approvalBusy !== null}
                >
                  <X size={18} strokeWidth={2.1} />
                  {approvalBusy === "reject" ? "Rejecting..." : "Reject"}
                </button>
                <button
                  type="button"
                  className="copilot-search-approval-bubble-action is-approve"
                  onClick={() => handleDetachedApproval("approve")}
                  disabled={approvalBusy !== null}
                >
                  <Check size={18} strokeWidth={2.1} />
                  {approvalBusy === "approve" ? "Approving..." : "Approve"}
                </button>
              </span>
            </section>
          ) : currentTodoText ? (
            <section
              className="copilot-search-active-task"
              role="status"
              aria-live="polite"
            >
              <div className="copilot-search-active-task-main">
                <LoaderCircle size={16} strokeWidth={2} aria-hidden="true" />
                <div className="copilot-search-active-task-copy">
                  <span className="copilot-search-active-task-title">
                    Tasks
                  </span>
                  <span className="copilot-search-active-task-text">
                    <strong>Now:</strong> {currentTodoText}
                  </span>
                </div>
              </div>
            </section>
          ) : null}
          <textarea
            ref={searchTextareaRef}
            value={quickMessage}
            onChange={(event) => {
              // Mark "user has edited since the last submit" so the
              // auto-clear on run completion does NOT wipe the draft they
              // are now typing. The flag stays true until the next submit.
              if (lastSubmittedTextRef.current !== null) {
                userEditedSinceSubmitRef.current = true;
              }
              setQuickMessage(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                // Only submit when not pending — but still let the user TYPE
                // freely while a run is in flight so they can prepare the
                // next message. The submit button itself flips to "Stop"
                // while pending, and pressing Enter while pending is a no-op.
                if (!quickMessagePending) {
                  event.currentTarget.form?.requestSubmit();
                }
              }
            }}
            className="copilot-search-input"
            placeholder={placeholder}
            aria-label="Ask AMS assistant"
            // dir="auto" lets the browser pick direction from the first strong
            // character: Urdu/Arabic text anchors to the right (RTL), English
            // stays left (LTR). Keeps the mic transcript and typed English in
            // their natural reading direction without forcing one on both.
            dir="auto"
            rows={1}
          />
          <div className="copilot-search-actions">
            <div className="copilot-search-right-actions">
              {isSpeakingReply ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="copilot-search-icon-btn"
                  aria-label="Stop voice reply"
                  title="Stop speaking"
                  onClick={stopReplyPlayback}
                  style={{ color: "var(--primary)" }}
                >
                  <span className="copilot-eq" aria-hidden="true">
                    <span />
                    <span />
                    <span />
                  </span>
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="icon-sm"
                className="copilot-search-icon-btn"
                aria-label={voiceRepliesEnabled ? "Turn off spoken replies" : "Turn on spoken replies"}
                title={voiceRepliesEnabled ? "Spoken replies: on" : "Spoken replies: off"}
                onClick={toggleVoiceReplies}
                style={voiceRepliesEnabled ? { color: "var(--primary)" } : undefined}
              >
                {voiceRepliesEnabled ? (
                  <Volume2 size={15} strokeWidth={1.9} />
                ) : (
                  <VolumeX size={15} strokeWidth={1.9} />
                )}
              </Button>
              {audioInputDevices.length > 1 ? (
                <select
                  className="copilot-search-mic-select"
                  aria-label="Voice input microphone"
                  value={selectedAudioDeviceId}
                  disabled={isRecording || isStartingVoice}
                  onChange={(event) => {
                    pendingMicStreamRef.current = null;
                    setSelectedAudioDeviceId(event.target.value);
                  }}
                  title="Voice input microphone"
                >
                  <option value={DEFAULT_AUDIO_DEVICE_ID}>Default mic</option>
                  {audioInputDevices.map(device => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label}
                    </option>
                  ))}
                </select>
              ) : null}
              {(isRecording || isStartingVoice) ? (
                <span
                  className={
                    "copilot-search-voice-meter" +
                    (isRecording ? " is-live" : "")
                  }
                  aria-label={
                    isRecording
                      ? `Voice input level ${Math.round(voiceLevel * 100)} percent`
                      : "Starting microphone"
                  }
                  title={
                    isRecording
                      ? "Listening…"
                      : "Opening microphone"
                  }
                >
                  <span style={{ width: `${Math.max(6, Math.round(voiceLevel * 100))}%` }} />
                </span>
              ) : null}
              <Button
                variant="ghost"
                size="icon-sm"
                className="copilot-search-icon-btn"
                aria-label={isRecording ? "Stop listening" : isStartingVoice ? "Starting microphone…" : "Start voice"}
                title={isRecording ? "Stop listening" : isStartingVoice ? "Starting microphone…" : "Start voice"}
                onPointerDown={prewarmMicrophone}
                onClick={startVoiceFromSearch}
                style={isRecording ? { color: "var(--danger)" } : isStartingVoice ? { color: "var(--primary)", opacity: 0.7 } : undefined}
              >
                <Mic size={15} strokeWidth={1.9} />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="copilot-search-expand-btn"
                aria-label="Open chat panel"
                title="Open chat panel"
                onClick={openPanel}
              >
                <Maximize2 size={14} strokeWidth={2} />
              </Button>
              <Button
                type={quickMessagePending ? "button" : "submit"}
                variant="outline"
                size="icon"
                className={
                  "copilot-search-send" +
                  (quickMessagePending ? " is-loading" : "")
                }
                aria-label={quickMessagePending ? "Stop task" : "Send message"}
                title={
                  quickMessagePending
                    ? "Stop task (click to cancel)"
                    : "Send message"
                }
                disabled={!quickMessagePending && !quickMessage.trim()}
                onClick={quickMessagePending ? stopDetachedRun : undefined}
              >
                {quickMessagePending ? (
                  // Mirror the chat panel: spinning loader while a run is
                  // in flight so the user gets the same "working..." signal.
                  // Click to cancel — same behaviour as the panel's Cancel.
                  <LoaderCircle
                    size={12}
                    strokeWidth={2}
                    className="copilot-search-send-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <ArrowUpIcon size={14} strokeWidth={2} />
                )}
              </Button>
            </div>
          </div>
          {voiceToast ? (
            <section
              className="copilot-voice-toast"
              role="status"
              aria-live="polite"
              aria-label="Spoken reply"
            >
              {isSpeakingReply ? (
                <span
                  className="copilot-eq copilot-voice-toast-icon"
                  aria-hidden="true"
                >
                  <span />
                  <span />
                  <span />
                </span>
              ) : (
                <Volume2
                  size={15}
                  strokeWidth={1.9}
                  className="copilot-voice-toast-icon"
                  aria-hidden="true"
                />
              )}
              {/* dir="auto" anchors Urdu narration RTL, English LTR. */}
              <span className="copilot-voice-toast-text" dir="auto">
                {voiceToast}
              </span>
              <button
                type="button"
                className="copilot-voice-toast-close"
                aria-label="Dismiss spoken reply"
                title="Dismiss"
                onClick={dismissVoiceToast}
              >
                <X size={13} strokeWidth={2.1} />
              </button>
            </section>
          ) : null}
        </form>
      ) : null}

      <aside
        ref={panelRef}
        className={`copilot-dock-panel${isOpen ? " is-open" : ""}${dragPos ? " is-dragged" : ""}`}
        style={panelStyle}
        role="complementary"
        aria-label="AMS AI assistant"
        aria-hidden={!isOpen}
      >
        <header
          className="copilot-dock-head"
          onMouseDown={startPanelDrag}
          style={{ cursor: isDragging ? "move" : "default" }}
        >
          <Button
            variant="ghost"
            size="icon-sm"
            className="copilot-dock-icon-btn"
            aria-label="Close assistant"
            title="Close assistant"
            onClick={closePanel}
          >
            <X size={14} strokeWidth={1.8} />
          </Button>
          <div className="copilot-dock-actions">
            <Button
              variant="ghost"
              size="icon-sm"
              className="copilot-dock-icon-btn"
              aria-label="New chat"
              title="New chat"
              onClick={startNewChat}
            >
              <SquarePen size={14} strokeWidth={1.8} />
            </Button>
          </div>
        </header>

        <div className="copilot-dock-frame">
          <iframe
            ref={iframeRef}
            src={CHAT_URL}
            title="AMS Assistant"
            className="copilot-dock-iframe"
            allow="clipboard-read; clipboard-write; microphone"
            style={{ pointerEvents: isDragging || !isOpen ? "none" : "auto" }}
          />
          <div className="copilot-dock-empty" aria-hidden="true">
            <MessageCircle size={26} strokeWidth={1.8} />
          </div>
        </div>
      </aside>
      {openUiPreview ? (
        <CopilotOpenUiPreviewModal
          code={openUiPreview.code}
          isStreaming={openUiPreview.isStreaming}
          onClose={() => setOpenUiPreview(null)}
        />
      ) : null}
    </>
  );
}
