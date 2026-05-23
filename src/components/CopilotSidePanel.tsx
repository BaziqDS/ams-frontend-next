"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type CSSProperties } from "react";
import { MessageCircle, Mic, Maximize2, SendHorizontal, SquarePen, X } from "lucide-react";
import { useCopilotInternal } from "@/contexts/CopilotContext";
import { CopilotOpenUiPreviewModal } from "@/components/CopilotOpenUiPreviewModal";

const CHAT_URL = process.env.NEXT_PUBLIC_COPILOT_URL ?? "http://localhost:3001";
const CHAT_ORIGIN = CHAT_URL.replace(/\/$/, "");
const DOCK_STORAGE_KEY = "ams-copilot-open";
const DOCK_POS_KEY   = "ams-copilot-pos";

const PLACEHOLDER_PHRASES = [
  "Ask about inspections...",
  "Search stock entries...",
  "Find items by category...",
  "Check maintenance schedules...",
  "Ask about locations...",
  "Ask AMS anything...",
];

type Pos = { left: number; top: number };

function loadPos(): Pos | null {
  if (typeof window === "undefined") return null;
  try { return JSON.parse(window.localStorage.getItem(DOCK_POS_KEY) ?? "null"); }
  catch { return null; }
}

export function CopilotSidePanel() {
  const [isOpen, setIsOpen] = useState(() => (
    typeof window !== "undefined" &&
    window.localStorage.getItem(DOCK_STORAGE_KEY) === "true"
  ));
  const [unreadCount, setUnreadCount]   = useState(0);
  const [quickMessage, setQuickMessage] = useState("");
  const [hideToolCalls, setHideToolCalls] = useState(false);
  const [placeholder, setPlaceholder]   = useState(PLACEHOLDER_PHRASES[0]);
  const [dragPos, setDragPos]           = useState<Pos | null>(loadPos);
  const [isDragging, setIsDragging]     = useState(false);
  const [openUiPreviewCode, setOpenUiPreviewCode] = useState<string | null>(null);

  const iframeRef       = useRef<HTMLIFrameElement>(null);
  const panelRef        = useRef<HTMLElement>(null);
  const searchTextareaRef = useRef<HTMLTextAreaElement>(null);
  const { setIframe } = useCopilotInternal();

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

  // Close panel when clicking outside it — but not when a modal is open
  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't close if the click is inside the panel itself
      if (panelRef.current?.contains(target)) return;
      // Don't close if a modal/dialog is open — let the modal handle its own interactions
      if (target.closest?.(".modal-backdrop, .modal, [role='dialog']")) return;
      setIsOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [isOpen]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== CHAT_ORIGIN) return;
      if (event.data?.source !== "ams-copilot-iframe") return;
      if (event.data?.type === "OPEN_OPENUI_PREVIEW") {
        if (typeof event.data.code === "string" && event.data.code.trim()) {
          setOpenUiPreviewCode(event.data.code);
        }
        return;
      }
      if (event.data?.type !== "ASSISTANT_MESSAGE") return;
      setUnreadCount((c) => (isOpen ? 0 : Math.min(99, c + 1)));
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [isOpen]);

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

  const postQuickMessage = useCallback((text: string, attempt = 0) => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) {
      if (attempt < 6) window.setTimeout(() => postQuickMessage(text, attempt + 1), 120);
      return;
    }
    iframe.contentWindow.postMessage({ source: "ams-copilot", type: "QUICK_MESSAGE", text }, CHAT_ORIGIN);
  }, []);

  const submitQuickMessage = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = quickMessage.trim();
    if (!text) return;
    setQuickMessage("");
    setIsOpen(true);
    window.setTimeout(() => postQuickMessage(text), 180);
  }, [postQuickMessage, quickMessage]);

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
    iframeRef.current?.contentWindow?.postMessage(
      { source: "ams-copilot", type: "START_NEW_THREAD" }, CHAT_ORIGIN,
    );
  }, []);

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
          className="copilot-search-overlay"
          style={overlayStyle}
          onSubmit={submitQuickMessage}
        >
          <textarea
            ref={searchTextareaRef}
            value={quickMessage}
            onChange={(event) => setQuickMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
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
                aria-label="Open chat panel" title="Open chat panel" onClick={() => setIsOpen(true)}>
                <Maximize2 size={14} strokeWidth={2} />
              </button>
              <button type="submit" className="copilot-search-send"
                aria-label="Send message" title="Send message" disabled={!quickMessage.trim()}>
                <SendHorizontal size={14} strokeWidth={2} />
              </button>
            </div>
          </div>
          {unreadCount > 0 ? (
            <span className="copilot-dock-unread"
              aria-label={`${unreadCount} unread assistant message${unreadCount === 1 ? "" : "s"}`}>
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
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
      {openUiPreviewCode ? (
        <CopilotOpenUiPreviewModal
          code={openUiPreviewCode}
          onClose={() => setOpenUiPreviewCode(null)}
        />
      ) : null}
    </>
  );
}
