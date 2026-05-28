"use client";

/**
 * Snooze preference for proactive agent cards.
 *
 * Snooze is intentionally simple: a single epoch-ms timestamp telling us when
 * proactive offers are allowed to resume. `null` (or any past timestamp)
 * means no active snooze. We persist this in localStorage per user so it
 * survives reloads and sticks across tabs.
 *
 * The dispatcher reads `isSnoozed()` to short-circuit; users set snoozes via
 * `snoozeFor(durationMs)` from a button on a proactive card. There's no
 * "permanent off" — even an opt-out has to renew because the underlying
 * notifications still need to be visible in the feed; only the *auto-fire*
 * is suppressed.
 */

import { useCallback, useEffect, useState } from "react";

const SNOOZE_STORAGE_KEY_PREFIX = "ams.copilot.proactive-snooze.v1";

function storageKey(userId: string | number | undefined): string {
  return `${SNOOZE_STORAGE_KEY_PREFIX}.${userId ?? "anonymous"}`;
}

function readSnoozeTimestamp(userId: string | number | undefined): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(storageKey(userId));
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) return null;
  return parsed;
}

function writeSnoozeTimestamp(userId: string | number | undefined, value: number | null) {
  if (typeof window === "undefined") return;
  if (value === null) {
    window.localStorage.removeItem(storageKey(userId));
    return;
  }
  window.localStorage.setItem(storageKey(userId), String(value));
}

/**
 * React hook. Returns the current snooze state and helpers to mutate it.
 * Persists to localStorage and listens for storage events so a snooze set
 * in tab A is visible in tab B without a custom postMessage layer.
 */
export function useProactiveSnooze(userId: string | number | undefined) {
  const [snoozedUntil, setSnoozedUntil] = useState<number | null>(() => readSnoozeTimestamp(userId));

  // Re-read on user change. A login switch should re-load that user's
  // preference (or clear, for anonymous).
  useEffect(() => {
    setSnoozedUntil(readSnoozeTimestamp(userId));
  }, [userId]);

  // Cross-tab sync via storage events. When tab A writes, tab B receives
  // the StorageEvent and updates its in-memory state. The localStorage
  // value is the source of truth.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const key = storageKey(userId);
    const onStorage = (event: StorageEvent) => {
      if (event.key !== key) return;
      setSnoozedUntil(readSnoozeTimestamp(userId));
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [userId]);

  // Auto-expire: when the snooze window passes, drop the value so the next
  // dispatcher tick sees "not snoozed" without anyone explicitly clearing.
  useEffect(() => {
    if (snoozedUntil === null) return;
    const remaining = snoozedUntil - Date.now();
    if (remaining <= 0) {
      setSnoozedUntil(null);
      writeSnoozeTimestamp(userId, null);
      return;
    }
    const timer = window.setTimeout(() => {
      setSnoozedUntil(null);
      writeSnoozeTimestamp(userId, null);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [snoozedUntil, userId]);

  const isSnoozed = snoozedUntil !== null && snoozedUntil > Date.now();

  const snoozeFor = useCallback((durationMs: number) => {
    const until = Date.now() + durationMs;
    setSnoozedUntil(until);
    writeSnoozeTimestamp(userId, until);
  }, [userId]);

  const clearSnooze = useCallback(() => {
    setSnoozedUntil(null);
    writeSnoozeTimestamp(userId, null);
  }, [userId]);

  return { isSnoozed, snoozedUntil, snoozeFor, clearSnooze };
}

/** Common snooze durations in ms — used by the proactive card's buttons. */
export const SNOOZE_DURATIONS = {
  thirtyMinutes: 30 * 60_000,
  oneHour: 60 * 60_000,
  restOfDay: 8 * 60 * 60_000,
} as const;
