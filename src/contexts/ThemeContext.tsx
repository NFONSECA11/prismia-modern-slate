import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type ThemeId = "night" | "slate" | "frost";
export type BgMode = "solid" | "landscape" | "gradient";

interface ThemeContextType {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  bgMode: BgMode;
  setBgMode: (m: BgMode) => void;
  bgVariant: number;
  setBgVariant: (v: number) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "slate",
  setTheme: () => {},
  bgMode: "solid",
  setBgMode: () => {},
  bgVariant: 0,
  setBgVariant: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

const THEME_KEY = "prismia-theme";
const BG_KEY = "prismia-bg-mode";
const BG_VARIANT_KEY = "prismia-bg-variant";

// Migration map for old theme IDs
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

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    try {
      return resolveTheme(localStorage.getItem(THEME_KEY));
    } catch {}
    return "slate";
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

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, bgMode, setBgMode, bgVariant, setBgVariant }}>
      {children}
    </ThemeContext.Provider>
  );
}
