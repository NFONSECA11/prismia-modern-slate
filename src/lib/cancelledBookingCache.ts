// Module-level cache for cancelled booking data (session only)
export const cancelledBookingCache = new Map<number, { cancelledId: string; botOff: boolean }>();

// Extract the last cancelled/rescheduled booking ID from the notes log
// Notes format: "[DD/MM/YYYY HH:mm] Cancelamento do agendamento #123 ..."
// or: "[DD/MM/YYYY HH:mm] Reagendamento: cancelamento do agendamento #123 ..."
export function extractCancelledIdFromNotes(notes?: string | null): string | null {
  if (!notes) return null;
  const matches = [...notes.matchAll(/(?:cancelamento|reagendamento)[^#]*#(\d+)/gi)];
  if (matches.length === 0) return null;
  return matches[matches.length - 1][1];
}

// Detect if notes contain a reschedule marker (BR_TAG_IN)
export function isRescheduleFromNotes(notes?: string | null): boolean {
  if (!notes) return false;
  return /BR_TAG_IN/i.test(notes);
}
