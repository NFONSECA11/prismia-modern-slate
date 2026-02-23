import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Sparkles, Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(username, password);
      navigate("/", { replace: true });
    } catch (err: any) {
      const msg =
        err?.response?.data?.error ??
        err?.response?.data?.detail ??
        err?.response?.data?.non_field_errors?.[0] ??
        "Credenciais inválidas. Verifique usuário e senha.";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "hsl(var(--background))" }}>
      <div className="w-full max-w-sm space-y-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl gradient-primary shadow-lg glow-primary">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold gradient-text">PrismIA</h1>
            <p className="text-xs text-muted-foreground mt-1">Dashboard Operacional</p>
          </div>
        </div>

        {/* Card */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-border p-6 space-y-4 surface-raised shadow-md"
        >
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Usuário
            </label>
            <input
              type="text"
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="seu.usuario"
              className="w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-surface text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/60 focus:border-primary/60 transition-all"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Senha
            </label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2.5 pr-10 text-sm rounded-lg border border-border bg-surface text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/60 focus:border-primary/60 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg px-3 py-2 bg-status-canceled-bg border border-status-canceled/30 text-status-canceled text-xs animate-fade-in">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !username || !password}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? "Entrando..." : "Entrar"}
          </button>

          <div className="text-center">
            <Link
              to="/forgot-password"
              className="text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Esqueci minha senha
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
