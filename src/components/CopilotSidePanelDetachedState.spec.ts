import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "src", "components", "CopilotSidePanel.tsx"),
  "utf8",
);
const styles = readFileSync(
  join(process.cwd(), "src", "app", "globals.css"),
  "utf8",
);
const dashboardLayoutSource = readFileSync(
  join(process.cwd(), "src", "app", "(dashboard)", "layout.tsx"),
  "utf8",
);

describe("detached copilot mirrored state", () => {
  it("mirrors loading state from the chat panel without clobbering the composer input", () => {
    expect(source).toMatch(/event\.data\?\.type === "HUMAN_MESSAGE"/);
    // pending may be set through the centralized safety setter OR the raw
    // setter — both flip the same React state, the safety wrapper just also
    // arms an auto-unlock timeout.
    expect(source).toMatch(
      /setPendingWithSafety\(true\)|setQuickMessagePending\(true\)/,
    );
    expect(source).toMatch(
      /event\.data\.isLoading === true[\s\S]*set(?:Pending(?:WithSafety)?|QuickMessagePending)\(true\)/,
    );
    // The HUMAN_MESSAGE handler MUST NOT echo the just-sent text back into
    // the composer — that would clobber a draft the user is typing next.
    const humanHandler =
      source.match(
        /event\.data\?\.type === "HUMAN_MESSAGE"[\s\S]*?return;\s*\}/,
      )?.[0] ?? "";
    expect(humanHandler).not.toMatch(/setQuickMessage\(text\)/);
    // The ASSISTANT_MESSAGE handler MUST NOT clear the composer either —
    // it fires on the first streamed token and the user may already be
    // typing the next message.
    const assistantHandler =
      source.match(
        /event\.data\?\.type !== "ASSISTANT_MESSAGE"[\s\S]*?\n {4}\};/,
      )?.[0] ?? "";
    expect(assistantHandler).not.toMatch(/setQuickMessage\(""\)/);
  });

  it("keeps the composer pending for the whole run — the first streamed token must not unlock it", () => {
    // ASSISTANT_MESSAGE fires on the FIRST streamed token while the agent is
    // still working. Unlocking here flipped the stop/spinner button back to
    // an idle send arrow mid-run (most visible on voice-initiated runs).
    // The only unlock signals are ASSISTANT_LOADING=false, HITL_INTERRUPT,
    // stop, and the safety timeout.
    const assistantHandler =
      source.match(
        /event\.data\?\.type !== "ASSISTANT_MESSAGE"[\s\S]*?\n {4}\};/,
      )?.[0] ?? "";
    expect(assistantHandler).not.toMatch(/setPendingWithSafety\(false\)/);
    expect(assistantHandler).not.toMatch(/loadingStartedRef\.current = false/);
    // Instead it re-arms the safety timer — streaming proves the run is alive.
    expect(assistantHandler).toMatch(/setPendingWithSafety\(true\)/);
    // TODO_STATE acts as a heartbeat too, so long tool-heavy runs with no
    // streamed text don't hit the safety timeout either.
    const todoHandler =
      source.match(
        /event\.data\?\.type === "TODO_STATE"[\s\S]*?return;\s*\}/,
      )?.[0] ?? "";
    expect(todoHandler).toMatch(/setPendingWithSafety\(true\)/);
  });

  it("shows a dismissable spoken-reply toast above the detached composer", () => {
    // SPEAK_TEXT (run complete + voice narration) raises a notification-style
    // block above the composer in detached mode only — when the panel is
    // open the reply is already visible in the chat thread.
    const speakHandler =
      source.match(
        /event\.data\?\.type === "SPEAK_TEXT"[\s\S]*?return;\s*\}/,
      )?.[0] ?? "";
    expect(speakHandler).toMatch(/if \(!isOpen\) setVoiceToast\(speakText\)/);
    // The ✕ removes the toast AND stops Uplift playback.
    const dismissFn =
      source.match(
        /const dismissVoiceToast = useCallback\([\s\S]*?\}, \[stopReplyPlayback\]\)/,
      )?.[0] ?? "";
    expect(dismissFn).toMatch(/setVoiceToast\(null\)/);
    expect(dismissFn).toMatch(/stopReplyPlayback\(\)/);
    expect(source).toMatch(/onClick=\{dismissVoiceToast\}/);
    // Urdu narration text renders in its natural reading direction.
    expect(source).toMatch(/className="copilot-voice-toast-text" dir="auto"/);
    // Stale-toast hygiene: cleared when the panel opens, when a new message
    // is sent, and on new chat.
    expect(source.match(/setVoiceToast\(null\)/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    // Positioned above the composer with a gap, like a notification.
    expect(styles).toMatch(
      /\.copilot-voice-toast \{[\s\S]*?bottom: calc\(100% \+ 0\.625rem\)/,
    );
    expect(styles).toMatch(/\.copilot-voice-toast-close/);
  });

  it("keeps the sent text in the composer as a visual receipt while the run is in flight", () => {
    // The submit handler must NOT clear the input on submit — the user
    // wants to see "I sent: Hi" while the spinner runs, otherwise the
    // composer looks empty and they wonder if anything was sent.
    const submitStart = source.indexOf("const submitQuickMessage");
    const submitEnd = source.indexOf("const stopDetachedRun");
    const submitFn =
      submitStart >= 0 && submitEnd > submitStart
        ? source.slice(submitStart, submitEnd)
        : "";
    expect(submitFn).not.toMatch(/setQuickMessage\(""\)/);
    // It DOES record the submitted text and resets the user-edited flag so
    // the auto-clear can fire when the run truly completes.
    expect(submitFn).toMatch(/lastSubmittedTextRef\.current = text/);
    expect(submitFn).toMatch(/userEditedSinceSubmitRef\.current = false/);
  });

  it("auto-clears the composer only when the run completes AND the user has not edited", () => {
    // ASSISTANT_LOADING=false marks the true end of a run (vs ASSISTANT_MESSAGE
    // which fires on the first streamed token mid-run). The clear is gated
    // on userEditedSinceSubmitRef so a new draft is never wiped.
    const loadingFalseBranch =
      source.match(
        /loadingStartedRef\.current = false;\s*setPendingWithSafety\(false\);[\s\S]*?return;/,
      )?.[0] ?? "";
    expect(loadingFalseBranch).toMatch(/!userEditedSinceSubmitRef\.current/);
    expect(loadingFalseBranch).toMatch(/setQuickMessage\(""\)/);
    expect(loadingFalseBranch).toMatch(/lastSubmittedTextRef\.current = null/);
  });

  it("marks the composer as user-edited on every keystroke after a submit", () => {
    // The textarea onChange handler flips userEditedSinceSubmitRef so a
    // mid-run edit is treated as a new draft and protected from auto-clear.
    expect(source).toMatch(/userEditedSinceSubmitRef\.current = true/);
  });

  it("does not reset iframe readiness after the child already announced ready", () => {
    expect(source).not.toMatch(
      /onLoad=\{\(\) => \{[\s\S]*iframeReadyRef\.current = false/,
    );
  });

  it("does not render the 'new reply' pill in detached mode", () => {
    // The pill ("Assistant has a new reply") was removed by request — the
    // spoken-reply toast and the chat thread itself are the only reply
    // surfaces. Keep the component and styles free of it.
    expect(source).not.toMatch(/copilot-dock-reply-pop/);
    expect(source).not.toMatch(/Assistant has a new reply/);
    expect(source).not.toMatch(/unreadCount/);
    expect(source).not.toMatch(/copilot-dock-unread/);
    expect(styles).not.toMatch(/\.copilot-dock-reply-pop/);
    expect(styles).not.toMatch(/copilot-reply-dot-pulse/);
    // The pop-in keyframe survives — the spoken-reply toast animates with it.
    expect(styles).toMatch(/@keyframes copilot-reply-pop-in/);
    expect(styles).toMatch(
      /\.copilot-voice-toast \{[\s\S]*?animation: copilot-reply-pop-in/,
    );
  });

  it("matches the chat panel composer corner radius in detached mode", () => {
    expect(styles).toMatch(
      /\.copilot-search-overlay \{[^}]*border-radius: 1\.125rem/,
    );
    expect(styles).toMatch(
      /\.copilot-search-active-task \{[^}]*border-radius: 1\.125rem 1\.125rem 0 0/,
    );
    expect(styles).toMatch(
      /\.copilot-search-approval-bubble \{[^}]*border-radius: 1\.125rem 1\.125rem 0 0/,
    );
  });
  it("removes the collapsed launcher and keeps the detached composer as the closed-panel entry point", () => {
    expect(source).not.toMatch(/copilot-launcher/);
    expect(source).not.toMatch(/launcherStatus/);
    expect(source).not.toMatch(/composerOpen/);
    expect(source).not.toMatch(/DETACHED_COMPOSER_OPEN_KEY/);
    expect(source).not.toMatch(/<Sparkles size=\{14\}/);
    expect(source).not.toMatch(/aria-label="Collapse AMS Copilot"/);
    expect(source).toMatch(/!isOpen \? \(/);
    expect(source).toMatch(/className=\{`copilot-search-overlay\$\{hasApproval \? " has-approval" : ""\}`\}/);
    expect(source).toMatch(/e\.key === "Escape" && isOpen\) closePanel\(\)/);
    expect(source).toMatch(/if \(target && panelRef\.current\?\.contains\(target\)\) return;[\s\S]*closePanel\(\);/);
    expect(styles).not.toMatch(/\.copilot-launcher/);
    expect(styles).not.toMatch(/\.copilot-search-overlay--drawer/);
    expect(styles).not.toMatch(/\.copilot-drawer-/);
  });

  it("lets the detached composer stop a pending agent run", () => {
    expect(source).toMatch(/const stopDetachedRun = useCallback/);
    expect(source).toMatch(/type: "STOP_RUN"/);
    expect(source).toMatch(
      /type=\{quickMessagePending \? "button" : "submit"\}/,
    );
    expect(source).toMatch(
      /onClick=\{quickMessagePending \? stopDetachedRun : undefined\}/,
    );
    expect(source).toMatch(
      /aria-label=\{quickMessagePending \? "Stop task" : "Send message"\}/,
    );
  });

  it("captures voice via browser SpeechRecognition only — no audio recording or server transcription", () => {
    const startVoiceStart = source.indexOf("const startVoiceFromSearch");
    const startVoiceEnd = source.indexOf("useEffect(() => () => stopVoiceRecognition()", startVoiceStart);
    const startVoiceFn =
      startVoiceStart >= 0 && startVoiceEnd > startVoiceStart
        ? source.slice(startVoiceStart, startVoiceEnd)
        : "";

    expect(source).not.toMatch(/COPILOT_START_VOICE_EVENT/);
    // getUserMedia + constraints are kept ONLY to drive the on-screen mic
    // meter — not to record audio.
    expect(source).toMatch(/const VOICE_AUDIO_CONSTRAINTS/);
    expect(source).toMatch(/channelCount: \{ ideal: 1 \}/);
    expect(source).toMatch(/echoCancellation: true/);
    expect(source).toMatch(/function buildVoiceAudioConstraints/);
    expect(source).toMatch(/enumerateDevices/);
    expect(source).toMatch(/setAudioInputDevices/);
    expect(source).toMatch(/startVoiceMeter\(stream\)/);
    expect(source).toMatch(/copilot-search-voice-meter/);
    // The text comes purely from the browser recognizer.
    expect(source).toMatch(/SpeechRecognition/);
    expect(source).toMatch(/webkitSpeechRecognition/);
    expect(source).toMatch(/recognition\.lang = "ur-PK"/);
    expect(source).toMatch(/normalizeUrduVoicePreview/);
    // The interim transcript streams straight into the composer textarea and
    // simply stays there on stop (same element/style/position), so nothing is
    // rewritten after the user stops talking.
    expect(source).toMatch(/const preview = normalizeUrduVoicePreview/);
    expect(source).toMatch(/setQuickMessage\(`\$\{recordingBaseTextRef\.current\}\$\{preview\}`\)/);
    expect(source).not.toMatch(/copilot-search-live-transcript/);
    expect(source).not.toMatch(/setLiveTranscriptPreview/);
    // The detached composer must stay editable — never read-only.
    expect(source).not.toMatch(/readOnly=\{isRecording\}/);
    // No audio recording and no server-side Whisper transcription anywhere.
    expect(source).not.toMatch(/MediaRecorder/);
    expect(source).not.toMatch(/transcribeRecording/);
    expect(source).not.toMatch(/VOICE_RECORDER_MIME_TYPES/);
    expect(source).not.toMatch(/getVoiceRecorderOptions/);
    expect(source).not.toMatch(/isTranscribing/);
    expect(source).not.toMatch(/\/api\/copilot\/voice\/transcribe/);
    // startVoiceFromSearch opens the mic for the meter and starts the
    // recognizer directly — no recorder, no postMessage, no panel open.
    expect(startVoiceFn).toMatch(/navigator\.mediaDevices\.getUserMedia/);
    expect(startVoiceFn).toMatch(/getUserMedia\(buildVoiceAudioConstraints\(selectedAudioDeviceId\)\)/);
    expect(startVoiceFn).toMatch(/startRealtimeTranscriptPreview\(\)/);
    expect(startVoiceFn).toMatch(/setIsRecording\(true\)/);
    expect(startVoiceFn).not.toMatch(/new MediaRecorder/);
    expect(startVoiceFn).not.toMatch(/setIsOpen\(true\)/);
    expect(startVoiceFn).not.toMatch(/START_VOICE_CAPTURE/);
    expect(startVoiceFn).not.toMatch(/postMessage/);
    expect(startVoiceEnd).toBeGreaterThan(startVoiceStart);
  });

  it("plays iframe voice replies from the detached parent shell", () => {
    expect(source).toMatch(/VOICE_REPLIES_KEY/);
    expect(source).toMatch(/event\.data\?\.type === "SPEAK_TEXT"/);
    expect(source).toMatch(/speakReplyText\(speakText\)/);
    expect(source).toMatch(/fetch\("\/api\/copilot\/voice\/speak"/);
    expect(source).toMatch(/new Audio\(url\)/);
    expect(source).toMatch(/voiceRepliesEnabled/);
    expect(source).toMatch(/toggleVoiceReplies/);
    expect(source).toMatch(/stopReplyPlayback/);
  });

  it("does not mount the separate voice overlay in the dashboard shell", () => {
    expect(dashboardLayoutSource).not.toMatch(/CopilotVoiceOverlay/);
  });

  it("guards against stuck pending state with a stop window and safety timeout", () => {
    // After the user clicks stop, straggler "loading=true" events from the
    // dying agent run must be ignored for a short window — otherwise the
    // composer re-locks immediately and the user is stuck.
    expect(source).toMatch(/stopGuardUntilRef/);
    expect(source).toMatch(/STOP_GUARD_MS/);
    expect(source).toMatch(/Date\.now\(\) < stopGuardUntilRef\.current/);

    // A safety timer must auto-clear pending if no iframe events arrive,
    // so a missed postMessage cannot permanently lock the composer.
    expect(source).toMatch(/PENDING_SAFETY_TIMEOUT_MS/);
    expect(source).toMatch(/pendingSafetyTimerRef/);
    expect(source).toMatch(/setPendingWithSafety/);
  });

  it("keeps the detached textarea always typeable", () => {
    // readOnly={quickMessagePending} traps users — they cannot start typing
    // the next message while the agent is responding. The textarea must be
    // typeable at all times; only the submit/stop button reflects pending.
    expect(source).not.toMatch(/readOnly=\{quickMessagePending\}/);
  });

  it("clears the iframe-side queued quick message when stop is requested", () => {
    // If a queued message remains after stop, it auto-submits the moment
    // stream.isLoading flips back to false — silently starting a new run
    // that re-locks the detached composer.
    const iframeSource = readFileSync(
      join(
        process.cwd(),
        "..",
        "langchain-agent-chat-openrouter",
        "apps",
        "web",
        "src",
        "components",
        "thread",
        "index.tsx",
      ),
      "utf8",
    );
    expect(iframeSource).toMatch(
      /STOP_RUN[\s\S]{0,400}pendingQuickMessageRef\.current = null/,
    );
  });
});

describe("detached approval bubble layout", () => {
  it("renders a slim detached HITL approval bar with inline decisions", () => {
    expect(source).toMatch(/buildDetachedApprovalReview/);
    expect(source).toMatch(/copilot-search-approval-bubble/);
    expect(source).toMatch(/HITL/);
    expect(source).toMatch(/Human approval required/);
    expect(source).toMatch(/Pending your response/);
    expect(source).toMatch(/Open chat panel to review/);
    expect(source).toMatch(/onClick=\{openPanel\}/);
    expect(source).toMatch(/sendHitlDecision\(decision\)/);
    expect(source).toMatch(/handleDetachedApproval\("reject"\)/);
    expect(source).toMatch(/handleDetachedApproval\("approve"\)/);
    expect(source).toMatch(/copilot-search-overlay.*has-approval/);
    expect(source).not.toMatch(/approvalReviewTab/);
    expect(source).not.toMatch(/copilot-search-approval-tabs/);
    expect(source).not.toMatch(/copilot-search-approval-meta/);
    expect(source).not.toMatch(/copilot-search-approval-field-list/);
    expect(source).not.toMatch(/copilot-search-approval-btn/);
    expect(source).not.toMatch(/"audit"|Audit/);
    expect(source).not.toMatch(/"details"|Details/);
    // Original concern: the deprecated approval-review tab label "Intent".
    // Exclude legitimate camelCase usages (suggestedIntent, intentTarget,
    // etc.) introduced by the proactive notification dispatcher.
    expect(source).not.toMatch(/(?<![a-z])Intent\b(?!Target)/);
    expect(source).not.toMatch(/ListChecks|is-preview/);
    expect(source).not.toMatch(/View fields/);
    expect(source).not.toMatch(
      /1 of \{approvalInterrupt\.actionRequests\.length\} action/,
    );
    const approvalStyles =
      styles.match(/\.copilot-search-approval-bubble \{[^}]*\}/)?.[0] ?? "";
    const approvalThemeStyles = [
      ...styles.matchAll(/\.copilot-search-approval[^{]*\{[^}]*\}/g),
    ]
      .map((match) => match[0])
      .join("\n");
    expect(styles).toMatch(
      /\.copilot-search-overlay\.has-approval \{[\s\S]*width: min\(29rem, calc\(100vw - 2rem\)\)/,
    );
    expect(approvalStyles).toMatch(/position: relative/);
    expect(approvalStyles).toMatch(/width: calc\(100% \+ 1\.125rem\)/);
    expect(approvalStyles).toMatch(/max-width: none/);
    expect(approvalStyles).toMatch(/margin: -0\.4375rem -0\.5625rem 0\.3125rem/);
    expect(approvalStyles).toMatch(/min-height: 3\.375rem/);
    expect(styles).toMatch(/\.copilot-search-approval-bubble-main/);
    expect(styles).toMatch(
      /\.copilot-search-approval-bubble-text \{[\s\S]*display: none/,
    );
    expect(styles).toMatch(
      /\.copilot-search-approval-bubble-eyebrow \{[\s\S]*white-space: nowrap/,
    );
    expect(styles).toMatch(
      /\.copilot-search-approval-bubble-main \{[\s\S]*overflow: hidden/,
    );
    expect(styles).toMatch(
      /\.copilot-search-approval-bubble-title \{[\s\S]*text-overflow: ellipsis/,
    );
    expect(styles).toMatch(
      /\.copilot-search-approval-bubble-action\.is-reject/,
    );
    expect(styles).toMatch(
      /\.copilot-search-approval-bubble-action\.is-approve/,
    );
    // Approval bubble uses the amber gradient theme. The exact hexes are
    // implementation detail; match any amber-family token so theme tweaks
    // (lightness, saturation) don't break the test.
    expect(approvalThemeStyles).toMatch(/#fde68a|#fef3c7|#fffbeb|#b45309|#92400e|#fcd34d/);
    expect(approvalThemeStyles).not.toMatch(/var\(--warn/);
    expect(styles).not.toMatch(/\.copilot-search-approval-bubble::after/);
    expect(styles).not.toMatch(/\.copilot-search-approval-bubble-open/);
    expect(styles).not.toMatch(/copilot-search-approval-step/);
    expect(styles).not.toMatch(/\.copilot-search-approval\s*\{/);
    expect(approvalStyles).not.toMatch(/bottom: calc\(100%/);
    expect(styles).not.toMatch(/\.copilot-search-approval-tabs/);
    expect(styles).not.toMatch(/\.copilot-search-approval-btn/);
  });
});
