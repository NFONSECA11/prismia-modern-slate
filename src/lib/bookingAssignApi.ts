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
  await fetchCsrf();

  // 1) Fetch all three lookups in parallel
  const [procSpecRes, profProcRes, unitProcRes, profRes] = await Promise.all([
    api.get("/api/settings/procedure-specialties/"),
    api.get("/api/settings/professional-procedures/"),
    api.get("/api/settings/unit-procedures/"),
    api.get("/api/booking/professionals/"),
  ]);

  const procSpecs: ProcedureSpecialtyItem[] = extractArray(procSpecRes.data);
  const profProcs: ProfessionalProcedureItem[] = extractArray(profProcRes.data);
  const unitProcs: UnitProcedureItem[] = extractArray(unitProcRes.data);
  const professionals: any[] = extractArray(profRes.data);

  const normalizedProcName = procedureName.trim().toLowerCase();

  // 2) Find specialty via procedure-specialties
  //    Match by procedure_name (case-insensitive)
  const matchedProcSpec = procSpecs.find(
    (ps) => (ps.procedure_name ?? "").trim().toLowerCase() === normalizedProcName
  );

  // 3) Find professional info
  const matchedProfessional = professionals.find((p: any) => p.id === professionalId);

  // 4) Find professional-procedure link (confirms the professional does this procedure)
  const matchedProfProc = profProcs.find(
    (pp) =>
      pp.professional === professionalId &&
      (pp.procedure_name ?? pp.procedure_slug ?? "").trim().toLowerCase() === normalizedProcName
  );

  // 5) Find unit-procedure link for procedure_code (the unit-procedure ID)
  const matchedUnitProc = unitProcs.find(
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

  console.log("[assignEnriched] Lookup results:", {
    procedureName,
    matchedProcSpec,
    matchedProfessional,
    matchedProfProc,
    matchedUnitProc,
    payload,
  });

  // 6) PATCH the booking
  await fetchCsrf();
  const { data } = await api.patch(`/api/booking/requests/${bookingId}/`, payload);
  const result = ((data as any)?.result ?? data) as BookingRequest;

  console.log("[assignEnriched] PATCH success:", result);
  return result;
}
