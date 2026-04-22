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
  const {
    theme, setTheme,
    bgMode, setBgMode,
    bgVariant, setBgVariant,
    accent, setAccent,
    group1, setGroup1,
    group2, setGroup2,
    group3, setGroup3,
  } = useTheme();

  const loaded = useRef(false);

  // Server-known values — saves only fire when UI diverges from these
  const serverTheme = useRef<string | null>(null);
  const serverBg = useRef<string | null>(null);
  const serverAccent = useRef<string | null>(null);
  const serverUnitId = useRef<number | null | undefined>(undefined); // undefined = not loaded yet
  const serverGroup1 = useRef<string | null>(null);
  const serverGroup2 = useRef<string | null>(null);
  const serverGroup3 = useRef<string | null>(null);

  // ── Reset when user logs out ────────────────────────────────────────────
  useEffect(() => {
    if (!isAuthenticated && !isLoading) {
      loaded.current = false;
      serverTheme.current = null;
      serverBg.current = null;
      serverAccent.current = null;
      serverUnitId.current = undefined;
      serverGroup1.current = null;
      serverGroup2.current = null;
      serverGroup3.current = null;
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

        // Color groups (campos opcionais — backend pode não retornar ainda)
        const g1 = (prefs as any).color_group1;
        if (g1) { serverGroup1.current = g1; setGroup1(g1); }
        const g2 = (prefs as any).color_group2;
        if (g2) { serverGroup2.current = g2; setGroup2(g2); }
        const g3 = (prefs as any).color_group3;
        if (g3) { serverGroup3.current = g3; setGroup3(g3); }

        // Unit — null/undefined explícito = "Todas as unidades"
        serverUnitId.current = prefs.last_unit_id ?? null;
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

  // ── Watch active unit changes (auto-save fallback) ──────────────────────
  useEffect(() => {
    if (!loaded.current) return;
    const newId = activeUnit?.id ?? null;
    if (newId !== serverUnitId.current) {
      console.log("[Prefs] unit changed:", serverUnitId.current, "→", newId);
      serverUnitId.current = newId;
      savePreference({ last_unit_id: newId });
    }
  }, [activeUnit]);

  // ── Watch color group changes ───────────────────────────────────────────
  useEffect(() => {
    if (!loaded.current) return;
    if (group1 !== serverGroup1.current) {
      console.log("[Prefs] group1 changed:", serverGroup1.current, "→", group1);
      serverGroup1.current = group1;
      savePreference({ color_group1: group1 });
    }
  }, [group1]);

  useEffect(() => {
    if (!loaded.current) return;
    if (group2 !== serverGroup2.current) {
      console.log("[Prefs] group2 changed:", serverGroup2.current, "→", group2);
      serverGroup2.current = group2;
      savePreference({ color_group2: group2 });
    }
  }, [group2]);

  useEffect(() => {
    if (!loaded.current) return;
    if (group3 !== serverGroup3.current) {
      console.log("[Prefs] group3 changed:", serverGroup3.current, "→", group3);
      serverGroup3.current = group3;
      savePreference({ color_group3: group3 });
    }
  }, [group3]);

  return null;
}
