import { describe, expect, it } from "vitest";

import { buildAssistantHistory, normaliseAssistantResponse } from "@/lib/assistant";


describe("assistant helpers", () => {
  it("keeps only conversational turns when building request history", () => {
    const history = buildAssistantHistory([
      { id: "1", role: "assistant", text: "Welcome", kind: "text" },
      { id: "2", role: "user", text: "Show low inventory", kind: "text" },
      { id: "3", role: "assistant", text: "Here you go", kind: "openui", openuiCode: "root = Card([])" },
      { id: "4", role: "system", text: "internal", kind: "text" },
    ]);

    expect(history).toEqual([
      { role: "assistant", content: "Welcome" },
      { role: "user", content: "Show low inventory" },
      { role: "assistant", content: "Here you go" },
    ]);
  });

  it("uses the retained SQL answer for hidden OpenUI messages in request history", () => {
    const history = buildAssistantHistory([
      {
        id: "1",
        role: "assistant",
        text: "",
        kind: "openui",
        openuiCode: "root = Card([])",
        sqlAnswer: "Two low inventory assets: laptop batteries and toner.",
      },
    ]);

    expect(history).toEqual([
      { role: "assistant", content: "Two low inventory assets: laptop batteries and toner." },
    ]);
  });

  it("drops openui code when the backend returned text mode", () => {
    const message = normaliseAssistantResponse({
      mode: "text",
      text: "Three items are below their threshold.",
      openui_code: 'root = Card([CardHeader("Low Inventory")])',
      sql_answer: "Three items are below their threshold.",
    });

    expect(message.kind).toBe("text");
    expect(message.openuiCode).toBeUndefined();
  });
});
