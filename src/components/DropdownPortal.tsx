"use client";

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";

type DropdownPortalStyle = {
  left: number;
  right: number;
  top?: number;
  bottom?: number;
  width: number;
};

export function DropdownPortal({
  anchorRef,
  className,
  children,
  minWidth,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  className: string;
  children: ReactNode;
  minWidth?: number;
}) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [style, setStyle] = useState<DropdownPortalStyle | null>(null);
  const [mounted, setMounted] = useState(false);

  const updatePosition = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;

    const rect = anchor.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const gap = 4;
    const edgePadding = 8;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;
    const menuHeight = menuRef.current?.offsetHeight ?? 230;
    const openUp = spaceBelow < Math.min(menuHeight, 220) + edgePadding && spaceAbove > spaceBelow;
    const left = Math.max(edgePadding, Math.min(rect.left, viewportWidth - rect.width - edgePadding));
    const width = Math.max(minWidth ?? 0, rect.width);

    setStyle({
      left,
      right: Math.max(edgePadding, viewportWidth - left - width),
      width,
      top: openUp ? undefined : rect.bottom - 1,
      bottom: openUp ? viewportHeight - rect.top + gap : undefined,
    });
  }, [anchorRef, minWidth]);

  useLayoutEffect(() => {
    setMounted(true);
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [updatePosition]);

  useLayoutEffect(() => {
    updatePosition();
  }, [children, updatePosition]);

  if (!mounted || !style) return null;

  return createPortal(
    <div
      ref={menuRef}
      className={`${className} dropdown-portal-menu`}
      style={{
        position: "fixed",
        left: style.left,
        right: style.right,
        top: style.top,
        bottom: style.bottom,
        width: style.width,
      }}
      onMouseDown={event => event.preventDefault()}
    >
      {children}
    </div>,
    document.body,
  );
}
