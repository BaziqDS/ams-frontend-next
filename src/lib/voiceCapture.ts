const DEFAULT_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
};

export function getVoiceAudioConstraints(deviceId?: string): MediaStreamConstraints {
  return {
    audio: deviceId
      ? {
          ...DEFAULT_AUDIO_CONSTRAINTS,
          deviceId: { exact: deviceId },
        }
      : DEFAULT_AUDIO_CONSTRAINTS,
  };
}

function isMissingAudioDeviceError(error: unknown) {
  const errorName =
    error && typeof error === "object" && "name" in error
      ? String((error as { name?: unknown }).name ?? "")
      : "";
  const errorMessage = error instanceof Error ? error.message : String(error);
  const normalized = `${errorName} ${errorMessage}`.toLowerCase();

  return (
    errorName === "NotFoundError" ||
    errorName === "DevicesNotFoundError" ||
    errorName === "OverconstrainedError" ||
    normalized.includes("requested device not found") ||
    normalized.includes("device not found")
  );
}

export async function getVoiceMediaStream(mediaDevices: MediaDevices) {
  try {
    return await mediaDevices.getUserMedia(getVoiceAudioConstraints());
  } catch (error) {
    if (!isMissingAudioDeviceError(error) || !mediaDevices.enumerateDevices) {
      throw error;
    }

    const devices = await mediaDevices.enumerateDevices();
    const audioInputs = devices.filter((device) => device.kind === "audioinput");
    for (const device of audioInputs) {
      if (!device.deviceId || device.deviceId === "default") continue;
      try {
        return await mediaDevices.getUserMedia(
          getVoiceAudioConstraints(device.deviceId),
        );
      } catch {
        // Try the next physical input. If none work, surface the original error.
      }
    }

    throw error;
  }
}

export function formatVoiceCaptureError(error: unknown) {
  const errorName =
    error && typeof error === "object" && "name" in error
      ? String((error as { name?: unknown }).name ?? "")
      : "";
  const errorMessage = error instanceof Error ? error.message : String(error);
  const normalized = `${errorName} ${errorMessage}`.toLowerCase();

  if (
    errorName === "NotFoundError" ||
    errorName === "DevicesNotFoundError" ||
    errorName === "OverconstrainedError" ||
    normalized.includes("requested device not found") ||
    normalized.includes("device not found")
  ) {
    return "No microphone was found. Connect or enable an input device, then try voice mode again.";
  }

  if (errorName === "NotAllowedError" || errorName === "PermissionDeniedError") {
    return "Microphone permission is blocked. Allow microphone access for this site, then try again.";
  }

  if (errorName === "NotReadableError" || normalized.includes("could not start")) {
    return "The microphone is unavailable. Close other apps using it, then try again.";
  }

  return errorMessage || "Could not start microphone capture.";
}

export function buildVoiceTranscriptDraft({
  translatedText,
  fallbackText,
}: {
  translatedText: string;
  fallbackText: string;
}) {
  return {
    text: translatedText.trim() || fallbackText.trim(),
    shouldAutoSend: false,
  };
}
