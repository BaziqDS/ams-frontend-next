/**
 * Cross-page "open this form once the page mounts" mechanism for the AMS
 * Copilot. The agent calls `open_form` from anywhere; if the user is not on
 * the right route the handler navigates AND drops a small token in
 * sessionStorage. The destination page reads the token on mount, fires the
 * matching open handler, and clears the token.
 *
 * sessionStorage is the right scope: survives client-side navigation,
 * dies with the tab, and never leaks across browser sessions.
 */

const KEY = "ams-copilot-pending-open";
const TTL_MS = 10_000;

export type PendingOpen = {
  formId: string;
  ts: number;
};

export function queuePendingOpen(formId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({ formId, ts: Date.now() } satisfies PendingOpen),
    );
  } catch {
    /* quota / private mode — ignore */
  }
}

/**
 * Returns the pending formId if it matches `expectedFormId` AND is still
 * within the TTL. Always clears the entry as a side effect (one-shot).
 */
export function consumePendingOpen(expectedFormId: string): boolean {
  if (typeof window === "undefined") return false;
  let raw: string | null = null;
  try {
    raw = window.sessionStorage.getItem(KEY);
  } catch {
    return false;
  }
  if (!raw) return false;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PendingOpen>;
    if (parsed.formId !== expectedFormId) return false;
    if (typeof parsed.ts !== "number") return false;
    if (Date.now() - parsed.ts > TTL_MS) return false;
    return true;
  } catch {
    return false;
  }
}

/** Same-page case — emit a window event the page can listen to. */
export const SAME_PAGE_OPEN_EVENT = "ams-copilot-open-form";

export function dispatchSamePageOpen(formId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(SAME_PAGE_OPEN_EVENT, { detail: { formId } }),
  );
}
