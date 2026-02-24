import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { MeResponse, UserRole, Unit, Company, fetchMe, logout as apiLogout, login as apiLogin } from "@/lib/authApi";
import { setAuthToken } from "@/lib/api";

interface AuthState {
  user: MeResponse["user"] | null;
  company: Company | null;
  role: UserRole | null;
  units: Unit[];
  activeUnit: Unit | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

interface AuthContextType extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setActiveUnit: (unit: Unit) => void;
  canManage: boolean; // owner or manager
  bootstrap: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    company: null,
    role: null,
    units: [],
    activeUnit: null,
    isLoading: true,
    isAuthenticated: false,
  });

  const resolveRole = (me: MeResponse): UserRole | null => {
    if (me.role) return me.role;
    const u = me.user as any;
    if (u?.role) return u.role;
    if (u?.is_superuser || u?.is_staff) return "admin";
    return null;
  };

  const bootstrap = useCallback(async () => {
    try {
      const me = await fetchMe();
      console.log("[Auth] bootstrap fetchMe:", JSON.stringify(me));
      const units = me.units ?? [];
      const role = resolveRole(me);
      setState({
        user: me.user,
        company: me.company ?? null,
        role,
        units,
        activeUnit: units[0] ?? null,
        isLoading: false,
        isAuthenticated: true,
      });
    } catch {
      setState((s) => ({ ...s, isLoading: false, isAuthenticated: false }));
    }
  }, []);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const login = async (username: string, password: string) => {
    await apiLogin(username, password);
    // bootstrap must succeed after login — re-throw so Login page can show the error
    try {
      const me = await fetchMe();
      console.log("[Auth] fetchMe response:", JSON.stringify(me));
      const units = me.units ?? [];
      const role = resolveRole(me);
      setState({
        user: me.user,
        company: me.company ?? null,
        role,
        units,
        activeUnit: units[0] ?? null,
        isLoading: false,
        isAuthenticated: true,
      });
    } catch (err) {
      console.error("[Auth] bootstrap after login failed:", err);
      setState((s) => ({ ...s, isLoading: false, isAuthenticated: false }));
      throw new Error("Login realizado, mas não foi possível carregar os dados do usuário.");
    }
  };

  const logout = async () => {
    try {
      await apiLogout();
    } catch {
      // ignore
    }
    setAuthToken(null);
    setState({
      user: null,
      company: null,
      role: null,
      units: [],
      activeUnit: null,
      isLoading: false,
      isAuthenticated: false,
    });
  };

  const setActiveUnit = (unit: Unit) => {
    setState((s) => ({ ...s, activeUnit: unit }));
  };

  const canManage = state.role === "owner" || state.role === "manager" || state.role === "admin";
  console.log("[Auth] role:", JSON.stringify(state.role), "canManage:", canManage);

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        logout,
        setActiveUnit,
        canManage,
        bootstrap,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
