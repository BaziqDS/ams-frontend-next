import { NextRequest, NextResponse } from "next/server";
import { getGroqAudioUrl } from "@/lib/voiceAudio";

export const runtime = "nodejs";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

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

function readString(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return jsonError(
      "GROQ_API_KEY is not configured on the AMS frontend server.",
      500,
    );
  }

  let body: FormData;
  try {
    body = await request.formData();
  } catch {
    return jsonError("Expected multipart/form-data with an audio file.", 400);
  }

  const audio = body.get("audio");
  if (!(audio instanceof File)) {
    return jsonError("Missing audio file under form field 'audio'.", 400);
  }

  if (audio.size <= 0) {
    return jsonError("The submitted audio file is empty.", 400);
  }

  if (audio.size > MAX_AUDIO_BYTES) {
    return jsonError("Audio file is larger than Groq's 25MB free-tier upload limit.", 413);
  }

  const groqForm = new FormData();
  groqForm.set("file", audio, audio.name || "voice-command.webm");
  groqForm.set(
    "model",
      readString(body.get("model")) ??
      process.env.GROQ_STT_MODEL ??
      "whisper-large-v3",
  );
  groqForm.set("response_format", "json");
  groqForm.set("temperature", "0");
  // Only pin a language when explicitly requested. AMS voice commands mix
  // Urdu and English ("stock register kholo"), and Whisper handles that
  // code-switching far better with per-utterance auto-detection than with a
  // forced language, which biases the decoder against the other language.
  const language = readString(body.get("language")) ?? process.env.GROQ_STT_LANGUAGE;
  if (language && language !== "auto") {
    groqForm.set("language", language);
  }

  const prompt =
    readString(body.get("prompt")) ??
    process.env.GROQ_STT_PROMPT ??
    "Transcribe the user's AMS voice command in the same language they spoke. If they speak Urdu, keep the transcript in Urdu. Common AMS terms include inspections, stock register, central register, finance review, categories, items, locations, maintenance, depreciation, contractor, consignee, indenter, inspection certificate, Jamia Masjid, and Core i5.";
  groqForm.set("prompt", prompt);

  const groqResponse = await fetch(getGroqAudioUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: groqForm,
  });

  const responseText = await groqResponse.text();
  let payload: unknown = null;
  try {
    payload = responseText ? JSON.parse(responseText) : null;
  } catch {
    payload = responseText;
  }

  if (!groqResponse.ok) {
    return jsonError("Groq audio transcription failed.", groqResponse.status, payload);
  }

  const text =
    payload &&
    typeof payload === "object" &&
    "text" in payload &&
    typeof payload.text === "string"
      ? payload.text.trim()
      : "";

  return NextResponse.json({
    ok: true,
    text,
  });
}
