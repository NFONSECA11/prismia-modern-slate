import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BarChart3,
  Building2,
  CalendarDays,
  ChevronDown,
  LayoutList,
  LogOut,
  Maximize2,
  Minimize2,
  RefreshCw,
  Settings,
  Shield,
  Sparkles,
  Wifi,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { savePreference } from "@/lib/preferencesApi";
import api from "@/lib/api";
import { fetchReportsBootstrap, type ReportFilters } from "@/lib/reportsApi";
import { ReportsFilters } from "@/components/reports/ReportsFilters";
import { ConversaoTab } from "@/components/reports/ConversaoTab";
import { OperacaoTab } from "@/components/reports/OperacaoTab";
import { ResultadoTab } from "@/components/reports/ResultadoTab";
import { PerformanceTab } from "@/components/reports/PerformanceTab";
import PrismIAAgendaLogo from "@/components/PrismIAAgendaLogo";

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

const landscapeMap: Record<string, string[]> = {
  night: [bgDarkNavy, bgDarkNavy2, bgDarkNavy3, bgDarkNavy4],
  slate: [bgSoftSlate, bgSoftSlate2, bgSoftSlate3, bgSoftSlate4, bgSoftSlate5],
  frost: [bgLightClean, bgLightClean2, bgLightClean3, bgLightClean4],
};

const roleLabel: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  agent: "Agent",
};

export default function Reports() {
  const navigate = useNavigate();
  const {
    user,
    company,
    role,
    units,
    activeUnit,
    setActiveUnit,
    canManage,
    isLoading,
    logout,
  } = useAuth();
  const { theme, bgMode, bgVariant } = useTheme();
  const [showUnitMenu, setShowUnitMenu] = useState(false);
  const [zenMode, setZenMode] = useState(false);
  const [activeTab, setActiveTab] = useState<"conversao" | "operacao" | "resultado" | "performance">("conversao");

  const tabs: { id: "conversao" | "operacao" | "resultado" | "performance"; label: string }[] = [
    { id: "conversao", label: "Conversão" },
    { id: "operacao", label: "Operação" },
    { id: "resultado", label: "Resultado" },
    { id: "performance", label: "Performance" },
  ];

  // Default: últimos 30 dias
  const today = new Date();
  const thirtyAgo = new Date();
  thirtyAgo.setDate(today.getDate() - 30);
  const toIso = (d: Date) => d.toISOString().slice(0, 10);
  const [filters, setFilters] = useState<ReportFilters>({
    date_from: toIso(thirtyAgo),
    date_to: toIso(today),
  });
  const [unitDefaultApplied, setUnitDefaultApplied] = useState(false);

  // Default da unidade conforme acesso do usuário:
  // - acesso a múltiplas unidades → "Todas as unidades" (undefined)
  // - acesso a apenas 1 unidade → aquela unidade
  useEffect(() => {
    if (unitDefaultApplied) return;
    if (units.length === 1) {
      setFilters((f) => ({ ...f, unit_id: units[0].id }));
    }
    setUnitDefaultApplied(true);
  }, [units, unitDefaultApplied]);

  const { data: bootstrap } = useQuery({
    queryKey: ["reports", "bootstrap"],
    queryFn: fetchReportsBootstrap,
    staleTime: 5 * 60 * 1000,
    enabled: !!canManage,
  });

  useEffect(() => {
    if (!isLoading && !canManage) navigate("/", { replace: true });
  }, [isLoading, canManage, navigate]);

  const { data: branding } = useQuery({
    queryKey: ["company-branding"],
    queryFn: async () => {
      const { data } = await api.get("/api/settings/company-branding/");
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  const isLandscape = bgMode === "landscape";
  const currentBg = landscapeMap[theme]?.[bgVariant] ?? landscapeMap[theme]?.[0];

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const goToView = (view: "table" | "agenda") => {
    sessionStorage.setItem("prefs:last_view", view);
    savePreference({ last_view: view });
    navigate("/");
  };

  return (
    <div className="min-h-screen relative" style={{ background: "hsl(var(--background))" }}>
      {isLandscape && (
        <div
          className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${currentBg})` }}
        />
      )}

      {/* Top navigation bar — replica do Index */}
      <header
        className="sticky top-0 z-30 print:hidden"
        style={{
          background: isLandscape ? "hsl(var(--topbar-bg) / 0.92)" : "hsl(var(--topbar-bg))",
          backdropFilter: isLandscape ? "blur(16px)" : undefined,
        }}
      >
        <div className="flex items-center justify-between px-4 sm:px-6 py-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="flex items-center gap-2 flex-shrink-0">
              {branding?.logo_url ? (
                <img
                  src={branding.logo_url}
                  alt={branding.logo_alt || "Logo"}
                  className="h-11 max-w-[180px] object-contain"
                />
              ) : (
                <>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg gradient-primary">
                    <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
                  </div>
                  <span className="text-sm font-bold tracking-tight gradient-text">PrismIA</span>
                </>
              )}
            </div>
            <span className="text-border text-xs hidden sm:inline">|</span>

            {/* Company + Unit selector */}
            <div className="hidden sm:flex items-center gap-2 min-w-0">
              {company && (
                <span className="text-xs text-muted-foreground font-medium truncate">
                  {company.name}
                </span>
              )}
              {units.length > 1 && (
                <div className="relative">
                  <button
                    onClick={() => setShowUnitMenu(!showUnitMenu)}
                    className="flex items-center gap-1 text-xs font-medium text-foreground px-2 py-1 rounded-lg border border-border hover:bg-surface-elevated transition-colors"
                  >
                    <Building2 className="h-3 w-3 text-muted-foreground" />
                    {activeUnit?.name ?? "Todas as unidades"}
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </button>
                  {showUnitMenu && (
                    <>
                      <div
                        className="fixed inset-0 z-40"
                        onClick={() => setShowUnitMenu(false)}
                      />
                      <div className="absolute top-full left-0 mt-1 z-50 rounded-lg border border-border surface-raised shadow-md py-1 min-w-[160px]">
                        <button
                          onClick={() => {
                            setActiveUnit(null);
                            savePreference({ last_unit_id: null });
                            setShowUnitMenu(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                            !activeUnit
                              ? "text-primary font-semibold bg-primary/5"
                              : "text-foreground hover:bg-surface-elevated"
                          }`}
                        >
                          Todas as unidades
                        </button>
                        <div className="my-1 h-px bg-border" />
                        {units.map((u) => (
                          <button
                            key={u.id}
                            onClick={() => {
                              setActiveUnit(u);
                              savePreference({ last_unit_id: u.id });
                              setShowUnitMenu(false);
                            }}
                            className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                              activeUnit?.id === u.id
                                ? "text-primary font-semibold bg-primary/5"
                                : "text-foreground hover:bg-surface-elevated"
                            }`}
                          >
                            {u.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
              {units.length <= 1 && activeUnit && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Building2 className="h-3 w-3" />
                  {activeUnit.name}
                </span>
              )}
            </div>

            {/* Connectivity */}
            <div className="hidden sm:flex">
              <span className="flex items-center gap-1 text-[10px] font-medium text-status-confirmed bg-status-confirmed-bg px-2 py-0.5 rounded-full border border-status-confirmed/25">
                <Wifi className="h-3 w-3" />
                Conectado
              </span>
            </div>
          </div>

          {/* Desktop actions */}
          <div className="hidden sm:flex items-center gap-2">
            {role && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-surface-elevated px-2 py-0.5 rounded-full border border-border">
                <Shield className="h-3 w-3" />
                {roleLabel[role] ?? role}
              </span>
            )}
            {user && (
              <span className="text-xs text-muted-foreground">
                {user.first_name || user.username}
              </span>
            )}

            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-lg hover:bg-surface-elevated"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Atualizar
            </button>

            <div className="h-4 w-px bg-border" />

            <div className="flex items-center gap-1 rounded-lg p-0.5 bg-surface-elevated border border-border">
              <button
                onClick={() => goToView("table")}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all text-muted-foreground hover:text-foreground"
              >
                <LayoutList className="h-3.5 w-3.5" />
                Tabela
              </button>
              <button
                onClick={() => goToView("agenda")}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all text-muted-foreground hover:text-foreground"
              >
                <CalendarDays className="h-3.5 w-3.5" />
                Agenda
              </button>
              <button
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all bg-primary/10 text-primary border border-primary/20"
                title="Relatórios"
              >
                <BarChart3 className="h-3.5 w-3.5" />
                Relatórios
              </button>
            </div>

            <button
              onClick={() => navigate("/settings")}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-surface-elevated"
              title="Configurações"
            >
              <Settings className="h-3.5 w-3.5" />
              Configurações
            </button>

            {isLandscape && (
              <button
                onClick={() => setZenMode(!zenMode)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-surface-elevated"
                title={zenMode ? "Voltar ao dashboard" : "Modo paisagem"}
              >
                {zenMode ? (
                  <Minimize2 className="h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" />
                )}
              </button>
            )}

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-status-canceled transition-colors px-2 py-1.5 rounded-lg hover:bg-surface-elevated"
              title="Sair"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair
            </button>
          </div>

          {/* Mobile: voltar */}
          <div className="flex sm:hidden items-center gap-2">
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-surface-elevated"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>
          </div>
        </div>
      </header>

      {/* Module banner — barra dupla full-width */}
      <div
        className="print:hidden relative w-full flex items-center px-4 sm:px-6 py-1 border-b border-border/60"
        style={{
          background: isLandscape ? "hsl(var(--topbar-bg) / 0.92)" : "hsl(var(--topbar-bg))",
          backdropFilter: isLandscape ? "blur(16px)" : undefined,
        }}
      >
        <div className="flex items-center w-full">
          <PrismIAAgendaLogo size="sm" bare />
        </div>
      </div>

      <main className="px-4 sm:px-6 py-6 max-w-7xl mx-auto space-y-4 relative z-10">

        <ReportsFilters
          value={filters}
          onChange={setFilters}
          units={bootstrap?.dimensions?.units ?? units.map((u) => ({ id: u.id, name: u.name }))}
          professionals={bootstrap?.dimensions?.professionals ?? []}
          procedures={bootstrap?.dimensions?.procedures ?? []}
        />

        <div className="border-b border-border">
          <div className="flex items-center gap-6">
            {tabs.map((t) => {
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`relative px-1 pb-3 text-sm font-medium transition-colors ${
                    isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t.label}
                  {isActive && (
                    <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary rounded-full" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {activeTab === "conversao" && <ConversaoTab filters={filters} />}
        {activeTab === "operacao" && <OperacaoTab filters={filters} />}
        {activeTab === "resultado" && <ResultadoTab filters={filters} />}

        {activeTab === "performance" && <PerformanceTab filters={filters} />}
      </main>
    </div>
  );
}
