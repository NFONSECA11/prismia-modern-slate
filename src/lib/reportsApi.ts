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
  // Backend espera nomes sem o sufixo "_id" (mesma convenção dos outros endpoints).
  const keyMap: Record<string, string> = {
    unit_id: "unit",
    professional_id: "professional",
    procedure_id: "procedure",
  };
  Object.entries(filters).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    const key = keyMap[k] ?? k;
    params[key] = String(v);
  });
  return params;
}

async function get<T>(path: string, filters: ReportFilters = {}): Promise<T> {
  const { data } = await api.get<T>(path, { params: toParams(filters) });
  return data;
}

// ===== Conversão =====
export interface ConversionOverview {
  conversations_started: number;
  booking_attempts: number;
  confirmed_bookings: number;
  lost_attempts: number;
  waitlist_entries: number;
  waitlist_recoveries: number;
  conversation_to_attempt_rate: number;
  attempt_to_confirm_rate: number;
  conversation_to_confirm_rate: number;
  waitlist_recovery_rate: number;
}
export const fetchConversionOverview = async (f: ReportFilters): Promise<ConversionOverview> => {
  const raw = await get<any>("/api/reports/conversion/overview", f);
  return raw.summary;
};

export interface ConversionFunnelStep {
  key: string;
  label: string;
  value: number;
  pct: number;
}
export interface ConversionFunnel {
  steps: ConversionFunnelStep[];
}
export const fetchConversionFunnel = async (f: ReportFilters): Promise<ConversionFunnel> => {
  const raw = await get<any>("/api/reports/conversion/funnel", f);
  const steps = raw.steps ?? [];
  return {
    steps: steps.map((s: any, idx: number) => {
      const prev = idx === 0 ? s.value : steps[idx - 1].value;
      return {
        ...s,
        pct: prev > 0 ? Math.round((s.value / prev) * 100) : 0,
      };
    }),
  };
};

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
export const fetchConversionLosses = async (f: ReportFilters): Promise<ConversionLosses> => {
  const raw = await get<any>("/api/reports/conversion/losses", f);
  return {
    total: raw.summary?.lost_attempts ?? 0,
    items: (raw.breakdowns?.loss_reason ?? []).map((it: any) => ({
      key: it.key,
      label: it.label,
      count: it.count,
      pct: it.rate,
    })),
  };
};

export interface WaitlistPoint {
  date: string;
  entries: number;
  recoveries: number;
}
export interface ConversionWaitlist {
  entries: number;
  recoveries: number;
  recovery_rate: number;
  avg_days_to_recovery: number;
  series: WaitlistPoint[];
}
export const fetchConversionWaitlist = async (f: ReportFilters): Promise<ConversionWaitlist> => {
  const raw = await get<any>("/api/reports/conversion/waitlist", f);
  return {
    entries: raw.summary?.waitlist_entries ?? 0,
    recoveries: raw.summary?.waitlist_recoveries ?? 0,
    recovery_rate: raw.summary?.waitlist_recovery_rate ?? 0,
    avg_days_to_recovery: raw.summary?.avg_days_to_recovery ?? 0,
    series: raw.series ?? [],
  };
};

// ===== Operação =====
export interface OperationsOverview {
  confirmed: number;
  available_slots: number;
  filled_slots: number;
  occupancy_rate: number;
}
export const fetchOperationsOverview = async (f: ReportFilters): Promise<OperationsOverview> => {
  const raw = await get<any>("/api/reports/operations/overview", f);
  return {
    confirmed: raw.summary?.confirmed_bookings ?? 0,
    available_slots: raw.summary?.available_slots ?? 0,
    filled_slots: raw.summary?.filled_slots ?? 0,
    occupancy_rate: raw.summary?.occupancy_rate ?? 0,
  };
};

export interface OperationsBookingsPoint {
  date: string;
  confirmed: number;
}
export interface OperationsBookings {
  series: OperationsBookingsPoint[];
}
export const fetchOperationsBookings = async (f: ReportFilters): Promise<OperationsBookings> => {
  const raw = await get<any>("/api/reports/operations/bookings", f);
  return {
    series: (raw.series ?? []).map((s: any) => ({
      date: s.bucket,
      confirmed: s.confirmed_bookings,
    })),
  };
};

export interface OperationsDistributionItem {
  key: string;
  label: string;
  count: number;
  pct: number;
}
export interface OperationsDistribution {
  items: OperationsDistributionItem[];
}
export const fetchOperationsDistribution = async (f: ReportFilters): Promise<OperationsDistribution> => {
  const raw = await get<any>("/api/reports/operations/distribution", f);
  const items = raw.breakdowns?.items ?? [];
  const max = items[0]?.confirmed_bookings || 1;
  return {
    items: items.map((it: any) => ({
      key: it.key,
      label: it.label,
      count: it.confirmed_bookings,
      pct: Math.round((it.confirmed_bookings / max) * 100),
    })),
  };
};

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
export const fetchOperationsBookingSources = async (f: ReportFilters): Promise<OperationsBookingSources> => {
  const raw = await get<any>("/api/reports/operations/booking-sources", f);
  const items = raw.breakdowns?.items ?? [];
  const total = items.reduce((acc: number, it: any) => acc + it.count, 0);
  return {
    total,
    items: items.map((it: any) => ({
      key: it.key,
      label: it.label,
      count: it.count,
      pct: it.rate,
    })),
  };
};

// ===== Resultado =====
export interface ResultsOverview {
  estimated_revenue: number;
  avg_ticket: number;
  average_ticket: number;
  confirmed_bookings: number;
  recovered_revenue_waitlist: number;
  recovered_revenue_reschedule: number;
}
export const fetchResultsOverview = async (f: ReportFilters): Promise<ResultsOverview> => {
  const raw = await get<any>("/api/reports/results/overview", f);
  return {
    estimated_revenue: raw.summary?.estimated_revenue ?? 0,
    avg_ticket: raw.summary?.average_ticket ?? 0,
    average_ticket: raw.summary?.average_ticket ?? 0,
    confirmed_bookings: raw.summary?.confirmed_bookings ?? 0,
    recovered_revenue_waitlist: raw.summary?.recovered_revenue_waitlist ?? 0,
    recovered_revenue_reschedule: raw.summary?.recovered_revenue_reschedule ?? 0,
  };
};

export interface ResultsRevenuePoint {
  date: string;
  revenue: number;
}
export interface ResultsRevenue {
  total: number;
  series: ResultsRevenuePoint[];
}
export const fetchResultsRevenue = async (f: ReportFilters): Promise<ResultsRevenue> => {
  const raw = await get<any>("/api/reports/results/revenue", f);
  return {
    total: raw.summary?.estimated_revenue ?? 0,
    series: (raw.series ?? []).map((s: any) => ({
      date: s.bucket,
      revenue: s.estimated_revenue,
    })),
  };
};

export interface ResultsBreakdownItem {
  key: string;
  label: string;
  revenue: number;
  pct: number;
}
export interface ResultsRevenueBreakdown {
  total: number;
  items: ResultsBreakdownItem[];
}
export const fetchResultsRevenueBreakdown = async (f: ReportFilters): Promise<ResultsRevenueBreakdown> => {
  const raw = await get<any>("/api/reports/results/revenue-breakdown", f);
  const items = raw.breakdowns?.items ?? [];
  const total = items.reduce((acc: number, it: any) => acc + it.estimated_revenue, 0);
  return {
    total,
    items: items.map((it: any) => ({
      key: it.key,
      label: it.label,
      revenue: it.estimated_revenue,
      pct: total > 0 ? Math.round((it.estimated_revenue / total) * 100) : 0,
    })),
  };
};

// ===== Performance =====
export interface PerformanceOverview {
  handoff_rate: number;
  handoff_count: number;
  human_confirmation_avg_minutes: number;
}
export const fetchPerformanceOverview = async (f: ReportFilters): Promise<PerformanceOverview> => {
  const raw = await get<any>("/api/reports/performance/overview", f);
  return {
    handoff_rate: raw.summary?.handoff_rate ?? 0,
    handoff_count: raw.summary?.handoff_count ?? 0,
    human_confirmation_avg_minutes: raw.summary?.human_confirmation_avg_minutes ?? 0,
  };
};

export interface AiIntentItem {
  key: string;
  label: string;
  count: number;
  pct: number;
}
export interface PerformanceAiIntents {
  total: number;
  items: AiIntentItem[];
}
export const fetchPerformanceAiIntents = async (f: ReportFilters): Promise<PerformanceAiIntents> => {
  const raw = await get<any>("/api/reports/performance/ai-intents", f);
  return {
    total: raw.summary?.total_leads ?? 0,
    items: (raw.breakdowns?.items ?? []).map((it: any) => ({
      key: it.key,
      label: it.label,
      count: it.count,
      pct: it.rate,
    })),
  };
};

export interface AiVsHumanItem {
  key: string;
  label: string;
  count: number;
  pct: number;
}
export interface PerformanceAiVsHuman {
  total: number;
  items: AiVsHumanItem[];
}
export const fetchPerformanceAiVsHuman = async (f: ReportFilters): Promise<PerformanceAiVsHuman> => {
  const raw = await get<any>("/api/reports/performance/ai-vs-human", f);
  const items = raw.breakdowns?.items ?? [];
  const total = items.reduce((acc: number, it: any) => acc + it.count, 0);
  return {
    total,
    items: items.map((it: any) => ({
      key: it.key,
      label: it.label,
      count: it.count,
      pct: it.rate,
    })),
  };
};

export interface HumanAgentRow {
  key: string;
  label: string;
  handoff_count: number;
  confirmation_avg_minutes: number;
}
export interface PerformanceHumanService {
  agents: HumanAgentRow[];
}
export const fetchPerformanceHumanService = async (f: ReportFilters): Promise<PerformanceHumanService> => {
  const raw = await get<any>("/api/reports/performance/human-service", f);
  return {
    agents: (raw.breakdowns?.items ?? []).map((it: any) => ({
      key: it.key,
      label: it.label,
      handoff_count: it.handoff_count,
      confirmation_avg_minutes: it.confirmation_avg_minutes,
    })),
  };
};
