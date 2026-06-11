import { NextRequest, NextResponse } from "next/server";
import { buildGoogleTranslateV2Body } from "@/lib/googleTranslateRequest";

export const runtime = "nodejs";

// Uplift's per-request character limit isn't published; cap replies so
// playback starts quickly and free-tier credits aren't burned on essays.
const MAX_SPEAK_CHARS = 800;

const UPLIFT_TTS_URL = "https://api.upliftai.org/v1/synthesis/text-to-speech";

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

// Trim to the cap without cutting mid-sentence (falls back to mid-word only
// when the first sentence alone exceeds the cap).
function clampToSentence(text: string, maxChars: number) {
  if (text.length <= maxChars) return text;
  const slice = text.slice(0, maxChars);
  const lastStop = Math.max(
    slice.lastIndexOf("۔"),
    slice.lastIndexOf("."),
    slice.lastIndexOf("!"),
    slice.lastIndexOf("?"),
  );
  return lastStop > maxChars * 0.4 ? slice.slice(0, lastStop + 1) : slice;
}

async function translateToUrdu(text: string): Promise<string | null> {
  const apiKey = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!apiKey) return null;

  const url = new URL("https://translation.googleapis.com/language/translate/v2");
  url.searchParams.set("key", apiKey);

  try {
    const response = await fetch(url.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        buildGoogleTranslateV2Body({ text, target: "ur", source: "en" }),
      ),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.warn("[voice/speak] translate failed:", response.status);
      return null;
    }
    const translated = payload?.data?.translations?.[0]?.translatedText;
    return typeof translated === "string" && translated.trim()
      ? translated.trim()
      : null;
  } catch (err) {
    console.warn("[voice/speak] translate threw:", err);
    return null;
  }
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.UPLIFTAI_API_KEY;
  if (!apiKey) {
    return jsonError(
      "UPLIFTAI_API_KEY is not configured on the AMS frontend server.",
      500,
    );
  }

  let body: { text?: string };
  try {
    body = await request.json();
  } catch {
    return jsonError("Expected JSON body with a 'text' field.", 400);
  }

  const rawText = typeof body.text === "string" ? body.text.trim() : "";
  if (!rawText) {
    return jsonError("Missing 'text' to speak.", 400);
  }

  let speakText = clampToSentence(rawText, MAX_SPEAK_CHARS);

  // Default behaviour is Urdu narration: English replies are translated
  // before synthesis. Set AMS_VOICE_REPLY_LANGUAGE=en to speak replies
  // verbatim instead (Uplift's voices handle English and mixed text too).
  const replyLanguage = process.env.AMS_VOICE_REPLY_LANGUAGE ?? "ur";
  const alreadyUrdu = /[؀-ۿ]/.test(speakText);
  if (replyLanguage === "ur" && !alreadyUrdu) {
    const translated = await translateToUrdu(speakText);
    if (translated) speakText = clampToSentence(translated, MAX_SPEAK_CHARS);
    // On translation failure fall through and speak the original text —
    // a Pakistani-English narration beats silence.
  }

  const upliftResponse = await fetch(UPLIFT_TTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      voiceId: process.env.UPLIFTAI_VOICE_ID || "v_8eelc901",
      text: speakText,
      outputFormat: process.env.UPLIFTAI_OUTPUT_FORMAT || "MP3_22050_128",
    }),
  });

  if (!upliftResponse.ok) {
    const detail = await upliftResponse.text().catch(() => "");
    console.error(
      "[voice/speak] Uplift AI synthesis failed:",
      upliftResponse.status,
      detail.slice(0, 500),
    );
    return jsonError(
      "Uplift AI speech synthesis failed.",
      upliftResponse.status,
      detail.slice(0, 500),
    );
  }

  const audio = await upliftResponse.arrayBuffer();
  return new NextResponse(audio, {
    headers: {
      "Content-Type":
        upliftResponse.headers.get("content-type") ?? "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
