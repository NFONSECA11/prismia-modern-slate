import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Settings() {
  const { company } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen" style={{ background: "hsl(var(--background))" }}>
      <header
        className="sticky top-0 z-30 flex items-center gap-3 px-6 py-3 border-b border-border"
        style={{ background: "hsl(var(--surface))" }}
      >
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-surface-elevated"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
        <div className="h-4 w-px bg-border" />
        <h1 className="text-sm font-bold text-foreground">Configurações</h1>
        {company && (
          <span className="text-xs text-muted-foreground">— {company.name}</span>
        )}
      </header>

      <main className="px-6 py-6 max-w-3xl mx-auto space-y-4">
        <p className="text-sm text-muted-foreground">
          Em breve você poderá gerenciar logo da empresa, profissionais, especialidades e mais.
        </p>

        <div className="grid gap-3">
          {[
            { label: "Logo da Empresa", description: "Upload e exibição do logo no dashboard" },
            { label: "Empresa", description: "Dados da empresa e informações gerais" },
            { label: "Unidades", description: "Gerenciar unidades e locais de atendimento" },
            { label: "Modo de Atendimento", description: "Configurar modos e fluxos de atendimento" },
            { label: "Diagnóstico", description: "Verificar integrações e saúde do sistema" },
            { label: "Profissionais", description: "Gerenciar profissionais da equipe" },
            { label: "Serviços & Mapeamentos", description: "Vincular serviços e configurar mapeamentos" },
            { label: "Agenda", description: "Configurar horários e disponibilidade" },
            { label: "Bloqueios", description: "Gerenciar bloqueios de horários e datas" },
            { label: "Roadmap", description: "Próximas funcionalidades em desenvolvimento" },
          ].map((item) => (
            <div
              key={item.label}
              className="flex items-center justify-between rounded-xl px-4 py-3 border border-border surface-raised"
            >
              <div>
                <span className="text-sm font-medium text-foreground">{item.label}</span>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
              <span className="text-[10px] text-muted-foreground bg-surface-elevated px-2 py-0.5 rounded-full border border-border">
                Em breve
              </span>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
