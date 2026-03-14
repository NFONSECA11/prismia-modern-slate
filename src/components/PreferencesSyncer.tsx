import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import {
  fetchPreferences,
  savePreference,
  themeFromBackend,
  themeToBackend,
  bgFromBackend,
  bgToBackend,
} from "@/lib/preferencesApi";

/**
 * Sits inside Auth + Theme providers.
 * Loads prefs once after auth bootstrap, applies them,
 * and watches for changes to auto-save.
 */
export default function PreferencesSyncer() {
  const { isAuthenticated, isLoading, units, setActiveUnit } = useAuth();
  const { theme, setTheme, bgMode, setBgMode, bgVariant, setBgVariant, accent, setAccent } = useTheme();

  const loaded = useRef(false);
  // Skip the first change events that come from applying loaded prefs
  const applying = useRef(false);

  // ── Load on auth ready ──────────────────────────────────────────────────
  useEffect(() => {
    if (isLoading || !isAuthenticated || loaded.current) return;
    loaded.current = true;

    (async () => {
      try {
        const prefs = await fetchPreferences();
        console.log("[Prefs] loaded:", prefs);
        applying.current = true;

        // Theme
        const t = themeFromBackend(prefs.theme);
        if (t && t !== theme) setTheme(t);

        // Background
        const bg = bgFromBackend(prefs.background);
        if (bg) {
          if (bg.mode !== bgMode) setBgMode(bg.mode);
          if (bg.variant !== bgVariant) setBgVariant(bg.variant);
        }

        // Accent
        if (prefs.accent && prefs.accent !== accent) {
          setAccent(prefs.accent as any);
        }

        // Unit
        if (prefs.last_unit_id && units.length > 0) {
          const unit = units.find((u) => u.id === prefs.last_unit_id);
          if (unit) setActiveUnit(unit);
        }

        // Store last_view and last_date for Index to pick up
        if (prefs.last_view) {
          sessionStorage.setItem("prefs:last_view", prefs.last_view);
        }
        if (prefs.last_date) {
          sessionStorage.setItem("prefs:last_date", prefs.last_date);
        }

        // Small delay so the watchers below don't treat applied values as user changes
        setTimeout(() => {
          applying.current = false;
        }, 600);
      } catch (err) {
        console.warn("[Prefs] failed to load:", err);
        applying.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isLoading]);

  // ── Watch theme changes ─────────────────────────────────────────────────
  const prevTheme = useRef(theme);
  useEffect(() => {
    if (applying.current || !loaded.current) return;
    if (theme !== prevTheme.current) {
      prevTheme.current = theme;
      savePreference({ theme: themeToBackend(theme) });
    }
  }, [theme]);

  // ── Watch background changes ────────────────────────────────────────────
  const prevBg = useRef(`${bgMode}-${bgVariant}`);
  useEffect(() => {
    if (applying.current || !loaded.current) return;
    const key = `${bgMode}-${bgVariant}`;
    if (key !== prevBg.current) {
      prevBg.current = key;
      savePreference({ background: bgToBackend(bgMode, bgVariant) });
    }
  }, [bgMode, bgVariant]);

  // ── Watch accent changes ────────────────────────────────────────────────
  const prevAccent = useRef(accent);
  useEffect(() => {
    if (applying.current || !loaded.current) return;
    if (accent !== prevAccent.current) {
      prevAccent.current = accent;
      savePreference({ accent });
    }
  }, [accent]);

  return null;
}
