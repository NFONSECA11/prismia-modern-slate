/**
 * Tracks last-read timestamps for booking conversations in localStorage.
 * A conversation is "unread" when booking.updated_at > stored last-read timestamp.
 */

const KEY_PREFIX = "booking_last_read_";
const EVENT = "conversation-read-changed";

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

export function markConversationRead(bookingId: number | string, ts: number = Date.now()): void {
  try {
    localStorage.setItem(KEY_PREFIX + bookingId, String(ts));
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { bookingId, ts } }));
  } catch {
    // ignore
  }
}

export function isConversationUnread(bookingId: number | string, updatedAt?: string | null): boolean {
  if (!updatedAt) return false;
  const updatedMs = new Date(updatedAt).getTime();
  if (!Number.isFinite(updatedMs)) return false;
  return updatedMs > getLastRead(bookingId);
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
