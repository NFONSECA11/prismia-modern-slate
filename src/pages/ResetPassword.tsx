import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { confirmPasswordReset } from "@/lib/authApi";
import { Sparkles, Loader2, CheckCircle2, AlertCircle, ArrowLeft, Eye, EyeOff } from "lucide-react";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const uid = params.get("uid") ?? "";
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    setLoading(true);
    try {
      await confirmPasswordReset(uid, token, password);
      setDone(true);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? err?.response?.data?.detail ?? "Link inválido ou expirado.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "hsl(var(--background))" }}>
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl gradient-primary shadow-lg glow-primary">
            <Sparkles className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-bold gradient-text">Nova Senha</h1>
        </div>

        <div className="rounded-2xl border border-border p-6 space-y-4 surface-raised shadow-md">
          {!uid || !token ? (
            <div className="text-center py-4 space-y-2">
              <AlertCircle className="h-8 w-8 text-status-canceled mx-auto" />
              <p className="text-sm text-foreground">Link inválido.</p>
              <p className="text-xs text-muted-foreground">Solicite um novo link de recuperação.</p>
            </div>
          ) : done ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="h-10 w-10 text-status-confirmed" />
              <p className="text-sm text-foreground font-medium">Senha alterada com sucesso!</p>
              <Link
                to="/login"
                className="text-xs text-primary hover:text-primary/80 transition-colors font-medium"
              >
                Fazer login →
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  Nova Senha
                </label>
                <div className="relative">
                  <input
                    type={showPw ? "text" : "password"}
                    autoFocus
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
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
                disabled={loading || !password}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loading ? "Salvando..." : "Redefinir Senha"}
              </button>
            </form>
          )}

          <div className="text-center pt-2">
            <Link to="/login" className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors">
              <ArrowLeft className="h-3 w-3" />
              Voltar ao login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
