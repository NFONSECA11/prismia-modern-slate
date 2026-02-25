import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft, ChevronDown, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function Settings() {
  const { company, units, activeUnit } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showNewProfessional, setShowNewProfessional] = useState(false);
  const [newProfName, setNewProfName] = useState("");
  const [newProfCode, setNewProfCode] = useState("");

  const { data: bookingSettings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ["booking-settings", activeUnit?.id],
    queryFn: async () => {
      const { data } = await api.get(`/api/booking/booking-settings/by-unit/${activeUnit!.id}/`);
      return data?.result ?? data;
    },
    enabled: !!activeUnit?.id,
  });

  const { data: professionals = [], isLoading: isLoadingProfessionals } = useQuery({
    queryKey: ["professionals", activeUnit?.id],
    queryFn: async () => {
      const { data } = await api.get(`/api/booking/professionals/`, {
        params: { unit: activeUnit!.id },
      });
      return Array.isArray(data) ? data : (data?.results ?? []);
    },
    enabled: !!activeUnit?.id,
  });

  const createProfessional = useMutation({
    mutationFn: async (payload: { name: string; code?: string }) => {
      await fetchCsrf();
      const { data } = await api.post("/api/booking/professionals/", {
        ...payload,
        unit: activeUnit!.id,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["professionals", activeUnit?.id] });
      setShowNewProfessional(false);
      setNewProfName("");
      setNewProfCode("");
      toast.success("Profissional criado com sucesso");
    },
    onError: () => {
      toast.error("Erro ao criar profissional");
    },
  });

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
          <CollapsibleContent className="mt-2 rounded-xl border border-border p-4 space-y-1" style={{ background: "hsl(var(--surface))" }}>
            <div className="flex items-center justify-between px-3 py-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Nome</span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">ID</span>
            </div>
            <div className="flex items-center justify-between rounded-lg px-3 py-2 border border-border" style={{ background: "hsl(var(--surface-elevated))" }}>
              <span className="text-sm font-medium text-foreground">{company?.name ?? "—"}</span>
              <span className="text-xs text-muted-foreground">{company?.id ?? "—"}</span>
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
          <CollapsibleContent className="mt-2 rounded-xl border border-border p-4 space-y-1" style={{ background: "hsl(var(--surface))" }}>
            <div className="flex items-center justify-between px-3 py-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Nome</span>
              <div className="flex items-center gap-6">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground w-16 text-right">ID</span>
              </div>
            </div>
            {units.length === 0 ? (
              <p className="text-xs text-muted-foreground px-3">Nenhuma unidade encontrada.</p>
            ) : (
              units.map((unit) => {
                const u = unit as any;
                const isActive = activeUnit?.id === unit.id;
                return (
                  <div
                    key={unit.id}
                    className="flex items-center justify-between rounded-lg px-3 py-2 border border-border"
                    style={{ background: "hsl(var(--surface-elevated))" }}
                  >
                    <span className="text-sm font-medium text-foreground">{unit.name}</span>
                    <div className="flex items-center gap-6">
                      <span className={`text-xs font-medium ${u.status === "active" || u.is_active || isActive ? "text-green-400" : "text-muted-foreground"}`}>
                        {isActive ? "Ativa" : u.status === "active" || u.is_active ? "Ativa" : u.status !== undefined ? "Inativa" : "—"}
                      </span>
                      <span className="text-xs font-mono text-muted-foreground w-16 text-right">{unit.id}</span>
                    </div>
                  </div>
                );
              })
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Modo de Atendimento - dados reais (collapsible) */}
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated" style={{ background: "hsl(var(--surface))" }}>
            <div className="text-left">
              <span className="text-sm font-bold text-foreground">Modo de Atendimento</span>
              <p className="text-xs text-muted-foreground">Configurar modos e fluxos de atendimento</p>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 rounded-xl border border-border p-4 space-y-1" style={{ background: "hsl(var(--surface))" }}>
            <div className="flex items-center justify-between px-3 py-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Unidade</span>
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Modo</span>
            </div>
            {!activeUnit ? (
              <p className="text-xs text-muted-foreground px-3">Nenhuma unidade ativa selecionada.</p>
            ) : isLoadingSettings ? (
              <p className="text-xs text-muted-foreground px-3">Carregando…</p>
            ) : (
              <div className="flex items-center justify-between rounded-lg px-3 py-2 border border-border" style={{ background: "hsl(var(--surface-elevated))" }}>
                <span className="text-sm font-medium text-foreground">{activeUnit.name}</span>
                <span className="text-xs text-muted-foreground">
                  {bookingSettings?.default_booking_mode
                    ? {
                        handoff_manual: "Handoff Manual",
                        assisted_slots_dashboard: "Assistido (Dashboard)",
                        auto_slots_bot: "Automático (Bot)",
                      }[bookingSettings.default_booking_mode as string] ?? bookingSettings.default_booking_mode
                    : "—"}
                </span>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Profissionais */}
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated" style={{ background: "hsl(var(--surface))" }}>
            <div className="text-left">
              <span className="text-sm font-bold text-foreground">Profissionais</span>
              <p className="text-xs text-muted-foreground">Gerenciar profissionais da equipe</p>
            </div>
            <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 rounded-xl border border-border p-4 space-y-1" style={{ background: "hsl(var(--surface))" }}>
            <div className="flex items-center justify-between px-3 py-1">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Nome</span>
              <div className="flex items-center gap-6">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground w-16 text-right">Código</span>
              </div>
            </div>
            {!activeUnit ? (
              <p className="text-xs text-muted-foreground px-3">Nenhuma unidade ativa selecionada.</p>
            ) : isLoadingProfessionals ? (
              <p className="text-xs text-muted-foreground px-3">Carregando…</p>
            ) : professionals.length === 0 ? (
              <p className="text-xs text-muted-foreground px-3">Nenhum profissional encontrado.</p>
            ) : (
              professionals.map((prof: any) => (
                <div
                  key={prof.id}
                  className="flex items-center justify-between rounded-lg px-3 py-2 border border-border"
                  style={{ background: "hsl(var(--surface-elevated))" }}
                >
                  <span className="text-sm font-medium text-foreground">{prof.name}</span>
                  <div className="flex items-center gap-6">
                    <span className={`text-xs font-medium ${prof.is_active !== false && prof.status !== "inactive" ? "text-green-400" : "text-muted-foreground"}`}>
                      {prof.is_active !== false && prof.status !== "inactive" ? "Ativo" : "Inativo"}
                    </span>
                    <span className="text-xs font-mono text-muted-foreground w-16 text-right">{prof.code ?? prof.slug ?? "—"}</span>
                  </div>
                </div>
              ))
            )}

            {/* Criar profissional */}
            {showNewProfessional ? (
              <div className="flex items-center gap-2 pt-2">
                <Input
                  placeholder="Nome"
                  value={newProfName}
                  onChange={(e) => setNewProfName(e.target.value)}
                  className="h-8 text-sm flex-1"
                />
                <Input
                  placeholder="Código"
                  value={newProfCode}
                  onChange={(e) => setNewProfCode(e.target.value)}
                  className="h-8 text-sm w-24"
                />
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  disabled={!newProfName.trim() || createProfessional.isPending}
                  onClick={() => createProfessional.mutate({ name: newProfName.trim(), ...(newProfCode.trim() ? { code: newProfCode.trim() } : {}) })}
                >
                  {createProfessional.isPending ? "…" : "Salvar"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs"
                  onClick={() => { setShowNewProfessional(false); setNewProfName(""); setNewProfCode(""); }}
                >
                  Cancelar
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setShowNewProfessional(true)}
                className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors pt-2 px-3"
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar profissional
              </button>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Itens futuros */}
        <div className="grid gap-3">
          {[
            { label: "Logo da Empresa", description: "Upload e exibição do logo no dashboard" },
            { label: "Diagnóstico", description: "Verificar integrações e saúde do sistema" },
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
