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
