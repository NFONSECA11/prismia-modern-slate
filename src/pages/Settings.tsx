import { useAuth } from "@/contexts/AuthContext";
import PrismIAAgendaLogo from "@/components/PrismIAAgendaLogo";
import { useTheme, ThemeId, BgMode, AccentId } from "@/contexts/ThemeContext";
import { ArrowLeft, ChevronDown, Plus, Trash2, Palette, Image, Square, Check, Building2, MapPin, Users, Settings2, Activity, Layers, CalendarDays } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import UserManagementSection from "@/components/UserManagementSection";
import CompanyBrandingSection from "@/components/CompanyBrandingSection";

import bgDarkNavy from "@/assets/bg-dark-navy.jpg";
import bgDarkNavy2 from "@/assets/bg-dark-navy-2.jpg";
import bgDarkNavy3 from "@/assets/bg-dark-navy-3.jpg";
import bgDarkNavy4 from "@/assets/bg-dark-navy-4.jpg";
import bgSoftSlate from "@/assets/bg-soft-slate.jpg";
import bgSoftSlate2 from "@/assets/bg-soft-slate-2.jpg";
import bgSoftSlate3 from "@/assets/bg-soft-slate-3.jpg";
import bgSoftSlate4 from "@/assets/bg-soft-slate-4.jpg";
import bgSoftSlate5 from "@/assets/bg-soft-slate-5.jpg";
import bgLightClean from "@/assets/bg-light-clean.jpg";
import bgLightClean2 from "@/assets/bg-light-clean-2.jpg";
import bgLightClean3 from "@/assets/bg-light-clean-3.jpg";
import bgLightClean4 from "@/assets/bg-light-clean-4.jpg";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

import DiagnosticCard from "@/components/DiagnosticCard";
import ProceduresByUnitSection from "@/components/ProceduresByUnitSection";
import SpecialtiesSection from "@/components/SpecialtiesSection";
import ServiceCategoriesSection from "@/components/ServiceCategoriesSection";
import ProceduresByUnitLinkSection from "@/components/ProceduresByUnitLinkSection";
import ProfessionalCard from "@/components/professional/ProfessionalCard";
import ProfessionalUnitsLinkSection from "@/components/professional/ProfessionalUnitsLinkSection";
import ProfessionalProceduresLinkSection from "@/components/professional/ProfessionalProceduresLinkSection";
import ProfessionalAvailabilitiesLinkSection from "@/components/professional/ProfessionalAvailabilitiesLinkSection";
import ProfessionalTimeOffsLinkSection from "@/components/professional/ProfessionalTimeOffsLinkSection";

export default function Settings() {
  const { company, units, activeUnit, canManage, canManageUsers, isAgent } = useAuth();
  const { theme, setTheme, bgMode, setBgMode, bgVariant, setBgVariant, accent, setAccent } = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: branding } = useQuery({
    queryKey: ["company-branding"],
    queryFn: async () => {
      const { data } = await api.get("/api/settings/company-branding/");
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const [showNewProfessional, setShowNewProfessional] = useState(false);
  const [newProfName, setNewProfName] = useState("");
  const [newProfCode, setNewProfCode] = useState("");
  const [newProfUnitId, setNewProfUnitId] = useState<number | "">(activeUnit?.id ?? "");
  // Override removed: the active swatch must reflect the persisted bgVariant directly.

  const { data: bookingSettings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ["booking-settings", activeUnit?.id],
    queryFn: async () => {
      const unpack = (payload: any): any[] => {
        if (!payload) return [];
        if (Array.isArray(payload)) return payload;
        if (Array.isArray(payload?.results)) return payload.results;
        if (payload?.result) return unpack(payload.result);
        return [payload];
      };

      const pickByUnit = (items: any[]) => items.find((s) => Number(s?.unit) === Number(activeUnit!.id)) ?? items[0] ?? null;
      const hasConfirmationFields = (s: any) =>
        s && (
          s.confirmation_send_before_hours != null ||
          s.confirmation_expiration_minutes != null ||
          s.confirmation_allowed_start_time != null ||
          s.confirmation_allowed_end_time != null ||
          (Array.isArray(s.confirmation_allowed_weekdays) && s.confirmation_allowed_weekdays.length > 0)
        );

      const [byUnitRes, listRes] = await Promise.allSettled([
        api.get(`/api/booking/booking-settings/by-unit/${activeUnit!.id}/`),
        api.get(`/api/settings/booking-settings/`, { params: { unit: activeUnit!.id } }),
      ]);

      const byUnitItems = byUnitRes.status === "fulfilled" ? unpack(byUnitRes.value.data) : [];
      const listItems = listRes.status === "fulfilled" ? unpack(listRes.value.data) : [];

      const byUnitSetting = pickByUnit(byUnitItems);
      const listSetting = pickByUnit(listItems);
      const merged = { ...(byUnitSetting ?? {}), ...(listSetting ?? {}) };

      if (hasConfirmationFields(merged)) return merged;
      if (hasConfirmationFields(listSetting)) return listSetting;
      if (hasConfirmationFields(byUnitSetting)) return byUnitSetting;
      return Object.keys(merged).length > 0 ? merged : null;
    },
    enabled: !!activeUnit?.id,
  });

  const { data: professionals = [], isLoading: isLoadingProfessionals } = useQuery({
    queryKey: ["professionals", activeUnit?.id],
    queryFn: async () => {
      const { data } = await api.get(`/api/settings/professionals/`, {
        params: { unit: activeUnit!.id },
      });
      return Array.isArray(data) ? data : (data?.results ?? []);
    },
    enabled: !!activeUnit?.id,
  });
  const getSettingValue = (obj: any, paths: string[]) => {
    for (const path of paths) {
      const value = path.split(".").reduce((acc: any, key: string) => (acc == null ? undefined : acc[key]), obj);
      if (value !== undefined && value !== null) return value;
    }
    return undefined;
  };

  const solidVariants: Record<ThemeId, { label: string; color: string }[]> = {
    "night": [
      { label: "Azul Profundo", color: "216 65% 7%" },
      { label: "Carvão Azulado", color: "240 3% 9%" },
      { label: "Meia-Noite", color: "200 40% 8%" },
    ],
    "slate": [
      { label: "Deep Blue", color: "#1e3a5f" },
      { label: "Grafite Frio", color: "#2a3f5f" },
      { label: "Aço Petróleo", color: "#1a3a4a" },
    ],
    "frost": [
      { label: "Branco Neve", color: "220 30% 98%" },
      { label: "Areia",       color: "30 17% 95%"  },
      { label: "Gelo",        color: "213 33% 95%" },
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
      { label: "Oceano", src: bgSoftSlate5 },
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
      { label: "Ocean Depth", gradient: "linear-gradient(145deg, hsl(210 58% 6%), hsl(205 55% 12%), hsl(200 45% 18%))" },
      { label: "Carbon Blue", gradient: "linear-gradient(150deg, hsl(220 30% 7%), hsl(218 25% 11%), hsl(215 20% 16%))" },
      { label: "Midnight Plum", gradient: "linear-gradient(140deg, hsl(215 50% 7%), hsl(248 28% 12%), hsl(260 22% 16%))" },
    ],
    "slate": [
      { label: "Deep Blue", gradient: "linear-gradient(135deg, #1e3a5f 0%, #0a1929 100%)" },
      { label: "Steel Graphite", gradient: "linear-gradient(135deg, #2d3748 0%, #111827 100%)" },
      { label: "Petroleum Mist", gradient: "linear-gradient(135deg, #1a3a4a 0%, #0d2030 100%)" },
    ],
    "frost": [
      { label: "Ice White", gradient: "linear-gradient(135deg, #ffffff 0%, #a8c8e8 100%)" },
      { label: "Soft Mist", gradient: "linear-gradient(135deg, #f5f0eb 0%, #b8c8e0 100%)" },
      { label: "Blue Haze", gradient: "linear-gradient(135deg, #e8f0fa 0%, #6b9fd4 100%)" },
    ],
  };


  const createProfessional = useMutation({
    mutationFn: async (payload: { name: string; code?: string; unit?: number }) => {
      await fetchCsrf();
      const { data } = await api.post("/api/settings/professionals/", {
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
      await api.patch(`/api/settings/professionals/${id}/`, { is_active, status: is_active ? "active" : "inactive" });
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
      await api.delete(`/api/settings/professionals/${id}/`);
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

  const landscapeMap: Record<string, string[]> = {
    "night": [bgDarkNavy, bgDarkNavy2, bgDarkNavy3, bgDarkNavy4],
    "slate": [bgSoftSlate, bgSoftSlate2, bgSoftSlate3, bgSoftSlate4, bgSoftSlate5],
    "frost": [bgLightClean, bgLightClean2, bgLightClean3, bgLightClean4],
  };
  const solidColors: Record<string, string[]> = {
    "night": ["216 65% 7%", "240 3% 9%", "200 40% 8%"],
    "slate": ["#1e3a5f", "#2a3f5f", "#1a3a4a"],
    "frost": ["212 54% 96%", "214 20% 94%", "208 35% 95%"],
  };
  const gradientMap: Record<string, string[]> = {
    "night": [
      "linear-gradient(145deg, hsl(210 58% 6%), hsl(205 55% 12%), hsl(200 45% 18%))",
      "linear-gradient(150deg, hsl(220 30% 7%), hsl(218 25% 11%), hsl(215 20% 16%))",
      "linear-gradient(140deg, hsl(215 50% 7%), hsl(248 28% 12%), hsl(260 22% 16%))",
    ],
    "slate": [
      "linear-gradient(135deg, #1e3a5f 0%, #0a1929 100%)",
      "linear-gradient(135deg, #2d3748 0%, #111827 100%)",
      "linear-gradient(135deg, #1a3a4a 0%, #0d2030 100%)",
    ],
    "frost": [
      "linear-gradient(135deg, #ffffff 0%, #a8c8e8 100%)",
      "linear-gradient(135deg, #f5f0eb 0%, #b8c8e0 100%)",
      "linear-gradient(135deg, #e8f0fa 0%, #6b9fd4 100%)",
    ],
  };
  const isLandscape = bgMode === "landscape";
  const isGradient = bgMode === "gradient";
  const effectiveBgVariant = bgVariant;
  const currentBg = landscapeMap[theme]?.[effectiveBgVariant] ?? landscapeMap[theme]?.[0];
  const solidBg = solidColors[theme]?.[effectiveBgVariant] ?? solidColors[theme]?.[0];
  const gradientBg = gradientMap[theme]?.[effectiveBgVariant] ?? gradientMap[theme]?.[0];
  const mainBg = isLandscape ? "hsl(var(--background))" : isGradient ? "hsl(var(--background))" : `hsl(${solidBg})`;

  return (
    <div className="min-h-screen relative" style={{ background: mainBg }}>
      {isLandscape && (
        <div
          className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${currentBg})` }}
        />
      )}
      {isGradient && (
        <div
          className="fixed inset-0 z-0"
          style={{ background: gradientBg }}
        />
      )}
      <header
        className="sticky top-0 z-30 flex items-center gap-3 px-4 sm:px-6 py-3"
        style={{ background: "hsl(var(--topbar-bg))" }}
      >
        {branding?.logo_url ? (
          <img src={branding.logo_url} alt={branding.logo_alt || "Logo"} className="h-11 max-w-[180px] object-contain" />
        ) : (
          <h1 className="text-sm font-bold text-foreground">Configurações</h1>
        )}
        {company && (
          <span className="text-xs text-muted-foreground">{company.name}</span>
        )}
        <div className="flex-1" />
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-surface-elevated"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
      </header>

      {/* Module banner — barra dupla full-width */}
      <div
        className="print:hidden relative w-full flex items-center px-4 sm:px-6 py-1"
        style={{ background: "hsl(var(--topbar-bg))" }}
      >
        <div className="flex items-center w-full" style={{ paddingLeft: 8 }}>
          <PrismIAAgendaLogo size="sm" bare />
        </div>
      </div>

      <main className="px-6 py-6 max-w-3xl mx-auto space-y-6 relative z-10">

        {/* ─── 1) Contexto da conta ─── */}
        <section className="space-y-3">
          <div className="flex items-center px-1 pb-1 border-b border-border/70">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-primary">{isAgent ? "Personalização" : "Contexto da conta"}</span>
          </div>

          {/* Gerenciamento de Usuários */}
          {canManageUsers && <UserManagementSection />}

          {/* Empresa */}
          {canManage && (
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
          )}

          {/* Logo */}
          {canManage && <CompanyBrandingSection />}

          {/* Unidades */}
          {canManage && (
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
          )}

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
                  ]).map((bg) => {
                    const active = bgMode === bg.id;
                    const Icon = bg.icon;
                    return (
                      <button
                        key={bg.id}
                        onClick={() => {
                          setBgMode(bg.id);
                        }}
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
                <div className="px-1 space-y-0.5">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    {bgMode === "solid" ? "Cor do Fundo" : "Escolha o gradiente"}
                  </p>
                  {bgMode === "solid" && (
                    <p className="text-[10px] text-muted-foreground/70">Tonalidade base da interface</p>
                  )}
                </div>
                <div className="flex items-center gap-3 px-1">
                  {bgMode === "solid"
                    ? solidVariants[theme].map((v, i) => {
                        const active = effectiveBgVariant === i;
                        return (
                          <button
                            key={i}
                            onClick={() => {
                              setBgVariant(i);
                            }}
                            className={`flex flex-col items-center gap-1.5 transition-all`}
                          >
                            <div
                              className={`w-14 h-10 rounded-lg relative ${active ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "border border-border hover:border-primary/50"}`}
                              style={{ background: v.color.startsWith("#") ? v.color : `hsl(${v.color})` }}
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

              {/* Accent / color variation */}
              <div className="space-y-2">
                <div className="px-1 space-y-0.5">
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
                    Cor de Destaque
                  </p>
                  <p className="text-[10px] text-muted-foreground/70">Cor de botões, ícones e elementos ativos</p>
                </div>
                <div className="flex items-center gap-3 px-1">
                  {([
                    { id: "deep-blue" as AccentId, label: "Deep Blue", colors: ["210 90% 40%", "186 72% 48%"] },
                    { id: "coral" as AccentId, label: "Coral", colors: ["25 95% 63%", "35 95% 70%"] },
                    { id: "teal" as AccentId, label: "Teal", colors: ["186 85% 39%", "195 85% 49%"] },
                  ]).map((a) => {
                    const active = accent === a.id;
                    return (
                      <button
                        key={a.id}
                        onClick={() => setAccent(a.id)}
                        className={`flex flex-col items-center gap-1.5 transition-all ${active ? "" : "opacity-60 hover:opacity-90"}`}
                      >
                        <div className={`w-14 h-8 rounded-lg overflow-hidden flex ${active ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "border border-border"}`}>
                          <div className="w-1/2 h-full" style={{ background: `hsl(${a.colors[0]})` }} />
                          <div className="w-1/2 h-full" style={{ background: `hsl(${a.colors[1]})` }} />
                        </div>
                        <span className={`text-[10px] font-medium ${active ? "text-foreground" : "text-muted-foreground"}`}>{a.label}</span>
                        {active && <span className="text-[9px] text-primary font-medium">Ativo</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </section>

        {canManage && (<>
        {/* ─── 2) Catálogo e oferta da unidade ─── */}
        <section className="space-y-3">
          <div className="flex items-center px-1 pb-1 border-b border-border/70">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Catálogo e oferta da unidade</span>
          </div>

          <SpecialtiesSection />
          <ProceduresByUnitSection />
          <ServiceCategoriesSection />
          <ProceduresByUnitLinkSection />
        </section>

        {/* ─── 3) Equipe e responsabilidades ─── */}
        <section className="space-y-3">
          <div className="flex items-center px-1 pb-1 border-b border-border/70">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Equipe e responsabilidades</span>
          </div>

          {/* Profissionais */}
          <Collapsible defaultOpen={false} id="section-profissionais">
            <CollapsibleTrigger className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated" style={{ background: "hsl(var(--surface))" }}>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary shrink-0" />
                <div className="text-left">
                  <span className="text-sm font-bold text-foreground">Profissionais</span>
                  <p className="text-xs text-muted-foreground">Cadastrar Profissionais</p>
                </div>
              </div>
              <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2 rounded-xl border border-border p-4 space-y-2" style={{ background: "hsl(var(--surface))" }}>
              <div className="grid grid-cols-[3rem_8rem_minmax(0,1fr)_6rem_auto_2rem] gap-2 px-3 py-1 items-center">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">ID</span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Empresa</span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Profissional</span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Código</span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
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
                  <ProfessionalCard
                    key={prof.id}
                    professional={prof}
                    companyName={company?.name}
                    onToggleActive={(id, isActive) => toggleProfessional.mutate({ id, is_active: isActive })}
                    onDelete={(id) => deleteProfessional.mutate(id)}
                  />
                ))
              )}

              {showNewProfessional ? (
                <div
                  className="rounded-lg border border-border p-3 mt-2 space-y-2"
                  style={{ background: "hsl(var(--surface-elevated))" }}
                >
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Empresa</span>
                      <div className="h-8 px-2 flex items-center text-xs text-foreground rounded-md border border-border bg-background/60 truncate">
                        {company?.name ?? "—"}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Profissional</span>
                      <Input
                        placeholder="Nome"
                        value={newProfName}
                        onChange={(e) => setNewProfName(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Código</span>
                      <Input
                        placeholder="Ex: ana"
                        value={newProfCode}
                        onChange={(e) => setNewProfCode(e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs"
                      onClick={() => { setShowNewProfessional(false); setNewProfName(""); setNewProfCode(""); }}
                    >
                      Cancelar
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 text-xs"
                      disabled={!newProfName.trim() || !activeUnit?.id || createProfessional.isPending}
                      onClick={() => createProfessional.mutate({ name: newProfName.trim(), unit: activeUnit!.id, ...(newProfCode.trim() ? { code: newProfCode.trim() } : {}) })}
                    >
                      {createProfessional.isPending ? "…" : "Salvar"}
                    </Button>
                  </div>
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

          <ProfessionalUnitsLinkSection />

          <ProfessionalProceduresLinkSection />

          <ProfessionalAvailabilitiesLinkSection />

          <ProfessionalTimeOffsLinkSection />

        </section>

        {/* ─── 5) Modo e validação final ─── */}
        <section className="space-y-3">
          <div className="flex items-center px-1 pb-1 border-b border-border/70">
            <span className="text-xs font-bold uppercase tracking-[0.14em] text-primary">Modo e validação final</span>
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
            <CollapsibleContent className="mt-2 rounded-xl border border-border p-4 space-y-4" style={{ background: "hsl(var(--surface))" }}>
              {!activeUnit ? (
                <p className="text-xs text-muted-foreground px-3">Nenhuma unidade ativa selecionada.</p>
              ) : isLoadingSettings ? (
                <p className="text-xs text-muted-foreground px-3">Carregando…</p>
              ) : !bookingSettings ? (
                <p className="text-xs text-muted-foreground px-3">Configuração não encontrada para esta unidade.</p>
              ) : (
                <>
                  {/* Unit header */}
                  <div className="flex items-center justify-between px-1 pb-2 border-b border-border/60">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-primary" />
                      <span className="text-xs font-bold text-foreground">{activeUnit.name}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">#{bookingSettings.id ?? "—"}</span>
                  </div>

                  {/* Geral */}
                  <div className="pl-3 space-y-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Geral</span>
                    <div className="space-y-0">
                      {[
                        { label: "Modo padrão", value: { handoff_manual: "Handoff Manual", assisted_slots_dashboard: "Assistido (Dashboard)", auto_slots_bot: "Automático (Bot)" }[getSettingValue(bookingSettings, ["default_booking_mode", "defaultBookingMode"]) as string] ?? getSettingValue(bookingSettings, ["default_booking_mode", "defaultBookingMode"]) ?? "—" },
                        { label: "Horizonte de agendamento", value: `${getSettingValue(bookingSettings, ["booking_horizon_days", "bookingHorizonDays"]) ?? "—"} dias` },
                        { label: "UI de escolha (WhatsApp)", value: getSettingValue(bookingSettings, ["wa_choice_ui_mode", "waChoiceUiMode"]) ?? "—" },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                          <span className="text-[11px] text-muted-foreground">{item.label}</span>
                          <span className="text-[11px] font-medium text-foreground">{String(item.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Confirmação */}
                  <div className="pl-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Confirmação</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${getSettingValue(bookingSettings, ["confirmation_enabled", "confirmationEnabled", "confirmation.enabled"]) ? "bg-emerald-500/15 text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                        {getSettingValue(bookingSettings, ["confirmation_enabled", "confirmationEnabled", "confirmation.enabled"]) ? "Ativada" : "Desativada"}
                      </span>
                    </div>
                    <div className="space-y-0">
                      {[
                        {
                          label: "Enviar antes de",
                          value: `${getSettingValue(bookingSettings, ["confirmation_send_before_hours", "confirmationSendBeforeHours", "confirmation.send_before_hours"]) ?? "—"}h`,
                        },
                        {
                          label: "Expira em",
                          value: `${getSettingValue(bookingSettings, ["confirmation_expiration_minutes", "confirmationExpirationMinutes", "confirmation.expiration_minutes"]) ?? "—"} min`,
                        },
                        {
                          label: "Dias permitidos",
                          value: (() => {
                            const weekdays = getSettingValue(bookingSettings, ["confirmation_allowed_weekdays", "confirmationAllowedWeekdays", "confirmation.allowed_weekdays"]);
                            if (Array.isArray(weekdays) && weekdays.length > 0) {
                              return weekdays.map((d: number) => ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"][d] ?? d).join(", ");
                            }
                            return "—";
                          })(),
                        },
                        {
                          label: "Horário início",
                          value: getSettingValue(bookingSettings, ["confirmation_allowed_start_time", "confirmationAllowedStartTime", "confirmation.allowed_start_time"]) ?? "—",
                        },
                        {
                          label: "Horário fim",
                          value: getSettingValue(bookingSettings, ["confirmation_allowed_end_time", "confirmationAllowedEndTime", "confirmation.allowed_end_time"]) ?? "—",
                        },
                        {
                          label: "Fins de semana",
                          value: getSettingValue(bookingSettings, ["confirmation_allow_weekends", "confirmationAllowWeekends", "confirmation.allow_weekends"]) ? "Sim" : "Não",
                        },
                      ].map((item) => (
                        <div key={item.label} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                          <span className="text-[11px] text-muted-foreground">{item.label}</span>
                          <span className="text-[11px] font-medium text-foreground">{String(item.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Menu router options */}
                  {Array.isArray(bookingSettings.router_menu_options) && bookingSettings.router_menu_options.length > 0 && (
                    <div className="pl-3 space-y-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Opções do menu router</span>
                      {bookingSettings.router_menu_options.map((opt: any, i: number) => (
                        <div key={i} className="text-xs text-foreground">{typeof opt === "string" ? opt : JSON.stringify(opt)}</div>
                      ))}
                    </div>
                  )}

                  {/* Timestamps */}
                  <div className="flex items-center gap-4 px-1 pt-1 border-t border-border/30">
                    <span className="text-[10px] text-muted-foreground">
                      Criado: {bookingSettings.created_at ? new Date(bookingSettings.created_at).toLocaleDateString("pt-BR") : "—"}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Atualizado: {bookingSettings.updated_at ? new Date(bookingSettings.updated_at).toLocaleDateString("pt-BR") : "—"}
                    </span>
                  </div>
                </>
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
        </>)}

      </main>
    </div>
  );
}
