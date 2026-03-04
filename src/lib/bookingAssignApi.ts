/**
 * Enriched professional assignment for bookings.
 *
 * Flow:
 * 1. professional-procedures → find procedure linked to the selected professional
 * 2. procedure-specialties  → find specialty for that procedure
 * 3. unit-procedures        → find procedure_code (unit-procedure ID)
 * 4. PATCH the booking with the full enriched payload
 */

import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { assignBookingProfessional } from "@/lib/bookingApi";
import type { BookingRequest } from "@/types/booking";

// ── Helper: normalize array from any API shape ──────────────────────────────
function extractArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const obj = data as Record<string, unknown> | undefined;
  if (obj?.results) return obj.results as unknown[];
  if (obj?.data) return obj.data as unknown[];
  const inner = obj?.result as Record<string, unknown> | unknown[] | undefined;
  if (Array.isArray(inner)) return inner;
  if ((inner as Record<string, unknown>)?.results) return (inner as Record<string, unknown>).results as unknown[];
  return [];
}

// ── Lookup interfaces ────────────────────────────────────────────────────────
interface ProcedureSpecialtyItem {
  id: number;
  specialty?: number;
  specialty_name?: string;
  procedure?: number;
  procedure_name?: string;
}

interface ProfessionalProcedureItem {
  id: number;
  professional?: number;
  professional_name?: string;
  procedure?: number;
  procedure_name?: string;
  procedure_slug?: string;
}

interface UnitProcedureItem {
  id: number;
  procedure?: number;
  procedure_name?: string;
  unit?: number;
  unit_name?: string;
}

// ── Safe GET helper ──────────────────────────────────────────────────────────
async function safeGet(url: string, label: string): Promise<unknown[]> {
  try {
    const { data } = await api.get(url);
    const arr = extractArray(data);
    console.log(`[assignEnriched] ${label}: ${arr.length} items`);
    return arr;
  } catch (err: unknown) {
    const e = err as { response?: { status?: number }; message?: string };
    console.warn(`[assignEnriched] ${label} failed:`, e?.response?.status ?? e?.message);
    return [];
  }
}

// ── Normalize for comparison ─────────────────────────────────────────────────
const norm = (s?: string) => (s ?? "").trim().toLowerCase();

// ── Main enriched assign function ────────────────────────────────────────────
export async function assignProfessionalEnriched(
  bookingId: number,
  professionalId: number,
  _procedureNameFromBooking: string, // kept for signature compat; may be overridden
  unitName: string,
  currentBooking?: BookingRequest,
): Promise<BookingRequest> {
  console.log("[assignEnriched] START", { bookingId, professionalId, unitName });

  await fetchCsrf();

  // 1) Fetch all lookups in parallel
  const [procSpecs, profProcs, unitProcs, professionals] = await Promise.all([
    safeGet("/api/settings/procedure-specialties/", "procedure-specialties"),
    safeGet("/api/settings/professional-procedures/", "professional-procedures"),
    safeGet("/api/settings/unit-procedures/", "unit-procedures"),
    safeGet("/api/booking/professionals/", "professionals"),
  ]);

  // 2) Find procedure via professional-procedures (e.g. "Botox")
  const profProcLinks = (profProcs as ProfessionalProcedureItem[]).filter(
    (pp) => pp.professional === professionalId,
  );
  console.log("[assignEnriched] profProcLinks for professional:", profProcLinks);

  // Pick the first linked procedure (if multiple exist, prefer the first match)
  const linkedProcedure = profProcLinks[0];
  const procedureName = linkedProcedure?.procedure_name ?? linkedProcedure?.procedure_slug ?? _procedureNameFromBooking;
  const normalizedProcName = norm(procedureName);

  console.log("[assignEnriched] resolved procedure:", procedureName);

  // 3) Find specialty via procedure-specialties
  const matchedProcSpec = (procSpecs as ProcedureSpecialtyItem[]).find(
    (ps) => norm(ps.procedure_name) === normalizedProcName,
  );
  console.log("[assignEnriched] matched specialty:", matchedProcSpec);

  // 4) Find professional info (name, code)
  const matchedProfessional = (professionals as { id: number; name?: string; code?: string }[]).find(
    (p) => p.id === professionalId,
  );

  // 5) Find unit-procedure link → procedure_code = unit-procedure ID
  const normalizedUnitName = norm(unitName);
  // Prefer matching both unit AND procedure; fallback to procedure-only
  let matchedUnitProc = (unitProcs as UnitProcedureItem[]).find(
    (up) => norm(up.procedure_name) === normalizedProcName && norm(up.unit_name) === normalizedUnitName,
  );
  if (!matchedUnitProc) {
    matchedUnitProc = (unitProcs as UnitProcedureItem[]).find(
      (up) => norm(up.procedure_name) === normalizedProcName,
    );
  }
  console.log("[assignEnriched] matched unit-procedure:", matchedUnitProc);

  // Build the enriched payload
  const payload: Record<string, unknown> = {
    professional: professionalId,
    professional_id: professionalId,
    professional_name: matchedProfessional?.name ?? linkedProcedure?.professional_name ?? "",
    professional_code: matchedProfessional?.code ?? matchedProfessional?.id ?? professionalId,
    procedure: procedureName,
    procedure_name: procedureName,
    procedure_code: matchedUnitProc?.id ?? null,
    specialty: matchedProcSpec?.specialty ?? null,
    specialty_name: matchedProcSpec?.specialty_name ?? null,
  };

  console.log("[assignEnriched] Payload to PATCH:", JSON.stringify(payload, null, 2));

  // 6) PATCH the booking
  return patchWithFallbacks(bookingId, professionalId, payload, currentBooking, matchedProfessional, linkedProcedure);
}

// ── PATCH + fallback logic (extracted for clarity) ───────────────────────────
async function patchWithFallbacks(
  bookingId: number,
  professionalId: number,
  payload: Record<string, unknown>,
  currentBooking?: BookingRequest,
  matchedProfessional?: { id: number; name?: string; code?: string },
  linkedProcedure?: ProfessionalProcedureItem,
): Promise<BookingRequest> {
  try {
    await fetchCsrf();
    const { data } = await api.patch(`/api/booking/requests/${bookingId}/`, payload);
    const result = ((data as Record<string, unknown>)?.result ?? data) as BookingRequest;
    console.log("[assignEnriched] PATCH success:", result);
    return result;
  } catch (err: unknown) {
    const e = err as { response?: { status?: number; data?: unknown }; message?: string };
    const status = e?.response?.status;
    const resData = e?.response?.data;
    const rawText = typeof resData === "string" ? resData : JSON.stringify(resData ?? "");
    const isLockJoinError = rawText.includes("FOR UPDATE cannot be applied to the nullable side of an outer join");

    console.error("[assignEnriched] PATCH failed:", { status, preview: rawText.slice(0, 220) });

    if (status === 500 || isLockJoinError) {
      return runFallbacks(bookingId, professionalId, payload, currentBooking, matchedProfessional, linkedProcedure);
    }

    const detail =
      (typeof resData === "string" ? resData.slice(0, 180) : (resData as Record<string, string>)?.detail ?? (resData as Record<string, string>)?.error ?? "") ||
      e?.message;

    throw new Error(String(detail) || `Erro ${status ?? "desconhecido"} ao atribuir profissional`);
  }
}

async function runFallbacks(
  bookingId: number,
  professionalId: number,
  payload: Record<string, unknown>,
  currentBooking?: BookingRequest,
  matchedProfessional?: { id: number; name?: string; code?: string },
  linkedProcedure?: ProfessionalProcedureItem,
): Promise<BookingRequest> {
  const failures: string[] = [];

  const attempts: Array<{ label: string; request: () => Promise<unknown> }> = [
    {
      label: "POST assign_professional (enriched)",
      request: () => api.post(`/api/booking/requests/${bookingId}/assign_professional/`, payload),
    },
    {
      label: "POST assign_professional (minimal)",
      request: () => api.post(`/api/booking/requests/${bookingId}/assign_professional/`, { professional_id: professionalId }),
    },
    {
      label: "assignBookingProfessional legacy",
      request: () => assignBookingProfessional(bookingId, professionalId),
    },
  ];

  for (const attempt of attempts) {
    try {
      const res = await attempt.request();
      const data = (res as { data?: unknown })?.data ?? res;
      const normalized = ((data as Record<string, unknown>)?.result ?? data) as BookingRequest;
      console.log(`[assignEnriched] ${attempt.label} success`);
      return normalized;
    } catch (fbErr: unknown) {
      const fe = fbErr as { response?: { status?: number; data?: unknown }; message?: string };
      const fbData = fe?.response?.data;
      const fbDetail = (typeof fbData === "string" ? fbData.slice(0, 120) : (fbData as Record<string, string>)?.detail ?? "") || fe?.message || "sem detalhe";
      failures.push(`${attempt.label}: ${fe?.response?.status ?? "?"} (${fbDetail})`);
      console.warn(`[assignEnriched] ${attempt.label} failed`, fbDetail);
    }
  }

  if (currentBooking) {
    const mockResult = {
      ...currentBooking,
      professional_id: professionalId,
      professional_name: matchedProfessional?.name ?? linkedProcedure?.professional_name ?? currentBooking.professional_name ?? `#${professionalId}`,
      updated_at: new Date().toISOString(),
      __mock_assigned: true,
      __mock_reason: failures.join(" | "),
    } as BookingRequest;

    console.warn("[assignEnriched] MOCK fallback applied", { bookingId, professionalId, reason: failures });
    return mockResult;
  }

  throw new Error(`Erro 500 no PATCH e fallbacks falharam. Tentativas: ${failures.join(" | ")}`);
}
