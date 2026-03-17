import { useState } from "react";
import { Link } from "react-router-dom";
import { requestPasswordReset } from "@/lib/authApi";
import { Loader2, CheckCircle2, AlertCircle, ArrowLeft } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err: any) {
      setError(err?.response?.data?.error ?? "Erro ao enviar. Tente novamente.");
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
          <h1 className="text-xl font-bold gradient-text">Recuperar Senha</h1>
        </div>

        <div className="rounded-2xl border border-border p-6 space-y-4 surface-raised shadow-md">
          {sent ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 className="h-10 w-10 text-status-confirmed" />
              <p className="text-sm text-foreground font-medium">
                Se o e-mail estiver cadastrado, você receberá um link de recuperação.
              </p>
              <p className="text-xs text-muted-foreground">Verifique sua caixa de entrada e spam.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-xs text-muted-foreground text-center">
                Informe seu e-mail e enviaremos um link para redefinir sua senha.
              </p>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                  E-mail
                </label>
                <input
                  type="email"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full px-3 py-2.5 text-sm rounded-lg border border-border bg-surface text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/60 focus:border-primary/60 transition-all"
                />
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-lg px-3 py-2 bg-status-canceled-bg border border-status-canceled/30 text-status-canceled text-xs animate-fade-in">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !email}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loading ? "Enviando..." : "Enviar link de recuperação"}
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
