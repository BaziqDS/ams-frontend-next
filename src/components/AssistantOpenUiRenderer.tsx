"use client";

import { Component, type ErrorInfo, type ReactNode, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Renderer } from "@openuidev/react-lang";
import { MarkDownRenderer, ThemeProvider, createTheme, openuiChatLibrary } from "@openuidev/react-ui";

const assistantOpenUiTheme = createTheme({
  background: "oklch(0.982 0.006 95)",
  foreground: "oklch(1 0 0)",
  popoverBackground: "oklch(1 0 0)",
  sunkLight: "oklch(0.96 0.006 95)",
  sunk: "oklch(0.94 0.008 95)",
  sunkDeep: "oklch(0.90 0.01 95)",
  elevatedLight: "oklch(1 0 0)",
  elevated: "oklch(1 0 0)",
  elevatedStrong: "oklch(0.985 0.004 95)",
  elevatedIntense: "oklch(0.97 0.006 95)",
  highlightSubtle: "oklch(0.96 0.012 255)",
  highlight: "oklch(0.94 0.018 255)",
  highlightStrong: "oklch(0.90 0.024 255)",
  textNeutralPrimary: "oklch(0.18 0.012 255)",
  textNeutralSecondary: "oklch(0.43 0.018 255)",
  textNeutralTertiary: "oklch(0.62 0.014 255)",
  textNeutralLink: "oklch(0.42 0.09 255)",
  textBrand: "oklch(0.42 0.09 255)",
  interactiveAccentDefault: "oklch(0.42 0.09 255)",
  interactiveAccentHover: "oklch(0.38 0.09 255)",
  interactiveAccentPressed: "oklch(0.34 0.09 255)",
  borderDefault: "oklch(0.88 0.006 95)",
  borderInteractive: "oklch(0.80 0.01 95)",
  borderInteractiveEmphasis: "oklch(0.62 0.018 255)",
  borderInteractiveSelected: "oklch(0.42 0.09 255)",
  chatUserResponseBg: "oklch(0.95 0.02 255)",
  chatUserResponseText: "oklch(0.18 0.012 255)",
  spaceXs: "4px",
  spaceS: "6px",
  spaceSM: "8px",
  spaceM: "10px",
  spaceML: "12px",
  spaceL: "14px",
  spaceXl: "18px",
  space2xl: "24px",
  space3xl: "32px",
  fontSizeXs: "11px",
  fontSizeSm: "12px",
  fontSizeMd: "13px",
  fontSizeLg: "15px",
  fontSizeXl: "17px",
  fontSize2xl: "19px",
  fontSize3xl: "22px",
  textBodyXs: "400 11px/1.4 \"Instrument Sans\", sans-serif",
  textBodyXsHeavy: "600 11px/1.4 \"Instrument Sans\", sans-serif",
  textBodySm: "400 12px/1.45 \"Instrument Sans\", sans-serif",
  textBodySmHeavy: "600 12px/1.45 \"Instrument Sans\", sans-serif",
  textBodyDefault: "400 13px/1.45 \"Instrument Sans\", sans-serif",
  textBodyDefaultHeavy: "600 13px/1.45 \"Instrument Sans\", sans-serif",
  textHeadingXs: "650 14px/1.25 \"Instrument Sans\", sans-serif",
  textHeadingSm: "650 15px/1.25 \"Instrument Sans\", sans-serif",
  textHeadingMd: "700 17px/1.2 \"Instrument Sans\", sans-serif",
  textHeadingLg: "700 19px/1.2 \"Instrument Sans\", sans-serif",
  textLabelXs: "500 10px/1.25 \"Instrument Sans\", sans-serif",
  textLabelXsHeavy: "700 10px/1.25 \"Instrument Sans\", sans-serif",
  textLabelSm: "500 11px/1.25 \"Instrument Sans\", sans-serif",
  textLabelSmHeavy: "700 11px/1.25 \"Instrument Sans\", sans-serif",
  textLabelDefault: "500 12px/1.25 \"Instrument Sans\", sans-serif",
  textLabelDefaultHeavy: "700 12px/1.25 \"Instrument Sans\", sans-serif",
  textNumbersSm: "500 12px/1.35 \"Instrument Sans\", sans-serif",
  textNumbersSmHeavy: "700 12px/1.35 \"Instrument Sans\", sans-serif",
  textNumbersDefault: "500 13px/1.35 \"Instrument Sans\", sans-serif",
  textNumbersDefaultHeavy: "700 13px/1.35 \"Instrument Sans\", sans-serif",
  textNumbersHeadingSm: "700 15px/1.2 \"Instrument Sans\", sans-serif",
  textNumbersHeadingMd: "700 17px/1.2 \"Instrument Sans\", sans-serif",
  radiusM: "8px",
  radiusL: "8px",
  radiusXl: "8px",
  radius2xl: "8px",
  radius3xl: "10px",
  fontBody: "\"Instrument Sans\", sans-serif",
  fontHeading: "\"Instrument Sans\", sans-serif",
  fontLabel: "\"Instrument Sans\", sans-serif",
  fontNumbers: "\"Instrument Sans\", sans-serif",
  fontCode: "\"JetBrains Mono\", monospace",
});

class OpenUiRenderBoundary extends Component<
  { children: ReactNode; fallback: ReactNode; resetKey: string },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {}

  override componentDidUpdate(previousProps: Readonly<{ resetKey: string }>) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  override render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export function AssistantOpenUiRenderer({
  code,
  isStreaming,
}: {
  code: string;
  isStreaming: boolean;
}) {
  const [renderErrors, setRenderErrors] = useState<string[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    setRenderErrors([]);
  }, [code]);

  useEffect(() => {
    if (!isExpanded) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsExpanded(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isExpanded]);

  const fallback = (
    <div className="assistant-genui-error">
      <div className="eyebrow">Render issue</div>
      <div>The generated UI could not be rendered safely. The plain-text answer is still shown above.</div>
    </div>
  );

  return (
    <div className="assistant-genui-shell assistant-openui-theme">
      <div className="assistant-genui-toolbar">
        <span className="assistant-genui-toolbar-label">Preview</span>
        <button
          type="button"
          className="assistant-genui-expand"
          onClick={() => setIsExpanded(true)}
          aria-label="Open generated UI in larger view"
        >
          <span>Larger view</span>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 3h6v6" />
            <path d="M21 3l-7 7" />
            <path d="M9 21H3v-6" />
            <path d="M3 21l7-7" />
          </svg>
        </button>
      </div>
      <div className="assistant-genui-render-area">
        <ThemeProvider mode="light" lightTheme={assistantOpenUiTheme} cssSelector=".assistant-openui-theme">
          <OpenUiRenderBoundary resetKey={code} fallback={fallback}>
            <Renderer
              library={openuiChatLibrary}
              response={code}
              isStreaming={isStreaming}
              onError={(errors) => {
                setRenderErrors(errors.map(error => error.message));
              }}
            />
          </OpenUiRenderBoundary>
        </ThemeProvider>
      </div>
      {renderErrors.length > 0 && !isStreaming ? (
        <div className="assistant-genui-error">
          <div className="eyebrow">Render issue</div>
          <div>{renderErrors[0]}</div>
        </div>
      ) : null}
      {isExpanded ? createPortal(
        <div className="assistant-genui-modal-backdrop" onClick={() => setIsExpanded(false)}>
          <section
            className="assistant-genui-modal assistant-openui-theme"
            role="dialog"
            aria-modal="true"
            aria-label="Generated UI larger view"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="assistant-genui-modal-header">
              <div>
                <div className="eyebrow">OpenUI Preview</div>
                <div className="assistant-genui-modal-title">Larger generated UI view</div>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-icon"
                onClick={() => setIsExpanded(false)}
                aria-label="Close larger generated UI view"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="assistant-genui-modal-body">
              <ThemeProvider mode="light" lightTheme={assistantOpenUiTheme} cssSelector=".assistant-openui-theme">
                <OpenUiRenderBoundary resetKey={code} fallback={fallback}>
                  <Renderer
                    library={openuiChatLibrary}
                    response={code}
                    isStreaming={isStreaming}
                    onError={(errors) => {
                      setRenderErrors(errors.map(error => error.message));
                    }}
                  />
                </OpenUiRenderBoundary>
              </ThemeProvider>
            </div>
          </section>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

export function AssistantMarkdownRenderer({ text }: { text: string }) {
  return (
    <div className="assistant-markdown-theme">
      <ThemeProvider mode="light" lightTheme={assistantOpenUiTheme} cssSelector=".assistant-markdown-theme">
        <MarkDownRenderer variant="clear" textMarkdown={text} />
      </ThemeProvider>
    </div>
  );
}
