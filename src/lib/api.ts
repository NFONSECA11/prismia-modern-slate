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
  baseURL: "https://ruling-lions-sir-formed.trycloudflare.com",
  timeout: 30_000,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
    // Evita keep-alive que causa "Bad request syntax ('0')" no túnel Cloudflare
    Connection: "close",
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

// Interceptor: sanitize tunnel errors + handle 401/403
api.interceptors.response.use(
  (res) => {
    const contentType = String((res.headers as any)?.["content-type"] ?? "").toLowerCase();
    if (contentType.includes("text/html") && String(res.config?.url ?? "").includes("/api/")) {
      return Promise.reject(new Error("API retornou HTML em vez de JSON. Verifique se o túnel está ativo."));
    }
    return res;
  },
  (err) => {
    const status = err?.response?.status;
    const contentType = String(err?.response?.headers?.["content-type"] ?? "").toLowerCase();
    const rawData = err?.response?.data;
    const isHtml =
      contentType.includes("text/html") ||
      (typeof rawData === "string" && /<!doctype|<html|<body/i.test(rawData));

    // 401 → redirect to login (skip if already on auth endpoints)
    const url = String(err?.config?.url ?? "");
    if (status === 401 && !url.includes("/api/auth/")) {
      localStorage.removeItem("auth_token");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }

    const msg = isHtml
      ? `Túnel indisponível (${status ?? "sem status"})`
      : err?.response?.data?.detail ?? err?.response?.data?.error ?? err?.message ?? "Erro desconhecido";

    console.error("[API]", url, "→", status, msg);
    return Promise.reject(err);
  }
);

export default api;
