import api from "@/lib/api";

export interface PublicHoliday {
  holiday_date: string; // yyyy-MM-dd
  local_name: string;
  english_name: string;
  scope: string;
  state_code: string | null;
}

function normalizeHolidayDate(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch?.[1]) return isoMatch[1];

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";

  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeHoliday(raw: Record<string, unknown>): PublicHoliday | null {
  const holiday_date = normalizeHolidayDate(
    raw.holiday_date ?? raw.holidayDate ?? raw.date ?? raw.day
  );
  if (!holiday_date) return null;

  const local_name = String(
    raw.local_name ?? raw.localName ?? raw.name ?? raw.title ?? "Feriado"
  ).trim();

  const english_name = String(
    raw.english_name ?? raw.englishName ?? raw.name ?? ""
  ).trim();

  const scope = String(raw.scope ?? raw.type ?? (raw.global ? "national" : "state")).trim();

  const state_code_raw = raw.state_code ?? raw.stateCode ?? raw.county ?? null;
  const state_code = typeof state_code_raw === "string" && state_code_raw.trim()
    ? state_code_raw.trim()
    : null;

  return {
    holiday_date,
    local_name,
    english_name,
    scope,
    state_code,
  };
}

function pickHolidayArray(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.result)) return data.result;
  if (Array.isArray(data?.holidays)) return data.holidays;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

export async function fetchHolidays(year: number): Promise<PublicHoliday[]> {
  try {
    const { data } = await api.get("/api/holidays/", { params: { year } });
    const items = pickHolidayArray(data);

    return items
      .filter((item) => item && typeof item === "object")
      .map((item) => normalizeHoliday(item as Record<string, unknown>))
      .filter((item): item is PublicHoliday => Boolean(item));
  } catch {
    return [];
  }
}

/** Build a lookup map: "yyyy-MM-dd" → PublicHoliday */
export function buildHolidayMap(holidays: PublicHoliday[]): Map<string, PublicHoliday> {
  const map = new Map<string, PublicHoliday>();
  for (const h of holidays) {
    const key = normalizeHolidayDate(h.holiday_date);
    if (key) map.set(key, h);
  }
  return map;
}

