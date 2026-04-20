import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import api from "@/lib/api";

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

export default function Reports() {
  const navigate = useNavigate();
  const { company, canManage, isLoading } = useAuth();
  const { theme, bgMode, bgVariant } = useTheme();

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

  return (
    <div className="min-h-screen relative" style={{ background: "hsl(var(--background))" }}>
      {isLandscape && (
        <div
          className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${currentBg})` }}
        />
      )}

      <header
        className="sticky top-0 z-30 flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-border/60"
        style={{ background: "hsl(var(--topbar-bg))" }}
      >
        {branding?.logo_url ? (
          <img
            src={branding.logo_url}
            alt={branding.logo_alt || "Logo"}
            className="h-11 max-w-[180px] object-contain"
          />
        ) : (
          <h1 className="text-sm font-bold text-foreground">Relatórios</h1>
        )}
        {company && <span className="text-xs text-muted-foreground">{company.name}</span>}
        <div className="flex-1" />
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-surface-elevated"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
      </header>

      {/* Module banner */}
      <div className="print:hidden relative -mb-3">
        <div
          className="inline-flex items-center gap-1.5 md:gap-2 px-2.5 md:px-4 py-0.5 md:py-1 pr-7 md:pr-10 relative mt-1"
          style={{
            background: "hsl(0 0% 0% / 0.85)",
            backdropFilter: "blur(12px)",
            clipPath: "polygon(0 0, 100% 0, calc(100% - 32px) 100%, 0 100%)",
          }}
        >
          <div className="flex items-center gap-0.5 text-xs md:text-sm font-semibold tracking-tight">
            <span className="font-light opacity-75" style={{ color: "hsl(0 0% 85%)" }}>Prism</span>
            <span className="gradient-text font-bold">IA</span>
          </div>
          <span
            className="text-xs md:text-sm font-semibold tracking-tight"
            style={{ color: "hsl(var(--primary))" }}
          >
            Agenda
          </span>
        </div>
      </div>

      <main className="px-6 py-6 max-w-3xl mx-auto space-y-6 relative z-10">
        <div className="flex items-center gap-2 px-1">
          <BarChart3 className="h-4 w-4 text-primary" />
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Relatórios
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>

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
