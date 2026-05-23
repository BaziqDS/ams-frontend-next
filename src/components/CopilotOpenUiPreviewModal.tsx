"use client";

import { Component, type ErrorInfo, type ReactNode, useEffect } from "react";
import { Renderer } from "@openuidev/react-lang";
import { ThemeProvider, defaultLightTheme, openuiLibrary } from "@openuidev/react-ui";

class CopilotOpenUiPreviewBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; resetKey: string },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Copilot OpenUI preview failed", error, info);
  }

  override componentDidUpdate(previousProps: Readonly<{ resetKey: string }>) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  override render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

export function CopilotOpenUiPreviewModal({
  code,
  onClose,
}: {
  code: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="copilot-openui-preview-backdrop" onMouseDown={onClose}>
      <section
        className="copilot-openui-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-label="OpenUI preview"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="copilot-openui-preview-head">
          <div className="copilot-openui-preview-label">
            <span>Preview</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 3h6v6" />
              <path d="M21 3l-7 7" />
              <path d="M9 21H3v-6" />
              <path d="M3 21l7-7" />
            </svg>
          </div>
          <button
            type="button"
            className="copilot-openui-preview-close"
            onClick={onClose}
            aria-label="Close preview"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>
        <div className="copilot-openui-preview-body assistant-openui-theme">
          <ThemeProvider mode="light" lightTheme={defaultLightTheme} cssSelector=".assistant-openui-theme">
            <CopilotOpenUiPreviewBoundary
              resetKey={code}
              fallback={<div className="assistant-genui-error">The generated UI could not be rendered safely.</div>}
            >
              <Renderer library={openuiLibrary} response={code} isStreaming={false} />
            </CopilotOpenUiPreviewBoundary>
          </ThemeProvider>
        </div>
      </section>
    </div>
  );
}
