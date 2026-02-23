import axios from "axios";

// Base Axios instance — aponta para o Django em Docker
const api = axios.create({
  baseURL: "https://sports-reduction-completing-bacteria.trycloudflare.com",
  timeout: 10_000,
  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: "Token 79ca14e2ccad8be2417242cce0a9c2729c737875",
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
