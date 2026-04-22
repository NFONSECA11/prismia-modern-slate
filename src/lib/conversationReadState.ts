/**
 * Tracks last-read timestamps for booking conversations in localStorage.
 * A conversation is "unread" when the latest relevant server timestamp
 * (usually the latest incoming client message) is newer than the stored last-read timestamp.
 */

const KEY_PREFIX = "booking_last_read_";
const EVENT = "conversation-read-changed";

function toTimestamp(value?: number | string | Date | null): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : 0;
  }
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

export function getLastRead(bookingId: number | string): number {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + bookingId);
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function markConversationRead(bookingId: number | string, ts?: number | string | Date | null): void {
  try {
    const nextTs = toTimestamp(ts) || Date.now();
    localStorage.setItem(KEY_PREFIX + bookingId, String(nextTs));
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { bookingId, ts: nextTs } }));
  } catch {
    // ignore
  }
}

export function isConversationUnread(bookingId: number | string, reference?: number | string | Date | null): boolean {
  const referenceMs = toTimestamp(reference);
  if (!referenceMs) return false;
  return referenceMs > getLastRead(bookingId);
}

export function subscribeReadChanges(cb: () => void): () => void {
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

