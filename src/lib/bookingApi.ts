import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import {
  applyBookingProcedureNameOverride,
  applyBookingProcedureNameOverrides,
} from "@/lib/bookingProcedureNameOverrides";
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

function isHtmlPayload(payload: unknown): boolean {
  if (typeof payload !== "string") return false;
  const trimmed = payload.trim().toLowerCase();
  return trimmed.startsWith("<!doctype") || trimmed.startsWith("<html") || trimmed.includes("<body");
}

function isTunnelHtmlBadRequest(error: unknown): boolean {
  const err = error as any;
  const status = err?.response?.status;
  const contentType = String(getHeaderValue(err?.response?.headers, "content-type") ?? "").toLowerCase();
  const payload = err?.response?.data;

  return status === 400 && (contentType.includes("text/html") || isHtmlPayload(payload));
}

export async function fetchBookingPhoneById(id: number): Promise<string | null> {
  const cached = bookingPhoneCache.get(id);
  if (cached) return cached;
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

export interface BookingFilterParams {
  status?: string;
  date_field?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  limit?: number;
  unit?: number;
  ordering?: string;
}

/**
 * Lightweight filtered fetch — sends params to the API instead of loading everything.
 * Follows at most 1 next-page cursor to keep it fast.
 */
export async function fetchFilteredBookings(
  params: BookingFilterParams = {}
): Promise<BookingListResponse> {
  const queryParams: Record<string, unknown> = { limit: params.limit ?? 200, ...params };
  delete queryParams.limit; // re-add after spread
  
  const { data, headers } = await api.get("/api/booking/requests/", {
    params: { limit: params.limit ?? 200, ...params },
  });

  const normalized = normalizeBookingListResponse(data);
  const professionals = normalized.professionals;
  const deduped = new Map<number, BookingRequest>();

  for (const b of normalized.results as BookingRequest[]) {
    deduped.set(b.id, b);
  }

  // Don't follow extra pages — keep memory footprint minimal

  const results = applyBookingProcedureNameOverrides(
    Array.from(deduped.values()).map((booking) => {
      const cachedPhone = bookingPhoneCache.get(booking.id);
      if (!cachedPhone || booking.contact_phone || booking.phone) return booking;
      return { ...booking, contact_phone: cachedPhone } as BookingRequest;
    })
  );

  console.log(`[bookingApi] Filtered fetch: ${results.length} results (params=${JSON.stringify(params)})`);

  return {
    count: normalized.count > results.length ? normalized.count : results.length,
    results,
    professionals,
  };
}

function normalizeNextTarget(cursor: string): string | null {
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
  return null;
}

// Keep the old fetchBookingRequests as a re-export for backward compat
export async function fetchBookingRequests(): Promise<BookingListResponse> {
  return fetchFilteredBookings({});
}

// ── Buscar BRs por telefone (para reagendamento manual) ──────────────────────
function digitsOnly(value: string): string {
  return (value ?? "").replace(/\D/g, "");
}

export async function fetchBookingsByPhone(
  phone: string,
  opts: { excludeId?: number; statuses?: string[]; leadName?: string; unitName?: string } = {}
): Promise<BookingRequest[]> {
  const phoneDigits = digitsOnly(phone);
  const leadName = (opts.leadName ?? "").trim().toLowerCase();
  if (!phoneDigits && !leadName) return [];

  const statuses = opts.statuses?.length
    ? opts.statuses
    : ["confirmed", "pending", "awaiting_choice", "handoff", "assisted"];

  const matchTarget = phoneDigits.slice(-8);
  const normalizeName = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  const normalizedLeadName = normalizeName(leadName);

  const queries = Array.from(
    new Set(
      [
        phoneDigits,
        phoneDigits.slice(-11),
        phoneDigits.slice(-9),
        phoneDigits.slice(-8),
        leadName,
      ].filter((value) => typeof value === "string" && value.trim().length >= 3)
    )
  );

  const candidates = new Map<number, BookingRequest>();

  const collectFromSearch = async (search: string) => {
    const { data } = await api.get("/api/booking/requests/", {
      params: { search, limit: 100 },
    });
    const normalized = normalizeBookingListResponse(data);
    for (const booking of normalized.results as BookingRequest[]) {
      candidates.set(booking.id, booking);
    }
  };

  try {
    for (const search of queries) {
      await collectFromSearch(search);
    }

    // Fallback: se o backend não indexa telefone/nome, escaneia BRs ativos recentes
    if (candidates.size === 0) {
      const fallback = await fetchFilteredBookings({ limit: 200 });
      for (const booking of fallback.results as BookingRequest[]) {
        candidates.set(booking.id, booking);
      }
    }

    const normalizedUnitName = opts.unitName ? normalizeName(opts.unitName) : "";

    const matches = await Promise.all(
      Array.from(candidates.values()).map(async (booking) => {
        if (opts.excludeId && booking.id === opts.excludeId) return null;
        if (!statuses.includes(booking.status)) return null;

        // Filtro por unidade: só inclui BRs da mesma unidade que o BR de origem
        if (normalizedUnitName) {
          const candidateUnit = normalizeName(booking.unit_name ?? "");
          if (candidateUnit !== normalizedUnitName) return null;
        }

        let candidatePhone = digitsOnly(booking.contact_phone ?? booking.phone ?? "");
        if (!candidatePhone) {
          candidatePhone = digitsOnly((await fetchBookingPhoneById(booking.id)) ?? "");
        }

        const nameMatches = normalizedLeadName
          ? normalizeName(booking.lead_name ?? "").includes(normalizedLeadName) ||
            normalizedLeadName.includes(normalizeName(booking.lead_name ?? ""))
          : false;

        const phoneMatches = !!matchTarget && !!candidatePhone && (
          candidatePhone.endsWith(matchTarget) || matchTarget.endsWith(candidatePhone.slice(-8))
        );

        if (!phoneMatches && !nameMatches) return null;

        return {
          ...booking,
          ...(candidatePhone ? { contact_phone: candidatePhone } : {}),
        } as BookingRequest;
      })
    );

    const filtered = matches.filter((item): item is BookingRequest => !!item);

    filtered.sort((a, b) => {
      const aTime = a.scheduled_at ? new Date(a.scheduled_at).getTime() : 0;
      const bTime = b.scheduled_at ? new Date(b.scheduled_at).getTime() : 0;
      if (aTime && bTime) return aTime - bTime;
      if (aTime) return -1;
      if (bTime) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

    return applyBookingProcedureNameOverrides(filtered);
  } catch (err) {
    console.error("[fetchBookingsByPhone] failed:", err);
    return [];
  }
}

export async function fetchBookingRequestById(id: number): Promise<BookingRequest> {
  const { data } = await api.get(`/api/booking/requests/${id}/`);
  return applyBookingProcedureNameOverride((data?.result ?? data) as BookingRequest);
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
export interface SuggestSlotsPayload {
  procedure?: number | string;
  procedure_code?: number | string;
  unit?: number | string;
  professional?: number | string;
  preferred_window?: string;
  preferred_period?: string;
  from_date?: string; // yyyy-MM-dd
}

export async function suggestSlots(id: number, payload: SuggestSlotsPayload = {}): Promise<any> {
  await fetchCsrf();
  const params: Record<string, unknown> = { ...payload };
  const { data } = await api.post(`/api/booking/requests/${id}/suggest_slots/`, payload, { params });
  return data;
}

const MANUAL_BOOKING_DRAFTS_STORAGE_KEY = "prismia-manual-booking-drafts-v1";

function getManualBookingMatchKey(booking: Partial<BookingRequest>): string {
  const scheduledAt = String(
    booking.scheduled_at ?? booking.chosen_slot?.start_at ?? booking.vars_snapshot?.chosen_slot?.start_at ?? ""
  ).slice(0, 16);
  return [booking.lead_name, booking.procedure_name, booking.professional_id, scheduledAt]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .join("|");
}

function readManualBookingDrafts(): BookingRequest[] {
  if (typeof localStorage === "undefined") return [];
  try {
    const parsed = JSON.parse(localStorage.getItem(MANUAL_BOOKING_DRAFTS_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((item) => item?.id && item?.scheduled_at) as BookingRequest[] : [];
  } catch {
    return [];
  }
}

function persistManualBookingDraft(booking: BookingRequest) {
  const nextKey = getManualBookingMatchKey(booking);
  const existing = readManualBookingDrafts().filter((item) => getManualBookingMatchKey(item) !== nextKey);
  localStorage.setItem(MANUAL_BOOKING_DRAFTS_STORAGE_KEY, JSON.stringify([booking, ...existing].slice(0, 50)));
}

// ── Buscar BRs para Agenda (server-side filters) ─────────────────────────────
export async function fetchAgendaBookings(
  unitId: number,
  dateFrom: string, // yyyy-MM-dd
  dateTo: string,   // yyyy-MM-dd
): Promise<BookingRequest[]> {
  console.log("[Agenda] Fetching bookings", { unitId, dateFrom, dateTo });
  const { data } = await api.get("/api/booking/requests/", {
    params: {
      unit: unitId,
      status: "confirmed",
      date_field: "scheduled_at",
      date_from: dateFrom,
      date_to: dateTo,
      limit: 500,
    },
  });
  const normalized = normalizeBookingListResponse(data);
  const serverResults = normalized.results as BookingRequest[];
  const serverKeys = new Set(serverResults.map(getManualBookingMatchKey));
  const localDrafts = readManualBookingDrafts().filter((booking) => {
    const dt = String(booking.scheduled_at ?? booking.chosen_slot?.start_at ?? booking.vars_snapshot?.chosen_slot?.start_at ?? "").slice(0, 10);
    const unitMatches = Number((booking as any).unit ?? (booking as any).unit_id) === unitId || !Number.isFinite(Number((booking as any).unit ?? (booking as any).unit_id));
    return unitMatches && dt >= dateFrom && dt <= dateTo && !serverKeys.has(getManualBookingMatchKey(booking));
  });
  console.log("[Agenda] Server-filtered results:", serverResults.length, "local drafts:", localDrafts.length);
  return applyBookingProcedureNameOverrides([...serverResults, ...localDrafts]);
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
  console.log(`[patchBooking] iniciando para id=${id}`, payload);
  try {
    const csrfToken = await fetchCsrf();
    console.log(`[patchBooking] CSRF obtido (len=${csrfToken?.length ?? 0})`);
  } catch (csrfErr: any) {
    console.error("[patchBooking] fetchCsrf FALHOU:", {
      message: csrfErr?.message,
      status: csrfErr?.response?.status,
      data: csrfErr?.response?.data,
    });
    throw csrfErr;
  }

  try {
    console.log(`[patchBooking] disparando PATCH HTTP /api/booking/requests/${id}/`);
    const { data, status } = await api.patch<{ ok?: boolean; result?: BookingRequest; updated?: string[] } | BookingRequest>(
      `/api/booking/requests/${id}/`,
      payload
    );
    console.log(`[patchBooking] PATCH HTTP completo status=${status}`, data);
    const result = (data as any)?.result ?? data;
    return applyBookingProcedureNameOverride(result as BookingRequest);
  } catch (httpErr: any) {
    console.error("[patchBooking] PATCH HTTP FALHOU:", {
      message: httpErr?.message,
      status: httpErr?.response?.status,
      statusText: httpErr?.response?.statusText,
      data: httpErr?.response?.data,
      url: httpErr?.config?.url,
      method: httpErr?.config?.method,
    });
    throw httpErr;
  }
}

export async function assignBookingProfessional(
  id: number,
  professionalId: number
): Promise<BookingRequest> {
  await fetchCsrf();

  const attempts: Array<{ label: string; request: () => Promise<{ data: any }> }> = [
    {
      label: "PATCH professional_id",
      request: () => api.patch(`/api/booking/requests/${id}/`, { professional_id: professionalId }),
    },
    {
      label: "PATCH professional",
      request: () => api.patch(`/api/booking/requests/${id}/`, { professional: professionalId }),
    },
    {
      label: "PUT professional_id",
      request: () => api.put(`/api/booking/requests/${id}/`, { professional_id: professionalId }),
    },
    {
      label: "POST assign_professional",
      request: () => api.post(`/api/booking/requests/${id}/assign_professional/`, { professional_id: professionalId }),
    },
  ];

  const failures: string[] = [];

  for (const attempt of attempts) {
    try {
      const { data } = await attempt.request();
      console.log(`[assignProfessional] ${attempt.label} success`);
      return ((data as any)?.result ?? data) as BookingRequest;
    } catch (err: any) {
      const status = err?.response?.status;
      const resData = err?.response?.data;
      const contentType = String(err?.response?.headers?.["content-type"] ?? "").toLowerCase();
      const isHtml =
        contentType.includes("text/html") ||
        (typeof resData === "string" && /<!doctype|<html|<body/i.test(resData));

      const detail = !isHtml
        ? (resData?.detail ?? resData?.error ?? resData?.message ?? resData?.code ?? "")
        : "";

      const failureLabel = `${attempt.label}: ${status ?? "sem_status"}${isHtml ? " (HTML)" : detail ? ` (${detail})` : ""}`;
      failures.push(failureLabel);

      console.error(`[assignProfessional] ${attempt.label} failed:`, {
        status,
        isHtml,
        data: isHtml ? "(HTML omitted)" : resData,
      });

      // Só tenta fallback para rota/método/formato. Erros de validação/permissão param aqui.
      const canFallback = isHtml || status === 404 || status === 405;
      if (!canFallback) {
        throw new Error(`Falha ao atribuir (${attempt.label}): ${detail || `status ${status ?? "desconhecido"}`}`);
      }
    }
  }

  throw new Error(`Falha ao atribuir profissional. Tentativas: ${failures.join(" | ")}`);
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
  const scheduledAt = `${payload.date}T${payload.time}:00`;
  const body = {
    lead_name: payload.lead_name,
    phone: payload.phone,
    contact_phone: payload.phone,
    procedure_name: payload.procedure_name,
    unit_name: payload.unit_name,
    professional_id: payload.professional_id,
    professional: payload.professional_id,
    preferred_period: payload.period,
    preferred_window: `${payload.date} - ${payload.period}`,
    scheduled_at: scheduledAt,
    status: "confirmed",
    booking_mode: "handoff_manual",
    conversation_bot_mode: "off",
    notes: payload.notes,
    source: "manual_dashboard",
    manual: true,
    vars_snapshot: {
      preferred_window: `${payload.date} - ${payload.period}`,
      chosen_slot: {
        start_at: scheduledAt,
        label: `${payload.date} às ${payload.time}`,
      },
    },
  };
  await fetchCsrf();
  try {
    const { data } = await api.post<BookingRequest>("/api/booking/requests/", body);
    return applyBookingProcedureNameOverride(((data as any)?.result ?? data) as BookingRequest);
  } catch (err: any) {
    const allow = err?.response?.headers?.allow ?? err?.response?.headers?.Allow;
    if (err?.response?.status === 405) {
      console.error("[createBooking] Backend recusou POST em /api/booking/requests/", {
        allow,
        body,
      });
      const localBooking = applyBookingProcedureNameOverride({
        id: -Date.now(),
        ...body,
        professional_name: `#${payload.professional_id}`,
        procedure_slug: payload.procedure_name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""),
        preferred_window: body.preferred_window,
        preferred_period: payload.period,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        chosen_slot: body.vars_snapshot.chosen_slot,
        vars_snapshot: body.vars_snapshot,
        confirmation: null,
      } as BookingRequest);
      persistManualBookingDraft(localBooking);
      return localBooking;
    }
    throw err;
  }
}
