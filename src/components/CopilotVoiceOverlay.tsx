"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  COPILOT_ASSISTANT_MESSAGE_EVENT,
  COPILOT_HITL_INTERRUPT_EVENT,
  COPILOT_START_VOICE_EVENT,
  type CopilotAssistantMessageEvent,
  type CopilotHitlInterrupt,
  useCopilotHitlDecision,
  useCopilotVoiceCommand,
} from "@/contexts/CopilotContext";
import { buildVoiceTranscriptDraft } from "@/lib/voiceCapture";
import {
  createDebouncedTranslator,
  translateText,
  type TranslateResult,
} from "@/lib/voiceTranslate";
import { Button } from "@/components/ui/button";

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
const VOICE_RECOGNITION_LANGUAGE = "ur-PK";
const VOICE_TRANSLATION_SOURCE_LANGUAGE = "ur";

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
  const [liveTranslation, setLiveTranslation] = useState("");

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const lastVoiceCommandAtRef = useRef<number | null>(null);
  const translatorRef = useRef(
    createDebouncedTranslator((result: TranslateResult) => {
      if (result.ok && result.translatedText) {
        setLiveTranslation(result.translatedText);
      }
    }, 400),
  );

  const displayTranscript = draftTranscript || finalTranscript || liveTranslation || liveTranscript;
  const visibleVoiceText =
    error ||
    displayTranscript ||
    assistantPreview ||
    "Ask AMS anything by voice without opening the chat panel";
  const isBusy = status === "recording" || status === "transcribing" || status === "sending";
  const hasVoiceGlow = isBusy || isVoiceAgentWorking;
  const voiceGlowColor =
    status === "recording"
      ? "color-mix(in oklch, var(--danger) 70%, white)"
      : "color-mix(in oklch, var(--primary) 76%, white)";
  const typedMessage = draftTranscript.trim();
  const canSendDraft = typedMessage.length > 0 && !isBusy;

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

  const finalizeSpeechTranscript = useCallback(async () => {
    translatorRef.current.cancel();
    const rawText = liveTranscript.trim();

    if (!rawText) {
      setStatus("idle");
      return;
    }

    setStatus("transcribing");
    setError("");

    try {
      const translated = await translateText(
        rawText,
        "en",
        VOICE_TRANSLATION_SOURCE_LANGUAGE,
      );
      const englishText = translated.ok && translated.translatedText
        ? translated.translatedText
        : liveTranslation || rawText;

      const draft = buildVoiceTranscriptDraft({
        translatedText: englishText,
        fallbackText: rawText,
      });
      setFinalTranscript(draft.text);
      setDraftTranscript(draft.text);
      setStatus("idle");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setStatus("error");
    }
  }, [liveTranscript, liveTranslation]);

  const startBrowserRecognition = useCallback(() => {
    const Recognition = getSpeechRecognitionCtor();
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = VOICE_RECOGNITION_LANGUAGE;
    recognition.onresult = (event: unknown) => {
      const results = (event as { results?: ArrayLike<ArrayLike<{ transcript?: string }>> }).results;
      if (!results) return;
      const parts: string[] = [];
      for (let i = 0; i < results.length; i += 1) {
        const item = results[i]?.[0]?.transcript;
        if (item) parts.push(item);
      }
      const joined = parts.join(" ").trim();
      setLiveTranscript(joined);
      if (joined) {
        translatorRef.current.translate(joined, "en", VOICE_TRANSLATION_SOURCE_LANGUAGE);
      }
    };
    recognition.onerror = () => {
      /* SpeechRecognition errors are non-fatal; the user can still edit the draft. */
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

  const startRecording = useCallback(() => {
    if (isBusy) return;
    const Recognition = getSpeechRecognitionCtor();
    if (!Recognition) {
      setError("Speech recognition is not supported in this browser.");
      setStatus("error");
      return;
    }

    setError("");
    setLiveTranscript("");
    setLiveTranslation("");
    setFinalTranscript("");
    setDraftTranscript("");
    setAssistantPreview("");
    translatorRef.current.cancel();

    startBrowserRecognition();
    setStatus("recording");
  }, [isBusy, startBrowserRecognition]);

  useEffect(() => {
    const onStartVoice = () => startRecording();
    window.addEventListener(COPILOT_START_VOICE_EVENT, onStartVoice);
    return () => window.removeEventListener(COPILOT_START_VOICE_EVENT, onStartVoice);
  }, [startRecording]);

  const clearDraft = useCallback(() => {
    translatorRef.current.cancel();
    setDraftTranscript("");
    setFinalTranscript("");
    setLiveTranscript("");
    setLiveTranslation("");
    setError("");
    setStatus("idle");
  }, []);

  const stopRecording = useCallback(() => {
    stopRecognition();
    void finalizeSpeechTranscript();
  }, [stopRecognition, finalizeSpeechTranscript]);

  useEffect(() => {
    const translator = translatorRef.current;
    return () => {
      translator.cancel();
      stopRecognition();
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [stopRecognition]);

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
    if (status === "transcribing") return "Transcribing & translating";
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
          inset: -5px;
          border-radius: 24px;
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
              <Button
                type="button"
                variant="outline"
                disabled={approvalBusy !== null}
                onClick={() => handleApproval("reject")}
              >
                {approvalBusy === "reject" ? "Rejecting..." : "Reject"}
              </Button>
              <Button
                type="button"
                disabled={approvalBusy !== null}
                onClick={() => handleApproval("approve")}
              >
                {approvalBusy === "approve" ? "Approving..." : "Approve"}
              </Button>
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
          width: "min(464px, calc(100vw - 32px))",
          zIndex: 1087,
          border: "1px solid color-mix(in oklch, var(--ink) 10%, var(--hairline))",
          borderRadius: 14,
          background: "color-mix(in oklch, var(--card) 94%, white)",
          boxShadow: "0 14px 38px -24px rgba(15, 23, 42, 0.34)",
          backdropFilter: "blur(14px)",
          padding: "7px 9px 6px",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        } as CSSProperties}
      >
        <div style={{ minWidth: 0 }}>
          <textarea
            value={draftTranscript}
            onChange={(event) => {
              setDraftTranscript(event.target.value);
              if (error) setError("");
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && canSendDraft) {
                event.preventDefault();
                submitTranscript(draftTranscript);
              }
            }}
            placeholder={error || assistantPreview || displayTranscript || "Ask AMS anything..."}
            aria-label="Type or edit assistant message"
            style={{
              width: "100%",
              minHeight: 28,
              maxHeight: 76,
              resize: "none",
              overflowY: "auto",
              border: "none",
              outline: "none",
              background: "transparent",
              color: "var(--ink)",
              font: "inherit",
              fontSize: 13,
              lineHeight: 1.3,
              padding: "1px 2px 0",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 6,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
            <button
              type="button"
              aria-label="Clear voice text"
              title="Clear voice text"
              onClick={clearDraft}
              disabled={!draftTranscript && !finalTranscript && !liveTranscript && !liveTranslation && !error}
              style={{
                width: 26,
                height: 26,
                borderRadius: 8,
                border: "none",
                background: "transparent",
                color: "var(--muted)",
                display: "grid",
                placeItems: "center",
                cursor: draftTranscript || finalTranscript || liveTranscript || liveTranslation || error ? "pointer" : "default",
                opacity: draftTranscript || finalTranscript || liveTranscript || liveTranslation || error ? 1 : 0.55,
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <button
              type="button"
              aria-label={status === "recording" ? "Stop voice command" : "Start voice command"}
              title={status === "recording" ? "Stop recording" : "Start voice"}
              onClick={status === "recording" ? stopRecording : startRecording}
              disabled={status === "transcribing" || status === "sending"}
              style={{
                width: 26,
                height: 26,
                borderRadius: 8,
                border: "none",
                background: "transparent",
                color: status === "recording" ? "var(--danger)" : "var(--muted)",
                display: "grid",
                placeItems: "center",
                cursor: status === "transcribing" || status === "sending" ? "not-allowed" : "pointer",
              }}
            >
              {status === "recording" ? (
                <span style={{ width: 10, height: 10, borderRadius: 3, background: "currentColor" }} />
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <path d="M12 19v3" />
                </svg>
              )}
            </button>

            <button
              type="button"
              aria-label="Send voice command"
              title="Send voice command"
              disabled={!canSendDraft}
              onClick={() => submitTranscript(draftTranscript)}
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                border: "none",
                background: canSendDraft ? "color-mix(in oklch, var(--ink) 82%, white)" : "color-mix(in oklch, var(--muted) 36%, white)",
                color: "white",
                display: "grid",
                placeItems: "center",
                cursor: canSendDraft ? "pointer" : "not-allowed",
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 19V5" />
                <path d="m5 12 7-7 7 7" />
              </svg>
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
