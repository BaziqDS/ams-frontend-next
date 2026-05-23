import { describe, expect, it, vi } from "vitest";

import { createDebouncedTranslator, translateText } from "@/lib/voiceTranslate";

describe("translateText", () => {
  it("returns empty result for blank input without making a network call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = await translateText("  ");
    expect(result).toEqual({
      ok: true,
      translatedText: "",
      detectedLanguage: null,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("sends an explicit source language when provided", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        translatedText: "create an inspection",
        detectedLanguage: "ur",
      }),
    } as Response);

    await translateText("ایک انسپیکشن بنائیں", "en", "ur");

    expect(fetchSpy).toHaveBeenCalledWith(
      "/api/copilot/voice/translate",
      expect.objectContaining({
        body: JSON.stringify({
          text: "ایک انسپیکشن بنائیں",
          target: "en",
          source: "ur",
        }),
      }),
    );

    fetchSpy.mockRestore();
  });
});

describe("createDebouncedTranslator", () => {
  it("cancels stale calls when a newer call arrives", () => {
    vi.useFakeTimers();
    const results: string[] = [];
    const { translate, cancel } = createDebouncedTranslator(
      (result) => results.push(result.translatedText),
      100,
    );

    // Empty text should deliver immediately.
    translate("  ");
    expect(results).toEqual([""]);

    // Non-empty should be debounced.
    translate("hello");
    translate("hello world");
    expect(results).toEqual([""]);

    cancel();
    vi.useRealTimers();
  });
});
