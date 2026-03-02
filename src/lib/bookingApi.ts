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
  const PAGE_SIZE = 100;
  const MAX_PAGES = 200;
  const MAX_NO_PROGRESS_PAGES = 3;

  const mergePage = (bookingsById: Map<number, BookingRequest>, pageResults: BookingRequest[]) => {
    const before = bookingsById.size;

    for (const booking of pageResults) {
      const id = Number(booking?.id);
      if (Number.isNaN(id)) continue;

      const existing = bookingsById.get(id);
      if (!existing) {
        bookingsById.set(id, booking);
        continue;
      }

      const existingTs = Date.parse(existing.updated_at ?? existing.created_at ?? "");
      const nextTs = Date.parse(booking.updated_at ?? booking.created_at ?? "");
      if (!Number.isNaN(nextTs) && (Number.isNaN(existingTs) || nextTs >= existingTs)) {
        bookingsById.set(id, booking);
      }
    }

    return bookingsById.size - before;
  };

  const fetchWithPageNumber = async (withPageSize: boolean) => {
    const bookingsById = new Map<number, BookingRequest>();
    let professionals: Professional[] = [];
    let totalCount = 0;
    let repeatedPageDetected = false;
    let pagesFetched = 0;
    let page = 1;
    let useCursor = false;
    let nextCursor: string | null = null;
    const seenCursors = new Set<string>();
    let noProgressPages = 0;

    const normalizeCursorRequestPath = (cursor: string): string => {
      try {
        const base = typeof api.defaults.baseURL === "string" ? api.defaults.baseURL : window.location.origin;
        const parsed = new URL(cursor, base);
        return `${parsed.pathname}${parsed.search}`;
      } catch {
        return cursor;
      }
    };

    while (pagesFetched < MAX_PAGES) {
      let data: any;
      let responseHeaders: any;
      try {
        if (useCursor && nextCursor) {
          const normalizedCursorPath = normalizeCursorRequestPath(nextCursor);
          if (seenCursors.has(normalizedCursorPath)) {
            repeatedPageDetected = true;
            break;
          }
          seenCursors.add(normalizedCursorPath);
          const response = await api.get(normalizedCursorPath);
          data = response.data;
          responseHeaders = response.headers;
        } else {
          const response = await api.get("/api/booking/requests/", {
            params: withPageSize ? { page, page_size: PAGE_SIZE } : { page },
          });
          data = response.data;
          responseHeaders = response.headers;
        }
      } catch (error) {
        const status = (error as any)?.response?.status;
        if (status === 404 && !useCursor && page > 1) break;
        if ((status === 400 || status === 404) && useCursor) break;
        throw error;
      }

      const normalizedPage = normalizeBookingListResponse(data);
      pagesFetched += 1;
      const headerTotalCount = extractTotalCountFromHeaders(responseHeaders);
      totalCount = Math.max(totalCount, normalizedPage.count || 0, headerTotalCount ?? 0);

      const addedCount = mergePage(bookingsById, normalizedPage.results);
      if (normalizedPage.professionals.length > 0) {
        professionals = normalizedPage.professionals;
      }

      const resolvedNextCursor = extractNextCursor(data, responseHeaders);

      // Diagnostic log — captures raw API shape
      console.log(`[bookingApi] strategy=${withPageSize ? "page+size" : "page"} page=${page} fetched=${normalizedPage.results.length} added=${addedCount} unique=${bookingsById.size} apiCount=${totalCount} headerCount=${headerTotalCount ?? "null"} nextCursor=${resolvedNextCursor ?? "null"} rawKeys=${data ? Object.keys(data).join(",") : "null"} resultKeys=${data?.result ? Object.keys(data.result).join(",") : "null"}`);

      if (addedCount === 0 && normalizedPage.results.length > 0) {
        noProgressPages += 1;
      } else {
        noProgressPages = 0;
      }

      if (normalizedPage.results.length === 0) break;
      if (totalCount > 0 && bookingsById.size >= totalCount) break;

      if (resolvedNextCursor) {
        useCursor = true;
        nextCursor = resolvedNextCursor;
        continue;
      }

      if (noProgressPages >= MAX_NO_PROGRESS_PAGES && normalizedPage.results.length > 0) {
        repeatedPageDetected = true;
        break;
      }

      page += 1;
    }

    return { bookingsById, professionals, totalCount, repeatedPageDetected, pagesFetched };
  };

  const fetchWithParamStrategies = async () => {
    const strategies: Array<{
      name: string;
      buildParams: (cursor: number) => Record<string, number>;
    }> = [
      { name: "offset+limit", buildParams: (cursor) => ({ offset: cursor, limit: PAGE_SIZE }) },
      { name: "skip+limit", buildParams: (cursor) => ({ skip: cursor, limit: PAGE_SIZE }) },
      { name: "start+limit", buildParams: (cursor) => ({ start: cursor, limit: PAGE_SIZE }) },
      { name: "from+size", buildParams: (cursor) => ({ from: cursor, size: PAGE_SIZE }) },
      {
        name: "page+limit",
        buildParams: (cursor) => ({ page: Math.floor(cursor / PAGE_SIZE) + 1, limit: PAGE_SIZE }),
      },
      {
        name: "page+per_page",
        buildParams: (cursor) => ({ page: Math.floor(cursor / PAGE_SIZE) + 1, per_page: PAGE_SIZE }),
      },
      {
        name: "pageNumber+pageSize",
        buildParams: (cursor) => ({
          pageNumber: Math.floor(cursor / PAGE_SIZE) + 1,
          pageSize: PAGE_SIZE,
        }),
      },
    ];

    let bestResult = {
      bookingsById: new Map<number, BookingRequest>(),
      professionals: [] as Professional[],
      totalCount: 0,
    };

    for (const strategy of strategies) {
      const bookingsById = new Map<number, BookingRequest>();
      let professionals: Professional[] = [];
      let totalCount = 0;
      let cursor = 0;
      let noProgressPages = 0;

      for (let step = 0; step < MAX_PAGES; step += 1) {
        let data: any;
        let responseHeaders: any;

        try {
          const response = await api.get("/api/booking/requests/", {
            params: strategy.buildParams(cursor),
          });
          data = response.data;
          responseHeaders = response.headers;
        } catch (error) {
          const status = (error as any)?.response?.status;
          if (status === 400 || status === 404) {
            if (step === 0) {
              break;
            }
            break;
          }
          throw error;
        }

        const normalizedPage = normalizeBookingListResponse(data);
        const headerTotalCount = extractTotalCountFromHeaders(responseHeaders);
        totalCount = Math.max(totalCount, normalizedPage.count || 0, headerTotalCount ?? 0);

        const addedCount = mergePage(bookingsById, normalizedPage.results);
        if (normalizedPage.professionals.length > 0) {
          professionals = normalizedPage.professionals;
        }

        const returnedRaw = data?.returned ?? data?.result?.returned;
        const returnedCount =
          typeof returnedRaw === "number"
            ? returnedRaw
            : typeof returnedRaw === "string"
              ? Number(returnedRaw)
              : NaN;

        console.log(
          `[bookingApi] alt=${strategy.name} step=${step + 1} cursor=${cursor} fetched=${normalizedPage.results.length} added=${addedCount} unique=${bookingsById.size} apiCount=${totalCount} returned=${Number.isFinite(returnedCount) ? returnedCount : "null"}`
        );

        if (normalizedPage.results.length === 0) break;
        if (totalCount > 0 && bookingsById.size >= totalCount) break;

        if (addedCount === 0) {
          noProgressPages += 1;
        } else {
          noProgressPages = 0;
        }

        if (noProgressPages >= MAX_NO_PROGRESS_PAGES) break;

        const advanceBy =
          Number.isFinite(returnedCount) && returnedCount > 0
            ? returnedCount
            : Math.max(normalizedPage.results.length, PAGE_SIZE);
        cursor += advanceBy;
      }

      if (bookingsById.size > bestResult.bookingsById.size) {
        bestResult = { bookingsById, professionals, totalCount };
      }

      if (bestResult.totalCount > 0 && bestResult.bookingsById.size >= bestResult.totalCount) {
        break;
      }
    }

    return bestResult;
  };

  const pageResultWithPageSize = await fetchWithPageNumber(true);

  let pageResult = pageResultWithPageSize;
  const shouldRetryWithoutPageSize =
    (pageResultWithPageSize.repeatedPageDetected ||
      (pageResultWithPageSize.totalCount > 0 &&
        pageResultWithPageSize.bookingsById.size < pageResultWithPageSize.totalCount) ||
      (pageResultWithPageSize.pagesFetched === 1 &&
        pageResultWithPageSize.bookingsById.size >= PAGE_SIZE)) &&
    pageResultWithPageSize.pagesFetched >= 1;

  if (shouldRetryWithoutPageSize) {
    const pageResultWithoutPageSize = await fetchWithPageNumber(false);
    if (pageResultWithoutPageSize.bookingsById.size > pageResult.bookingsById.size) {
      pageResult = pageResultWithoutPageSize;
    }
  }

  let finalById = pageResult.bookingsById;
  let finalProfessionals = pageResult.professionals;
  let finalTotalCount = pageResult.totalCount;

  const shouldTryOffsetFallback =
    pageResult.repeatedPageDetected ||
    (pageResult.pagesFetched === 1 && pageResult.bookingsById.size >= 20) ||
    (pageResult.totalCount > 0 && pageResult.bookingsById.size < pageResult.totalCount);

  if (shouldTryOffsetFallback) {
    const offsetResult = await fetchWithParamStrategies();
    if (offsetResult.bookingsById.size > finalById.size) {
      finalById = offsetResult.bookingsById;
      finalProfessionals = offsetResult.professionals;
      finalTotalCount = Math.max(finalTotalCount, offsetResult.totalCount);
    }
  }

  const normalized: BookingListResponse = {
    count: Math.max(finalTotalCount, finalById.size),
    results: Array.from(finalById.values()),
    professionals: finalProfessionals,
  };

  const missingPhone = normalized.results.filter(
    (booking) => !booking.contact_phone && !booking.phone
  );

  const needFetch = missingPhone.filter((booking) => !bookingPhoneCache.has(booking.id));
  if (needFetch.length > 0) {
    await Promise.all(needFetch.map((booking) => fetchBookingPhoneById(booking.id)));
  }

  const resultsWithPhone = normalized.results.map((booking) => {
    const cachedPhone = bookingPhoneCache.get(booking.id);
    if (!cachedPhone || booking.contact_phone || booking.phone) return booking;
    return { ...booking, contact_phone: cachedPhone };
  });

  return { ...normalized, results: resultsWithPhone };
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
  await api.post(`/api/booking/requests/${id}/handoff_off/`);
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
