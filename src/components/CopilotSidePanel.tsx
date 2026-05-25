"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type CSSProperties } from "react";
import { ClipboardList, LoaderCircle, MessageCircle, Mic, Maximize2, SendHorizontal, Sparkles, SquarePen, X } from "lucide-react";
import {
  COPILOT_HITL_INTERRUPT_EVENT,
  type CopilotHitlInterrupt,
  useCopilotInternal,
} from "@/contexts/CopilotContext";
import { CopilotOpenUiPreviewModal } from "@/components/CopilotOpenUiPreviewModal";
import {
  buildDetachedApprovalReview,
} from "@/lib/copilotDetachedApproval";

const CHAT_URL = process.env.NEXT_PUBLIC_COPILOT_URL ?? "http://localhost:3001";
const CHAT_ORIGIN = CHAT_URL.replace(/\/$/, "");
const DOCK_STORAGE_KEY = "ams-copilot-open";
const DOCK_POS_KEY   = "ams-copilot-pos";
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
  try { return JSON.parse(window.localStorage.getItem(DOCK_POS_KEY) ?? "null"); }
  catch { return null; }
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
  const [isOpen, setIsOpen] = useState(() => (
    typeof window !== "undefined" &&
    window.localStorage.getItem(DOCK_STORAGE_KEY) === "true"
  ));
  const [unreadCount, setUnreadCount]   = useState(0);
  const [quickMessage, setQuickMessage] = useState(
    () => restoredPendingRef.current?.text ?? "",
  );
  const [quickMessagePending, setQuickMessagePending] = useState(
    () => Boolean(restoredPendingRef.current),
  );
  const [currentTodo, setCurrentTodo] = useState<DetachedTodo>(null);
  const [approvalInterrupt, setApprovalInterrupt] =
    useState<CopilotHitlInterrupt | null>(null);
  const [approvalReviewContext, setApprovalReviewContext] =
    useState<ApprovalContextSnapshot | null>(null);
  const [approvalRequestedAt, setApprovalRequestedAt] =
    useState<Date | null>(null);
  const [hideToolCalls, setHideToolCalls] = useState(false);
  const [placeholder, setPlaceholder]   = useState(PLACEHOLDER_PHRASES[0]);
  const [dragPos, setDragPos]           = useState<Pos | null>(loadPos);
  const [isDragging, setIsDragging]     = useState(false);
  const [openUiPreview, setOpenUiPreview] = useState<{
    id: string;
    code: string;
    isStreaming: boolean;
  } | null>(null);

  const iframeRef       = useRef<HTMLIFrameElement>(null);
  const panelRef        = useRef<HTMLElement>(null);
  const searchTextareaRef = useRef<HTMLTextAreaElement>(null);
  const loadingStartedRef = useRef(false);
  const iframeReadyRef = useRef(false);
  const queuedQuickMessageRef = useRef<string | null>(null);
  const restoredPendingSentRef = useRef(false);
  // Timestamp (ms) until which incoming "loading=true" / HUMAN_MESSAGE events
  // are treated as stragglers from a just-stopped run and ignored.
  const stopGuardUntilRef = useRef(0);
  // Safety timer that auto-clears a stuck pending state.
  const pendingSafetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The text the user last sent. The composer keeps showing this text while
  // the agent runs (visual receipt that "I sent this"), and auto-clears it
  // only when the run truly completes — and only if the user has NOT edited
  // the input in the meantime (we never want to clobber a new draft).
  const lastSubmittedTextRef = useRef<string | null>(null);
  const userEditedSinceSubmitRef = useRef(false);
  const { setIframe, getContextSnapshot } = useCopilotInternal();

  const showApprovalInterrupt = useCallback((interrupt: CopilotHitlInterrupt | null) => {
    setApprovalInterrupt(interrupt);
    setApprovalReviewContext(interrupt ? getContextSnapshot() : null);
    setApprovalRequestedAt(interrupt ? new Date() : null);
  }, [getContextSnapshot]);

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

  useEffect(() => () => {
    if (pendingSafetyTimerRef.current) {
      clearTimeout(pendingSafetyTimerRef.current);
      pendingSafetyTimerRef.current = null;
    }
  }, []);

  useEffect(() => { setIframe(iframeRef.current); return () => setIframe(null); }, [setIframe]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("ams-copilot-docked", isOpen);
    window.localStorage.setItem(DOCK_STORAGE_KEY, isOpen ? "true" : "false");
    if (isOpen) setUnreadCount(0);
    return () => { document.documentElement.classList.remove("ams-copilot-docked"); };
  }, [isOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && isOpen) setIsOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  // Close panel whenever the user clicks outside it, including active AMS modals/forms.
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node | null;
      if (target && panelRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown, true);
    return () => document.removeEventListener("mousedown", onPointerDown, true);
  }, [isOpen]);

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
        const text = typeof event.data.text === "string" ? event.data.text.trim() : "";
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
      showApprovalInterrupt((event as CustomEvent<CopilotHitlInterrupt | null>).detail ?? null);
    };

    window.addEventListener(COPILOT_HITL_INTERRUPT_EVENT, onHitlInterrupt);
    return () => {
      window.removeEventListener(COPILOT_HITL_INTERRUPT_EVENT, onHitlInterrupt);
    };
  }, [showApprovalInterrupt]);

  // Typewriter cycling placeholder
  useEffect(() => {
    if (isOpen) return;
    let phraseIdx = 0, charIdx = 0, deleting = false;
    let tid: ReturnType<typeof setTimeout>;
    const tick = () => {
      const phrase = PLACEHOLDER_PHRASES[phraseIdx];
      if (!deleting) {
        charIdx++;
        setPlaceholder(phrase.slice(0, charIdx));
        if (charIdx === phrase.length) { deleting = true; tid = setTimeout(tick, 1800); }
        else tid = setTimeout(tick, 55);
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
      const t = window.setTimeout(() => searchTextareaRef.current?.focus(), 120);
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

    const r  = panel.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    const sl = r.left,    st = r.top;

    setIsDragging(true);
    e.preventDefault();

    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

    const onMove = (ev: MouseEvent) => {
      const left = clamp(sl + ev.clientX - sx, 8, window.innerWidth  - r.width  - 8);
      const top  = clamp(st + ev.clientY - sy, 8, window.innerHeight - r.height - 8);
      setDragPos({ left, top });
    };

    const onUp = (ev: MouseEvent) => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
      const left = clamp(sl + ev.clientX - sx, 8, window.innerWidth  - r.width  - 8);
      const top  = clamp(st + ev.clientY - sy, 8, window.innerHeight - r.height - 8);
      const pos  = { left, top };
      setDragPos(pos);
      setIsDragging(false);
      window.localStorage.setItem(DOCK_POS_KEY, JSON.stringify(pos));
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
  }, []);
  // ────────────────────────────────────────────────────────────────────────────

  const closePanel = useCallback(() => setIsOpen(false), []);
  const openPanel = useCallback(() => {
    setUnreadCount(0);
    setIsOpen(true);
  }, []);

  const postQuickMessage = useCallback((text: string, attempt = 0) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) {
      if (attempt < 6) window.setTimeout(() => postQuickMessage(text, attempt + 1), 120);
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
    iframe.contentWindow.postMessage({ source: "ams-copilot", type: "QUICK_MESSAGE", text }, CHAT_ORIGIN);
  }, [setPendingWithSafety]);

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

  const submitQuickMessage = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = quickMessage.trim();
    if (!text || quickMessagePending) return;
    // Keep the text in the composer as a visual receipt — the empty input
    // looks "lost" to the user. The send button flips to a spinning Cancel
    // button alongside it so the run-in-flight state is clear. The text
    // auto-clears when the run truly ends (ASSISTANT_LOADING=false) and
    // only if the user has not started typing a new draft.
    setQuickMessage(text);
    lastSubmittedTextRef.current = text;
    userEditedSinceSubmitRef.current = false;
    setPendingWithSafety(true);
    loadingStartedRef.current = true;
    saveDetachedPending(text);
    postQuickMessage(text);
  }, [postQuickMessage, quickMessage, quickMessagePending, setPendingWithSafety]);

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

  const startVoiceFromSearch = useCallback(() => {
    setIsOpen(true);
    window.setTimeout(() => {
      iframeRef.current?.contentWindow?.postMessage(
        { source: "ams-copilot", type: "START_VOICE_CAPTURE" }, CHAT_ORIGIN,
      );
    }, 180);
  }, []);

  const toggleHideToolCalls = useCallback(() => {
    setHideToolCalls((current) => {
      const next = !current;
      iframeRef.current?.contentWindow?.postMessage(
        { source: "ams-copilot", type: "SET_HIDE_TOOL_CALLS", value: next }, CHAT_ORIGIN,
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
      { source: "ams-copilot", type: "START_NEW_THREAD" }, CHAT_ORIGIN,
    );
  }, [setPendingWithSafety, showApprovalInterrupt]);

  // ── Computed styles ─────────────────────────────────────────────────────────
  // Panel: when dragged, override the CSS-based centering with exact left/top.
  // Hide via opacity only (not slide-off-screen transform) so it fades in/out
  // from its custom position rather than animating to/from center-bottom.
  const panelStyle: CSSProperties | undefined = dragPos ? {
    left:      dragPos.left,
    top:       dragPos.top,
    right:     "auto",
    bottom:    "auto",
    transform: "none",
  } : undefined;
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
  const overlayStyle: CSSProperties | undefined = dragPos ? {
    left:      dragPos.left,
    bottom:    "18px",
    transform: "none",   // override the default translateX(-50%)
  } : undefined;
  // ────────────────────────────────────────────────────────────────────────────

  return (
    <>
      {!isOpen ? (
        <form
          className={`copilot-search-overlay${hasApproval ? " has-approval" : ""}`}
          style={overlayStyle}
          onSubmit={submitQuickMessage}
        >
          {hasApproval && approvalReview ? (
            <button
              type="button"
              className="copilot-search-approval-bubble"
              aria-label={`Approval needed for ${approvalReview.title}. Open chat panel to review.`}
              aria-live="polite"
              onClick={openPanel}
            >
              <span className="copilot-search-approval-bubble-icon" aria-hidden="true">
                <ClipboardList size={15} strokeWidth={2} />
              </span>
              <span className="copilot-search-approval-bubble-copy">
                <span className="copilot-search-approval-bubble-title">
                  Approval needed
                </span>
                <span className="copilot-search-approval-bubble-text">
                  {approvalBubbleText}
                </span>
              </span>
              <Maximize2
                className="copilot-search-approval-bubble-open"
                size={14}
                strokeWidth={2}
                aria-hidden="true"
              />
            </button>
          ) : currentTodoText ? (
            <section className="copilot-search-active-task" role="status" aria-live="polite">
              <div className="copilot-search-active-task-main">
                <LoaderCircle size={16} strokeWidth={2} aria-hidden="true" />
                <div className="copilot-search-active-task-copy">
                  <span className="copilot-search-active-task-title">Tasks</span>
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
            rows={1}
          />
          <div className="copilot-search-actions">
            <div className="copilot-search-right-actions">
              <button type="button" className="copilot-search-icon-btn"
                aria-label="Start voice" title="Start voice" onClick={startVoiceFromSearch}>
                <Mic size={15} strokeWidth={1.9} />
              </button>
              <button type="button" className="copilot-search-expand-btn"
                aria-label="Open chat panel" title="Open chat panel" onClick={openPanel}>
                <Maximize2 size={14} strokeWidth={2} />
              </button>
              <button
                type={quickMessagePending ? "button" : "submit"}
                className={
                  "copilot-search-send" +
                  (quickMessagePending ? " is-loading" : "")
                }
                aria-label={quickMessagePending ? "Stop task" : "Send message"}
                title={quickMessagePending ? "Stop task (click to cancel)" : "Send message"}
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
                  <SendHorizontal size={12} strokeWidth={2} />
                )}
              </button>
            </div>
          </div>
          {unreadCount > 0 && !hasApproval ? (
            <button
              type="button"
              className="copilot-dock-reply-pop"
              aria-label={`${unreadCount} unread assistant message${unreadCount === 1 ? "" : "s"}. Open chat panel.`}
              onClick={openPanel}
            >
              <Sparkles size={15} strokeWidth={2} aria-hidden="true" />
              <span>Assistant has a new reply</span>
              <span className="copilot-dock-reply-dot" aria-hidden="true" />
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
          <button type="button" className="copilot-dock-icon-btn"
            aria-label="Close assistant" title="Close assistant" onClick={closePanel}>
            <X size={14} strokeWidth={1.8} />
          </button>
          <div className="copilot-dock-actions">
            <button type="button" className="copilot-dock-icon-btn"
              aria-label="New chat" title="New chat" onClick={startNewChat}>
              <SquarePen size={14} strokeWidth={1.8} />
            </button>
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
