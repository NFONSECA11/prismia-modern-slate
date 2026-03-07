import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type ThemeId = "dark-navy" | "soft-slate" | "light-clean";

interface ThemeContextType {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "dark-navy",
  setTheme: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

const STORAGE_KEY = "prismia-theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "dark-navy" || saved === "soft-slate" || saved === "light-clean") return saved;
    } catch {}
    return "dark-navy";
  });

  const setTheme = (t: ThemeId) => {
    setThemeState(t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch {}
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
