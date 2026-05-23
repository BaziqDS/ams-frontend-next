export type TranslateResult = {
  ok: boolean;
  translatedText: string;
  detectedLanguage: string | null;
  error?: string;
};

const EMPTY_RESULT: TranslateResult = {
  ok: true,
  translatedText: "",
  detectedLanguage: null,
};

export async function translateText(
  text: string,
  target = "en",
  source?: string,
): Promise<TranslateResult> {
  const trimmed = text.trim();
  if (!trimmed) return EMPTY_RESULT;

  try {
    const body: { text: string; target: string; source?: string } = {
      text: trimmed,
      target,
    };
    if (source?.trim()) {
      body.source = source.trim();
    }

    const response = await fetch("/api/copilot/voice/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || !payload?.ok) {
      return {
        ok: false,
        translatedText: "",
        detectedLanguage: null,
        error: payload?.error || "Translation failed.",
      };
    }

    return {
      ok: true,
      translatedText: String(payload.translatedText ?? ""),
      detectedLanguage: payload.detectedLanguage ?? null,
    };
  } catch (err) {
    return {
      ok: false,
      translatedText: "",
      detectedLanguage: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Creates a debounced translator that cancels stale in-flight requests.
 * Only the latest call's result is delivered to the callback.
 */
export function createDebouncedTranslator(
  onResult: (result: TranslateResult) => void,
  delayMs = 350,
) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let abortController: AbortController | null = null;
  let generation = 0;

  function translate(text: string, target = "en", source?: string) {
    if (timer) clearTimeout(timer);

    const trimmed = text.trim();
    if (!trimmed) {
      onResult(EMPTY_RESULT);
      return;
    }

    timer = setTimeout(async () => {
      abortController?.abort();
      abortController = new AbortController();
      const currentGeneration = ++generation;

      const result = await translateText(trimmed, target, source);

      // Only deliver if this is still the latest request.
      if (currentGeneration === generation) {
        onResult(result);
      }
    }, delayMs);
  }

  function cancel() {
    if (timer) clearTimeout(timer);
    timer = null;
    abortController?.abort();
    abortController = null;
    generation++;
  }

  return { translate, cancel };
}
