import api from "@/lib/api";
import { BookingListResponse, BookingRequest } from "@/types/booking";

// ── Listagem ─────────────────────────────────────────────────────────────────
export async function fetchBookingRequests(): Promise<BookingListResponse> {
  const { data } = await api.get<BookingListResponse>("/api/booking/requests/");
  return data;
}

// ── Confirmar agendamento ────────────────────────────────────────────────────
export interface ConfirmBookingPayload {
  use_chosen_slot: boolean;
  notes?: string;
}

export async function confirmBooking(
  id: number,
  payload: ConfirmBookingPayload
): Promise<void> {
  await api.post(`/api/booking/requests/${id}/confirm/`, payload);
}

// ── Sugerir horários ─────────────────────────────────────────────────────────
export interface SuggestSlotsPayload {
  generate: boolean;
  send: boolean;
}

export async function suggestSlots(
  id: number,
  payload: SuggestSlotsPayload = { generate: true, send: true }
): Promise<void> {
  await api.post(`/api/booking/requests/${id}/suggest_slots/`, payload);
}

// ── Criar novo agendamento ───────────────────────────────────────────────────
export interface CreateBookingPayload {
  lead_name: string;
  phone: string;
  procedure_name: string;
  unit_name: string;
  professional_id: number;
  date: string;
  time: string;
  time_end: string;
  notes: string;
  period: string;
}

export async function createBooking(
  payload: CreateBookingPayload
): Promise<BookingRequest> {
  const body = {
    lead_name: payload.lead_name,
    phone: payload.phone,
    procedure_name: payload.procedure_name,
    unit_name: payload.unit_name,
    professional_id: payload.professional_id,
    preferred_period: payload.period,
    vars_snapshot: {
      preferred_window: `${payload.date} - ${payload.period}`,
      chosen_slot: {
        start_at: `${payload.date}T${payload.time}:00`,
        label: `${payload.date} às ${payload.time}`,
      },
    },
  };
  const { data } = await api.post<BookingRequest>("/api/booking/requests/", body);
  return data;
}
