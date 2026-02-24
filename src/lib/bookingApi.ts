import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { BookingListResponse, BookingRequest, Professional } from "@/types/booking";

// ── Listagem ─────────────────────────────────────────────────────────────────
const bookingPhoneCache = new Map<number, string>();

function normalizeBookingListResponse(payload: any): BookingListResponse {
  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.results)) {
      return {
        count: typeof payload.count === "number" ? payload.count : payload.results.length,
        results: payload.results,
        professionals: Array.isArray(payload.professionals) ? payload.professionals : [],
      };
    }

    if (Array.isArray(payload.result?.results)) {
      return {
        count:
          typeof payload.result.count === "number"
            ? payload.result.count
            : payload.result.results.length,
        results: payload.result.results,
        professionals: Array.isArray(payload.result.professionals)
          ? payload.result.professionals
          : [],
      };
    }

    if (Array.isArray(payload.result)) {
      return {
        count: payload.result.length,
        results: payload.result,
        professionals: [],
      };
    }
  }

  return { count: 0, results: [], professionals: [] };
}

async function fetchBookingPhoneById(id: number): Promise<string | null> {
  try {
    const { data } = await api.get(`/api/booking/requests/${id}/`);
    const detail = data?.result ?? data;
    const phone = detail?.contact_phone ?? detail?.phone ?? null;
    if (phone) bookingPhoneCache.set(id, phone);
    return phone;
  } catch {
    return null;
  }
}

export async function fetchBookingRequests(): Promise<BookingListResponse> {
  const { data } = await api.get("/api/booking/requests/");
  const normalized = normalizeBookingListResponse(data);

  const missingPhone = normalized.results.filter(
    (booking) => !booking.contact_phone && !booking.phone
  );

  const needFetch = missingPhone.filter((booking) => !bookingPhoneCache.has(booking.id));
  if (needFetch.length > 0) {
    await Promise.all(needFetch.map((booking) => fetchBookingPhoneById(booking.id)));
  }

  const resultsWithPhone = normalized.results.map((booking) => {
    const cachedPhone = bookingPhoneCache.get(booking.id);
    if (!cachedPhone || booking.contact_phone || booking.phone) return booking;
    return { ...booking, contact_phone: cachedPhone };
  });

  return { ...normalized, results: resultsWithPhone };
}

export async function fetchBookingRequestById(id: number): Promise<BookingRequest> {
  const { data } = await api.get(`/api/booking/requests/${id}/`);
  return (data?.result ?? data) as BookingRequest;
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
  await fetchCsrf();
  await api.post(`/api/booking/requests/${id}/confirm/`, payload);
}

// ── Cancelar ─────────────────────────────────────────────────────────────────
export async function cancelBooking(id: number): Promise<void> {
  await fetchCsrf();
  await api.post(`/api/booking/requests/${id}/cancel/`);
}

// ── Reabrir ──────────────────────────────────────────────────────────────────
export async function reopenBooking(id: number): Promise<void> {
  await fetchCsrf();
  await api.post(`/api/booking/requests/${id}/reopen/`);
}

// ── Handoff ON / OFF ─────────────────────────────────────────────────────────
export async function handoffOn(id: number): Promise<void> {
  await fetchCsrf();
  await api.post(`/api/booking/requests/${id}/handoff_on/`);
}

export async function handoffOff(id: number): Promise<void> {
  await fetchCsrf();
  await api.post(`/api/booking/requests/${id}/handoff_off/`);
}

// ── Sugerir horários ─────────────────────────────────────────────────────────
export async function suggestSlots(id: number): Promise<any> {
  await fetchCsrf();
  const { data } = await api.post(`/api/booking/requests/${id}/suggest_slots/`, {});
  return data;
}

// ── Listar profissionais por unidade ──────────────────────────────────────────
export async function fetchProfessionalsByUnit(unitId: number): Promise<Professional[]> {
  const { data } = await api.get(`/api/booking/professionals/`, {
    params: { unit: unitId },
  });
  // API pode retornar array direto ou { results: [...] }
  return Array.isArray(data) ? data : (data?.results ?? []);
}

// ── Atualizar booking (ex: profissional) ─────────────────────────────────────
export async function patchBooking(
  id: number,
  payload: Record<string, unknown>
): Promise<BookingRequest> {
  await fetchCsrf();
  const { data } = await api.patch<BookingRequest>(`/api/booking/requests/${id}/`, payload);
  return data;
}

// ── Mensagens de um booking ──────────────────────────────────────────────────
export interface BookingMessage {
  id: number;
  role: string;        // "assistant" | "user" | "system" etc.
  content: string;
  created_at: string;
}

export async function fetchBookingMessages(
  bookingId: number,
  limit = 30
): Promise<BookingMessage[]> {
  const { data } = await api.get(`/api/booking/requests/${bookingId}/messages/`, {
    params: { limit },
  });
  // API pode retornar array direto ou { results: [...] }
  const msgs = Array.isArray(data) ? data : (data?.results ?? data?.result ?? []);
  return msgs as BookingMessage[];
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
  await fetchCsrf();
  const { data } = await api.post<BookingRequest>("/api/booking/requests/", body);
  return data;
}
