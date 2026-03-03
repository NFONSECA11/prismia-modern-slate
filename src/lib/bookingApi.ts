import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { BookingListResponse, BookingRequest, Professional } from "@/types/booking";

// ── Listagem ─────────────────────────────────────────────────────────────────
const bookingPhoneCache = new Map<number, string>();

function normalizeBookingListResponse(payload: any): BookingListResponse {
  const resultNode = payload?.result;

  const results = Array.isArray(payload?.results)
    ? payload.results
    : Array.isArray(resultNode?.results)
      ? resultNode.results
      : Array.isArray(resultNode)
        ? resultNode
        : Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(resultNode?.data)
            ? resultNode.data
            : [];

  const rawCount =
    payload?.count ??
    resultNode?.count ??
    payload?.total ??
    resultNode?.total ??
    payload?.total_count ??
    resultNode?.total_count ??
    payload?.pagination?.count ??
    resultNode?.pagination?.count;

  const parsedCount =
    typeof rawCount === "number"
      ? rawCount
      : typeof rawCount === "string"
        ? Number(rawCount)
        : NaN;

  return {
    count: Number.isFinite(parsedCount) ? parsedCount : results.length,
    results,
    professionals: Array.isArray(payload?.professionals)
      ? payload.professionals
      : Array.isArray(resultNode?.professionals)
        ? resultNode.professionals
        : [],
  };
}

function getHeaderValue(headers: any, key: string): string | null {
  const direct = headers?.[key] ?? headers?.[key.toLowerCase()] ?? headers?.get?.(key);
  if (typeof direct === "string" && direct.trim().length > 0) return direct;
  return null;
}

function extractNextFromLinkHeader(linkHeader: string | null): string | null {
  if (!linkHeader) return null;

  const entries = linkHeader.split(",");
  for (const entry of entries) {
    const [urlPart, ...params] = entry.split(";");
    const isNext = params.some((param) => /rel\s*=\s*"?next"?/i.test(param));
    if (!isNext) continue;

    const match = urlPart.match(/<([^>]+)>/);
    if (match?.[1]) return match[1].trim();
  }

  return null;
}

function extractTotalCountFromHeaders(headers: any): number | null {
  const directCandidates = [
    getHeaderValue(headers, "x-total-count"),
    getHeaderValue(headers, "x-pagination-count"),
    getHeaderValue(headers, "x-pagination-total"),
    getHeaderValue(headers, "x-total"),
  ];

  for (const candidate of directCandidates) {
    if (!candidate) continue;
    const parsed = Number(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }

  const contentRange = getHeaderValue(headers, "content-range");
  if (contentRange) {
    const match = contentRange.match(/\/(\d+)\s*$/);
    if (match?.[1]) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed)) return parsed;
    }
  }

  return null;
}

function extractNextCursor(payload: any, headers?: any): string | null {
  const linkHeaderNext = extractNextFromLinkHeader(getHeaderValue(headers, "link"));
  if (linkHeaderNext) return linkHeaderNext;

  const headerCandidates = [
    getHeaderValue(headers, "x-next"),
    getHeaderValue(headers, "next"),
    getHeaderValue(headers, "x-pagination-next"),
  ];

  for (const candidate of headerCandidates) {
    if (!candidate) continue;
    if (candidate.startsWith("/") || candidate.startsWith("http") || candidate.startsWith("?")) {
      return candidate;
    }
  }

  const candidates = [
    payload?.next,
    payload?.result?.next,
    payload?.pagination?.next,
    payload?.result?.pagination?.next,
    payload?.links?.next,
    payload?.result?.links?.next,
    payload?.meta?.next,
    payload?.result?.meta?.next,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) return candidate;
    if (
      candidate &&
      typeof candidate === "object" &&
      typeof (candidate.url ?? candidate.href) === "string" &&
      (candidate.url ?? candidate.href).trim().length > 0
    ) {
      return (candidate.url ?? candidate.href) as string;
    }
  }

  return null;
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
  const PAGE_SIZE = 50;
  const MAX_PAGES = 5;

  const deduped = new Map<number, BookingRequest>();
  let professionals: Professional[] = [];
  let totalCount: number | null = null;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const response = await api.get(`/api/booking/requests/`, {
      params: { page, page_size: PAGE_SIZE },
    });

    const normalized = normalizeBookingListResponse(response.data);
    const headerCount = extractTotalCountFromHeaders(response.headers);

    if (normalized.professionals.length > 0) professionals = normalized.professionals;

    const candidateCounts = [normalized.count, headerCount].filter(
      (n): n is number => typeof n === "number" && Number.isFinite(n)
    );
    if (candidateCounts.length > 0) {
      const best = Math.max(...candidateCounts);
      totalCount = totalCount === null ? best : Math.max(totalCount, best);
    }

    const items = Array.isArray(normalized.results) ? (normalized.results as BookingRequest[]) : [];
    for (const b of items) deduped.set(b.id, b);

    // Stop if we got fewer than a full page or reached total
    if (items.length < PAGE_SIZE) break;
    if (totalCount !== null && deduped.size >= totalCount) break;
  }

  const results = Array.from(deduped.values());
  console.log(`[bookingApi] Fetched ${results.length} bookings (totalHint=${totalCount ?? "n/a"})`);

  return {
    count: totalCount !== null ? Math.max(totalCount, results.length) : results.length,
    results,
    professionals,
  };
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
  await api.post(`/api/booking/requests/${id}/handoff_off/`, {
    resume_to: { flow_key: "booking", version: 1, state: "BOOKING_PROCEDURE" },
  });
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
  id: string | number;
  role: string; // "assistant" | "user" | "system" etc.
  content: string;
  created_at: string;
}

function pickFirstDefined<T>(...vals: Array<T | undefined | null>): T | undefined {
  for (const v of vals) {
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

function coerceString(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    const nested = pickFirstDefined(v.content, v.text, v.message, v.body);
    if (typeof nested === "string") return nested;
  }
  return undefined;
}

function getAnyStringField(obj: Record<string, unknown>): string | undefined {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    const s = coerceString(v);
    if (s && s.trim()) return s;
  }
  return undefined;
}

function normalizeBookingMessage(raw: unknown, index: number): BookingMessage {
  if (typeof raw === "string") {
    return { id: index, role: "unknown", content: raw, created_at: "" };
  }

  const r = (raw ?? {}) as Record<string, unknown>;

  const id = pickFirstDefined(r.id as any, r.pk as any, r.uuid as any, r.message_id as any, index);

  const roleRaw = (coerceString(pickFirstDefined(
    r.role,
    r.sender_role,
    r.author_role,
    r.from_role,
    r.sender,
    r.author,
    r.from,
    r.direction,
    r.origin
  )) ?? "unknown").toLowerCase();

  const role = roleRaw.includes("assist") || roleRaw.includes("bot") || roleRaw.includes("system")
    ? "assistant"
    : roleRaw.includes("user") || roleRaw.includes("lead") || roleRaw.includes("client")
      ? "user"
      : (roleRaw || "unknown");

  const content = (
    coerceString(pickFirstDefined(
      r.content,
      r.message,
      r.text,
      r.body,
      r.msg,
      (r.data as any)?.content,
      (r.data as any)?.text,
      (r.payload as any)?.content,
      (r.payload as any)?.text
    )) ??
    getAnyStringField(r) ??
    ""
  ).trim();

  const created_at = coerceString(pickFirstDefined(
    r.created_at,
    r.timestamp,
    r.sent_at,
    r.created,
    r.createdAt,
    r.time
  )) ?? "";

  return {
    id: id as any,
    role,
    content: content || "[sem conteúdo]",
    created_at,
  };
}

export async function fetchBookingMessages(bookingId: number, limit = 30): Promise<BookingMessage[]> {
  const { data } = await api.get(`/api/booking/requests/${bookingId}/messages/`, {
    params: { limit },
  });

  // API pode retornar array direto ou { results: [...] } ou { result: [...] }
  const raw = Array.isArray(data) ? data : (data?.results ?? data?.result ?? []);

  // Ajuda a depurar formatos inesperados sem quebrar a UI
  if (import.meta.env.DEV) {
    const sample = Array.isArray(raw) ? raw[0] : raw;
    console.log("[bookingApi] /messages sample:", sample);
  }

  if (!Array.isArray(raw)) return [];
  return raw.map((m, i) => normalizeBookingMessage(m, i));
}

// ── Enviar mensagem em um booking ─────────────────────────────────────────────
export async function sendBookingMessage(
  bookingId: number,
  content: string
): Promise<BookingMessage> {
  await fetchCsrf();
  const { data } = await api.post(`/api/booking/requests/${bookingId}/send/`, {
    text: content,
  });
  return normalizeBookingMessage(data?.result ?? data, 0);
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
