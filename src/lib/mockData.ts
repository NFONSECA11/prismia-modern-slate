import { BookingRequest, Professional, BookingListResponse } from "@/types/booking";

export const mockProfessionals: Professional[] = [
  { id: 1, name: "Dra. Ana Silva", specialty: "Dermatologia" },
  { id: 2, name: "Dr. Carlos Mendes", specialty: "Estética" },
  { id: 3, name: "Dra. Beatriz Lima", specialty: "Harmonização" },
];

const today = new Date();
const fmt = (d: Date) => d.toISOString().split("T")[0];

export const mockBookings: BookingRequest[] = [
  {
    id: 1,
    lead_name: "Maria Oliveira",
    phone: "+55 11 91234-5678",
    status: "handoff",
    booking_mode: "ai",
    procedure_name: "Limpeza de Pele Profunda",
    procedure_slug: "limpeza-pele",
    unit_name: "Unidade Centro",
    professional_id: 1,
    professional_name: "Dra. Ana Silva",
    preferred_window: `${fmt(today)} - Manhã`,
    preferred_period: "Manhã",
    created_at: new Date(today.getTime() - 3600000).toISOString(),
    updated_at: new Date(today.getTime() - 3600000).toISOString(),
    vars_snapshot: {
      preferred_window: `${fmt(today)} - Manhã`,
      chosen_slot: { start_at: `${fmt(today)}T09:00:00`, label: `${fmt(today)} às 09:00` },
    },
  },
  {
    id: 2,
    lead_name: "João Santos",
    phone: "+55 11 98765-4321",
    status: "assisted",
    booking_mode: "ai",
    procedure_name: "Botox Facial",
    procedure_slug: "botox",
    unit_name: "Unidade Zona Sul",
    professional_id: 2,
    professional_name: "Dr. Carlos Mendes",
    preferred_window: `${fmt(today)} - Tarde`,
    preferred_period: "Tarde",
    created_at: new Date(today.getTime() - 7200000).toISOString(),
    updated_at: new Date(today.getTime() - 7200000).toISOString(),
    vars_snapshot: {
      preferred_window: `${fmt(today)} - Tarde`,
      chosen_slot: { start_at: `${fmt(today)}T14:30:00`, label: `${fmt(today)} às 14:30` },
    },
  },
  {
    id: 3,
    lead_name: "Carla Ferreira",
    phone: "+55 21 99876-5432",
    status: "pending",
    booking_mode: "manual",
    procedure_name: "Microagulhamento",
    procedure_slug: "microagulhamento",
    unit_name: "Unidade Norte",
    professional_id: 3,
    professional_name: "Dra. Beatriz Lima",
    preferred_window: `${fmt(today)} - Manhã`,
    preferred_period: "Manhã",
    created_at: new Date(today.getTime() - 1800000).toISOString(),
    updated_at: new Date(today.getTime() - 1800000).toISOString(),
    vars_snapshot: {
      preferred_window: `${fmt(today)} - Manhã`,
      chosen_slot: { start_at: `${fmt(today)}T10:00:00`, label: `${fmt(today)} às 10:00` },
    },
  },
  {
    id: 4,
    lead_name: "Pedro Almeida",
    phone: "+55 11 91111-2222",
    status: "confirmed",
    booking_mode: "ai",
    procedure_name: "Harmonização Facial",
    procedure_slug: "harmonizacao",
    unit_name: "Unidade Centro",
    professional_id: 1,
    professional_name: "Dra. Ana Silva",
    preferred_window: `${fmt(today)} - Tarde`,
    preferred_period: "Tarde",
    created_at: new Date(today.getTime() - 86400000).toISOString(),
    updated_at: new Date(today.getTime() - 86400000).toISOString(),
    vars_snapshot: {
      preferred_window: `${fmt(today)} - Tarde`,
      chosen_slot: { start_at: `${fmt(today)}T15:00:00`, label: `${fmt(today)} às 15:00` },
    },
  },
  {
    id: 5,
    lead_name: "Fernanda Costa",
    phone: "+55 21 93333-4444",
    status: "pending",
    booking_mode: "manual",
    procedure_name: "Preenchimento Labial",
    procedure_slug: "preenchimento",
    unit_name: "Unidade Zona Sul",
    professional_id: 2,
    professional_name: "Dr. Carlos Mendes",
    preferred_window: `${fmt(today)} - Manhã`,
    preferred_period: "Manhã",
    created_at: new Date(today.getTime() - 600000).toISOString(),
    updated_at: new Date(today.getTime() - 600000).toISOString(),
    vars_snapshot: {
      preferred_window: `${fmt(today)} - Manhã`,
      chosen_slot: { start_at: `${fmt(today)}T11:00:00`, label: `${fmt(today)} às 11:00` },
    },
  },
];

export const mockBookingListResponse: BookingListResponse = {
  count: mockBookings.length,
  results: mockBookings,
  professionals: mockProfessionals,
};
