import { describe, expect, it } from "vitest";

import { buildVoiceTranscriptDraft, formatVoiceCaptureError } from "@/lib/voiceCapture";

describe("formatVoiceCaptureError", () => {
  it("explains missing microphone devices instead of showing raw browser text", () => {
    expect(formatVoiceCaptureError(new Error("Requested device not found"))).toBe(
      "No microphone was found. Connect or enable an input device, then try voice mode again.",
    );
  });
});

describe("buildVoiceTranscriptDraft", () => {
  it("returns an editable transcript draft without marking it for automatic send", () => {
    expect(buildVoiceTranscriptDraft({ translatedText: "Open Jamia Masjid", fallbackText: "jamia masjid" })).toEqual({
      text: "Open Jamia Masjid",
      shouldAutoSend: false,
    });
  });
});
