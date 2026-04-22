import type { BookingRequest } from "@/types/booking";

const bookingProcedureNameOverrides = new Map<number, string>();
const PLACEHOLDER_PROCEDURE_NAMES = new Set(["falar com atendente"]);

function normalizeProcedureName(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isPlaceholderProcedureName(value: unknown): boolean {
  const normalized = normalizeProcedureName(value).toLowerCase();
  return normalized.length > 0 && PLACEHOLDER_PROCEDURE_NAMES.has(normalized);
}

export function rememberBookingProcedureNameOverride(
  bookingId: number,
  procedureName: unknown,
): void {
  const normalizedName = normalizeProcedureName(procedureName);
  if (!bookingId || !normalizedName) return;
  bookingProcedureNameOverrides.set(bookingId, normalizedName);
}

export function applyBookingProcedureNameOverride<T extends { id?: number; procedure_name?: string | null }>(
  booking: T,
): T {
  if (!booking || typeof booking !== "object") return booking;

  const bookingId = typeof booking.id === "number" ? booking.id : Number(booking.id);
  if (!Number.isFinite(bookingId)) return booking;

  const overrideName = bookingProcedureNameOverrides.get(bookingId);
  if (!overrideName) return booking;

  const currentName = normalizeProcedureName(booking.procedure_name);
  if (currentName && !isPlaceholderProcedureName(currentName) && currentName !== overrideName) {
    return booking;
  }

  if (currentName === overrideName) return booking;

  return {
    ...booking,
    procedure_name: overrideName,
  };
}

export function applyBookingProcedureNameOverrides(bookings: BookingRequest[]): BookingRequest[] {
  return bookings.map((booking) => applyBookingProcedureNameOverride(booking));
}
