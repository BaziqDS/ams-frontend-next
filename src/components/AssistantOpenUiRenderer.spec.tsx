import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AssistantOpenUiRenderer } from "./AssistantOpenUiRenderer";

vi.mock("@openuidev/react-lang", () => ({
  Renderer: ({ response }: { response: string }) => <div data-testid="openui-renderer">{response}</div>,
}));

vi.mock("@openuidev/react-ui", () => ({
  createTheme: (theme: unknown) => theme,
  openuiChatLibrary: {},
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  MarkDownRenderer: ({ textMarkdown }: { textMarkdown: string }) => <div>{textMarkdown}</div>,
}));

describe("AssistantOpenUiRenderer", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  afterEach(() => {
    if (root) {
      act(() => root?.unmount());
    }
    container?.remove();
    container = null;
    root = null;
  });

  it("opens and closes a larger preview overlay for generated UI", () => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);

    act(() => {
      root?.render(<AssistantOpenUiRenderer code="root = Card([])" isStreaming={false} />);
    });

    expect(container.textContent).toContain("Preview");
    expect(container.textContent).toContain("Larger view");

    const expandButton = container.querySelector<HTMLButtonElement>("[aria-label='Open generated UI in larger view']");
    expect(expandButton).not.toBeNull();
    expect(document.querySelector("[role='dialog']")).toBeNull();

    act(() => {
      expandButton?.click();
    });

    expect(document.querySelector("[role='dialog']")).not.toBeNull();
    expect(document.querySelectorAll("[data-testid='openui-renderer']")).toHaveLength(2);

    const closeButton = document.querySelector<HTMLButtonElement>("[aria-label='Close larger generated UI view']");
    act(() => {
      closeButton?.click();
    });

    expect(document.querySelector("[role='dialog']")).toBeNull();
  });
});
