import { describe, expect, it, vi } from "vitest";

import {
  buildVoiceTranscriptDraft,
  formatVoiceCaptureError,
  getVoiceAudioConstraints,
  getVoiceMediaStream,
} from "@/lib/voiceCapture";

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

describe("getVoiceMediaStream", () => {
  it("uses default audio constraints first", async () => {
    const stream = {} as MediaStream;
    const mediaDevices = {
      getUserMedia: vi.fn().mockResolvedValue(stream),
      enumerateDevices: vi.fn(),
    } as unknown as MediaDevices;

    await expect(getVoiceMediaStream(mediaDevices)).resolves.toBe(stream);
    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith(
      getVoiceAudioConstraints(),
    );
    expect(mediaDevices.enumerateDevices).not.toHaveBeenCalled();
  });

  it("falls back to a physical microphone when the default device is stale", async () => {
    const staleDefault = Object.assign(new Error("Requested device not found"), {
      name: "NotFoundError",
    });
    const stream = {} as MediaStream;
    const mediaDevices = {
      getUserMedia: vi
        .fn()
        .mockRejectedValueOnce(staleDefault)
        .mockResolvedValueOnce(stream),
      enumerateDevices: vi.fn().mockResolvedValue([
        { kind: "audioinput", deviceId: "default" },
        { kind: "audioinput", deviceId: "builtin-mic" },
      ]),
    } as unknown as MediaDevices;

    await expect(getVoiceMediaStream(mediaDevices)).resolves.toBe(stream);
    expect(mediaDevices.getUserMedia).toHaveBeenLastCalledWith(
      getVoiceAudioConstraints("builtin-mic"),
    );
  });
});
