import api from "@/lib/api";
import { BookingListResponse, BookingRequest } from "@/types/booking";
import { mockBookingListResponse, mockBookings } from "@/lib/mockData";

// Flag: true enquanto o backend não estiver acessível
let useMock = false;

// ── Listagem ─────────────────────────────────────────────────────────────────
export async function fetchBookingRequests(): Promise<BookingListResponse> {
  try {
    const { data } = await api.get<BookingListResponse>("/api/booking/requests/");
    useMock = false;
    return data;
  } catch {
    console.warn("[API] Backend inacessível — usando dados mock");
    useMock = true;
    return { ...mockBookingListResponse };
  }
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

  if (useMock) {
    // Cria localmente quando o backend está offline
    const newBooking: BookingRequest = {
      id: Date.now(),
      lead_name: payload.lead_name,
      phone: payload.phone,
      status: "pending",
      booking_mode: "manual",
      procedure_name: payload.procedure_name,
      procedure_slug: payload.procedure_name.toLowerCase().replace(/\s+/g, "-"),
      unit_name: payload.unit_name,
      professional_id: payload.professional_id,
      professional_name: mockBookingListResponse.professionals.find(p => p.id === payload.professional_id)?.name ?? "Profissional",
      preferred_window: body.vars_snapshot.preferred_window,
      preferred_period: payload.period,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      vars_snapshot: body.vars_snapshot,
    };
    mockBookings.push(newBooking);
    mockBookingListResponse.count = mockBookings.length;
    console.info("[Mock] Agendamento criado localmente:", newBooking.lead_name);
    return newBooking;
  }

  const { data } = await api.post<BookingRequest>("/api/booking/requests/", body);
  return data;
}
