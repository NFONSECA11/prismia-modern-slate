// PrismIA — Types matching the Django API contract

export type BookingStatus = "handoff" | "assisted" | "confirmed" | "pending" | "canceled";

export interface ChosenSlot {
  start_at: string;
  label: string;
}

export interface VarsSnapshot {
  preferred_window?: string;
  chosen_slot?: ChosenSlot;
}

export interface BookingRequest {
  id: number;
  lead_name: string;
  phone: string;
  status: BookingStatus;
  booking_mode: string;
  procedure_name: string;
  procedure_slug: string;
  unit_name: string;
  professional_id: number;
  professional_name: string;
  preferred_window: string;
  preferred_period: string;
  created_at: string;
  updated_at: string;
  vars_snapshot: VarsSnapshot;
}

export interface Professional {
  id: number;
  name: string;
  specialty: string;
}

export interface BookingListResponse {
  count: number;
  results: BookingRequest[];
  professionals: Professional[];
}

export interface ConfirmPayload {
  use_chosen_slot: boolean;
  notes: string;
}
