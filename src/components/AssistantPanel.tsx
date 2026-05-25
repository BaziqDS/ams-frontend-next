"use client";

import { FormEvent, startTransition, useEffect, useMemo, useRef, useState } from "react";

import { AssistantMarkdownRenderer, AssistantOpenUiRenderer } from "@/components/AssistantOpenUiRenderer";
import {
  type AssistantThreadMessage,
  buildAssistantHistory,
  streamAssistantResponse,
} from "@/lib/assistant";
import { Button } from "@/components/ui/button";


const WELCOME_MESSAGE: AssistantThreadMessage = {
  id: "assistant-welcome",
  role: "assistant",
  kind: "text",
  text: "Ask about inventory health, low stock items, locations, maintenance, inspections, or depreciation. I will query the live AMS database and return either a direct answer or a compact UI summary.",
};

export function AssistantPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AssistantThreadMessage[]>([WELCOME_MESSAGE]);
  const [requestError, setRequestError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const canSend = input.trim().length > 0 && !isSending;
  const assistantCount = useMemo(
    () => messages.filter(message => message.role === "assistant").length,
    [messages],
  );

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    textareaRef.current?.focus();
  }, [isOpen]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedInput = input.trim();
    if (!trimmedInput || isSending) return;

    const history = buildAssistantHistory(messages);
    const userMessage: AssistantThreadMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      kind: "text",
      text: trimmedInput,
    };

    startTransition(() => {
      setMessages(previous => [...previous, userMessage]);
      setInput("");
      setRequestError(null);
    });
    setIsSending(true);
    const assistantMessageId = `assistant-stream-${Date.now()}`;

    try {
      startTransition(() => {
        setMessages(previous => [
          ...previous,
          {
            id: assistantMessageId,
            role: "assistant",
            kind: "openui",
            text: "Querying the AMS database...",
            openuiCode: "",
          },
        ]);
      });

      await streamAssistantResponse({
        message: trimmedInput,
        history,
        onEvent: (event) => {
          if (event.type === "status") {
            startTransition(() => {
              setMessages(previous => previous.map(messageItem => (
                messageItem.id === assistantMessageId
                  ? { ...messageItem, text: event.message }
                  : messageItem
              )));
            });
            return;
          }

          if (event.type === "sql_answer") {
            startTransition(() => {
              setMessages(previous => previous.map(messageItem => (
                messageItem.id === assistantMessageId
                  ? { ...messageItem, text: "Rendering visual answer...", sqlAnswer: event.sql_answer }
                  : messageItem
              )));
            });
            return;
          }

          if (event.type === "openui_delta") {
            startTransition(() => {
              setMessages(previous => previous.map(messageItem => (
                messageItem.id === assistantMessageId
                  ? { ...messageItem, kind: "openui", text: "", openuiCode: (messageItem.openuiCode ?? "") + event.delta }
                  : messageItem
              )));
            });
            return;
          }

          if (event.type === "final") {
            startTransition(() => {
              const isOpenUiResponse = event.mode === "openui" && Boolean(event.openui_code);
              setMessages(previous => previous.map(messageItem => (
                messageItem.id === assistantMessageId
                  ? {
                    ...messageItem,
                    kind: isOpenUiResponse ? "openui" : "text",
                    text: isOpenUiResponse ? "" : event.text,
                    openuiCode: isOpenUiResponse ? event.openui_code ?? undefined : undefined,
                    sqlAnswer: event.sql_answer,
                  }
                  : messageItem
              )));
            });
            return;
          }

          if (event.type === "error") {
            throw new Error(event.message);
          }
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The assistant request failed.";
      setRequestError(message);
      startTransition(() => {
        setMessages(previous => {
          const withoutPending = previous.filter(messageItem => messageItem.id !== assistantMessageId);
          return [
            ...withoutPending,
            {
            id: `assistant-error-${Date.now()}`,
            role: "assistant",
            kind: "text",
            text: `I couldn't complete that request: ${message}`,
          },
          ];
        });
      });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="assistant-launcher"
        onClick={() => setIsOpen(true)}
        aria-label="Open AI assistant"
      >
        <span className="assistant-launcher-orb" aria-hidden="true">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l1.9 4.9L19 10l-4 3.3.9 5.2L12 16l-3.9 2.5.9-5.2L5 10l5.1-2.1L12 3z" />
          </svg>
        </span>
        <span className="assistant-launcher-copy">
          <span className="assistant-launcher-label">AI Assistant</span>
          <span className="assistant-launcher-sub">OpenRouter + SQL toolkit</span>
        </span>
      </button>

      {isOpen ? <button type="button" className="assistant-backdrop" aria-label="Close AI assistant" onClick={() => setIsOpen(false)} /> : null}

      <aside className={"assistant-panel" + (isOpen ? " is-open" : "")} aria-hidden={!isOpen}>
        <div className="assistant-panel-chrome">
          <div className="assistant-panel-header">
            <div>
              <div className="eyebrow">Database Copilot</div>
              <div className="assistant-panel-title">AMS Assistant</div>
              <div className="assistant-panel-sub">Live inventory answers rendered in a compact side panel.</div>
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => setIsOpen(false)} aria-label="Close AI assistant">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </Button>
          </div>

          <div className="assistant-panel-meta">
            <span className="assistant-panel-chip">{assistantCount} assistant replies</span>
            <span className="assistant-panel-chip is-live">SQL database connected</span>
          </div>
        </div>

        <div className="assistant-panel-body" ref={scrollRef}>
          {messages.map(message => (
            <section
              key={message.id}
              className={"assistant-message" + (message.role === "user" ? " is-user" : " is-assistant")}
            >
              <div className="assistant-message-head">
                <span className="assistant-message-role">{message.role === "user" ? "You" : "Assistant"}</span>
                {message.kind === "openui" ? <span className="assistant-message-pill">OpenUI</span> : null}
              </div>
              {message.text.trim().length > 0 ? (
                <div className="assistant-message-copy">
                  <AssistantMarkdownRenderer text={message.text} />
                </div>
              ) : null}
              {message.kind === "openui" && message.openuiCode ? (
                <AssistantOpenUiRenderer code={message.openuiCode} isStreaming={isSending && message.id.startsWith("assistant-stream-")} />
              ) : null}
            </section>
          ))}

          {isSending ? (
            <section className="assistant-message is-assistant is-loading">
              <div className="assistant-message-head">
                <span className="assistant-message-role">Assistant</span>
                <span className="assistant-message-pill">Querying</span>
              </div>
              <div className="assistant-loading-dots" aria-label="Assistant is thinking">
                <span />
                <span />
                <span />
              </div>
            </section>
          ) : null}
        </div>

        <form className="assistant-composer" onSubmit={handleSubmit}>
          <label className="assistant-composer-label" htmlFor="assistant-input">
            Ask about inventory, locations, maintenance, or asset health
          </label>
          <textarea
            id="assistant-input"
            ref={textareaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="What are the low inventory assets right now?"
            rows={3}
            className="assistant-composer-input"
          />
          <div className="assistant-composer-foot">
            <div className="assistant-composer-hint">
              Full-database SQL access is enabled for this testing slice.
              {requestError ? <span className="assistant-composer-error"> {requestError}</span> : null}
            </div>
            <Button type="submit"  disabled={!canSend}>
              {isSending ? "Working..." : "Send"}
            </Button>
          </div>
        </form>
      </aside>
    </>
  );
}
