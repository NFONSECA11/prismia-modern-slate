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
  const MAX_REQUESTS = 64;
  const MAX_RETRIES = 1;

  const deduped = new Map<number, BookingRequest>();
  const visitedTargets = new Set<string>();
  let professionals: Professional[] = [];
  let totalCount: number | null = null;
  let requestCount = 0;
  let retriesUsed = 0;
  let shardRequests = 0;
  let partialError = false;
  let inferredPageSize = 20;

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
    if (/^\d+$/.test(value)) return `/api/booking/requests/?page=${value}`;

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

    if (normalized.professionals.length > 0) professionals = normalized.professionals;

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
    if (pageResults.length > 0) inferredPageSize = Math.max(1, Math.min(100, pageResults.length));

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

  const safeGet = async (
    request: () => Promise<{ data: unknown; headers: any }>,
    options?: { markPartialOnFail?: boolean }
  ): Promise<{ data: unknown; headers: any } | null> => {
    if (requestCount >= MAX_REQUESTS) return null;

    const markPartialOnFail = options?.markPartialOnFail ?? true;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      try {
        const response = await request();
        requestCount += 1;
        return response;
      } catch (error) {
        retriesUsed += 1;
        if (attempt === MAX_RETRIES) {
          if (markPartialOnFail) partialError = true;
          if (deduped.size === 0) throw error;
          return null;
        }
        await sleep(200 * (attempt + 1));
      }
    }

    return null;
  };

  // 1) Primeira página com tentativas de page size maior
  let firstCursor: string | null = null;
  let hasAnyResponse = false;

  const firstResponse = await safeGet(() => api.get("/api/booking/requests/", { params: { limit: 500 } }));
  if (firstResponse) {
    hasAnyResponse = true;
    const merged = mergeResponse(firstResponse.data, firstResponse.headers);
    firstCursor = merged.cursorTarget;
  }

  if (!hasAnyResponse) {
    return { count: 0, results: [], professionals: [] };
  }

  // 2) Seguir cursor/next sem abortar cedo por duplicatas
  let nextCursor = firstCursor;
  while (nextCursor && requestCount < MAX_REQUESTS) {
    if (visitedTargets.has(nextCursor)) break;
    visitedTargets.add(nextCursor);

    const currentTarget = nextCursor;
    const response = await safeGet(() => api.get(currentTarget));
    if (!response) break;

    const merged = mergeResponse(response.data, response.headers);
    if (totalCount !== null && deduped.size >= totalCount) break;
    if (!merged.cursorTarget || merged.cursorTarget === currentTarget) break;

    nextCursor = merged.cursorTarget;
    await sleep(200);
  }

  // 3) Sweep por paginação numérica com múltiplos formatos de parâmetro
  const shouldPaginateByPage =
    (totalCount !== null && deduped.size < totalCount) ||
    (totalCount === null && deduped.size >= inferredPageSize);

  if (shouldPaginateByPage && requestCount < MAX_REQUESTS) {
    const maxPagesByCount =
      totalCount !== null
        ? Math.min(80, Math.ceil(totalCount / Math.max(1, inferredPageSize)) + 4)
        : 14;

    let missStreak = 0;

    for (let page = 2; page <= maxPagesByCount && requestCount < MAX_REQUESTS; page += 1) {
      if (totalCount !== null && deduped.size >= totalCount) break;

      const pageVariants = [
        { page, page_size: inferredPageSize },
        { page },
        { page_number: page },
        { p: page },
        { offset: (page - 1) * inferredPageSize, limit: inferredPageSize },
      ];

      let gotAnyPageData = false;

      for (const params of pageVariants) {
        if (requestCount >= MAX_REQUESTS) break;

        const response = await safeGet(() => api.get("/api/booking/requests/", { params }));
        if (!response) continue;

        const merged = mergeResponse(response.data, response.headers);
        if (merged.pageResults.length > 0) {
          gotAnyPageData = true;
          break;
        }
      }

      if (!gotAnyPageData) {
        missStreak += 1;
        if (missStreak >= 3) break;
      } else {
        missStreak = 0;
      }

      await sleep(200);
    }
  }

  // 4) Sweep por offset como fallback adicional
  if (totalCount !== null && deduped.size < totalCount && requestCount < MAX_REQUESTS) {
    const step = Math.max(1, inferredPageSize);
    let missStreak = 0;

    for (let offset = 0; offset < totalCount && requestCount < MAX_REQUESTS; offset += step) {
      if (deduped.size >= totalCount) break;

      const response = await safeGet(() =>
        api.get("/api/booking/requests/", {
          params: { offset, limit: step },
        })
      );

      if (!response) {
        missStreak += 1;
        if (missStreak >= 3) break;
        continue;
      }

      const merged = mergeResponse(response.data, response.headers);
      if (merged.pageResults.length === 0) {
        missStreak += 1;
        if (missStreak >= 3) break;
      } else {
        missStreak = 0;
      }

      await sleep(200);
    }
  }

  // 5) Fallback final por status usando APENAS status já vistos (evita invalid_status)
  if (totalCount !== null && deduped.size < totalCount && requestCount < MAX_REQUESTS) {
    const knownStatuses = Array.from(
      new Set(
        Array.from(deduped.values())
          .map((b) => String(b.status ?? "").trim())
          .filter((s) => s.length > 0)
      )
    );

    const detectStatusKey = async (): Promise<"status" | "booking_status" | null> => {
      if (knownStatuses.length === 0) return null;

      for (const statusKey of ["status", "booking_status"] as const) {
        const probe = await safeGet(
          () =>
            api.get("/api/booking/requests/", {
              params: { [statusKey]: knownStatuses[0], page: 1, page_size: 1 },
            }),
          { markPartialOnFail: false }
        );

        if (!probe) continue;

        shardRequests += 1;
        mergeResponse(probe.data, probe.headers);
        return statusKey;
      }

      return null;
    };

    const statusKey = await detectStatusKey();

    if (statusKey) {
      for (const status of knownStatuses) {
        if (requestCount >= MAX_REQUESTS || deduped.size >= totalCount) break;

        for (let page = 1; page <= 10 && requestCount < MAX_REQUESTS; page += 1) {
          if (deduped.size >= totalCount) break;

          const response = await safeGet(
            () =>
              api.get("/api/booking/requests/", {
                params: { [statusKey]: status, page, page_size: inferredPageSize },
              }),
            { markPartialOnFail: false }
          );

          if (!response) break;

          shardRequests += 1;
          const merged = mergeResponse(response.data, response.headers);
          if (merged.pageResults.length === 0) break;

          await sleep(200);
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
    `[bookingApi] Fetched ${results.length} bookings (requests=${requestCount}, retries=${retriesUsed}, shard=${shardRequests}, pageSize=${inferredPageSize}, totalHint=${totalCount ?? "n/a"}, partialError=${partialError})`
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
