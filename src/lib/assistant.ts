import { API_BASE } from "@/lib/api";

export type AssistantMessageRole = "user" | "assistant" | "system";
export type AssistantMessageKind = "text" | "openui";

export interface AssistantThreadMessage {
  id: string;
  role: AssistantMessageRole;
  text: string;
  kind: AssistantMessageKind;
  openuiCode?: string;
  sqlAnswer?: string;
}

export interface AssistantApiResponse {
  mode: "text" | "openui";
  text: string;
  openui_code: string | null;
  sql_answer: string;
}

export interface AssistantHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export type AssistantStreamEvent =
  | { type: "status"; message: string }
  | { type: "sql_answer"; text: string; sql_answer: string }
  | { type: "openui_delta"; delta: string }
  | { type: "final"; mode: "text" | "openui"; text: string; openui_code: string | null; sql_answer: string }
  | { type: "error"; message: string };

function nextMessageId() {
  return globalThis.crypto?.randomUUID?.() ?? `assistant-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function buildAssistantHistory(messages: AssistantThreadMessage[]): AssistantHistoryTurn[] {
  return messages
    .filter((message): message is AssistantThreadMessage & { role: "user" | "assistant" } => (
      message.role === "user" || message.role === "assistant"
    ))
    .map(message => ({
      role: message.role,
      content: message.text.trim() || message.sqlAnswer?.trim() || "",
    }))
    .filter(turn => turn.content.length > 0);
}

export function normaliseAssistantResponse(payload: AssistantApiResponse): AssistantThreadMessage {
  const kind: AssistantMessageKind = payload.mode === "openui" && payload.openui_code ? "openui" : "text";

  return {
    id: nextMessageId(),
    role: "assistant",
    text: payload.text.trim(),
    kind,
    openuiCode: kind === "openui" ? payload.openui_code ?? undefined : undefined,
    sqlAnswer: payload.sql_answer,
  };
}

export async function streamAssistantResponse({
  message,
  history,
  onEvent,
}: {
  message: string;
  history: AssistantHistoryTurn[];
  onEvent: (event: AssistantStreamEvent) => void;
}) {
  const response = await fetch(`${API_BASE}/api/ai/chat/stream/`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });

  if (!response.ok) {
    let errorMessage = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (body && typeof body === "object" && typeof body.detail === "string") {
        errorMessage = body.detail;
      }
    } catch {
      /* ignore parse error */
    }
    throw new Error(errorMessage);
  }

  if (!response.body) {
    throw new Error("The assistant stream did not return a readable response body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const eventBlock of events) {
      const dataLine = eventBlock
        .split("\n")
        .find(line => line.startsWith("data: "));
      if (!dataLine) continue;

      const payload = JSON.parse(dataLine.slice(6)) as AssistantStreamEvent;
      onEvent(payload);
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    const dataLine = buffer
      .split("\n")
      .find(line => line.startsWith("data: "));
    if (dataLine) {
      onEvent(JSON.parse(dataLine.slice(6)) as AssistantStreamEvent);
    }
  }
}
