"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, PanelRightClose, Sparkles, X } from "lucide-react";
import { useCopilotInternal } from "@/contexts/CopilotContext";

const CHAT_URL = process.env.NEXT_PUBLIC_COPILOT_URL ?? "http://localhost:3001";
const CHAT_ORIGIN = CHAT_URL.replace(/\/$/, "");
const DOCK_STORAGE_KEY = "ams-copilot-open";

export function CopilotSidePanel() {
  const [isOpen, setIsOpen] = useState(() => (
    typeof window !== "undefined" &&
    window.localStorage.getItem(DOCK_STORAGE_KEY) === "true"
  ));
  const [unreadCount, setUnreadCount] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { setIframe } = useCopilotInternal();

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
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) setIsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== CHAT_ORIGIN) return;
      if (event.data?.source !== "ams-copilot-iframe") return;
      if (event.data?.type !== "ASSISTANT_MESSAGE") return;
      setUnreadCount((current) => (isOpen ? 0 : Math.min(99, current + 1)));
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [isOpen]);

  const closePanel = useCallback(() => setIsOpen(false), []);

  return (
    <>
      {!isOpen ? (
        <button
          type="button"
          className="copilot-dock-launcher"
          aria-label="Open AI assistant"
          title="Open AI assistant"
          onClick={() => setIsOpen(true)}
        >
          <Sparkles size={21} strokeWidth={1.9} aria-hidden="true" />
          {unreadCount > 0 ? (
            <span
              className="copilot-dock-unread"
              aria-label={`${unreadCount} unread assistant message${unreadCount === 1 ? "" : "s"}`}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </button>
      ) : null}

      <aside
        className={`copilot-dock-panel${isOpen ? " is-open" : ""}`}
        role="complementary"
        aria-label="AMS AI assistant"
        aria-hidden={!isOpen}
      >
        <header className="copilot-dock-head">
          <div className="copilot-dock-title">
            <span className="copilot-dock-mark" aria-hidden="true">
              <Sparkles size={18} strokeWidth={2} />
            </span>
            <div className="copilot-dock-copy">
              <div className="copilot-dock-name">AMS Assistant</div>
              <div className="copilot-dock-sub">Chat</div>
            </div>
          </div>
          <div className="copilot-dock-actions">
            <button
              type="button"
              className="copilot-dock-icon-btn"
              aria-label="Collapse assistant"
              title="Collapse assistant"
              onClick={closePanel}
            >
              <PanelRightClose size={17} strokeWidth={1.9} />
            </button>
            <button
              type="button"
              className="copilot-dock-icon-btn"
              aria-label="Close assistant"
              title="Close assistant"
              onClick={closePanel}
            >
              <X size={17} strokeWidth={1.9} />
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
          />
          <div className="copilot-dock-empty" aria-hidden="true">
            <MessageCircle size={26} strokeWidth={1.8} />
          </div>
        </div>
      </aside>
    </>
  );
}
