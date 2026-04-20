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

// ===== Operação =====
export interface OperationsOverview {
  confirmed: number;
  available_slots: number;
  filled_slots: number;
  occupancy_rate: number;
}
export const fetchOperationsOverview = (f: ReportFilters) =>
  get<OperationsOverview>("/api/reports/operations/overview", f);

export interface OperationsBookingsPoint {
  date: string;
  confirmed: number;
}
export interface OperationsBookings {
  group_by: "day" | "week" | "month";
  series: OperationsBookingsPoint[];
}
export const fetchOperationsBookings = (f: ReportFilters) =>
  get<OperationsBookings>("/api/reports/operations/bookings", f);

export interface OperationsDistributionItem {
  key: string;
  label: string;
  count: number;
  pct: number;
}
export interface OperationsDistribution {
  dimension: "unit" | "professional" | "procedure";
  items: OperationsDistributionItem[];
}
export const fetchOperationsDistribution = (f: ReportFilters) =>
  get<OperationsDistribution>("/api/reports/operations/distribution", f);

export interface BookingSourceItem {
  key: string;
  label: string;
  count: number;
  pct: number;
}
export interface OperationsBookingSources {
  total: number;
  items: BookingSourceItem[];
}
export const fetchOperationsBookingSources = (f: ReportFilters) =>
  get<OperationsBookingSources>("/api/reports/operations/booking-sources", f);

// ===== Resultado =====
export interface ResultsOverview {
  estimated_revenue: number;
  avg_ticket: number;
  recovered_revenue_waitlist: number;
  recovered_revenue_pct: number;
  confirmed_with_value: number;
}
export const fetchResultsOverview = (f: ReportFilters) =>
  get<ResultsOverview>("/api/reports/results/overview", f);

export interface ResultsRevenuePoint {
  date: string;
  revenue: number;
}
export interface ResultsRevenue {
  group_by: "day" | "week" | "month";
  series: ResultsRevenuePoint[];
}
export const fetchResultsRevenue = (f: ReportFilters) =>
  get<ResultsRevenue>("/api/reports/results/revenue", f);

export interface ResultsBreakdownItem {
  key: string;
  label: string;
  revenue: number;
  pct: number;
}
export interface ResultsRevenueBreakdown {
  dimension: "unit" | "professional" | "procedure" | "source";
  total: number;
  items: ResultsBreakdownItem[];
  recovered_waitlist?: { revenue: number; bookings: number };
  recovered_reschedule?: { revenue: number; bookings: number };
}
export const fetchResultsRevenueBreakdown = (f: ReportFilters) =>
  get<ResultsRevenueBreakdown>("/api/reports/results/revenue-breakdown", f);


