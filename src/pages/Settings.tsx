import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

export default function Settings() {
  const { company, units, activeUnit } = useAuth();
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

        {/* Empresa - dados reais (collapsible) */}
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated" style={{ background: "hsl(var(--surface))" }}>
            <div className="text-left">
              <span className="text-sm font-bold text-foreground">Empresa</span>
              <p className="text-xs text-muted-foreground">Dados da empresa e informações gerais</p>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>svg>&]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 rounded-xl border border-border p-4 space-y-2" style={{ background: "hsl(var(--surface))" }}>
            <div className="flex items-center justify-between rounded-lg px-3 py-2 border border-border" style={{ background: "hsl(var(--surface-elevated))" }}>
              <span className="text-xs text-muted-foreground">Nome</span>
              <span className="text-sm font-medium text-foreground">{company?.name ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg px-3 py-2 border border-border" style={{ background: "hsl(var(--surface-elevated))" }}>
              <span className="text-xs text-muted-foreground">ID</span>
              <span className="text-sm font-medium text-foreground">{company?.id ?? "—"}</span>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Unidades - dados reais (collapsible) */}
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated" style={{ background: "hsl(var(--surface))" }}>
            <div className="text-left">
              <span className="text-sm font-bold text-foreground">Unidades</span>
              <p className="text-xs text-muted-foreground">Gerenciar unidades e locais de atendimento</p>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 space-y-2">
            {units.length === 0 ? (
              <p className="text-xs text-muted-foreground px-4 py-3">Nenhuma unidade encontrada.</p>
            ) : (
              units.map((unit) => {
                const u = unit as any;
                const isActive = activeUnit?.id === unit.id;
                return (
                  <div
                    key={unit.id}
                    className="rounded-xl border border-border p-4 space-y-2"
                    style={{ background: "hsl(var(--surface))" }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{unit.name}</span>
                      {isActive && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/25">
                          Unidade ativa
                        </span>
                      )}
                    </div>
                    <div className="grid gap-1.5">
                      <div className="flex items-center justify-between rounded-lg px-3 py-2 border border-border" style={{ background: "hsl(var(--surface-elevated))" }}>
                        <span className="text-xs text-muted-foreground">ID</span>
                        <span className="text-xs font-mono text-foreground">{unit.id}</span>
                      </div>
                      {u.timezone && (
                        <div className="flex items-center justify-between rounded-lg px-3 py-2 border border-border" style={{ background: "hsl(var(--surface-elevated))" }}>
                          <span className="text-xs text-muted-foreground">Timezone</span>
                          <span className="text-xs text-foreground">{u.timezone}</span>
                        </div>
                      )}
                      {u.status !== undefined && (
                        <div className="flex items-center justify-between rounded-lg px-3 py-2 border border-border" style={{ background: "hsl(var(--surface-elevated))" }}>
                          <span className="text-xs text-muted-foreground">Status</span>
                          <span className={`text-xs font-medium ${u.status === "active" || u.is_active ? "text-green-400" : "text-muted-foreground"}`}>
                            {u.status === "active" || u.is_active ? "Ativa" : "Inativa"}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Itens futuros */}
        <div className="grid gap-3">
          {[
            { label: "Logo da Empresa", description: "Upload e exibição do logo no dashboard" },
            
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
