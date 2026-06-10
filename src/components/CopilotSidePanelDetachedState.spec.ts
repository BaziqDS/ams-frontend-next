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
        /event\.data\?\.type !== "ASSISTANT_MESSAGE"[\s\S]*?setUnreadCount/,
      )?.[0] ?? "";
    expect(assistantHandler).not.toMatch(/setQuickMessage\(""\)/);
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

  it("shows an amber rounded reply popover with a pointed notch", () => {
    expect(source).toMatch(/copilot-dock-reply-pop/);
    expect(source).toMatch(/Assistant has a new reply/);
    expect(source).toMatch(/onClick=\{openPanel\}/);
    expect(source).not.toMatch(/copilot-dock-unread/);
    expect(styles).toMatch(/\.copilot-dock-reply-pop \{[\s\S]*right: 0/);
    expect(styles).toMatch(/\.copilot-dock-reply-pop \{[\s\S]*border-radius: 1\.125rem/);
    expect(styles).toMatch(/\.copilot-dock-reply-pop \{[\s\S]*#fef3c7/);
    expect(styles).toMatch(/\.copilot-dock-reply-pop \{[\s\S]*#78350f/);
    expect(styles).toMatch(/\.copilot-dock-reply-pop::after/);
    expect(styles).toMatch(/\.copilot-dock-reply-pop::after \{[\s\S]*transform: rotate\(45deg\)/);
    expect(styles).toMatch(/\.copilot-dock-reply-pop::after \{[\s\S]*#fef3c7/);
    expect(styles).toMatch(/copilot-reply-dot-pulse/);
    expect(styles).not.toMatch(
      /\.copilot-dock-unread \{[\s\S]*var\(--danger\)/,
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

  it("keeps the collapsed launcher from restyling the opened detached composer", () => {
    expect(source).toMatch(/copilot-launcher/);
    expect(source).toMatch(/copilot-launcher-icon/);
    expect(source).toMatch(/copilot-launcher-message/);
    expect(source).toMatch(/copilot-launcher-cta/);
    expect(source).toMatch(/<Sparkles size=\{14\}/);
    expect(source).toMatch(
      /const closePanel = useCallback\(\(\) => \{[\s\S]*setIsOpen\(false\);[\s\S]*setComposerOpen\(true\);[\s\S]*DETACHED_COMPOSER_OPEN_KEY/,
    );
    expect(source).toMatch(/e\.key === "Escape" && isOpen\) closePanel\(\)/);
    expect(source).toMatch(
      /if \(target && panelRef\.current\?\.contains\(target\)\) return;[\s\S]*closePanel\(\);/,
    );
    expect(source).toMatch(/composerOpen/);
    expect(source).toMatch(/aria-label="Collapse AMS Copilot"/);
    expect(source).toMatch(/onClick=\{closeComposer\}/);
    expect(source).toMatch(/ChevronDown/);
    expect(source).toMatch(
      /it, but do not force it open again after the user manually collapses it/,
    );
    expect(source).not.toMatch(
      /approvalInterrupt, composerOpen, persistComposerOpen/,
    );
    expect(source).toMatch(
      /className=\{`copilot-search-overlay\$\{hasApproval \? " has-approval" : ""\}`\}/,
    );
    expect(source).not.toMatch(/actionRequests\?\.length\) return;\s+closeComposer/);
    expect(source).not.toMatch(/copilot-search-overlay--drawer/);
    expect(source).not.toMatch(/copilot-drawer-/);
    // Launcher pill — new floating rounded design (pulsing dot + uppercase
    // label + mono status text + chevron). Asserts the structural pieces
    // exist; exact pixel/radius values are implementation detail.
    expect(styles).toMatch(/\.copilot-launcher \{/);
    expect(styles).toMatch(/\.copilot-launcher \{[\s\S]*border-radius: 999px/);
    expect(styles).toMatch(/\.copilot-launcher-icon \{/);
    expect(styles).toMatch(/\.copilot-launcher-message \{/);
    expect(styles).toMatch(/\.copilot-launcher-message \{[\s\S]*text-overflow: ellipsis/);
    expect(styles).toMatch(/\.copilot-launcher-cta \{/);
    expect(styles).toMatch(/--copilot-launcher-cta-top: #3a3025/);
    expect(styles).toMatch(/--copilot-launcher-cta-bottom: #221d18/);
    // Old bottom-attached shoulder pseudo-elements removed.
    expect(styles).not.toMatch(/\.copilot-launcher::before/);
    expect(styles).not.toMatch(/\.copilot-launcher::after/);
    // Old "AI" badge mark removed.
    expect(styles).not.toMatch(/\.copilot-launcher-mark \{/);
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

  it("records voice inline into the detached composer without an overlay", () => {
    const startVoiceStart = source.indexOf("const startVoiceFromSearch");
    const startVoiceEnd = source.indexOf("useEffect(() => () => stopVoiceRecognition()", startVoiceStart);
    const transcribeStart = source.indexOf("const transcribeRecording");
    const startVoiceFn =
      startVoiceStart >= 0 && startVoiceEnd > startVoiceStart
        ? source.slice(startVoiceStart, startVoiceEnd)
        : "";
    const transcribeFn =
      transcribeStart >= 0
        ? source.slice(transcribeStart, transcribeStart + 2000)
        : "";

    expect(source).not.toMatch(/COPILOT_START_VOICE_EVENT/);
    expect(startVoiceFn).toMatch(/navigator\.mediaDevices\.getUserMedia/);
    expect(startVoiceFn).toMatch(/new MediaRecorder/);
    expect(startVoiceFn).toMatch(/transcribeRecording/);
    expect(transcribeFn).toMatch(/\/api\/copilot\/voice\/transcribe/);
    expect(transcribeFn).toMatch(/setQuickMessage/);
    expect(startVoiceFn).not.toMatch(/setIsOpen\(true\)/);
    expect(startVoiceFn).not.toMatch(/START_VOICE_CAPTURE/);
    expect(startVoiceFn).not.toMatch(/postMessage/);
    expect(startVoiceEnd).toBeGreaterThan(startVoiceStart);
    expect(transcribeStart).toBeGreaterThanOrEqual(0);
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
    expect(source).toMatch(/unreadCount > 0 && !hasApproval/);
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
