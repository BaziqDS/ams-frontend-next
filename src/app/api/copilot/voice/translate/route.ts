import { NextRequest, NextResponse } from "next/server";
import { buildGoogleTranslateV2Body } from "@/lib/googleTranslateRequest";

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
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!apiKey) {
    return jsonError(
      "GOOGLE_TRANSLATE_API_KEY is not configured on the AMS frontend server.",
      500,
    );
  }

  let body: { text?: string; source?: string; target?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError("Expected JSON body with a 'text' field.", 400);
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
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
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      console.error("[voice/translate] Google API error:", response.status, JSON.stringify(payload));
      return jsonError(
        "Google Translate API request failed.",
        response.status,
        payload,
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
      err instanceof Error ? err.message : String(err),
    );
  }
}
