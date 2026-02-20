import axios from "axios";

// Base Axios instance — aponta para o Django em Docker
const api = axios.create({
  baseURL: "http://localhost:8000",
  timeout: 10_000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// Interceptor: loga erros de rede de forma legível
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg = err?.response?.data?.detail ?? err?.message ?? "Erro desconhecido";
    console.error("[API]", err?.config?.url, "→", msg);
    return Promise.reject(err);
  }
);

export default api;
