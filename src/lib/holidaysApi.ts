import api from "@/lib/api";

export interface PublicHoliday {
  holiday_date: string; // yyyy-MM-dd
  local_name: string;
  english_name: string;
  scope: string;
  state_code: string | null;
}

function formatUTCDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addUTCDateDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function calculateEasterSundayUTC(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
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
  return formatUTCDate(parsed);
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

function collectHolidayRecords(payload: unknown): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const queue: unknown[] = [payload];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    if (Array.isArray(current)) {
      queue.push(...current);
      continue;
    }

    if (typeof current !== "object") continue;

    const obj = current as Record<string, unknown>;
    const hasDateLikeField =
      typeof obj.holiday_date === "string" ||
      typeof obj.holidayDate === "string" ||
      typeof obj.date === "string" ||
      typeof obj.day === "string" ||
      typeof obj.holiday_day === "string";

    if (hasDateLikeField) out.push(obj);

    for (const value of Object.values(obj)) {
      if (value && (Array.isArray(value) || typeof value === "object")) {
        queue.push(value);
      }
    }
  }

  return out;
}

function buildBrazilFallbackHolidays(year: number): PublicHoliday[] {
  const easterSunday = calculateEasterSundayUTC(year);

  const fixed = [
    ["01-01", "Confraternização Universal", "New Year's Day"],
    ["04-21", "Tiradentes", "Tiradentes Day"],
    ["05-01", "Dia do Trabalhador", "Labour Day"],
    ["09-07", "Independência do Brasil", "Independence Day"],
    ["10-12", "Nossa Senhora Aparecida", "Our Lady of Aparecida"],
    ["11-02", "Finados", "All Souls' Day"],
    ["11-15", "Proclamação da República", "Republic Proclamation Day"],
    ["11-20", "Dia da Consciência Negra", "Black Awareness Day"],
    ["12-25", "Natal", "Christmas Day"],
  ] as const;

  const movable = [
    {
      date: formatUTCDate(addUTCDateDays(easterSunday, -2)),
      local_name: "Sexta-feira Santa",
      english_name: "Good Friday",
    },
  ];

  return [
    ...fixed.map(([mmdd, local_name, english_name]) => ({
      holiday_date: `${year}-${mmdd}`,
      local_name,
      english_name,
      scope: "national",
      state_code: null,
    })),
    ...movable.map((item) => ({
      holiday_date: item.date,
      local_name: item.local_name,
      english_name: item.english_name,
      scope: "national",
      state_code: null,
    })),
  ];
}

async function fetchHolidayRecords(params: Record<string, string | number>): Promise<Record<string, unknown>[] | null> {
  try {
    const { data } = await api.get("/api/holidays/", { params });
    return collectHolidayRecords(data);
  } catch {
    return null;
  }
}

export async function fetchHolidays(year: number): Promise<PublicHoliday[]> {
  const attempts: Array<Record<string, string | number>> = [
    { year },
    { ano: year },
    { date_from: `${year}-01-01`, date_to: `${year}-12-31` },
    { from: `${year}-01-01`, to: `${year}-12-31` },
    { start_date: `${year}-01-01`, end_date: `${year}-12-31` },
  ];

  let apiRecords: Record<string, unknown>[] = [];

  for (const params of attempts) {
    const records = await fetchHolidayRecords(params);
    if (records === null) continue;
    if (records.length > 0) {
      apiRecords = records;
      break;
    }
    if (apiRecords.length === 0) apiRecords = records;
  }

  const normalizedApi = apiRecords
    .map((item) => normalizeHoliday(item))
    .filter((item): item is PublicHoliday => Boolean(item));

  const merged = [...normalizedApi, ...buildBrazilFallbackHolidays(year)];

  const unique = new Map<string, PublicHoliday>();
  for (const holiday of merged) {
    unique.set(`${holiday.holiday_date}_${holiday.local_name}`, holiday);
  }

  return Array.from(unique.values());
}

/** Build a lookup map: "yyyy-MM-dd" → PublicHoliday */
export function buildHolidayMap(holidays: PublicHoliday[]): Map<string, PublicHoliday> {
  const map = new Map<string, PublicHoliday>();
  for (const h of holidays) {
    const key = normalizeHolidayDate(h.holiday_date);
    if (key && !map.has(key)) map.set(key, h);
  }
  return map;
}
