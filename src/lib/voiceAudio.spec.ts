import { describe, expect, it } from "vitest";

import { getGroqAudioUrl } from "@/lib/voiceAudio";

describe("getGroqAudioUrl", () => {
  it("uses the translation endpoint for English voice commands", () => {
    expect(getGroqAudioUrl()).toBe("https://api.groq.com/openai/v1/audio/translations");
  });
});
