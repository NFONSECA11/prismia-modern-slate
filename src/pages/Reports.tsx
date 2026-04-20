import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { useEffect } from "react";

export default function Reports() {
  const navigate = useNavigate();
  const { canManage, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && !canManage) navigate("/", { replace: true });
  }, [isLoading, canManage, navigate]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-surface">
        <div className="max-w-[1440px] mx-auto px-6 py-3 flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-surface-elevated"
            title="Voltar"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Voltar
          </button>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h1 className="text-sm font-semibold tracking-tight">Relatórios</h1>
          </div>
        </div>
      </header>

      <main className="max-w-[1440px] mx-auto px-6 py-10">
        <div
          className="rounded-2xl border border-border p-10 text-center"
          style={{ background: "hsl(var(--surface))" }}
        >
          <BarChart3 className="h-10 w-10 text-primary mx-auto mb-4" />
          <h2 className="text-lg font-semibold mb-2">Em construção</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Esta área receberá os relatórios da operação (agendamentos por período,
            produtividade por profissional, conversão do bot, confirmações etc).
          </p>
        </div>
      </main>
    </div>
  );
}
