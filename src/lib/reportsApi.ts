import api from "./api";

export interface ReportFilters {
  date_from?: string;
  date_to?: string;
  unit_id?: number | string;
  professional_id?: number | string;
  procedure_id?: number | string;
  group_by?: "day" | "week" | "month";
  dimension?: "unit" | "professional" | "procedure" | "source";
}

function toParams(filters: ReportFilters): Record<string, string> {
  const params: Record<string, string> = {};
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") params[k] = String(v);
  });
  return params;
}

async function get<T>(path: string, filters: ReportFilters = {}): Promise<T> {
  const { data } = await api.get<T>(path, { params: toParams(filters) });
  return data;
}

// ===== Bootstrap =====
export interface ReportBootstrap {
  units?: { id: number; name: string }[];
  professionals?: { id: number; name: string }[];
  procedures?: { id: number; name: string }[];
  default_date_from?: string;
  default_date_to?: string;
}
export const fetchReportsBootstrap = () =>
  get<ReportBootstrap>("/api/reports/bootstrap");

// ===== Conversão =====
export interface ConversionOverview {
  conversations_started: number;
  booking_attempts: number;
  confirmed: number;
  conversation_to_attempt_rate: number;
  attempt_to_confirmation_rate: number;
  conversation_to_confirmation_rate: number;
}
export const fetchConversionOverview = (f: ReportFilters) =>
  get<ConversionOverview>("/api/reports/conversion/overview", f);

export interface ConversionFunnelStep {
  key: string;
  label: string;
  value: number;
  pct: number;
}
export interface ConversionFunnel {
  steps: ConversionFunnelStep[];
}
export const fetchConversionFunnel = (f: ReportFilters) =>
  get<ConversionFunnel>("/api/reports/conversion/funnel", f);

export interface ConversionLossItem {
  key: string;
  label: string;
  count: number;
  pct: number;
}
export interface ConversionLosses {
  total: number;
  items: ConversionLossItem[];
}
export const fetchConversionLosses = (f: ReportFilters) =>
  get<ConversionLosses>("/api/reports/conversion/losses", f);

export interface WaitlistPoint {
  date: string;
  entries: number;
  recoveries: number;
}
export interface ConversionWaitlist {
  entries: number;
  recoveries: number;
  recovery_rate: number;
  series: WaitlistPoint[];
}
export const fetchConversionWaitlist = (f: ReportFilters) =>
  get<ConversionWaitlist>("/api/reports/conversion/waitlist", f);
