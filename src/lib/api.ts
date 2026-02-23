import axios from "axios";

// Helper to read a cookie by name
function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(^| )${name}=([^;]+)`));
  return match ? decodeURIComponent(match[2]) : null;
}

// Base Axios instance — session/cookie auth (same domain in production)
const api = axios.create({
  baseURL: "https://sports-reduction-completing-bacteria.trycloudflare.com",
  timeout: 10_000,
  withCredentials: true, // envia cookies (sessionid, csrftoken)
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// Interceptor: inject CSRF token + Referer on mutating requests
api.interceptors.request.use((config) => {
  const method = (config.method ?? "get").toLowerCase();
  if (["post", "put", "patch", "delete"].includes(method)) {
    const csrf = getCookie("csrftoken");
    if (csrf) {
      config.headers["X-CSRFToken"] = csrf;
    }
    // Referer — some Django CSRF middleware checks it
    config.headers["Referer"] = window.location.origin + "/";
  }
  return config;
});

// Interceptor: log errors + redirect on 401
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err?.response?.status;
    const msg = err?.response?.data?.detail ?? err?.response?.data?.error ?? err?.message ?? "Erro desconhecido";
    console.error("[API]", err?.config?.url, "→", status, msg);

    // 401 = session expired → redirect to login
    if (status === 401 && !err?.config?.url?.includes("/auth/")) {
      window.location.href = "/login";
    }

    return Promise.reject(err);
  }
);

export default api;
