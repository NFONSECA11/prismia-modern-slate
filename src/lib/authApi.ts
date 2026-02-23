import api, { setInMemoryCsrfToken, setAuthToken } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────
export type UserRole = "owner" | "manager" | "agent" | "admin";

export interface Unit {
  id: number;
  name: string;
}

export interface Company {
  id: number;
  name: string;
}

export interface MeResponse {
  user: {
    id: number;
    username: string;
    email: string;
    first_name: string;
    last_name: string;
  };
  company: Company;
  role: UserRole;
  units: Unit[];
}

// ── CSRF bootstrap ──────────────────────────────────────────────────────────
export async function fetchCsrf(): Promise<string> {
  const { data } = await api.get("/api/auth/csrf/");
  const token = data?.result?.csrfToken ?? null;
  setInMemoryCsrfToken(token);
  return token!;
}

// ── Login (Token auth) ──────────────────────────────────────────────────────
export async function login(username: string, password: string): Promise<void> {
  await fetchCsrf();
  const { data } = await api.post("/api/auth/login/", { username, password });
  // DRF returns { key: "..." } or { token: "..." }
  const token = data?.token ?? data?.key ?? null;
  if (token) {
    setAuthToken(token);
    console.log("[Auth] Token stored successfully");
  } else {
    console.warn("[Auth] No token in login response, falling back to session auth", data);
  }
}

// ── Logout ───────────────────────────────────────────────────────────────────
export async function logout(): Promise<void> {
  await api.post("/api/auth/logout/");
  setAuthToken(null);
}

// ── Me (bootstrap) ──────────────────────────────────────────────────────────
export async function fetchMe(): Promise<MeResponse> {
  const { data } = await api.get<MeResponse>("/api/me/");
  return data;
}

// ── Password Reset ──────────────────────────────────────────────────────────
export async function requestPasswordReset(email: string): Promise<void> {
  await fetchCsrf();
  await api.post("/api/auth/password/reset/", { email });
}

export async function confirmPasswordReset(
  uid: string,
  token: string,
  new_password: string
): Promise<void> {
  await fetchCsrf();
  await api.post("/api/auth/password/reset/confirm/", { uid, token, new_password });
}
