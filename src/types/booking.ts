// PrismIA — Types matching the Django API contract

export type BookingStatus =
  | "handoff"
  | "assisted"
  | "pending"
  | "confirmed"
  | "canceled"
  | "cancelled"
  | "failed"
  | "awaiting_choice";

export type BookingMode =
  | "handoff_manual"
  | "assisted_slots_dashboard"
  | "auto_slots_bot";

export interface ChosenSlot {
  start_at: string;
  label: string;
}

export interface OfferSlot {
  start_at: string;
  label: string;
}

export interface VarsSnapshot {
  preferred_window?: string;
  chosen_slot?: ChosenSlot;
  conversation_bot_mode?: "on" | "off" | string;
}

export interface BookingRequest {
  id: number;
  lead_name: string;
  phone?: string;
  contact_phone?: string;
  status: BookingStatus;
  booking_mode: BookingMode | string;
  procedure_name: string;
  procedure_slug: string;
  unit_name: string;
  professional_id: number;
  professional_name: string;
  preferred_window: string;
  preferred_period: string;
  created_at: string;
  notes?: string;
  updated_at: string;
  conversation_bot_mode?: "on" | "off" | string;
  vars_snapshot: VarsSnapshot;
  // assisted_slots_dashboard fields
  offer_slots?: OfferSlot[];
  offer_expires_at?: string;
  chosen_slot?: ChosenSlot;
  chosen_slot_label?: string;
  scheduled_at?: string;
  confirmation?: BookingConfirmation | null;
}

export type ConfirmationStatus =
  | "sent"
  | "confirmed"
  | "declined"
  | "reschedule_requested"
  | "canceled"
  | "expired";

export type ConfirmationResponseType =
  | "positive"
  | "negative"
  | "reschedule"
  | null;

export interface BookingConfirmation {
  id: number;
  status: ConfirmationStatus;
  send_at?: string;
  expires_at?: string;
  sent_at?: string;
  responded_at?: string;
  response_type?: ConfirmationResponseType;
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
