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
  const REQUEST_PAGE_SIZE = 100;
  const MAX_TOTAL_REQUESTS = 24;
  const SHARD_STATUSES = [
    "handoff",
    "assisted",
    "awaiting_choice",
    "pending",
    "confirmed",
    "canceled",
    "cancelled",
    "failed",
  ] as const;

  const deduped = new Map<number, BookingRequest>();
  const visitedTargets = new Set<string>();
  let professionals: Professional[] = [];
  let totalCount: number | null = null;
  let totalRequests = 0;
  let probeRequests = 0;
  let shardRequests = 0;
  let partialError = false;

  const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

  const normalizeTarget = (cursor: string | null): string | null => {
    if (!cursor) return null;
    const value = cursor.trim();
    if (!value) return null;

    if (value.startsWith("http://") || value.startsWith("https://")) {
      try {
        const u = new URL(value);
        return `${u.pathname}${u.search}`;
      } catch {
        return value;
      }
    }

    if (value.startsWith("/")) return value;
    if (value.startsWith("?")) return `/api/booking/requests/${value}`;
    if (/^\d+$/.test(value)) return `/api/booking/requests/?page=${value}&page_size=${REQUEST_PAGE_SIZE}`;

    return null;
  };

  const extractPayloadTotalCount = (payload: any): number | null => {
    const resultNode = payload?.result;
    const rawCandidates = [
      payload?.count,
      resultNode?.count,
      payload?.total,
      resultNode?.total,
      payload?.total_count,
      resultNode?.total_count,
      payload?.pagination?.count,
      resultNode?.pagination?.count,
      payload?.pagination?.total,
      resultNode?.pagination?.total,
      payload?.meta?.total,
      resultNode?.meta?.total,
    ];

    for (const raw of rawCandidates) {
      const parsed = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }

    return null;
  };

  const mergeResponse = (data: unknown, headers: any) => {
    const normalized = normalizeBookingListResponse(data);

    if (normalized.professionals.length > 0) {
      professionals = normalized.professionals;
    }

    const payloadTotal = extractPayloadTotalCount(data);
    const headerTotal = extractTotalCountFromHeaders(headers);
    const candidateCounts = [payloadTotal, headerTotal].filter(
      (n): n is number => typeof n === "number" && Number.isFinite(n)
    );

    if (candidateCounts.length > 0) {
      const best = Math.max(...candidateCounts);
      totalCount = totalCount === null ? best : Math.max(totalCount, best);
    }

    const pageResults = Array.isArray(normalized.results) ? (normalized.results as BookingRequest[]) : [];

    let newItems = 0;
    for (const booking of pageResults) {
      if (!deduped.has(booking.id)) newItems += 1;
      deduped.set(booking.id, booking);
    }

    return {
      pageResults,
      newItems,
      cursorTarget: normalizeTarget(extractNextCursor(data, headers)),
    };
  };

  const hasReliableTotal = () => totalCount !== null && totalCount > 20;
  const reachedReliableTotal = () => hasReliableTotal() && deduped.size >= (totalCount as number);

  const safeGet = async (url: string, params?: Record<string, unknown>) => {
    if (totalRequests >= MAX_TOTAL_REQUESTS) return null;
    try {
      const response = await api.get(url, params ? { params } : undefined);
      totalRequests += 1;
      return response;
    } catch (error) {
      partialError = true;
      if (deduped.size === 0) throw error;
      return null;
    }
  };

  // 1) Primeira página
  const firstResponse = await safeGet("/api/booking/requests/", { page: 1, page_size: REQUEST_PAGE_SIZE });
  if (!firstResponse) {
    return { count: 0, results: [], professionals: [] };
  }

  const firstMerged = mergeResponse(firstResponse.data, firstResponse.headers);

  // 2) Seguir cursor/next quando existir
  let nextCursor = firstMerged.cursorTarget;
  while (nextCursor && totalRequests < MAX_TOTAL_REQUESTS) {
    if (visitedTargets.has(nextCursor)) break;
    visitedTargets.add(nextCursor);

    const response = await safeGet(nextCursor);
    if (!response) break;

    const merged = mergeResponse(response.data, response.headers);
    if (reachedReliableTotal()) break;
    if (merged.pageResults.length === 0 || merged.newItems === 0) break;

    nextCursor = merged.cursorTarget;
    await sleep(120);
  }

  // 3) Se ainda travou em 20, detectar estratégia de paginação aceitada pela API
  type ProbeStrategy = {
    name: string;
    probeParams: Record<string, number>;
    nextValue: number;
    step: number;
    buildParams: (value: number) => Record<string, number>;
  };

  const probeStrategies: ProbeStrategy[] = [
    {
      name: "page",
      probeParams: { page: 2 },
      nextValue: 3,
      step: 1,
      buildParams: (value) => ({ page: value }),
    },
    {
      name: "page+size",
      probeParams: { page: 2, page_size: REQUEST_PAGE_SIZE },
      nextValue: 3,
      step: 1,
      buildParams: (value) => ({ page: value, page_size: REQUEST_PAGE_SIZE }),
    },
    {
      name: "offset+limit",
      probeParams: { offset: 20, limit: 20 },
      nextValue: 40,
      step: 20,
      buildParams: (value) => ({ offset: value, limit: 20 }),
    },
    {
      name: "offset",
      probeParams: { offset: 20 },
      nextValue: 40,
      step: 20,
      buildParams: (value) => ({ offset: value }),
    },
    {
      name: "skip+limit",
      probeParams: { skip: 20, limit: 20 },
      nextValue: 40,
      step: 20,
      buildParams: (value) => ({ skip: value, limit: 20 }),
    },
    {
      name: "page_number",
      probeParams: { page_number: 2 },
      nextValue: 3,
      step: 1,
      buildParams: (value) => ({ page_number: value }),
    },
    {
      name: "p",
      probeParams: { p: 2 },
      nextValue: 3,
      step: 1,
      buildParams: (value) => ({ p: value }),
    },
  ];

  const shouldProbePagination = () => {
    if (reachedReliableTotal()) return false;
    if (hasReliableTotal()) return deduped.size < (totalCount as number);
    return deduped.size <= 20;
  };

  let discoveredStrategy: ProbeStrategy | null = null;
  if (shouldProbePagination()) {
    for (const strategy of probeStrategies) {
      const response = await safeGet("/api/booking/requests/", strategy.probeParams);
      if (!response) continue;
      probeRequests += 1;

      const merged = mergeResponse(response.data, response.headers);
      if (merged.newItems > 0) {
        discoveredStrategy = strategy;
        break;
      }

      if (reachedReliableTotal()) break;
      await sleep(120);
    }
  }

  // 4) Paginar com a estratégia descoberta
  if (discoveredStrategy) {
    let cursor = discoveredStrategy.nextValue;

    while (totalRequests < MAX_TOTAL_REQUESTS) {
      const response = await safeGet("/api/booking/requests/", discoveredStrategy.buildParams(cursor));
      if (!response) break;

      const merged = mergeResponse(response.data, response.headers);
      if (reachedReliableTotal()) break;
      if (merged.pageResults.length === 0 || merged.newItems === 0) break;

      cursor += discoveredStrategy.step;
      await sleep(120);
    }
  }

  const shouldShardByStatus = () => {
    if (reachedReliableTotal()) return false;
    if (hasReliableTotal()) return deduped.size < (totalCount as number);
    return deduped.size <= 20;
  };

  // 5) Fallback final: shard por status com paginação curta
  if (shouldShardByStatus()) {
    const statusParamBuilders = [
      (status: string, page: number) => ({ status, page, page_size: REQUEST_PAGE_SIZE }),
      (status: string, page: number) => ({ booking_status: status, page, page_size: REQUEST_PAGE_SIZE }),
    ];

    outer: for (const status of SHARD_STATUSES) {
      if (totalRequests >= MAX_TOTAL_REQUESTS || reachedReliableTotal()) break;

      for (const buildParams of statusParamBuilders) {
        for (const page of [1, 2] as const) {
          if (totalRequests >= MAX_TOTAL_REQUESTS || reachedReliableTotal()) break outer;

          const response = await safeGet("/api/booking/requests/", buildParams(status, page));
          if (!response) continue;

          shardRequests += 1;
          const merged = mergeResponse(response.data, response.headers);

          if (merged.pageResults.length === 0) break;
          if (page === 2 && merged.newItems === 0) break;

          await sleep(120);
        }
      }
    }
  }

  const results = Array.from(deduped.values()).map((booking) => {
    const cachedPhone = bookingPhoneCache.get(booking.id);
    if (!cachedPhone || booking.contact_phone || booking.phone) return booking;
    return { ...booking, contact_phone: cachedPhone } as BookingRequest;
  });

  console.log(
    `[bookingApi] Fetched ${results.length} bookings (requests=${totalRequests}, probe=${probeRequests}, shard=${shardRequests}, strategy=${discoveredStrategy?.name ?? "cursor-only"}, totalHint=${totalCount ?? "n/a"}, partialError=${partialError})`
  );

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
