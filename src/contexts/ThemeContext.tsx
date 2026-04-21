import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type ThemeId = "night" | "slate" | "frost";
export type BgMode = "solid" | "gradient" | "landscape";
export type AccentId = "deep-blue" | "coral" | "teal";

interface ThemeContextType {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  bgMode: BgMode;
  setBgMode: (m: BgMode) => void;
  bgVariant: number;
  setBgVariant: (v: number) => void;
  accent: AccentId;
  setAccent: (a: AccentId) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "slate",
  setTheme: () => {},
  bgMode: "solid",
  setBgMode: () => {},
  bgVariant: 0,
  setBgVariant: () => {},
  accent: "deep-blue",
  setAccent: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

const THEME_KEY = "prismia-theme";
const BG_KEY = "prismia-bg-mode";
const BG_VARIANT_KEY = "prismia-bg-variant";
const ACCENT_KEY = "prismia-accent";

const THEME_MIGRATION: Record<string, ThemeId> = {
  "dark-navy": "night",
  "soft-slate": "slate",
  "light-clean": "frost",
};

function resolveTheme(saved: string | null): ThemeId {
  if (!saved) return "slate";
  if (saved === "night" || saved === "slate" || saved === "frost") return saved;
  if (THEME_MIGRATION[saved]) return THEME_MIGRATION[saved];
  return "slate";
}

function resolveAccent(saved: string | null): AccentId {
  if (saved === "deep-blue" || saved === "coral" || saved === "teal") return saved;
  return "deep-blue";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    try { return resolveTheme(localStorage.getItem(THEME_KEY)); } catch {} return "slate";
  });

  const [bgMode, setBgModeState] = useState<BgMode>(() => {
    try {
      const saved = localStorage.getItem(BG_KEY);
      if (saved === "solid" || saved === "landscape" || saved === "gradient") return saved;
    } catch {}
    return "solid";
  });

  const [bgVariant, setBgVariantState] = useState<number>(() => {
    try {
      const saved = localStorage.getItem(BG_VARIANT_KEY);
      if (saved !== null) return Number(saved) || 0;
    } catch {}
    return 0;
  });

  const [accent, setAccentState] = useState<AccentId>(() => {
    try { return resolveAccent(localStorage.getItem(ACCENT_KEY)); } catch {} return "deep-blue";
  });

  const setTheme = (t: ThemeId) => {
    setThemeState(t);
    setBgVariantState(0);
    try {
      localStorage.setItem(THEME_KEY, t);
      localStorage.setItem(BG_VARIANT_KEY, "0");
    } catch {}
  };

  const setBgMode = (m: BgMode) => {
    setBgModeState(m);
    setBgVariantState(0);
    try {
      localStorage.setItem(BG_KEY, m);
      localStorage.setItem(BG_VARIANT_KEY, "0");
    } catch {}
  };

  const setBgVariant = (v: number) => {
    setBgVariantState(v);
    try { localStorage.setItem(BG_VARIANT_KEY, String(v)); } catch {}
  };

  const setAccent = (a: AccentId) => {
    setAccentState(a);
    try { localStorage.setItem(ACCENT_KEY, a); } catch {}
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-accent", accent);
  }, [accent]);

  useEffect(() => {
    // Map (theme, bgMode, bgVariant) → data-background tokens defined in index.css
    let token: string | null = null;
    if (theme === "night") {
      if (bgMode === "solid") {
        token = ["solid-night", "solid-abissal", "solid-steel"][bgVariant] ?? "solid-night";
      } else if (bgMode === "gradient") {
        token = ["gradient-fumaca", "gradient-aurora", "gradient-nevoa"][bgVariant] ?? "gradient-fumaca";
      }
    } else if (theme === "slate") {
      if (bgMode === "solid") {
        token = ["solid-deep-blue", "solid-grafite", "solid-petroleo"][bgVariant] ?? "solid-deep-blue";
      }
    }
    if (token) {
      document.documentElement.setAttribute("data-background", token);
    } else {
      document.documentElement.removeAttribute("data-background");
    }
  }, [theme, bgMode, bgVariant]);

  // Override ONLY --background when user picks a solid swatch in the Night theme.
  // Does not touch --topbar-bg, --surface, --surface-raised, --surface-elevated, etc.
  useEffect(() => {
    const NIGHT_SOLID_BACKGROUNDS = ["216 65% 7%", "240 3% 9%", "200 40% 8%"];
    const FROST_SOLID_BACKGROUNDS = ["220 30% 98%", "30 17% 95%", "213 33% 95%"];
    const FROST_GRADIENTS = [
      "linear-gradient(135deg, #ffffff 0%, #a8c8e8 100%)",
      "linear-gradient(135deg, #f5f0eb 0%, #b8c8e0 100%)",
      "linear-gradient(135deg, #e8f0fa 0%, #6b9fd4 100%)",
    ];
    const SLATE_GRADIENTS = [
      "linear-gradient(135deg, #1e3a5f 0%, #0a1929 100%)",
      "linear-gradient(135deg, #2d3748 0%, #111827 100%)",
      "linear-gradient(135deg, #1a3a4a 0%, #0d2030 100%)",
    ];
    if (theme === "night" && bgMode === "solid") {
      const value = NIGHT_SOLID_BACKGROUNDS[bgVariant] ?? NIGHT_SOLID_BACKGROUNDS[0];
      document.documentElement.style.setProperty("--background", value);
    } else if (theme === "frost" && bgMode === "solid") {
      const value = FROST_SOLID_BACKGROUNDS[bgVariant] ?? FROST_SOLID_BACKGROUNDS[0];
      document.documentElement.style.setProperty("--background", value);
    } else {
      document.documentElement.style.removeProperty("--background");
    }

    // Gradients: apply via --gradient-bg (body uses background-image: var(--gradient-bg))
    if (theme === "frost" && bgMode === "gradient") {
      const value = FROST_GRADIENTS[bgVariant] ?? FROST_GRADIENTS[0];
      document.documentElement.style.setProperty("--gradient-bg", value);
    } else if (theme === "slate" && bgMode === "gradient") {
      const value = SLATE_GRADIENTS[bgVariant] ?? SLATE_GRADIENTS[0];
      document.documentElement.style.setProperty("--gradient-bg", value);
    } else if (theme !== "night") {
      // Night uses CSS-defined --gradient-bg via [data-background]; only clear inline for non-night
      document.documentElement.style.removeProperty("--gradient-bg");
    } else {
      document.documentElement.style.removeProperty("--gradient-bg");
    }
  }, [theme, bgMode, bgVariant]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, bgMode, setBgMode, bgVariant, setBgVariant, accent, setAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}
