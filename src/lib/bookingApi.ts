import { BookingListResponse, BookingRequest } from "@/types/booking";

// Mutable mock store (simulates a backend in memory)
export const MOCK_BOOKINGS: BookingListResponse = {
  count: 7,
  professionals: [
    { id: 1, name: "Dra. Ana Lima", specialty: "Estética Facial" },
    { id: 2, name: "Dr. Carlos Melo", specialty: "Dermatologia" },
    { id: 3, name: "Dra. Beatriz Santos", specialty: "Harmonização" },
  ],
  results: [
    {
      id: 42,
      lead_name: "Mariana Oliveira",
      phone: "+55 11 99234-5678",
      status: "handoff",
      booking_mode: "assisted_slots_dashboard",
      procedure_name: "Limpeza de Pele Profunda",
      procedure_slug: "limpeza-pele-profunda",
      unit_name: "Unidade Centro",
      professional_id: 1,
      professional_name: "Dra. Ana Lima",
      preferred_window: "2026-02-20 a 2026-02-25",
      preferred_period: "Manhã",
      created_at: "2026-02-19T09:15:00Z",
      updated_at: "2026-02-20T16:40:16Z",
      vars_snapshot: {
        preferred_window: "2026-02-20 a 2026-02-25 - Manhã",
        chosen_slot: { start_at: "2026-02-21T10:00:00Z", label: "21/02 às 10:00 (Opção 2)" },
      },
    },
    {
      id: 43,
      lead_name: "Fernanda Costa",
      phone: "+55 21 98765-4321",
      status: "pending",
      booking_mode: "auto",
      procedure_name: "Botox Facial",
      procedure_slug: "botox-facial",
      unit_name: "Unidade Zona Sul",
      professional_id: 2,
      professional_name: "Dr. Carlos Melo",
      preferred_window: "2026-02-22 a 2026-02-26",
      preferred_period: "Tarde",
      created_at: "2026-02-19T14:30:00Z",
      updated_at: "2026-02-20T10:15:00Z",
      vars_snapshot: { preferred_window: "2026-02-22 a 2026-02-26 - Tarde" },
    },
    {
      id: 44,
      lead_name: "Rafael Souza",
      phone: "+55 31 97654-3210",
      status: "confirmed",
      booking_mode: "manual",
      procedure_name: "Peeling Químico",
      procedure_slug: "peeling-quimico",
      unit_name: "Unidade Centro",
      professional_id: 3,
      professional_name: "Dra. Beatriz Santos",
      preferred_window: "2026-02-21 a 2026-02-21",
      preferred_period: "Manhã",
      created_at: "2026-02-18T11:00:00Z",
      updated_at: "2026-02-20T08:00:00Z",
      vars_snapshot: {
        preferred_window: "2026-02-21 - Manhã",
        chosen_slot: { start_at: "2026-02-21T09:00:00Z", label: "21/02 às 09:00" },
      },
    },
    {
      id: 45,
      lead_name: "Camila Ferreira",
      phone: "+55 11 91234-8765",
      status: "assisted",
      booking_mode: "assisted_slots_dashboard",
      procedure_name: "Microagulhamento",
      procedure_slug: "microagulhamento",
      unit_name: "Unidade Zona Sul",
      professional_id: 1,
      professional_name: "Dra. Ana Lima",
      preferred_window: "2026-02-23 a 2026-02-28",
      preferred_period: "Manhã",
      created_at: "2026-02-20T07:45:00Z",
      updated_at: "2026-02-20T15:20:00Z",
      vars_snapshot: { preferred_window: "2026-02-23 a 2026-02-28 - Manhã" },
    },
    {
      id: 46,
      lead_name: "Lucas Barbosa",
      phone: "+55 85 99876-5432",
      status: "handoff",
      booking_mode: "assisted_slots_dashboard",
      procedure_name: "Preenchimento Labial",
      procedure_slug: "preenchimento-labial",
      unit_name: "Unidade Centro",
      professional_id: 2,
      professional_name: "Dr. Carlos Melo",
      preferred_window: "2026-02-24 a 2026-03-01",
      preferred_period: "Tarde",
      created_at: "2026-02-20T06:30:00Z",
      updated_at: "2026-02-20T14:10:00Z",
      vars_snapshot: {
        preferred_window: "2026-02-24 a 2026-03-01 - Tarde",
        chosen_slot: { start_at: "2026-02-25T15:00:00Z", label: "25/02 às 15:00 (Opção 1)" },
      },
    },
    {
      id: 47,
      lead_name: "Juliana Alves",
      phone: "+55 41 98888-7777",
      status: "pending",
      booking_mode: "auto",
      procedure_name: "Depilação a Laser",
      procedure_slug: "depilacao-laser",
      unit_name: "Unidade Zona Sul",
      professional_id: 3,
      professional_name: "Dra. Beatriz Santos",
      preferred_window: "2026-02-25 a 2026-03-02",
      preferred_period: "Noite",
      created_at: "2026-02-20T05:00:00Z",
      updated_at: "2026-02-20T12:00:00Z",
      vars_snapshot: { preferred_window: "2026-02-25 a 2026-03-02 - Noite" },
    },
    {
      id: 48,
      lead_name: "Thiago Mendes",
      phone: "+55 61 97777-6666",
      status: "canceled",
      booking_mode: "manual",
      procedure_name: "Massagem Relaxante",
      procedure_slug: "massagem-relaxante",
      unit_name: "Unidade Centro",
      professional_id: 1,
      professional_name: "Dra. Ana Lima",
      preferred_window: "2026-02-19 a 2026-02-19",
      preferred_period: "Manhã",
      created_at: "2026-02-17T13:00:00Z",
      updated_at: "2026-02-19T09:00:00Z",
      vars_snapshot: { preferred_window: "2026-02-19 - Manhã" },
    },
  ],
};

let nextId = 100;

export async function fetchBookingRequests(): Promise<BookingListResponse> {
  await new Promise((r) => setTimeout(r, 600));
  return { ...MOCK_BOOKINGS, results: [...MOCK_BOOKINGS.results], count: MOCK_BOOKINGS.results.length };
}

export async function confirmBooking(id: number, payload: { use_chosen_slot: boolean; notes: string }): Promise<void> {
  await new Promise((r) => setTimeout(r, 800));
  console.log(`POST /api/booking/requests/${id}/confirm/`, payload);
}

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

export async function createBooking(payload: CreateBookingPayload): Promise<BookingRequest> {
  await new Promise((r) => setTimeout(r, 700));

  const prof = MOCK_BOOKINGS.professionals.find((p) => p.id === payload.professional_id);

  const newBooking: BookingRequest = {
    id: nextId++,
    lead_name: payload.lead_name,
    phone: payload.phone,
    status: "pending",
    booking_mode: "manual",
    procedure_name: payload.procedure_name,
    procedure_slug: payload.procedure_name.toLowerCase().replace(/\s+/g, "-"),
    unit_name: payload.unit_name,
    professional_id: payload.professional_id,
    professional_name: prof?.name ?? "",
    preferred_window: payload.date,
    preferred_period: payload.period,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    vars_snapshot: {
      preferred_window: `${payload.date} - ${payload.period}`,
      chosen_slot: {
        start_at: `${payload.date}T${payload.time}:00`,
        label: `${payload.date} às ${payload.time}`,
      },
    },
  };

  // Persist in mock store so next fetch returns updated list
  MOCK_BOOKINGS.results.push(newBooking);
  MOCK_BOOKINGS.count = MOCK_BOOKINGS.results.length;

  return newBooking;
}
