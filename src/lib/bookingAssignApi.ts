/**
 * Enriched professional assignment for bookings.
 *
 * Flow:
 * 1. Look up the procedure in procedure-specialties → get Specialty
 * 2. Look up the professional in professional-procedures → get Professional details
 * 3. Look up the procedure in unit-procedures → get Procedure code (unit-procedure ID)
 * 4. PATCH the booking with the full enriched payload
 */

import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { assignBookingProfessional } from "@/lib/bookingApi";
import type { BookingRequest } from "@/types/booking";

// ── Helper: normalize array from any API shape ──────────────────────────────
function extractArray(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (data?.results) return data.results;
  if (data?.data) return data.data;
  const inner = data?.result;
  if (Array.isArray(inner)) return inner;
  if (inner?.results) return inner.results;
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

// ── Main enriched assign function ────────────────────────────────────────────
export async function assignProfessionalEnriched(
  bookingId: number,
  professionalId: number,
  procedureName: string,
  unitName: string
): Promise<BookingRequest> {
  console.log("[assignEnriched] START", { bookingId, professionalId, procedureName, unitName });
  
  await fetchCsrf();

  // 1) Fetch all lookups in parallel — tolerate individual failures
  const safeGet = async (url: string, label: string, params?: Record<string, any>): Promise<any[]> => {
    try {
      const { data } = await api.get(url, params ? { params } : undefined);
      const arr = extractArray(data);
      console.log(`[assignEnriched] ${label}: ${arr.length} items`);
      return arr;
    } catch (err: any) {
      console.warn(`[assignEnriched] ${label} failed:`, err?.response?.status ?? err?.message);
      return [];
    }
  };

  const [procSpecs, profProcs, unitProcs, professionals] = await Promise.all([
    safeGet("/api/settings/procedure-specialties/", "procedure-specialties"),
    safeGet("/api/settings/professional-procedures/", "professional-procedures"),
    safeGet("/api/settings/unit-procedures/", "unit-procedures"),
    safeGet("/api/booking/professionals/", "professionals"),
  ]);

  const normalizedProcName = procedureName.trim().toLowerCase();

  // 2) Find specialty via procedure-specialties
  const matchedProcSpec = (procSpecs as ProcedureSpecialtyItem[]).find(
    (ps) => (ps.procedure_name ?? "").trim().toLowerCase() === normalizedProcName
  );

  // 3) Find professional info
  const matchedProfessional = professionals.find((p: any) => p.id === professionalId);

  // 4) Find professional-procedure link
  const matchedProfProc = (profProcs as ProfessionalProcedureItem[]).find(
    (pp) =>
      pp.professional === professionalId &&
      (pp.procedure_name ?? pp.procedure_slug ?? "").trim().toLowerCase() === normalizedProcName
  );

  // 5) Find unit-procedure link for procedure_code
  const matchedUnitProc = (unitProcs as UnitProcedureItem[]).find(
    (up) => (up.procedure_name ?? "").trim().toLowerCase() === normalizedProcName
  );

  // Build the enriched payload
  const payload: Record<string, unknown> = {
    professional: professionalId,
    professional_id: professionalId,
    professional_name: matchedProfessional?.name ?? matchedProfProc?.professional_name ?? "",
    professional_code: matchedProfessional?.code ?? matchedProfessional?.id ?? professionalId,
    procedure: procedureName,
    procedure_name: procedureName,
    procedure_code: matchedUnitProc?.id ?? null,
    specialty: matchedProcSpec?.specialty ?? null,
    specialty_name: matchedProcSpec?.specialty_name ?? null,
  };

  console.log("[assignEnriched] Payload to PATCH:", JSON.stringify(payload, null, 2));

  // 6) PATCH the booking (primary path)
  try {
    await fetchCsrf();
    const { data } = await api.patch(`/api/booking/requests/${bookingId}/`, payload);
    const result = ((data as any)?.result ?? data) as BookingRequest;
    console.log("[assignEnriched] PATCH success:", result);
    return result;
  } catch (err: any) {
    const status = err?.response?.status;
    const resData = err?.response?.data;
    const errMsg = err?.message ?? "";
    const rawText = typeof resData === "string" ? resData : JSON.stringify(resData ?? "");
    const isLockJoinError = rawText.includes("FOR UPDATE cannot be applied to the nullable side of an outer join");

    console.error("[assignEnriched] PATCH failed:", {
      status,
      message: errMsg,
      preview: rawText.slice(0, 220),
    });

    // Backend 500 known issue: fallback to dedicated assignment endpoint strategies
    if (status === 500 || isLockJoinError) {
      const fallbackFailures: string[] = [];

      const attempts: Array<{ label: string; request: () => Promise<any> }> = [
        {
          label: "POST assign_professional (enriched)",
          request: () => api.post(`/api/booking/requests/${bookingId}/assign_professional/`, payload),
        },
        {
          label: "POST assign_professional (minimal)",
          request: () =>
            api.post(`/api/booking/requests/${bookingId}/assign_professional/`, {
              professional_id: professionalId,
            }),
        },
        {
          label: "assignBookingProfessional legacy fallback",
          request: () => assignBookingProfessional(bookingId, professionalId),
        },
      ];

      for (const attempt of attempts) {
        try {
          const res = await attempt.request();
          const data = (res as any)?.data ?? res;
          const normalized = ((data as any)?.result ?? data) as BookingRequest;
          console.log(`[assignEnriched] ${attempt.label} success`);
          return normalized;
        } catch (fallbackErr: any) {
          const fbStatus = fallbackErr?.response?.status;
          const fbData = fallbackErr?.response?.data;
          const fbDetail =
            (typeof fbData === "string" ? fbData.slice(0, 120) : fbData?.detail ?? fbData?.error ?? "") ||
            fallbackErr?.message ||
            "sem detalhe";

          fallbackFailures.push(`${attempt.label}: ${fbStatus ?? "sem_status"} (${fbDetail})`);
          console.warn(`[assignEnriched] ${attempt.label} failed`, { status: fbStatus, detail: fbDetail });
        }
      }

      throw new Error(
        `Erro 500 no PATCH e fallbacks falharam. Tentativas: ${fallbackFailures.join(" | ")}`
      );
    }

    const detail =
      (typeof resData === "string" ? resData.slice(0, 180) : resData?.detail ?? resData?.error ?? resData?.message ?? "") ||
      errMsg;

    throw new Error(detail || `Erro ${status ?? "desconhecido"} ao atribuir profissional`);
  }
}
