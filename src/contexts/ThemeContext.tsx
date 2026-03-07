import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type ThemeId = "dark-navy" | "soft-slate" | "light-clean";
export type BgMode = "solid" | "landscape";

interface ThemeContextType {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  bgMode: BgMode;
  setBgMode: (m: BgMode) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark-navy",
  setTheme: () => {},
  bgMode: "solid",
  setBgMode: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

const THEME_KEY = "prismia-theme";
const BG_KEY = "prismia-bg-mode";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === "dark-navy" || saved === "soft-slate" || saved === "light-clean") return saved;
    } catch {}
    return "dark-navy";
  });

  const [bgMode, setBgModeState] = useState<BgMode>(() => {
    try {
      const saved = localStorage.getItem(BG_KEY);
      if (saved === "solid" || saved === "landscape") return saved;
    } catch {}
    return "solid";
  });

  const setTheme = (t: ThemeId) => {
    setThemeState(t);
    try { localStorage.setItem(THEME_KEY, t); } catch {}
  };

  const setBgMode = (m: BgMode) => {
    setBgModeState(m);
    try { localStorage.setItem(BG_KEY, m); } catch {}
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, bgMode, setBgMode }}>
      {children}
    </ThemeContext.Provider>
  );
}
