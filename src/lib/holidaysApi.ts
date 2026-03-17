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
  if (!trimmed) return "";

  const isoMatch = trimmed.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch?.[1]) return isoMatch[1];

  const ymdSlashMatch = trimmed.match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
  if (ymdSlashMatch) return `${ymdSlashMatch[1]}-${ymdSlashMatch[2]}-${ymdSlashMatch[3]}`;

  const dmySlashMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmySlashMatch) return `${dmySlashMatch[3]}-${dmySlashMatch[2]}-${dmySlashMatch[1]}`;

  const dmyDashMatch = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmyDashMatch) return `${dmyDashMatch[3]}-${dmyDashMatch[2]}-${dmyDashMatch[1]}`;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return "";

  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function normalizeHoliday(raw: Record<string, unknown>): PublicHoliday | null {
  const holiday_date = normalizeHolidayDate(
    raw.holiday_date ?? raw.holidayDate ?? raw.date ?? raw.day ?? raw.holiday_day
  );
  if (!holiday_date) return null;

  const local_name = String(
    raw.local_name ?? raw.localName ?? raw.name ?? raw.title ?? raw.holiday_name ?? "Feriado"
  ).trim();

  const english_name = String(
    raw.english_name ?? raw.englishName ?? raw.name_en ?? ""
  ).trim();

  const scope = String(raw.scope ?? raw.type ?? (raw.global ? "national" : "state")).trim();

  const state_code_raw = raw.state_code ?? raw.stateCode ?? raw.county ?? raw.uf ?? null;
  const state_code = typeof state_code_raw === "string" && state_code_raw.trim()
    ? state_code_raw.trim()
    : null;

  return { holiday_date, local_name, english_name, scope, state_code };
}

function pickHolidayArray(data: any): any[] {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.result)) return data.result;
  if (Array.isArray(data?.holidays)) return data.holidays;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

async function fetchHolidayItems(params: Record<string, string | number>): Promise<any[] | null> {
  try {
    const { data } = await api.get("/api/holidays/", { params });
    return pickHolidayArray(data);
  } catch {
    return null;
  }
}

export async function fetchHolidays(year: number): Promise<PublicHoliday[]> {
  const attempts: Array<Record<string, string | number>> = [
    { year },
    { date_from: `${year}-01-01`, date_to: `${year}-12-31` },
    { from: `${year}-01-01`, to: `${year}-12-31` },
  ];

  let items: any[] = [];

  for (const params of attempts) {
    const responseItems = await fetchHolidayItems(params);
    if (responseItems === null) continue;
    if (responseItems.length > 0) {
      items = responseItems;
      break;
    }
    if (items.length === 0) items = responseItems;
  }

  const normalized = items
    .filter((item) => item && typeof item === "object")
    .map((item) => normalizeHoliday(item as Record<string, unknown>))
    .filter((item): item is PublicHoliday => Boolean(item));

  const unique = new Map<string, PublicHoliday>();
  for (const holiday of normalized) {
    unique.set(`${holiday.holiday_date}_${holiday.local_name}`, holiday);
  }

  return Array.from(unique.values());
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

