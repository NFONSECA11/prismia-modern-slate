// Extract the last cancelled booking ID from the notes log
// Notes format: "[DD/MM/YYYY HH:mm] Cancelamento do agendamento #123 solicitado por ..."
export function extractCancelledIdFromNotes(notes?: string | null): string | null {
  if (!notes) return null;
  // Find all matches and return the last one (most recent cancellation)
  const matches = [...notes.matchAll(/Cancelamento do agendamento #(\d+)/g)];
  if (matches.length === 0) return null;
  return matches[matches.length - 1][1];
}
