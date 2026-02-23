import api from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────
export type UserRole = "owner" | "manager" | "agent";

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
export async function fetchCsrf(): Promise<void> {
  await api.get("/api/auth/csrf/");
}

// ── Login ────────────────────────────────────────────────────────────────────
export async function login(username: string, password: string): Promise<void> {
  await fetchCsrf();
  await api.post("/api/auth/login/", { username, password });
}

// ── Logout ───────────────────────────────────────────────────────────────────
export async function logout(): Promise<void> {
  await api.post("/api/auth/logout/");
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
