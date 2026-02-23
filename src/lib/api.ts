import axios from "axios";

// Helper to read a cookie by name
function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

// Base Axios instance — session/cookie auth (same domain in production)
const api = axios.create({
  baseURL: "https://inclusion-flying-registration-angels.trycloudflare.com",
  timeout: 10_000,
  withCredentials: true, // envia cookies (sessionid, csrftoken)
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// In-memory CSRF token store (set by authApi.fetchCsrf)
let _inMemoryCsrfToken: string | null = null;
export function setInMemoryCsrfToken(token: string | null) {
  _inMemoryCsrfToken = token;
}

// Interceptor: inject CSRF token + Referer on mutating requests
api.interceptors.request.use((config) => {
  const method = (config.method ?? "get").toLowerCase();
  if (["post", "put", "patch", "delete"].includes(method)) {
    // Prefer in-memory token (works cross-origin where cookies are blocked)
    const csrf = _inMemoryCsrfToken || getCookie("csrftoken");
    if (csrf) {
      config.headers["X-CSRFToken"] = csrf;
    }
    // Referer — some Django CSRF middleware checks it
    config.headers["Referer"] = window.location.origin + "/";
  }
  return config;
});

// Interceptor: log errors (no auto-redirect — AuthProvider handles 401 gracefully)
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
