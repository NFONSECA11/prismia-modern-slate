import axios from "axios";

const AUTH_TOKEN_STORAGE_KEYS = ["auth_token", "token", "authToken", "access", "access_token", "key"] as const;
const API_BASE_URL_STORAGE_KEY = "api_base_url_v2";

type RetryableRequestConfig = {
  __retriedApiBaseUrls?: string[];
};

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

const DEFAULT_API_BASE_URL = "https://edit-default-ambassador-hawaii.trycloudflare.com";
const FALLBACK_API_BASE_URLS = [DEFAULT_API_BASE_URL];

function normalizeApiBaseUrl(url: string): string {
  return url.trim().replace(/\.trycloudflare\.co(?=\/?$)/i, ".trycloudflare.com");
}

function isTryCloudflareUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".trycloudflare.com");
  } catch {
    return false;
  }
}

function readPersistedApiBaseUrl(): string | null {
  const persisted = localStorage.getItem(API_BASE_URL_STORAGE_KEY);
  return persisted ? normalizeApiBaseUrl(persisted) : null;
}

function isTrustedApiBaseUrl(url: string): boolean {
  const normalized = normalizeApiBaseUrl(url);
  return (
    !isTryCloudflareUrl(normalized) ||
    normalized === DEFAULT_API_BASE_URL ||
    normalized === rawEnvApiBaseUrl
  );
}

function persistApiBaseUrl(url: string) {
  localStorage.setItem(API_BASE_URL_STORAGE_KEY, normalizeApiBaseUrl(url));
}

const rawEnvApiBaseUrl = import.meta.env.VITE_API_BASE_URL
  ? normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL)
  : null;

const envApiBaseUrl = rawEnvApiBaseUrl && !isTryCloudflareUrl(rawEnvApiBaseUrl) ? rawEnvApiBaseUrl : null;

function resolveApiBaseUrl(): string {
  const persistedApiBaseUrl = readPersistedApiBaseUrl();

  if (persistedApiBaseUrl && !isTryCloudflareUrl(persistedApiBaseUrl)) {
    return persistedApiBaseUrl;
  }

  if (envApiBaseUrl) {
    return envApiBaseUrl;
  }

  if (isTryCloudflareUrl(DEFAULT_API_BASE_URL)) {
    if (persistedApiBaseUrl && persistedApiBaseUrl !== DEFAULT_API_BASE_URL) {
      localStorage.removeItem(API_BASE_URL_STORAGE_KEY);
    }
    return DEFAULT_API_BASE_URL;
  }

  return persistedApiBaseUrl ?? rawEnvApiBaseUrl ?? DEFAULT_API_BASE_URL;
}

function getApiBaseUrlCandidates(currentBaseUrl?: string | null): string[] {
  return Array.from(
    new Set(
      [currentBaseUrl, readPersistedApiBaseUrl(), rawEnvApiBaseUrl, ...FALLBACK_API_BASE_URLS]
        .filter((value): value is string => Boolean(value))
        .map(normalizeApiBaseUrl)
        .filter(isTrustedApiBaseUrl)
    )
  );
}

let resolvedApiBaseUrl = resolveApiBaseUrl();

// ── Axios instance ───────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: resolvedApiBaseUrl,
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
  const nextBaseUrl = normalizeApiBaseUrl(String(config.baseURL ?? resolvedApiBaseUrl));
  if (!isTrustedApiBaseUrl(nextBaseUrl)) {
    localStorage.removeItem(API_BASE_URL_STORAGE_KEY);
    resolvedApiBaseUrl = DEFAULT_API_BASE_URL;
    api.defaults.baseURL = DEFAULT_API_BASE_URL;
    config.baseURL = DEFAULT_API_BASE_URL;
  } else {
    config.baseURL = nextBaseUrl;
  }

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
    const successfulBaseUrl = normalizeApiBaseUrl(String(res.config?.baseURL ?? resolvedApiBaseUrl));
    resolvedApiBaseUrl = successfulBaseUrl;
    api.defaults.baseURL = successfulBaseUrl;
    persistApiBaseUrl(successfulBaseUrl);

    const contentType = String((res.headers as any)?.["content-type"] ?? "").toLowerCase();
    if (contentType.includes("text/html") && String(res.config?.url ?? "").includes("/api/")) {
      return Promise.reject(new Error("API retornou HTML em vez de JSON. Verifique se o túnel está ativo."));
    }
    return res;
  },
  (err) => {
    const config = (err?.config ?? {}) as typeof err.config & RetryableRequestConfig;
    const status = err?.response?.status;
    const contentType = String(err?.response?.headers?.["content-type"] ?? "").toLowerCase();
    const rawData = err?.response?.data;
    const isHtml =
      contentType.includes("text/html") ||
      (typeof rawData === "string" && /<!doctype|<html|<body/i.test(rawData));
    const isNetworkError = err?.code === "ERR_NETWORK";

    // 401 → redirect to login (skip if already on auth endpoints)
    const url = String(config?.url ?? "");
    if (status === 401 && !url.includes("/api/auth/")) {
      localStorage.removeItem("auth_token");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }

    if ((isNetworkError || isHtml) && url.includes("/api/")) {
      const triedBaseUrls = new Set(config.__retriedApiBaseUrls ?? []);
      const currentBaseUrl = normalizeApiBaseUrl(String(config.baseURL ?? resolvedApiBaseUrl));
      triedBaseUrls.add(currentBaseUrl);

      const nextBaseUrl = getApiBaseUrlCandidates(currentBaseUrl).find((candidate) => !triedBaseUrls.has(candidate));

      if (nextBaseUrl) {
        resolvedApiBaseUrl = nextBaseUrl;
        api.defaults.baseURL = nextBaseUrl;

        console.warn("[API] retrying with fallback base URL:", nextBaseUrl);

        return api.request({
          ...config,
          baseURL: nextBaseUrl,
          __retriedApiBaseUrls: [...triedBaseUrls],
        });
      }
    }

    const msg = isHtml
      ? `Túnel indisponível (${status ?? "sem status"})`
      : err?.response?.data?.detail ?? err?.response?.data?.error ?? err?.message ?? "Erro desconhecido";

    console.error("[API]", url, "→", status, msg, "baseURL:", config.baseURL ?? resolvedApiBaseUrl);
    return Promise.reject(err);
  }
);

export default api;
