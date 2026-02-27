import axios from "axios";

const AUTH_TOKEN_STORAGE_KEYS = ["auth_token", "token", "authToken", "access", "access_token", "key"] as const;

function readPersistedAuthToken(): string | null {
  for (const key of AUTH_TOKEN_STORAGE_KEYS) {
    const token = localStorage.getItem(key);
    if (token) {
      if (key !== "auth_token") {
        localStorage.setItem("auth_token", token);
      }
      return token;
    }
  }
  return null;
}

// ── Token storage ────────────────────────────────────────────────────────────
let _authToken: string | null = readPersistedAuthToken();

export function setAuthToken(token: string | null) {
  _authToken = token;
  if (token) {
    localStorage.setItem("auth_token", token);
  } else {
    localStorage.removeItem("auth_token");
  }
}

export function getAuthToken(): string | null {
  return _authToken;
}

// ── CSRF (kept as fallback for specific endpoints) ───────────────────────────
let _inMemoryCsrfToken: string | null = null;
export function setInMemoryCsrfToken(token: string | null) {
  _inMemoryCsrfToken = token;
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

// ── Axios instance ───────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: "https://facts-rainbow-improvement-supply.trycloudflare.com",
  timeout: 10_000,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

function buildAuthHeader(token: string) {
  return token.includes(".") ? `Bearer ${token}` : `Token ${token}`;
}

// Interceptor: inject Auth Token + CSRF on mutating requests
api.interceptors.request.use((config) => {
  const token = _authToken || readPersistedAuthToken();
  if (token) {
    _authToken = token;
    const hasAuthorization = Boolean((config.headers as any)?.Authorization || (config.headers as any)?.authorization);
    if (!hasAuthorization) {
      (config.headers as any)["Authorization"] = buildAuthHeader(token);
    }
  }

  const method = (config.method ?? "get").toLowerCase();
  if (["post", "put", "patch", "delete"].includes(method)) {
    const csrf = _inMemoryCsrfToken || getCookie("csrftoken");
    if (csrf) {
      (config.headers as any)["X-CSRFToken"] = csrf;
    }
    (config.headers as any)["Referer"] = window.location.origin + "/";
  }
  return config;
});

// Interceptor: log errors
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status;
    const msg = err?.response?.data?.detail ?? err?.response?.data?.error ?? err?.message ?? "Erro desconhecido";
    console.error("[API]", err?.config?.url, "→", status, msg);
    return Promise.reject(err);
  }
);

export default api;
