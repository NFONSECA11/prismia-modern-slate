import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type ThemeId = "night" | "slate" | "frost";
export type BgMode = "solid" | "gradient" | "landscape";
export type AccentId = "deep-blue" | "coral" | "teal";

// Color groups — 3 áreas independentes do tema base.
// "default" = herda do tema atual (sem override).
export type Group1Id = "default" | "dark" | "light" | "blue";
export type Group2Id = "default" | "dark" | "light" | "soft";
export type Group3Id = "default" | "dark" | "light" | "midnight";

interface ThemeContextType {
  theme: ThemeId;
  setTheme: (t: ThemeId) => void;
  bgMode: BgMode;
  setBgMode: (m: BgMode) => void;
  bgVariant: number;
  setBgVariant: (v: number) => void;
  accent: AccentId;
  setAccent: (a: AccentId) => void;
  group1: Group1Id;
  setGroup1: (g: Group1Id) => void;
  group2: Group2Id;
  setGroup2: (g: Group2Id) => void;
  group3: Group3Id;
  setGroup3: (g: Group3Id) => void;
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
  group1: "default",
  setGroup1: () => {},
  group2: "default",
  setGroup2: () => {},
  group3: "default",
  setGroup3: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

const THEME_KEY = "prismia-theme";
const BG_KEY = "prismia-bg-mode";
const BG_VARIANT_KEY = "prismia-bg-variant";
const ACCENT_KEY = "prismia-accent";
const G1_KEY = "prismia-group1";
const G2_KEY = "prismia-group2";
const G3_KEY = "prismia-group3";

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

function resolveGroup1(saved: string | null): Group1Id {
  if (saved === "dark" || saved === "light" || saved === "blue" || saved === "default") return saved;
  return "default";
}
function resolveGroup2(saved: string | null): Group2Id {
  if (saved === "dark" || saved === "light" || saved === "soft" || saved === "default") return saved;
  return "default";
}
function resolveGroup3(saved: string | null): Group3Id {
  if (saved === "dark" || saved === "light" || saved === "midnight" || saved === "default") return saved;
  return "default";
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

  const [group1, setGroup1State] = useState<Group1Id>(() => {
    try { return resolveGroup1(localStorage.getItem(G1_KEY)); } catch {} return "default";
  });
  const [group2, setGroup2State] = useState<Group2Id>(() => {
    try { return resolveGroup2(localStorage.getItem(G2_KEY)); } catch {} return "default";
  });
  const [group3, setGroup3State] = useState<Group3Id>(() => {
    try { return resolveGroup3(localStorage.getItem(G3_KEY)); } catch {} return "default";
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

  const setGroup1 = (g: Group1Id) => {
    setGroup1State(g);
    try { localStorage.setItem(G1_KEY, g); } catch {}
  };
  const setGroup2 = (g: Group2Id) => {
    setGroup2State(g);
    try { localStorage.setItem(G2_KEY, g); } catch {}
  };
  const setGroup3 = (g: Group3Id) => {
    setGroup3State(g);
    try { localStorage.setItem(G3_KEY, g); } catch {}
  };

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-accent", accent);
  }, [accent]);

  // ── Apply color groups to <html> as data-attributes ───────────────────
  useEffect(() => {
    const root = document.documentElement;
    if (group1 === "default") root.removeAttribute("data-group1");
    else root.setAttribute("data-group1", group1);
  }, [group1]);

  useEffect(() => {
    const root = document.documentElement;
    if (group2 === "default") root.removeAttribute("data-group2");
    else root.setAttribute("data-group2", group2);
  }, [group2]);

  useEffect(() => {
    const root = document.documentElement;
    if (group3 === "default") root.removeAttribute("data-group3");
    else root.setAttribute("data-group3", group3);
  }, [group3]);

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
    const FROST_SOLID_BACKGROUNDS = ["0 0% 100%", "30 17% 95%", "213 33% 95%"];
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
    <ThemeContext.Provider value={{
      theme, setTheme,
      bgMode, setBgMode,
      bgVariant, setBgVariant,
      accent, setAccent,
      group1, setGroup1,
      group2, setGroup2,
      group3, setGroup3,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}
