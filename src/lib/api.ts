import axios from "axios";

// ── Token storage ────────────────────────────────────────────────────────────
let _authToken: string | null = localStorage.getItem("auth_token");

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
  baseURL: "https://invalid-legacy-medications-begins.trycloudflare.com",
  timeout: 10_000,
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// Interceptor: inject Auth Token + CSRF on mutating requests
api.interceptors.request.use((config) => {
  // Always add Token auth if available
  if (_authToken) {
    config.headers["Authorization"] = `Token ${_authToken}`;
  }

  const method = (config.method ?? "get").toLowerCase();
  if (["post", "put", "patch", "delete"].includes(method)) {
    const csrf = _inMemoryCsrfToken || getCookie("csrftoken");
    if (csrf) {
      config.headers["X-CSRFToken"] = csrf;
    }
    config.headers["Referer"] = window.location.origin + "/";
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
