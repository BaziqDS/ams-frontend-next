"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCopilotInternal } from "@/contexts/CopilotContext";

const CHAT_URL = process.env.NEXT_PUBLIC_COPILOT_URL ?? "http://localhost:3001";
const CHAT_ORIGIN = CHAT_URL.replace(/\/$/, "");

const BUTTON_W = 56;
const BUTTON_H = 56;
const VIEWPORT_PADDING = 12;
const DRAG_THRESHOLD_PX = 5;
const POS_STORAGE_KEY = "ams-copilot-button-pos";

const PANEL_MAX_W = 620;
const PANEL_MAX_H = 720;
const PANEL_BUTTON_GAP = 8;
const MOBILE_BREAKPOINT = 720;

type Pos = { x: number; y: number };

type PanelPlacement = {
  left: number;
  top: number;
  width: number;
  height: number;
  originH: "left" | "right";
  originV: "top" | "bottom";
};

function clampToViewport(pos: Pos): Pos {
  if (typeof window === "undefined") return pos;
  const maxX = window.innerWidth - BUTTON_W - VIEWPORT_PADDING;
  const maxY = window.innerHeight - BUTTON_H - VIEWPORT_PADDING;
  return {
    x: Math.min(Math.max(VIEWPORT_PADDING, pos.x), Math.max(VIEWPORT_PADDING, maxX)),
    y: Math.min(Math.max(VIEWPORT_PADDING, pos.y), Math.max(VIEWPORT_PADDING, maxY)),
  };
}

function defaultPos(): Pos {
  if (typeof window === "undefined") return { x: 0, y: 0 };
  return {
    x: window.innerWidth - BUTTON_W - 20,
    y: window.innerHeight - BUTTON_H - 20,
  };
}

/**
 * Compute where the panel should open based on the button's position.
 *
 * Rule:
 *   - Panel grows AWAY from the button toward open space.
 *   - Horizontally: if the button is on the right half of the viewport, the
 *     panel extends to the left of the button (right-anchored). Otherwise it
 *     extends right (left-anchored).
 *   - Vertically: same idea — if the button is on the bottom half, the panel
 *     extends upward (bottom-anchored). Otherwise it extends downward.
 *   - On small viewports (< MOBILE_BREAKPOINT wide), the panel covers the
 *     viewport with safe margins regardless of button position.
 *   - The resulting rect is clamped to the viewport so the panel can never
 *     extend off-screen.
 *
 * The chosen corner is also returned as the transform-origin so the opening
 * scale animation feels like the panel grew out of the button.
 */
function calculatePanelPlacement(btnPos: Pos): PanelPlacement {
  if (typeof window === "undefined") {
    return {
      left: VIEWPORT_PADDING,
      top: VIEWPORT_PADDING,
      width: PANEL_MAX_W,
      height: PANEL_MAX_H,
      originH: "right",
      originV: "bottom",
    };
  }

  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Mobile: full viewport with safe margins
  if (vw < MOBILE_BREAKPOINT) {
    return {
      left: VIEWPORT_PADDING,
      top: VIEWPORT_PADDING,
      width: vw - VIEWPORT_PADDING * 2,
      height: vh - VIEWPORT_PADDING * 2,
      originH: btnPos.x + BUTTON_W / 2 > vw / 2 ? "right" : "left",
      originV: btnPos.y + BUTTON_H / 2 > vh / 2 ? "bottom" : "top",
    };
  }

  const desiredW = Math.min(PANEL_MAX_W, vw - VIEWPORT_PADDING * 2);
  const desiredH = Math.min(PANEL_MAX_H, vh - VIEWPORT_PADDING * 2);

  const btnCenterX = btnPos.x + BUTTON_W / 2;
  const btnCenterY = btnPos.y + BUTTON_H / 2;
  const panelGoesLeft = btnCenterX > vw / 2;
  const panelGoesUp = btnCenterY > vh / 2;

  let left = panelGoesLeft
    ? btnPos.x + BUTTON_W - desiredW
    : btnPos.x;
  let top = panelGoesUp
    ? btnPos.y - desiredH - PANEL_BUTTON_GAP
    : btnPos.y + BUTTON_H + PANEL_BUTTON_GAP;

  // Clamp to viewport
  left = Math.max(VIEWPORT_PADDING, Math.min(left, vw - desiredW - VIEWPORT_PADDING));
  top = Math.max(VIEWPORT_PADDING, Math.min(top, vh - desiredH - VIEWPORT_PADDING));

  return {
    left,
    top,
    width: desiredW,
    height: desiredH,
    originH: panelGoesLeft ? "right" : "left",
    originV: panelGoesUp ? "bottom" : "top",
  };
}

function loadSavedPos(): Pos | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(POS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Pos;
    if (typeof parsed?.x !== "number" || typeof parsed?.y !== "number") return null;
    return clampToViewport(parsed);
  } catch {
    return null;
  }
}

export function CopilotSidePanel() {
  const [isOpen, setIsOpen] = useState(() => (
    typeof window !== "undefined" &&
    window.localStorage.getItem("ams-copilot-open") === "true"
  ));
  const [buttonPos, setButtonPos] = useState<Pos>(() => loadSavedPos() ?? defaultPos());
  const [isDragging, setIsDragging] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
    pointerId: number;
  } | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const { setIframe } = useCopilotInternal();

  // Register the iframe with the context exactly once. The iframe is kept
  // mounted across panel open/close so the chat session and history persist.
  useEffect(() => {
    setIframe(iframeRef.current);
    return () => setIframe(null);
  }, [setIframe]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) setIsOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  useEffect(() => {
    window.localStorage.setItem("ams-copilot-open", isOpen ? "true" : "false");
    if (isOpen) setUnreadCount(0);
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

  // Re-clamp on viewport resize so the button never ends up off-screen.
  // We also bump a tick so the panel placement memo recomputes.
  const [, setViewportTick] = useState(0);
  useEffect(() => {
    const onResize = () => {
      setButtonPos((prev) => clampToViewport(prev));
      setViewportTick((t) => t + 1);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Where the panel should appear, based on the button's current position.
  // Recomputed when buttonPos or the viewport changes.
  const placement = useMemo<PanelPlacement>(
    () => calculatePanelPlacement(buttonPos),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buttonPos.x, buttonPos.y, isOpen],
  );

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const btn = e.currentTarget;
    btn.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: buttonPos.x,
      origY: buttonPos.y,
      moved: false,
      pointerId: e.pointerId,
    };
  }, [buttonPos.x, buttonPos.y]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    if (!drag.moved) {
      drag.moved = true;
      setIsDragging(true);
    }
    setButtonPos(clampToViewport({ x: drag.origX + dx, y: drag.origY + dy }));
  }, []);

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (drag.moved) {
      // Persist the new position
      try {
        window.localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(buttonPos));
      } catch {
        /* ignore quota */
      }
      setIsDragging(false);
    } else {
      // Treat as a click — open the panel
      setIsOpen(true);
    }
    dragRef.current = null;
  }, [buttonPos]);

  const handlePointerCancel = useCallback(() => {
    if (dragRef.current?.moved) setIsDragging(false);
    dragRef.current = null;
  }, []);

  return (
    <>
      {!isOpen && (
        <button
          type="button"
          aria-label="Open AI assistant (drag to move)"
          title="Open assistant - drag to move"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onContextMenu={(e) => e.preventDefault()}
          style={{
            position: "fixed",
            left: buttonPos.x,
            top: buttonPos.y,
            width: BUTTON_W,
            height: BUTTON_H,
            padding: 0,
            borderRadius: 999,
            background: "var(--primary)",
            color: "var(--primary-ink)",
            border: "1px solid color-mix(in oklab, var(--primary), white 18%)",
            boxShadow: isDragging
              ? "0 16px 32px -8px rgba(15, 23, 42, 0.35), 0 4px 12px -2px rgba(15, 23, 42, 0.18)"
              : "var(--shadow-md)",
            cursor: isDragging ? "grabbing" : "grab",
            zIndex: 1100,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 0,
            fontFamily: "var(--font-sans)",
            fontSize: 13,
            fontWeight: 500,
            letterSpacing: "-0.005em",
            transform: isDragging ? "scale(1.04)" : "scale(1)",
            transition: isDragging
              ? "box-shadow var(--t-fast), transform var(--t-fast)"
              : "box-shadow var(--t-fast), transform var(--t-fast), left 180ms cubic-bezier(0.2, 0, 0, 1), top 180ms cubic-bezier(0.2, 0, 0, 1)",
            touchAction: "none",
            userSelect: "none",
            WebkitUserSelect: "none",
          }}
          onMouseEnter={(e) => {
            if (isDragging) return;
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              "var(--shadow-lg)";
          }}
          onMouseLeave={(e) => {
            if (isDragging) return;
            (e.currentTarget as HTMLButtonElement).style.boxShadow =
              "var(--shadow-md)";
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M12 3l1.9 4.9L19 10l-4 3.3.9 5.2L12 16l-3.9 2.5.9-5.2L5 10l5.1-2.1L12 3z" />
          </svg>
          {unreadCount > 0 ? (
            <span
              aria-label={`${unreadCount} unread assistant message${unreadCount === 1 ? "" : "s"}`}
              style={{
                position: "absolute",
                right: -4,
                top: -5,
                minWidth: 20,
                height: 20,
                padding: "0 5px",
                borderRadius: 999,
                background: "#dc2626",
                color: "#fff",
                border: "2px solid var(--card)",
                boxShadow: "0 6px 16px rgba(220, 38, 38, 0.28)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 700,
                lineHeight: 1,
              }}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          ) : null}
        </button>
      )}

      <div
        aria-hidden={!isOpen}
        style={{
          position: "fixed",
          inset: 0,
          background: "var(--overlay)",
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transition: "opacity var(--t)",
          zIndex: 1090,
        }}
        onClick={() => setIsOpen(false)}
      />

      <aside
        role="complementary"
        aria-label="AI assistant"
        style={{
          position: "fixed",
          left: placement.left,
          top: placement.top,
          width: placement.width,
          height: placement.height,
          background: "var(--card)",
          boxShadow:
            "0 24px 56px -16px rgba(15, 23, 42, 0.28), 0 6px 18px -6px rgba(15, 23, 42, 0.12)",
          transform: isOpen ? "scale(1)" : "scale(0.92)",
          transformOrigin: `${placement.originV} ${placement.originH}`,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? "auto" : "none",
          transition:
            "transform var(--t), opacity var(--t-fast), left var(--t), top var(--t), width var(--t-fast), height var(--t-fast)",
          zIndex: 1095,
          display: "flex",
          flexDirection: "column",
          border: "1px solid var(--hairline)",
          borderRadius: 14,
          overflow: "hidden",
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "10px 14px",
            borderBottom: "1px solid var(--hairline)",
            background: "var(--surface-2)",
            flexShrink: 0,
            height: 52,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "var(--radius-sm)",
                background: "var(--primary)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--primary-ink)",
                fontFamily: "var(--font-display)",
                fontSize: 15,
                fontWeight: 500,
                fontStyle: "italic",
              }}
            >
              A
            </div>
            <div>
              <div
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  color: "var(--ink)",
                  letterSpacing: "-0.005em",
                }}
              >
                AMS Assistant
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)" }}>
                Beta · Esc to close
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Close panel"
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--ink-2)",
              cursor: "pointer",
              width: 28,
              height: 28,
              borderRadius: "var(--radius-sm)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background var(--t-fast), border-color var(--t-fast)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "var(--surface)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <div style={{ flex: 1, position: "relative", background: "var(--card)" }}>
          <iframe
            ref={iframeRef}
            src={CHAT_URL}
            title="AMS Assistant"
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              border: "none",
            }}
            allow="clipboard-read; clipboard-write"
          />
        </div>
      </aside>
    </>
  );
}
