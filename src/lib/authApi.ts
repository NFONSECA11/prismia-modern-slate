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
    name?: string;
  };
  company: Company;
  role: UserRole;
  units: Unit[];
}

// ── Managed user (for user management) ──────────────────────────────────────
export interface ManagedUser {
  membership_id: number;
  user_id: number;
  username: string;
  email: string;
  name: string;
  company_id: number;
  role: UserRole;
  all_units: boolean;
  membership_is_active: boolean;
  user_is_active: boolean;
  unit_ids: number[];
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

// ── User Management API ─────────────────────────────────────────────────────
export async function fetchUsers(): Promise<ManagedUser[]> {
  const { data } = await api.get("/api/settings/users/?status=all");
  const payload = data?.results ?? data?.result ?? data;
  return Array.isArray(payload) ? payload : [];
}

export async function createUser(payload: {
  username: string;
  email: string;
  password: string;
  role: UserRole;
  unit_ids: number[];
}): Promise<ManagedUser> {
  await fetchCsrf();
  const { data } = await api.post("/api/settings/users/", payload);
  return data?.result ?? data;
}

export async function fetchUserDetail(membershipId: number): Promise<ManagedUser> {
  const { data } = await api.get(`/api/settings/users/${membershipId}/`);
  return data?.result ?? data;
}

export async function updateUser(
  membershipId: number,
  payload: Partial<{
    username: string;
    email: string;
    password: string;
    role: UserRole;
    unit_ids: number[];
  }>
): Promise<ManagedUser> {
  await fetchCsrf();
  const { data } = await api.patch(`/api/settings/users/${membershipId}/`, payload);
  return data?.result ?? data;
}

export async function deactivateUser(membershipId: number): Promise<void> {
  await fetchCsrf();
  await api.post(`/api/settings/users/${membershipId}/deactivate/`);
}

export async function reactivateUser(membershipId: number): Promise<void> {
  await fetchCsrf();
  await api.post(`/api/settings/users/${membershipId}/reactivate/`);
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
