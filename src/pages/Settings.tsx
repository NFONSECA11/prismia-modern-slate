import { useAuth } from "@/contexts/AuthContext";
import { useTheme, ThemeId, BgMode, AccentId } from "@/contexts/ThemeContext";
import { ArrowLeft, ChevronDown, Plus, Trash2, Palette, Image, Square, Check, Building2, MapPin, Users, Settings2, Activity, Layers } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import bgDarkNavy from "@/assets/bg-dark-navy.jpg";
import bgDarkNavy2 from "@/assets/bg-dark-navy-2.jpg";
import bgDarkNavy3 from "@/assets/bg-dark-navy-3.jpg";
import bgDarkNavy4 from "@/assets/bg-dark-navy-4.jpg";
import bgSoftSlate from "@/assets/bg-soft-slate.jpg";
import bgSoftSlate2 from "@/assets/bg-soft-slate-2.jpg";
import bgSoftSlate3 from "@/assets/bg-soft-slate-3.jpg";
import bgSoftSlate4 from "@/assets/bg-soft-slate-4.jpg";
import bgLightClean from "@/assets/bg-light-clean.jpg";
import bgLightClean2 from "@/assets/bg-light-clean-2.jpg";
import bgLightClean3 from "@/assets/bg-light-clean-3.jpg";
import bgLightClean4 from "@/assets/bg-light-clean-4.jpg";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

import DiagnosticCard from "@/components/DiagnosticCard";
// ProfessionalProceduresSection removed
import ProceduresByUnitSection from "@/components/ProceduresByUnitSection";
import SpecialtiesSection from "@/components/SpecialtiesSection";
import ScheduleBlocksSection from "@/components/ScheduleBlocksSection";
import ServicesByProfessionalSection from "@/components/ServicesByProfessionalSection";
import ProfessionalAvailabilitySection from "@/components/ProfessionalAvailabilitySection";
import ServiceCategoriesSection from "@/components/ServiceCategoriesSection";
import ProceduresByUnitLinkSection from "@/components/ProceduresByUnitLinkSection";

export default function Settings() {
  const { company, units, activeUnit } = useAuth();
  const { theme, setTheme, bgMode, setBgMode, bgVariant, setBgVariant } = useTheme();

  const solidVariants: Record<ThemeId, { label: string; color: string }[]> = {
    "night": [
      { label: "Azul Profundo", color: "215 63% 7%" },
      { label: "Carvão", color: "220 15% 10%" },
      { label: "Púrpura Noturno", color: "260 30% 8%" },
    ],
    "slate": [
      { label: "Deep Blue", color: "216 50% 12%" },
      { label: "Cinza Quente", color: "220 15% 16%" },
      { label: "Aço Frio", color: "210 15% 18%" },
    ],
    "frost": [
      { label: "Branco Gelo", color: "212 54% 96%" },
      { label: "Creme", color: "40 30% 95%" },
      { label: "Gelo Azul", color: "200 30% 95%" },
    ],
  };

  const landscapeVariants: Record<ThemeId, { label: string; src: string }[]> = {
    "night": [
      { label: "Montanhas", src: bgDarkNavy },
      { label: "Aurora Boreal", src: bgDarkNavy2 },
      { label: "Via Láctea", src: bgDarkNavy3 },
      { label: "Céu Estrelado", src: bgDarkNavy4 },
    ],
    "slate": [
      { label: "Lago", src: bgSoftSlate },
      { label: "Floresta", src: bgSoftSlate2 },
      { label: "Costa", src: bgSoftSlate3 },
      { label: "Tempestade", src: bgSoftSlate4 },
    ],
    "frost": [
      { label: "Praia", src: bgLightClean },
      { label: "Lavanda", src: bgLightClean2 },
      { label: "Cerejeiras", src: bgLightClean3 },
      { label: "Tropical", src: bgLightClean4 },
    ],
  };

  const gradientVariants: Record<ThemeId, { label: string; gradient: string }[]> = {
    "night": [
      { label: "Oceano Profundo", gradient: "linear-gradient(135deg, hsl(215 63% 7%), hsl(205 80% 20%), hsl(205 100% 59%))" },
      { label: "Aurora Boreal", gradient: "linear-gradient(160deg, hsl(215 63% 7%), hsl(260 30% 18%), hsl(186 72% 48%))" },
    ],
    "slate": [
      { label: "Névoa Azul", gradient: "linear-gradient(135deg, hsl(216 50% 10%), hsl(208 60% 28%), hsl(208 100% 59%))" },
      { label: "Aço Quente", gradient: "linear-gradient(160deg, hsl(216 50% 10%), hsl(30 15% 22%), hsl(215 40% 30%))" },
    ],
    "frost": [
      { label: "Céu Limpo", gradient: "linear-gradient(135deg, hsl(212 54% 96%), hsl(200 40% 92%), hsl(211 83% 85%))" },
      { label: "Pôr do Sol", gradient: "linear-gradient(160deg, hsl(212 54% 96%), hsl(40 50% 92%), hsl(20 60% 90%))" },
    ],
  };

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showNewProfessional, setShowNewProfessional] = useState(false);
  const [newProfName, setNewProfName] = useState("");
  const [newProfCode, setNewProfCode] = useState("");
  const [newProfUnitId, setNewProfUnitId] = useState<number | "">(activeUnit?.id ?? "");

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
    mutationFn: async (payload: { name: string; code?: string; unit?: number }) => {
      await fetchCsrf();
      const { data } = await api.post("/api/booking/professionals/", {
        ...payload,
        unit: payload.unit ?? activeUnit!.id,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["professionals", activeUnit?.id] });
      setShowNewProfessional(false);
      setNewProfName("");
      setNewProfCode("");
      setNewProfUnitId(activeUnit?.id ?? "");
      toast.success("Profissional criado com sucesso");
    },
    onError: () => {
      toast.error("Erro ao criar profissional");
    },
  });

  const toggleProfessional = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      await fetchCsrf();
      // Try both field names the API might expect
      await api.patch(`/api/booking/professionals/${id}/`, { is_active, status: is_active ? "active" : "inactive" });
    },
    onMutate: async ({ id, is_active }) => {
      await queryClient.cancelQueries({ queryKey: ["professionals", activeUnit?.id] });
      const prev = queryClient.getQueryData(["professionals", activeUnit?.id]);
      queryClient.setQueryData(["professionals", activeUnit?.id], (old: any[]) =>
        old?.map((p: any) => p.id === id ? { ...p, is_active, status: is_active ? "active" : "inactive" } : p)
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(["professionals", activeUnit?.id], context?.prev);
      toast.error("Erro ao alterar status do profissional");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["professionals", activeUnit?.id] });
    },
  });

  const deleteProfessional = useMutation({
    mutationFn: async (id: number) => {
      await fetchCsrf();
      await api.delete(`/api/booking/professionals/${id}/`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["professionals", activeUnit?.id] });
      toast.success("Profissional removido com sucesso");
    },
    onError: (err: any) => {
      const status = err?.response?.status;
      if (status === 405) {
        toast.error("A API não suporta exclusão de profissionais. Use o toggle ativo/inativo.");
      } else {
        toast.error("Erro ao remover profissional");
      }
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

      <main className="px-6 py-6 max-w-3xl mx-auto space-y-6">

        {/* ─── 1) Contexto da conta ─── */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">1 · Contexto da conta</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Empresa */}
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated" style={{ background: "hsl(var(--surface))" }}>
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-bold text-foreground">Empresa</span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
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

          {/* Unidades */}
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated" style={{ background: "hsl(var(--surface))" }}>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                <span className="text-sm font-bold text-foreground">Unidades</span>
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

          {/* Aparência */}
          <Collapsible defaultOpen={false} id="section-aparencia">
            <CollapsibleTrigger className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated" style={{ background: "hsl(var(--surface))" }}>
              <div className="flex items-center gap-2">
                <Palette className="h-4 w-4 text-primary" />
                <span className="text-sm font-bold text-foreground">Aparência</span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 rounded-xl border border-border p-4 space-y-5" style={{ background: "hsl(var(--surface))" }}>
              {/* Theme selection */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground px-1 font-medium uppercase tracking-wider">
                  Tema
                </p>
                <div className="flex items-center gap-4 px-1">
                  {([
                    { id: "night" as ThemeId, label: "Prism Night", colors: ["215 63% 7%", "205 100% 59%", "186 72% 48%"] },
                    { id: "slate" as ThemeId, label: "Prism Deep", colors: ["216 50% 12%", "208 100% 59%", "186 65% 46%"] },
                    { id: "frost" as ThemeId, label: "Prism Light", colors: ["212 54% 96%", "211 83% 50%", "186 60% 38%"] },
                  ]).map((t) => {
                    const active = theme === t.id;
                    return (
                      <button
                        key={t.id}
                        onClick={() => setTheme(t.id)}
                        className={`flex flex-col items-center gap-1.5 transition-all ${active ? "" : "opacity-60 hover:opacity-90"}`}
                      >
                        <div className={`w-16 h-10 rounded-lg overflow-hidden flex ${active ? "border-2 border-primary ring-2 ring-primary/30" : "border border-border"}`}>
                          <div className="w-1/3 h-full" style={{ background: `hsl(${t.colors[0]})` }} />
                          <div className="w-1/3 h-full" style={{ background: `hsl(${t.colors[1]})` }} />
                          <div className="w-1/3 h-full" style={{ background: `hsl(${t.colors[2]})` }} />
                        </div>
                        <span className={`text-[10px] font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>{t.label}</span>
                        {active && <span className="text-[9px] text-primary font-medium">Ativo</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Background mode */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground px-1 font-medium uppercase tracking-wider">
                  Plano de fundo
                </p>
                <div className="flex items-center gap-3 px-1 flex-wrap">
                  {([
                    { id: "solid" as BgMode, label: "Sólido", icon: Square, desc: "Cor sólida" },
                    { id: "gradient" as BgMode, label: "Gradiente", icon: Layers, desc: "Transição de cores" },
                    { id: "landscape" as BgMode, label: "Paisagem", icon: Image, desc: "Imagem de natureza" },
                  ]).map((bg) => {
                    const active = bgMode === bg.id;
                    const Icon = bg.icon;
                    return (
                      <button
                        key={bg.id}
                        onClick={() => setBgMode(bg.id)}
                        className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border transition-all ${
                          active
                            ? "border-primary bg-primary/10 text-foreground"
                            : "border-border text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
                        }`}
                      >
                        <Icon className={`h-4 w-4 ${active ? "text-primary" : ""}`} />
                        <div className="text-left">
                          <span className={`text-xs font-medium block ${active ? "text-foreground" : ""}`}>{bg.label}</span>
                          <span className="text-[10px] text-muted-foreground">{bg.desc}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Variant selection */}
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground px-1 font-medium uppercase tracking-wider">
                  {bgMode === "solid" ? "Variação de cor" : bgMode === "gradient" ? "Escolha o gradiente" : "Escolha a paisagem"}
                </p>
                <div className="flex items-center gap-3 px-1">
                  {bgMode === "solid"
                    ? solidVariants[theme].map((v, i) => {
                        const active = bgVariant === i;
                        return (
                          <button
                            key={i}
                            onClick={() => setBgVariant(i)}
                            className={`flex flex-col items-center gap-1.5 transition-all`}
                          >
                            <div
                              className={`w-14 h-10 rounded-lg relative ${active ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "border border-border hover:border-primary/50"}`}
                              style={{ background: `hsl(${v.color})` }}
                            >
                              {active && (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <Check className="h-4 w-4 text-primary" />
                                </div>
                              )}
                            </div>
                            <span className={`text-[10px] font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>{v.label}</span>
                          </button>
                        );
                      })
                    : bgMode === "gradient"
                    ? gradientVariants[theme].map((v, i) => {
                        const active = bgVariant === i;
                        return (
                          <button
                            key={i}
                            onClick={() => setBgVariant(i)}
                            className="flex flex-col items-center gap-1.5 transition-all"
                          >
                            <div
                              className={`w-20 h-12 rounded-lg relative ${active ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "border border-border hover:border-primary/50"}`}
                              style={{ background: v.gradient }}
                            >
                              {active && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/20 rounded-lg">
                                  <Check className="h-4 w-4 text-white" />
                                </div>
                              )}
                            </div>
                            <span className={`text-[10px] font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>{v.label}</span>
                          </button>
                        );
                      })
                    : landscapeVariants[theme].map((v, i) => {
                        const active = bgVariant === i;
                        return (
                          <button
                            key={i}
                            onClick={() => setBgVariant(i)}
                            className="flex flex-col items-center gap-1.5 transition-all"
                          >
                            <div
                              className={`w-20 h-12 rounded-lg overflow-hidden relative bg-cover bg-center ${active ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "border border-border hover:border-primary/50"}`}
                              style={{ backgroundImage: `url(${v.src})` }}
                            >
                              {active && (
                                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                  <Check className="h-4 w-4 text-white" />
                                </div>
                              )}
                            </div>
                            <span className={`text-[10px] font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>{v.label}</span>
                          </button>
                        );
                      })}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </section>

        {/* ─── 2) Catálogo e oferta da unidade ─── */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">2 · Catálogo e oferta</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <SpecialtiesSection />
          <ProceduresByUnitSection />
          <ServiceCategoriesSection />
          <ProceduresByUnitLinkSection />
        </section>

        {/* ─── 3) Equipe e responsabilidades ─── */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">3 · Equipe e responsabilidades</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Profissionais */}
          <Collapsible defaultOpen={false} id="section-profissionais">
            <CollapsibleTrigger className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated" style={{ background: "hsl(var(--surface))" }}>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <span className="text-sm font-bold text-foreground">Profissionais</span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 rounded-xl border border-border p-4 space-y-1" style={{ background: "hsl(var(--surface))" }}>
              <div className="grid grid-cols-[3rem_1fr_1fr_auto_5rem_2rem] gap-2 px-3 py-1 items-center">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Unidade</span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Nome Unidade</span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Nome</span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground text-right">Código</span>
                <span />
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
                    className="grid grid-cols-[3rem_1fr_1fr_auto_5rem_2rem] gap-2 items-center rounded-lg px-3 py-2 border border-border"
                    style={{ background: "hsl(var(--surface-elevated))" }}
                  >
                    <span className="text-xs font-mono text-muted-foreground">{prof.unit ?? "—"}</span>
                    <span className="text-xs text-muted-foreground">{prof.unit_name ?? units.find((u) => u.id === prof.unit)?.name ?? "—"}</span>
                    <span className="text-sm font-medium text-foreground">{prof.name}</span>
                    <Switch
                      checked={prof.is_active !== false && prof.status !== "inactive"}
                      onCheckedChange={(checked) => toggleProfessional.mutate({ id: prof.id, is_active: checked })}
                      className="scale-75"
                    />
                    <span className="text-xs font-mono text-muted-foreground text-right">{prof.code ?? prof.slug ?? "—"}</span>
                    <button
                      onClick={() => deleteProfessional.mutate(prof.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors"
                      title="Remover profissional"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))
              )}

              {/* Criar profissional */}
              {showNewProfessional ? (
                <div className="flex items-center gap-2 pt-2">
                  <select
                    value={newProfUnitId}
                    onChange={(e) => setNewProfUnitId(e.target.value ? Number(e.target.value) : "")}
                    className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground z-50"
                  >
                    <option value="">Unidade</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>{u.name}</option>
                    ))}
                  </select>
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
                    disabled={!newProfName.trim() || !newProfUnitId || createProfessional.isPending}
                    onClick={() => createProfessional.mutate({ name: newProfName.trim(), unit: newProfUnitId as number, ...(newProfCode.trim() ? { code: newProfCode.trim() } : {}) })}
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

          <ServicesByProfessionalSection />
          
        </section>

        {/* ─── 4) Agenda e bloqueios ─── */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">4 · Agenda e bloqueios</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <ProfessionalAvailabilitySection />
          <ScheduleBlocksSection />
        </section>

        {/* ─── 5) Modo e validação final ─── */}
        <section className="space-y-3">
          <div className="flex items-center gap-2 px-1">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">5 · Modo e validação</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* Modo de Atendimento */}
          <Collapsible defaultOpen={false} id="section-modo-atendimento">
            <CollapsibleTrigger className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated" style={{ background: "hsl(var(--surface))" }}>
              <div className="flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-bold text-foreground">Modo de Atendimento</span>
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

          {/* Diagnóstico */}
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated" style={{ background: "hsl(var(--surface))" }}>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" />
                <span className="text-sm font-bold text-foreground">Diagnóstico</span>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 rounded-xl border border-border p-4 space-y-2" style={{ background: "hsl(var(--surface))" }}>
              {units.length === 0 ? (
                <p className="text-xs text-muted-foreground px-3">Nenhuma unidade encontrada.</p>
              ) : (
                units.map((unit) => (
                  <DiagnosticCard key={unit.id} unit={unit} />
                ))
              )}
            </CollapsibleContent>
          </Collapsible>
        </section>

      </main>
    </div>
  );
}
