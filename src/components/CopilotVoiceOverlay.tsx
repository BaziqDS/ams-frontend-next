"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  COPILOT_ASSISTANT_MESSAGE_EVENT,
  COPILOT_HITL_INTERRUPT_EVENT,
  type CopilotAssistantMessageEvent,
  type CopilotHitlInterrupt,
  useCopilotHitlDecision,
  useCopilotVoiceCommand,
} from "@/contexts/CopilotContext";
import {
  buildVoiceTranscriptDraft,
  formatVoiceCaptureError,
  getVoiceMediaStream,
} from "@/lib/voiceCapture";

type VoiceStatus =
  | "idle"
  | "recording"
  | "transcribing"
  | "sending"
  | "sent"
  | "error";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

const AUTO_SPEAK_STORAGE_KEY = "ams.voice-copilot.auto-speak";
const VOICE_RESPONSE_WINDOW_MS = 120_000;

function getSpeechRecognitionCtor():
  | (new () => SpeechRecognitionLike)
  | undefined {
  if (typeof window === "undefined") return undefined;
  const win = window as typeof window & {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return win.SpeechRecognition ?? win.webkitSpeechRecognition;
}

function supportedMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function ellipsize(value: string, max = 420) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}...` : normalized;
}

function parseOpenUiStrings(source: string) {
  const strings: string[] = [];
  const patterns = [
    /TextContent\("((?:\\"|[^"])*)"/g,
    /CardHeader\("((?:\\"|[^"])*)"/g,
    /Callout\("[^"]*"\s*,\s*"((?:\\"|[^"])*)"\s*,\s*"((?:\\"|[^"])*)"/g,
    /TextCallout\("[^"]*"\s*,\s*"((?:\\"|[^"])*)"\s*,\s*"((?:\\"|[^"])*)"/g,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(source)) !== null) {
      for (const item of match.slice(1)) {
        if (item) strings.push(item.replace(/\\"/g, "\""));
      }
    }
  }

  return strings;
}

function speakableAssistantText(raw: string) {
  const text = raw.trim();
  if (!text) return "";

  if (/root\s*=/.test(text)) {
    const extracted = parseOpenUiStrings(text)
      .filter((item) => !/^[-_a-z0-9]+\s*=/i.test(item))
      .join(". ");
    return ellipsize(extracted || "I have prepared the result on screen.", 260);
  }

  return ellipsize(
    text
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/\[[^\]]+\]\([^)]+\)/g, "")
      .replace(/[#*_`]/g, " "),
    320,
  );
}

function formatActionName(name: string) {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function summarizeActionArgs(args: Record<string, unknown>) {
  return Object.entries(args)
    .filter(([key]) => !["approvalContext", "reviewContext", "summary"].includes(key))
    .map(([key, value]) => {
      const rendered =
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
          ? String(value)
          : JSON.stringify(value);
      return `${formatActionName(key)}: ${rendered}`;
    })
    .slice(0, 5);
}

export function CopilotVoiceOverlay() {
  const sendVoiceCommand = useCopilotVoiceCommand();
  const sendHitlDecision = useCopilotHitlDecision();
  const [status, setStatus] = useState<VoiceStatus>("idle");
  const [liveTranscript, setLiveTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [draftTranscript, setDraftTranscript] = useState("");
  const [assistantPreview, setAssistantPreview] = useState("");
  const [error, setError] = useState("");
  const [isVoiceAgentWorking, setIsVoiceAgentWorking] = useState(false);
  const [autoSpeak, setAutoSpeak] = useState(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem(AUTO_SPEAK_STORAGE_KEY) !== "false";
  });
  const [interrupt, setInterrupt] = useState<CopilotHitlInterrupt | null>(null);
  const [approvalBusy, setApprovalBusy] = useState<"approve" | "reject" | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const lastVoiceCommandAtRef = useRef<number | null>(null);

  const displayTranscript = draftTranscript || finalTranscript || liveTranscript;
  const isBusy = status === "recording" || status === "transcribing" || status === "sending";
  const hasVoiceGlow = isBusy || isVoiceAgentWorking;
  const voiceGlowColor =
    status === "recording"
      ? "color-mix(in oklch, var(--danger) 70%, white)"
      : "color-mix(in oklch, var(--primary) 76%, white)";
  const canSendDraft = draftTranscript.trim().length > 0 && !isBusy;

  const stopTracks = useCallback(() => {
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
  }, []);

  const stopRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (!recognition) return;
    recognition.onresult = null;
    recognition.onerror = null;
    recognition.onend = null;
    try {
      recognition.stop();
    } catch {
      try {
        recognition.abort();
      } catch {
        /* ignore */
      }
    }
  }, []);

  const speak = useCallback((text: string) => {
    if (!autoSpeak || typeof window === "undefined" || !("speechSynthesis" in window)) return;
    if (!text.trim()) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
  }, [autoSpeak]);

  const submitTranscript = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!trimmed) {
      setStatus("idle");
      return;
    }
    setStatus("sending");
    setDraftTranscript("");
    setFinalTranscript(trimmed);
    setIsVoiceAgentWorking(true);
    lastVoiceCommandAtRef.current = Date.now();
    sendVoiceCommand(trimmed);
    setStatus("sent");
    setTimeout(() => {
      setStatus((current) => (current === "sent" ? "idle" : current));
    }, 1600);
  }, [sendVoiceCommand]);

  const transcribeAudio = useCallback(async (blob: Blob) => {
    setStatus("transcribing");
    setError("");

    const form = new FormData();
    form.set("audio", blob, "voice-command.webm");

    try {
      const response = await fetch("/api/copilot/voice/transcribe", {
        method: "POST",
        body: form,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || "Voice transcription failed.");
      }
      const transcript = String(payload.text ?? "").trim() || liveTranscript.trim();
      const draft = buildVoiceTranscriptDraft({
        translatedText: transcript,
        fallbackText: liveTranscript,
      });
      setFinalTranscript(draft.text);
      setDraftTranscript(draft.text);
      setStatus("idle");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStatus("error");
    } finally {
      stopTracks();
    }
  }, [liveTranscript, stopTracks]);

  const startBrowserRecognition = useCallback(() => {
    const Recognition = getSpeechRecognitionCtor();
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event: unknown) => {
      const results = (event as { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }).results;
      if (!results) return;
      const parts: string[] = [];
      for (let i = 0; i < results.length; i += 1) {
        const item = results[i]?.[0]?.transcript;
        if (item) parts.push(item);
      }
      setLiveTranscript(parts.join(" ").trim());
    };
    recognition.onerror = () => {
      /* Final transcript still comes from Groq. Browser interim STT is only UX. */
    };
    recognition.onend = () => {
      recognitionRef.current = null;
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      recognitionRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (isBusy) return;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Microphone capture is not available in this browser.");
      setStatus("error");
      return;
    }

    try {
      setError("");
      setLiveTranscript("");
      setFinalTranscript("");
      setDraftTranscript("");
      setAssistantPreview("");
      const stream = await getVoiceMediaStream(navigator.mediaDevices);
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      const mimeType = supportedMimeType();
      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        audioChunksRef.current = [];
        mediaRecorderRef.current = null;
        void transcribeAudio(blob);
      };

      recorder.start();
      startBrowserRecognition();
      setStatus("recording");
    } catch (err) {
      stopTracks();
      setError(formatVoiceCaptureError(err));
      setStatus("error");
    }
  }, [isBusy, startBrowserRecognition, stopTracks, transcribeAudio]);

  const clearDraft = useCallback(() => {
    setDraftTranscript("");
    setFinalTranscript("");
    setLiveTranscript("");
    setError("");
    setStatus("idle");
  }, []);

  const stopRecording = useCallback(() => {
    stopRecognition();
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      stopTracks();
      setStatus("idle");
      return;
    }
    recorder.stop();
  }, [stopRecognition, stopTracks]);

  useEffect(() => {
    return () => {
      stopRecognition();
      stopTracks();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [stopRecognition, stopTracks]);

  useEffect(() => {
    window.localStorage.setItem(AUTO_SPEAK_STORAGE_KEY, autoSpeak ? "true" : "false");
  }, [autoSpeak]);

  useEffect(() => {
    const onAssistantMessage = (event: Event) => {
      const detail = (event as CustomEvent<CopilotAssistantMessageEvent>).detail;
      const startedAt = lastVoiceCommandAtRef.current;
      if (!startedAt || Date.now() - startedAt > VOICE_RESPONSE_WINDOW_MS) return;

      setIsVoiceAgentWorking(false);
      const text = speakableAssistantText(detail.text);
      if (!text) return;
      setAssistantPreview(text);
      speak(text);
    };

    const onHitlInterrupt = (event: Event) => {
      setIsVoiceAgentWorking(false);
      setApprovalBusy(null);
      setInterrupt((event as CustomEvent<CopilotHitlInterrupt | null>).detail ?? null);
    };

    window.addEventListener(COPILOT_ASSISTANT_MESSAGE_EVENT, onAssistantMessage);
    window.addEventListener(COPILOT_HITL_INTERRUPT_EVENT, onHitlInterrupt);
    return () => {
      window.removeEventListener(COPILOT_ASSISTANT_MESSAGE_EVENT, onAssistantMessage);
      window.removeEventListener(COPILOT_HITL_INTERRUPT_EVENT, onHitlInterrupt);
    };
  }, [speak]);

  useEffect(() => {
    if (!isVoiceAgentWorking) return undefined;
    const timeout = window.setTimeout(() => setIsVoiceAgentWorking(false), 45_000);
    return () => window.clearTimeout(timeout);
  }, [isVoiceAgentWorking]);

  const statusLabel = useMemo(() => {
    if (status === "recording") return "Listening";
    if (status === "transcribing") return "Transcribing with Groq";
    if (status === "sending") return "Sending to AMS assistant";
    if (status === "sent") return "Sent";
    if (status === "error") return "Voice unavailable";
    return "Voice mode";
  }, [status]);

  const handleApproval = useCallback((decision: "approve" | "reject") => {
    setApprovalBusy(decision);
    const sent = sendHitlDecision(decision);
    if (!sent) {
      setApprovalBusy(null);
      setError("Assistant channel is not ready yet. Open the assistant once and try again.");
    }
  }, [sendHitlDecision]);

  return (
    <>
      <style>{`
        @keyframes amsVoiceWorkingGlow {
          0%, 100% {
            opacity: 0.42;
            transform: scale(0.985);
          }
          50% {
            opacity: 0.92;
            transform: scale(1.018);
          }
        }

        .voice-copilot-overlay {
          isolation: isolate;
          transition: border-color 180ms ease, box-shadow 180ms ease;
        }

        .voice-copilot-overlay::before {
          content: "";
          position: absolute;
          inset: -7px;
          border-radius: 999px;
          background:
            radial-gradient(circle at 18% 50%, var(--voice-glow-color), transparent 30%),
            radial-gradient(circle at 82% 50%, var(--voice-glow-color), transparent 30%);
          filter: blur(13px);
          opacity: 0;
          pointer-events: none;
          z-index: -1;
          transition: opacity 180ms ease;
        }

        .voice-copilot-overlay--active {
          border-color: color-mix(in oklch, var(--voice-glow-color) 48%, var(--hairline)) !important;
          box-shadow:
            0 18px 48px -22px rgba(15, 23, 42, 0.42),
            0 0 0 1px color-mix(in oklch, var(--voice-glow-color) 35%, transparent),
            0 0 34px -10px var(--voice-glow-color) !important;
        }

        .voice-copilot-overlay--active::before {
          opacity: 1;
          animation: amsVoiceWorkingGlow 1.45s ease-in-out infinite;
        }
      `}</style>
      {interrupt ? (
        <section
          aria-label="Assistant approval required"
          style={{
            position: "fixed",
            left: "50%",
            bottom: 104,
            transform: "translateX(-50%)",
            width: "min(640px, calc(100vw - 32px))",
            zIndex: 1088,
            border: "1px solid color-mix(in oklch, var(--warn) 34%, var(--hairline))",
            borderRadius: "var(--radius-lg)",
            background: "color-mix(in oklch, var(--card) 94%, white)",
            boxShadow: "0 20px 48px -18px rgba(15, 23, 42, 0.32)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 14px",
              borderBottom: "1px solid var(--hairline)",
              background: "color-mix(in oklch, var(--warn-weak) 58%, var(--card))",
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                background: "var(--warn)",
                flex: "0 0 auto",
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>
                Approval required
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Review before the assistant writes through the AMS UI.
              </div>
            </div>
          </div>

          <div style={{ padding: 14, display: "grid", gap: 10 }}>
            {interrupt.actionRequests.map((action, index) => {
              const details = summarizeActionArgs(action.args);
              return (
                <div
                  key={`${action.name}-${index}`}
                  style={{
                    border: "1px solid var(--hairline)",
                    borderRadius: "var(--radius)",
                    background: "var(--card)",
                    padding: 12,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)" }}>
                    {formatActionName(action.name)}
                  </div>
                  {action.description ? (
                    <div style={{ marginTop: 3, fontSize: 12, color: "var(--muted)" }}>
                      {action.description}
                    </div>
                  ) : null}
                  {details.length ? (
                    <div style={{ marginTop: 8, display: "grid", gap: 4 }}>
                      {details.map((line) => (
                        <div
                          key={line}
                          style={{
                            fontSize: 12,
                            color: "var(--ink-2)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={line}
                        >
                          {line}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                className="btn"
                disabled={approvalBusy !== null}
                onClick={() => handleApproval("reject")}
              >
                {approvalBusy === "reject" ? "Rejecting..." : "Reject"}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={approvalBusy !== null}
                onClick={() => handleApproval("approve")}
              >
                {approvalBusy === "approve" ? "Approving..." : "Approve"}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section
        aria-label="Voice assistant"
        className={`voice-copilot-overlay${hasVoiceGlow ? " voice-copilot-overlay--active" : ""}`}
        style={{
          "--voice-glow-color": voiceGlowColor,
          position: "fixed",
          left: "50%",
          bottom: 18,
          transform: "translateX(-50%)",
          width: "min(680px, calc(100vw - 32px))",
          zIndex: 1087,
          border: "1px solid color-mix(in oklch, var(--primary) 14%, var(--hairline))",
          borderRadius: 999,
          background: "color-mix(in oklch, var(--card) 88%, white)",
          boxShadow: "0 18px 48px -22px rgba(15, 23, 42, 0.42)",
          backdropFilter: "blur(16px)",
          padding: 8,
          display: "grid",
          gridTemplateColumns: "auto 1fr auto auto auto",
          alignItems: "center",
          gap: 8,
        } as CSSProperties}
      >
        <button
          type="button"
          aria-label={status === "recording" ? "Stop voice command" : "Start voice command"}
          onClick={status === "recording" ? stopRecording : startRecording}
          disabled={status === "transcribing" || status === "sending"}
          style={{
            width: 42,
            height: 42,
            borderRadius: 999,
            border: "1px solid color-mix(in oklch, var(--primary) 20%, var(--hairline))",
            background:
              status === "recording"
                ? "color-mix(in oklch, var(--danger) 88%, black)"
                : "var(--primary)",
            color: "var(--primary-ink)",
            display: "grid",
            placeItems: "center",
            cursor: status === "transcribing" || status === "sending" ? "not-allowed" : "pointer",
          }}
        >
          {status === "recording" ? (
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 3,
                background: "currentColor",
              }}
            />
          ) : (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <path d="M12 19v3" />
            </svg>
          )}
        </button>

        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--ink)" }}>
            {statusLabel}
          </div>
          {draftTranscript ? (
            <input
              value={draftTranscript}
              onChange={(event) => setDraftTranscript(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && canSendDraft) {
                  event.preventDefault();
                  submitTranscript(draftTranscript);
                }
              }}
              aria-label="Edit voice transcript before sending"
              style={{
                width: "100%",
                minWidth: 0,
                border: "none",
                outline: "none",
                background: "transparent",
                color: "var(--ink-2)",
                font: "inherit",
                fontSize: 13,
                padding: 0,
              }}
            />
          ) : (
            <div
              style={{
                fontSize: 13,
                color: displayTranscript || assistantPreview || error ? "var(--ink-2)" : "var(--muted-2)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
              title={displayTranscript || assistantPreview || error || undefined}
            >
              {error ||
                displayTranscript ||
                assistantPreview ||
                "Ask AMS anything by voice without opening the chat panel"}
            </div>
          )}
        </div>

        <button
          type="button"
          aria-label={autoSpeak ? "Mute voice responses" : "Enable voice responses"}
          title={autoSpeak ? "Mute responses" : "Speak responses"}
          onClick={() => setAutoSpeak((value) => !value)}
          style={{
            width: 34,
            height: 34,
            borderRadius: 999,
            border: "1px solid var(--hairline)",
            background: autoSpeak ? "var(--primary-weak)" : "var(--card)",
            color: autoSpeak ? "var(--primary)" : "var(--muted)",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
          }}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M11 5 6 9H3v6h3l5 4V5Z" />
            {autoSpeak ? <path d="M15.5 8.5a5 5 0 0 1 0 7" /> : <path d="m16 9 5 5m0-5-5 5" />}
          </svg>
        </button>

        {status === "recording" ? (
          <button type="button" className="btn" onClick={stopRecording}>
            Stop
          </button>
        ) : null}

        {draftTranscript ? (
          <>
            <button type="button" className="btn btn-primary" disabled={!canSendDraft} onClick={() => submitTranscript(draftTranscript)}>
              Send
            </button>
            <button type="button" className="btn" onClick={clearDraft}>
              Clear
            </button>
          </>
        ) : null}
      </section>
    </>
  );
}
