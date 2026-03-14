import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import type { ThemeId, BgMode, AccentId } from "@/contexts/ThemeContext";

// ── Backend ↔ Frontend mappings ──────────────────────────────────────────────

const THEME_TO_BACKEND: Record<ThemeId, string> = { night: "night", slate: "deep", frost: "light" };
const THEME_FROM_BACKEND: Record<string, ThemeId> = { night: "night", deep: "slate", light: "frost" };

export function themeToBackend(t: ThemeId): string {
  return THEME_TO_BACKEND[t] ?? "deep";
}

export function themeFromBackend(t: string | null | undefined): ThemeId | null {
  if (!t) return null;
  return THEME_FROM_BACKEND[t] ?? null;
}

// Backend valid maximums per mode
const BG_MAX: Record<string, number> = { solid: 2, gradient: 2, landscape: 2 };

/** Convert frontend bgMode+bgVariant (0-based) → backend string like "solid-1" */
export function bgToBackend(mode: BgMode, variant: number): string {
  const max = BG_MAX[mode] ?? 2;
  const clamped = Math.min(variant + 1, max);
  return `${mode}-${clamped}`;
}

/** Convert backend "solid-1" → { mode, variant (0-based) } */
export function bgFromBackend(bg: string | null | undefined): { mode: BgMode; variant: number } | null {
  if (!bg) return null;
  const match = bg.match(/^(solid|gradient|landscape)-(\d+)$/);
  if (!match) return null;
  return { mode: match[1] as BgMode, variant: Math.max(0, Number(match[2]) - 1) };
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface UserPreferences {
  theme: string;
  background: string;
  accent: string;
  last_unit_id: number | null;
  last_route: string | null;
  sidebar_open: boolean;
  last_view: "table" | "agenda";
  last_date: string | null;
  default_filters: Record<string, unknown>;
  locale: string;
  timezone: string;
  notifications_enabled: boolean;
  updated_at: string;
}

// ── API calls ────────────────────────────────────────────────────────────────

export async function fetchPreferences(): Promise<UserPreferences> {
  const { data } = await api.get("/api/user-preferences/");
  return (data?.result ?? data) as UserPreferences;
}

export async function patchPreferences(
  partial: Partial<Omit<UserPreferences, "updated_at">>
): Promise<UserPreferences> {
  await fetchCsrf();
  const { data } = await api.patch("/api/user-preferences/", partial);
  return (data?.result ?? data) as UserPreferences;
}

// ── Debounced saver (merges fields, single timer) ────────────────────────────

let _pending: Record<string, unknown> = {};
let _timer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 500;

export function savePreference(fields: Record<string, unknown>) {
  _pending = { ..._pending, ...fields };
  if (_timer) clearTimeout(_timer);
  _timer = setTimeout(async () => {
    const payload = { ..._pending };
    _pending = {};
    _timer = null;
    try {
      console.log("[Prefs] saving:", JSON.stringify(payload));
      await patchPreferences(payload as any);
      console.log("[Prefs] saved OK");
    } catch (err: any) {
      const resp = err?.response?.data;
      console.warn("[Prefs] failed to save:", JSON.stringify(resp ?? err?.message));
      // If batch failed, retry each field individually so one bad field doesn't block others
      if (resp && Object.keys(payload).length > 1) {
        for (const [key, value] of Object.entries(payload)) {
          try {
            await patchPreferences({ [key]: value } as any);
            console.log("[Prefs] individual save OK:", key);
          } catch {
            console.warn("[Prefs] individual save failed:", key);
          }
        }
      }
    }
  }, DEBOUNCE_MS);
}
