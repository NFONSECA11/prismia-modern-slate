import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { BookingListResponse, BookingRequest, Professional } from "@/types/booking";

// ── Listagem ─────────────────────────────────────────────────────────────────
const bookingPhoneCache = new Map<number, string>();

function normalizeBookingListResponse(payload: any): BookingListResponse {
  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.results)) {
      return {
        count: typeof payload.count === "number" ? payload.count : payload.results.length,
        results: payload.results,
        professionals: Array.isArray(payload.professionals) ? payload.professionals : [],
      };
    }

    if (Array.isArray(payload.result?.results)) {
      return {
        count:
          typeof payload.result.count === "number"
            ? payload.result.count
            : payload.result.results.length,
        results: payload.result.results,
        professionals: Array.isArray(payload.result.professionals)
          ? payload.result.professionals
          : [],
      };
    }

    if (Array.isArray(payload.result)) {
      return {
        count: payload.result.length,
        results: payload.result,
        professionals: [],
      };
    }
  }

  return { count: 0, results: [], professionals: [] };
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

  const fetchWithPageNumber = async () => {
    const bookingsById = new Map<number, BookingRequest>();
    let professionals: Professional[] = [];
    let totalCount = 0;
    let repeatedPageDetected = false;
    let pagesFetched = 0;
    let page = 1;
    let useCursor = false;
    let nextCursor: string | null = null;
    const seenCursors = new Set<string>();

    while (pagesFetched < MAX_PAGES) {
      let data: any;
      try {
        if (useCursor && nextCursor) {
          if (seenCursors.has(nextCursor)) {
            repeatedPageDetected = true;
            break;
          }
          seenCursors.add(nextCursor);
          const response = await api.get(nextCursor);
          data = response.data;
        } else {
          const response = await api.get("/api/booking/requests/", {
            params: { page, page_size: PAGE_SIZE },
          });
          data = response.data;
        }
      } catch (error) {
        const status = (error as any)?.response?.status;
        if (status === 404 && !useCursor && page > 1) break;
        if ((status === 400 || status === 404) && useCursor) break;
        throw error;
      }

      const normalizedPage = normalizeBookingListResponse(data);
      pagesFetched += 1;
      totalCount = Math.max(totalCount, normalizedPage.count || 0);

      const addedCount = mergePage(bookingsById, normalizedPage.results);
      if (normalizedPage.professionals.length > 0) {
        professionals = normalizedPage.professionals;
      }

      console.log(`[bookingApi] page=${page} fetched=${normalizedPage.results.length} added=${addedCount} total=${bookingsById.size} count=${totalCount}`);

      const hasTopNextField =
        !!data &&
        typeof data === "object" &&
        Object.prototype.hasOwnProperty.call(data, "next");
      const hasNestedNextField =
        !!data?.result &&
        typeof data.result === "object" &&
        Object.prototype.hasOwnProperty.call(data.result, "next");
      const hasNextField = hasTopNextField || hasNestedNextField;

      const rawNext = hasTopNextField ? data?.next : hasNestedNextField ? data?.result?.next : null;
      const resolvedNextCursor =
        typeof rawNext === "string" && rawNext.trim().length > 0 ? rawNext : null;

      if (normalizedPage.results.length === 0) break;

      if (hasNextField) {
        useCursor = true;
        if (!resolvedNextCursor) break;
        nextCursor = resolvedNextCursor;
        continue;
      }

      // If total count indicates more data exists, keep paginating even if no new unique IDs
      if (totalCount > 0 && bookingsById.size >= totalCount) break;

      // Only stop on repeated data if we've already fetched enough
      if (page >= 2 && addedCount === 0 && normalizedPage.results.length > 0) {
        // If count says there's more, try next page anyway
        if (totalCount > bookingsById.size) {
          page += 1;
          continue;
        }
        repeatedPageDetected = true;
        break;
      }

      page += 1;
    }

    console.log(`[bookingApi] pageNumber done: ${bookingsById.size} unique bookings, totalCount=${totalCount}, pages=${pagesFetched}`);
    return { bookingsById, professionals, totalCount, repeatedPageDetected, pagesFetched };
  };

  const fetchWithOffsetLimit = async () => {
    const bookingsById = new Map<number, BookingRequest>();
    let professionals: Professional[] = [];
    let totalCount = 0;
    let offset = 0;

    for (let step = 0; step < MAX_PAGES; step += 1) {
      let data: any;
      try {
        const response = await api.get("/api/booking/requests/", {
          params: { limit: PAGE_SIZE, offset },
        });
        data = response.data;
      } catch (error) {
        const status = (error as any)?.response?.status;
        if (status === 400 || status === 404) {
          if (offset === 0) {
            return { bookingsById, professionals, totalCount };
          }
          break;
        }
        throw error;
      }

      const normalizedPage = normalizeBookingListResponse(data);
      totalCount = Math.max(totalCount, normalizedPage.count || 0);

      const addedCount = mergePage(bookingsById, normalizedPage.results);
      if (normalizedPage.professionals.length > 0) {
        professionals = normalizedPage.professionals;
      }

      if (normalizedPage.results.length === 0 || addedCount === 0) break;
      offset += PAGE_SIZE;
    }

    return { bookingsById, professionals, totalCount };
  };

  const pageResult = await fetchWithPageNumber();

  let finalById = pageResult.bookingsById;
  let finalProfessionals = pageResult.professionals;
  let finalTotalCount = pageResult.totalCount;

  const shouldTryOffsetFallback =
    pageResult.repeatedPageDetected ||
    (pageResult.pagesFetched === 1 && pageResult.bookingsById.size >= 20) ||
    (pageResult.totalCount > 0 && pageResult.bookingsById.size < pageResult.totalCount);

  if (shouldTryOffsetFallback) {
    const offsetResult = await fetchWithOffsetLimit();
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
