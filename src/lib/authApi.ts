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
  const payload = data?.result ?? data;
  // Accept DRF token payloads in flat or wrapped format
  const token = payload?.token ?? payload?.key ?? payload?.auth_token ?? payload?.access ?? null;

  if (token) {
    setAuthToken(token);
    console.log("[Auth] Token stored successfully");
  } else {
    console.warn("[Auth] No token in login response, falling back to session auth", payload);
  }
}

// ── Logout ───────────────────────────────────────────────────────────────────
export async function logout(): Promise<void> {
  await api.post("/api/auth/logout/");
  setAuthToken(null);
}

// ── Me (bootstrap) ──────────────────────────────────────────────────────────
export async function fetchMe(): Promise<MeResponse> {
  const { data } = await api.get("/api/me/");
  // Handle wrapped response: { ok, result: { user, role, ... } }
  const payload = data?.result ?? data;

  const token =
    payload?.token ??
    payload?.key ??
    payload?.auth_token ??
    payload?.access ??
    payload?.user?.token ??
    payload?.user?.auth_token ??
    null;

  if (token) {
    setAuthToken(token);
  }

  return payload as MeResponse;
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
