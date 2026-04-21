import { useEffect, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import {
  fetchPreferences,
  savePreference,
  themeFromBackend,
  themeToBackend,
  bgFromBackend,
  bgToBackend,
  touchLastAccess,
} from "@/lib/preferencesApi";

/**
 * Sits inside Auth + Theme providers.
 * Loads prefs once after auth bootstrap, applies them,
 * and watches for changes to auto-save.
 *
 * Uses a "server snapshot" approach instead of timing-based guards:
 * we track what the server last told us, and only save when the
 * UI state diverges from that snapshot.
 */
export default function PreferencesSyncer() {
  const { isAuthenticated, isLoading, units, activeUnit, setActiveUnit } = useAuth();
  const { theme, setTheme, bgMode, setBgMode, bgVariant, setBgVariant, accent, setAccent } = useTheme();

  const loaded = useRef(false);

  // Server-known values — saves only fire when UI diverges from these
  const serverTheme = useRef<string | null>(null);
  const serverBg = useRef<string | null>(null);
  const serverAccent = useRef<string | null>(null);
  const serverUnitId = useRef<number | null | undefined>(undefined); // undefined = not loaded yet

  // ── Reset when user logs out ────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      loaded.current = false;
      serverTheme.current = null;
      serverBg.current = null;
      serverAccent.current = null;
      sessionStorage.removeItem("prefs:last_view");
      sessionStorage.removeItem("prefs:last_date");
    }
  }, [isAuthenticated, isLoading]);

  // ── Load on auth ready ──────────────────────────────────────────────────
  useEffect(() => {
    if (isLoading || !isAuthenticated || loaded.current) return;
    loaded.current = true;

    // Clear stale session data before loading fresh prefs
    sessionStorage.removeItem("prefs:last_view");
    sessionStorage.removeItem("prefs:last_date");

    (async () => {
      try {
        console.log("[Prefs] fetching preferences…");
        const prefs = await fetchPreferences();
        console.log("[Prefs] loaded:", JSON.stringify(prefs));

        // Theme
        const t = themeFromBackend(prefs.theme);
        if (t) {
          serverTheme.current = themeToBackend(t); // store as backend key
          setTheme(t);
        }

        // Background
        const bg = bgFromBackend(prefs.background);
        if (bg) {
          serverBg.current = bgToBackend(bg.mode, bg.variant);
          setBgMode(bg.mode);
          setBgVariant(bg.variant);
        }

        // Accent
        if (prefs.accent) {
          serverAccent.current = prefs.accent;
          setAccent(prefs.accent as any);
        }

        // Unit — null/undefined explícito = "Todas as unidades"
        if (prefs.last_unit_id === null) {
          console.log("[Prefs] restoring: Todas as unidades");
          setActiveUnit(null);
        } else if (prefs.last_unit_id && units.length > 0) {
          const unit = units.find((u) => u.id === prefs.last_unit_id);
          if (unit) {
            console.log("[Prefs] restoring unit:", unit.id, unit.name);
            setActiveUnit(unit);
          }
        }

        // Registra o último acesso do usuário (não bloqueante)
        touchLastAccess();

        // Store last_view and last_date for Index to pick up
        if (prefs.last_view) {
          sessionStorage.setItem("prefs:last_view", prefs.last_view);
        }
        if (prefs.last_date) {
          sessionStorage.setItem("prefs:last_date", prefs.last_date);
        }
      } catch (err) {
        console.warn("[Prefs] failed to load:", err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isLoading]);

  // ── Watch theme changes ─────────────────────────────────────────────────
  useEffect(() => {
    if (!loaded.current) return;
    const backendVal = themeToBackend(theme);
    if (backendVal !== serverTheme.current) {
      console.log("[Prefs] theme changed:", serverTheme.current, "→", backendVal);
      serverTheme.current = backendVal;
      savePreference({ theme: backendVal });
    }
  }, [theme]);

  // ── Watch background changes ────────────────────────────────────────────
  useEffect(() => {
    if (!loaded.current) return;
    const backendVal = bgToBackend(bgMode, bgVariant);
    if (backendVal !== serverBg.current) {
      console.log("[Prefs] bg changed:", serverBg.current, "→", backendVal);
      serverBg.current = backendVal;
      savePreference({ background: backendVal });
    }
  }, [bgMode, bgVariant]);

  // ── Watch accent changes ────────────────────────────────────────────────
  useEffect(() => {
    if (!loaded.current) return;
    if (accent !== serverAccent.current) {
      console.log("[Prefs] accent changed:", serverAccent.current, "→", accent);
      serverAccent.current = accent;
      savePreference({ accent });
    }
  }, [accent]);

  return null;
}
