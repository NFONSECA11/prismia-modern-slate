import api from "@/lib/api";

export interface PublicHoliday {
  holiday_date: string; // yyyy-MM-dd
  local_name: string;
  english_name: string;
  scope: string;
  state_code: string | null;
}

export async function fetchHolidays(year: number): Promise<PublicHoliday[]> {
  try {
    const { data } = await api.get("/api/holidays/", { params: { year } });
    console.log("[holidaysApi] Raw response for year", year, ":", data);
    const results = Array.isArray(data) ? data : (data?.results ?? data?.result ?? []);
    console.log("[holidaysApi] Parsed holidays:", results.length, "items. Sample:", results[0]);
    return Array.isArray(results) ? results : [];
  } catch (err) {
    console.warn("[holidaysApi] Failed to fetch holidays for year", year, err);
    return [];
  }
}

/** Build a lookup map: "yyyy-MM-dd" → PublicHoliday */
export function buildHolidayMap(holidays: PublicHoliday[]): Map<string, PublicHoliday> {
  const map = new Map<string, PublicHoliday>();
  for (const h of holidays) {
    if (h.holiday_date) map.set(h.holiday_date, h);
  }
  return map;
}
