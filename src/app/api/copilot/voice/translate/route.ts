import { NextRequest, NextResponse } from "next/server";
import { buildGoogleTranslateV2Body } from "@/lib/googleTranslateRequest";
import { authorizeVoice, BodyTooLarge, readLimitedBody } from '@/lib/voiceRouteSecurity';

export const runtime = "nodejs";

function jsonError(message: string, status: number, details?: unknown) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
      details,
    },
    { status },
  );
}

export async function POST(request: NextRequest) {
  const denied = await authorizeVoice(request);
  if (denied) return denied;
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!apiKey) {
    return jsonError(
      "GOOGLE_TRANSLATE_API_KEY is not configured on the AMS frontend server.",
      500,
    );
  }

  let body: { text?: string; source?: string; target?: string };
  try {
    body = JSON.parse(new TextDecoder().decode(await readLimitedBody(request, 32_000)));
    if (!body || typeof body !== 'object') return jsonError('Expected a JSON object.', 400);
  } catch (error) {
    if (error instanceof BodyTooLarge) return jsonError('Translation request is too large.', 413);
    return jsonError("Expected JSON body with a 'text' field.", 400);
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (text.length > 5000) return jsonError('Text exceeds 5000 characters.', 413);
  if (!text) {
    return NextResponse.json({ ok: true, translatedText: "", detectedLanguage: null });
  }

  const target = typeof body.target === "string" && body.target.trim() ? body.target.trim() : "en";
  const source = typeof body.source === "string" && body.source.trim() ? body.source.trim() : undefined;

  const url = new URL("https://translation.googleapis.com/language/translate/v2");
  url.searchParams.set("key", apiKey);

  // The v2 endpoint (translation.googleapis.com/language/translate/v2) only
  // accepts simple model names like "nmt" or "base", not the v3-style
  // projects/.../locations/.../models/general/translation-llm path. Passing
  // that path here returns HTTP 400 from Google. Drop projectId so the v2
  // request omits the model field and uses Google's default NMT model.
  const translateBody = buildGoogleTranslateV2Body({
    text,
    target,
    source,
  });

  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(translateBody),
      signal: AbortSignal.timeout(30_000),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return jsonError(
        "Google Translate API request failed.",
        502,
      );
    }

    const translation = payload?.data?.translations?.[0];
    const translatedText = typeof translation?.translatedText === "string"
      ? translation.translatedText
      : "";
    const detectedLanguage = translation?.detectedSourceLanguage ?? null;

    return NextResponse.json({
      ok: true,
      translatedText,
      detectedLanguage,
    });
  } catch (err) {
    return jsonError(
      "Failed to reach Google Translate API.",
      502,
    );
  }
}
