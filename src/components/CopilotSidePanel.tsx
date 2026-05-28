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
  ChevronDown,
  ChevronUp,
  Clock3,
  LoaderCircle,
  MessageCircle,
  Mic,
  Maximize2,
  Sparkles,
  SquarePen,
  UserRound,
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
import { translateText } from "@/lib/voiceTranslate";
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
const DETACHED_COMPOSER_OPEN_KEY = "ams-copilot-detached-open";
const DETACHED_PENDING_KEY = "ams-copilot-detached-pending";
const DETACHED_PENDING_TTL_MS = 10 * 60 * 1000;
// After the user clicks stop, ignore any straggler ASSISTANT_LOADING=true /
// HUMAN_MESSAGE events from the iframe for this many milliseconds. The
// langgraph stream may emit one last "loading" tick while winding down, and
// without this guard the parent re-locks the composer immediately after stop.
const STOP_GUARD_MS = 2000;
// Safety net: if the parent thinks the agent is still running but no events
// arrive for this long, auto-unlock the composer. Prevents the textarea from
// being permanently stuck if a postMessage is missed.
const PENDING_SAFETY_TIMEOUT_MS = 45 * 1000;

const PLACEHOLDER_PHRASES = [
  "Ask about inspections...",
  "Search stock entries...",
  "Find items by category...",
  "Check maintenance schedules...",
  "Ask about locations...",
  "Ask AMS anything...",
];

type Pos = { left: number; top: number };
type DetachedTodo = { content?: unknown; status?: unknown } | null;
type DetachedPending = { text: string; at: number } | null;
type ApprovalContextSnapshot = {
  readables?: Array<{ id?: string; description?: string; value?: unknown }>;
};

function loadPos(): Pos | null {
  if (typeof window === "undefined") return null;
  try {
    return JSON.parse(window.localStorage.getItem(DOCK_POS_KEY) ?? "null");
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
  const [unreadCount, setUnreadCount] = useState(0);
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
  // Detached composer: collapsed launcher pill by default, expands to the
  // existing compact detached composer on click. Persisted across sessions so
  // the user's preference sticks.
  const [composerOpen, setComposerOpen] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(DETACHED_COMPOSER_OPEN_KEY) === "true";
  });

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const composerFormRef = useRef<HTMLFormElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
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
    setComposerOpen(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DETACHED_COMPOSER_OPEN_KEY, "true");
    }
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
    if (isOpen) setUnreadCount(0);
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
      if (event.data?.type !== "ASSISTANT_MESSAGE") return;
      loadingStartedRef.current = false;
      queuedQuickMessageRef.current = null;
      clearDetachedPending();
      setPendingWithSafety(false);
      // Do NOT clear quickMessage here. This event fires on the FIRST
      // assistant token (mid-stream), and the user may already be typing
      // the next message — clearing would wipe their draft. The input was
      // already cleared at submit time.
      setUnreadCount((c) => (isOpen ? 0 : Math.min(99, c + 1)));
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [isOpen, setPendingWithSafety, showApprovalInterrupt]);

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

    const clamp = (v: number, lo: number, hi: number) =>
      Math.max(lo, Math.min(hi, v));

    const onMove = (ev: MouseEvent) => {
      const left = clamp(
        sl + ev.clientX - sx,
        8,
        window.innerWidth - r.width - 8,
      );
      const top = clamp(
        st + ev.clientY - sy,
        8,
        window.innerHeight - r.height - 8,
      );
      setDragPos({ left, top });
    };

    const onUp = (ev: MouseEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      const left = clamp(
        sl + ev.clientX - sx,
        8,
        window.innerWidth - r.width - 8,
      );
      const top = clamp(
        st + ev.clientY - sy,
        8,
        window.innerHeight - r.height - 8,
      );
      const pos = { left, top };
      setDragPos(pos);
      setIsDragging(false);
      window.localStorage.setItem(DOCK_POS_KEY, JSON.stringify(pos));
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);
  // ────────────────────────────────────────────────────────────────────────────

  const openPanel = useCallback(() => {
    setUnreadCount(0);
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
      voiceInputRef.current = false;

      const sendText = (finalText: string) => {
        setQuickMessage(finalText);
        lastSubmittedTextRef.current = finalText;
        userEditedSinceSubmitRef.current = false;
        setPendingWithSafety(true);
        loadingStartedRef.current = true;
        saveDetachedPending(finalText);
        postQuickMessage(finalText);
      };

      // Translate to English whenever the message contains Urdu/Arabic script
      // (U+0600..U+06FF). This works whether the text came from the mic, a
      // paste, or a manual type — the agent always receives English.
      const hasUrdu = /[؀-ۿ]/.test(text);
      if (!hasUrdu) {
        sendText(text);
        return;
      }

      setPendingWithSafety(true);
      lastSubmittedTextRef.current = text;
      userEditedSinceSubmitRef.current = false;
      translateText(text, "en", "ur")
        .then((result) => {
          if (!result.ok || !result.translatedText.trim()) {
            console.warn("[CopilotSidePanel] translate failed, sending original:", result.error);
            sendText(text);
            return;
          }
          console.info("[CopilotSidePanel] translated:", text, "→", result.translatedText);
          sendText(result.translatedText.trim());
        })
        .catch((err) => {
          console.warn("[CopilotSidePanel] translate threw, sending original:", err);
          sendText(text);
        });
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
    voiceInputRef.current = false;
    iframeRef.current?.contentWindow?.postMessage(
      { source: "ams-copilot", type: "STOP_RUN" },
      CHAT_ORIGIN,
    );
  }, [setPendingWithSafety]);

  // Voice input via the browser's built-in SpeechRecognition. Live interim
  // results stream straight into the composer as the user speaks. On submit,
  // any Urdu/Arabic-script text is translated to English (Google Translate)
  // before being handed to the agent.
  const [isRecording, setIsRecording] = useState(false);
  const recognitionRef = useRef<{
    stop: () => void;
    abort: () => void;
    onresult: ((event: unknown) => void) | null;
    onerror: ((event: unknown) => void) | null;
    onend: (() => void) | null;
  } | null>(null);
  const recordingBaseTextRef = useRef("");
  const voiceInputRef = useRef(false);

  const stopVoiceRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    setIsRecording(false);
    if (recognition) {
      // Detach handlers BEFORE stop() so any late onresult/onend events from
      // the browser don't clobber the user's manual edits after they pressed
      // stop. Once handlers are null, the transcript shown in the composer
      // is the user's to edit freely.
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
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
    // Focus the composer and put the cursor at the end so the user can
    // immediately tweak any misheard words and hit Enter to send.
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
  }, []);

  const startVoiceFromSearch = useCallback(() => {
    if (typeof window === "undefined") return;
    if (recognitionRef.current) {
      stopVoiceRecognition();
      return;
    }
    type SpeechRecognitionLike = {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      onresult: ((event: unknown) => void) | null;
      onerror: ((event: unknown) => void) | null;
      onend: (() => void) | null;
      start: () => void;
      stop: () => void;
      abort: () => void;
    };
    const win = window as typeof window & {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Recognition = win.SpeechRecognition ?? win.webkitSpeechRecognition;
    if (!Recognition) {
      console.warn("[CopilotSidePanel] SpeechRecognition not available");
      return;
    }
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "ur-PK";
    recordingBaseTextRef.current = quickMessage ? `${quickMessage} ` : "";
    userEditedSinceSubmitRef.current = true;
    recognition.onresult = (event: unknown) => {
      const results = (event as {
        results?: ArrayLike<ArrayLike<{ transcript?: string }>>;
      }).results;
      if (!results) return;
      const parts: string[] = [];
      for (let i = 0; i < results.length; i += 1) {
        const item = results[i]?.[0]?.transcript;
        if (item) parts.push(item);
      }
      const joined = parts.join(" ").replace(/\s+/g, " ").trim();
      voiceInputRef.current = true;
      setQuickMessage(`${recordingBaseTextRef.current}${joined}`);
    };
    recognition.onerror = () => {
      recognitionRef.current = null;
      setIsRecording(false);
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setIsRecording(false);
    };
    try {
      recognition.start();
      recognitionRef.current = recognition;
      setIsRecording(true);
    } catch {
      recognitionRef.current = null;
      setIsRecording(false);
    }
  }, [quickMessage, stopVoiceRecognition]);

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
    showApprovalInterrupt(null);
    iframeRef.current?.contentWindow?.postMessage(
      { source: "ams-copilot", type: "START_NEW_THREAD" },
      CHAT_ORIGIN,
    );
  }, [setPendingWithSafety, showApprovalInterrupt]);

  // ── Detached composer open/close ───────────────────────────────────────────
  const persistComposerOpen = useCallback((next: boolean) => {
    setComposerOpen(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DETACHED_COMPOSER_OPEN_KEY, next ? "true" : "false");
    }
  }, []);
  const openComposer = useCallback(() => persistComposerOpen(true), [persistComposerOpen]);
  const closeComposer = useCallback(() => persistComposerOpen(false), [persistComposerOpen]);

  // Auto-open when a human-in-the-loop approval arrives so the user can't miss
  // it, but do not force it open again after the user manually collapses it.
  useEffect(() => {
    if (approvalInterrupt?.actionRequests?.length) {
      persistComposerOpen(true);
    }
  }, [approvalInterrupt, persistComposerOpen]);

  // Esc closes the composer when it's open.
  useEffect(() => {
    if (!composerOpen) return;
    const handle = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      closeComposer();
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [closeComposer, composerOpen]);

  // NOTE: the detached composer is intentionally STICKY — it stays on screen
  // until the user explicitly collapses it via the ChevronDown button (or
  // Esc, handled above). Clicking outside is no longer a dismiss path.
  //
  // Two reasons:
  // 1. The composer doubles as a persistent assistant entry point. If a user
  //    just closed the chat panel, they almost always want the composer
  //    available without a second click to re-summon it from the pill.
  // 2. A previous click-outside handler raced with the panel's own
  //    click-outside (which calls closePanel → composerOpen=true). Both
  //    fired on the same click and net-effect was "land on the pill", not
  //    on the detached composer. Removing this handler is what fixes that.

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

  const launcherStatus: "idle" | "working" | "approval" | "unread" =
    hasApproval
      ? "approval"
      : quickMessagePending
        ? "working"
        : unreadCount > 0
          ? "unread"
          : "idle";
  const launcherStatusLabel =
    launcherStatus === "approval"
      ? "Approval needed"
      : launcherStatus === "working"
        ? "Working…"
        : launcherStatus === "unread"
          ? `${unreadCount} new repl${unreadCount === 1 ? "y" : "ies"}`
          : "Idle";
  // Conversational pill copy. Shorter than a status label, written so the
  // line reads naturally end-to-end ("AMS Copilot is ready — Open"). Kept
  // separate from launcherStatusLabel so the longer status word stays
  // available for the aria-label.
  const launcherMessage =
    launcherStatus === "approval"
      ? "AMS Copilot needs your approval"
      : launcherStatus === "working"
        ? "AMS Copilot is working…"
        : launcherStatus === "unread"
          ? unreadCount === 1
            ? "AMS Copilot has a new reply"
            : `AMS Copilot has ${unreadCount} new replies`
          : "Ask AMS Copilot anything";
  const launcherCtaLabel = launcherStatus === "approval" ? "Review" : "Open";

  return (
    <>
      {!isOpen && !composerOpen ? (
        <button
          ref={launcherRef}
          type="button"
          className={`copilot-launcher copilot-launcher--${launcherStatus}`}
          onClick={openComposer}
          aria-label={`Open AMS Copilot (${launcherStatusLabel})`}
          title="Open AMS Copilot"
        >
          <span className="copilot-launcher-icon" aria-hidden="true">
            <Sparkles size={14} strokeWidth={1.9} />
          </span>
          <span className="copilot-launcher-message">{launcherMessage}</span>
          <span className="copilot-launcher-cta" aria-hidden="true">{launcherCtaLabel}</span>
        </button>
      ) : null}

      {!isOpen && composerOpen ? (
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
              // User manually edited — no longer a pure voice draft, skip
              // auto-translation on submit.
              voiceInputRef.current = false;
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
            rows={1}
          />
          <div className="copilot-search-actions">
            <div className="copilot-search-right-actions">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="copilot-search-icon-btn copilot-search-collapse-btn"
                aria-label="Collapse AMS Copilot"
                title="Collapse"
                onClick={closeComposer}
              >
                <ChevronDown size={15} strokeWidth={2.1} />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="copilot-search-icon-btn"
                aria-label={isRecording ? "Stop voice" : "Start voice"}
                title={isRecording ? "Stop voice" : "Start voice"}
                onClick={startVoiceFromSearch}
                style={isRecording ? { color: "var(--danger)" } : undefined}
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
          {unreadCount > 0 && !hasApproval ? (
            <button
              type="button"
              className="copilot-dock-reply-pop"
              aria-label={`${unreadCount} unread assistant message${unreadCount === 1 ? "" : "s"}. Open chat panel.`}
              onClick={openPanel}
            >
              <span className="copilot-dock-reply-dot" aria-hidden="true" />
              <span>Assistant has a new reply</span>
            </button>
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
