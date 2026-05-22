export type CopilotFocusResult =
  | { ok: true; field: string }
  | { ok: false; reason: string };

function escapeAttributeSelectorValue(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function focusCopilotFormField(field: string): CopilotFocusResult {
  if (typeof document === "undefined") {
    return { ok: false, reason: "Document is not available." };
  }

  const escapedField = escapeAttributeSelectorValue(field);
  const target = document.querySelector<HTMLElement>(
    `[data-copilot-field="${escapedField}"] input, ` +
    `[data-copilot-field="${escapedField}"] textarea, ` +
    `[data-copilot-field="${escapedField}"] select, ` +
    `[data-copilot-field="${escapedField}"] button, ` +
    `[data-copilot-field="${escapedField}"] [tabindex]:not([tabindex="-1"])`,
  );

  target?.focus();
  target?.scrollIntoView({ block: "center", behavior: "smooth" });
  return target ? { ok: true, field } : { ok: false, reason: `Field ${field} is not focusable.` };
}
