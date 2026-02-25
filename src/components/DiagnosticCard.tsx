import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  ShieldX,
} from "lucide-react";
import { toast } from "sonner";

interface UnitHealth {
  status: "ok" | "warn" | "error";
  can_enable_auto: boolean;
  issues: { code: string; message: string }[];
  stats: {
    procedures?: number;
    professionals?: number;
    mappings?: number;
    availabilities?: number;
    timeoffs?: number;
  };
}

const STATUS_CONFIG = {
  ok: { label: "OK", icon: CheckCircle2, color: "text-green-400", bg: "bg-green-400/10", border: "border-green-400/30" },
  warn: { label: "WARN", icon: AlertTriangle, color: "text-yellow-400", bg: "bg-yellow-400/10", border: "border-yellow-400/30" },
  error: { label: "ERROR", icon: XCircle, color: "text-red-400", bg: "bg-red-400/10", border: "border-red-400/30" },
};

const ISSUE_ROUTES: Record<string, { label: string; route: string | null }> = {
  procedure_without_professional: { label: "Serviços & Mapeamentos", route: null },
  professional_without_availability: { label: "Agenda", route: null },
  unit_procedure_disabled: { label: "Config interna", route: null },
  booking_settings_missing: { label: "Modo de Atendimento", route: null },
};

const STAT_LABELS: Record<string, string> = {
  procedures: "Procedimentos",
  professionals: "Profissionais",
  mappings: "Mapeamentos",
  availabilities: "Disponibilidades",
  timeoffs: "Bloqueios",
};

const MAX_ISSUES_COLLAPSED = 3;

export default function DiagnosticCard({ unit }: { unit: { id: number; name: string } }) {
  const [showAllIssues, setShowAllIssues] = useState(false);

  const { user } = useAuth();

  const {
    data: health,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery<UnitHealth>({
    queryKey: ["health", unit.id],
    queryFn: async () => {
      const { data } = await api.get(`/api/settings/health/`, { params: { unit: unit.id } });
      return data?.result ?? data;
    },
    retry: 1,
    enabled: !!user,
  });

  if (isLoading) {
    return (
      <div
        className="rounded-lg border border-border px-4 py-3 animate-pulse"
        style={{ background: "hsl(var(--surface-elevated))" }}
      >
        <div className="flex items-center gap-3">
          <div className="h-4 w-24 rounded bg-muted" />
          <div className="h-5 w-14 rounded-full bg-muted" />
        </div>
      </div>
    );
  }

  if (isError || !health) {
    return (
      <div
        className="rounded-lg border border-red-400/30 px-4 py-3 flex items-center justify-between"
        style={{ background: "hsl(var(--surface-elevated))" }}
      >
        <div className="flex items-center gap-2">
          <XCircle className="h-4 w-4 text-red-400" />
          <span className="text-sm font-medium text-foreground">{unit.name}</span>
          <span className="text-xs text-red-400">Erro ao carregar diagnóstico</span>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs gap-1.5"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
          Tentar novamente
        </Button>
      </div>
    );
  }

  const cfg = STATUS_CONFIG[health.status] ?? STATUS_CONFIG.error;
  const StatusIcon = cfg.icon;
  const issues = health.issues ?? [];
  const visibleIssues = showAllIssues ? issues : issues.slice(0, MAX_ISSUES_COLLAPSED);
  const stats = health.stats ?? {};
  const hasStats = Object.values(stats).some((v) => v !== undefined && v !== null);

  return (
    <div
      className={`rounded-lg border ${cfg.border} px-4 py-3 space-y-3`}
      style={{ background: "hsl(var(--surface-elevated))" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-sm font-medium text-foreground">{unit.name}</span>
          <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>
            <StatusIcon className="h-3 w-3" />
            {cfg.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 text-xs ${health.can_enable_auto ? "text-green-400" : "text-red-400"}`}>
            {health.can_enable_auto ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldX className="h-3.5 w-3.5" />}
            Auto: {health.can_enable_auto ? "Permitido" : "Bloqueado"}
          </span>
          <span className="text-xs font-mono text-muted-foreground">#{unit.id}</span>
        </div>
      </div>

      {/* Stats */}
      {hasStats && (
        <div className="flex flex-wrap gap-3">
          {Object.entries(stats).map(([key, val]) =>
            val !== undefined && val !== null ? (
              <div key={key} className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{STAT_LABELS[key] ?? key}:</span>
                <span className="text-xs font-bold text-foreground">{val}</span>
              </div>
            ) : null,
          )}
        </div>
      )}

      {/* Issues */}
      {issues.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Pendências ({issues.length})
          </span>
          {visibleIssues.map((issue, i) => {
            const route = ISSUE_ROUTES[issue.code];
            return (
              <div
                key={i}
                className="flex items-center justify-between rounded-md px-3 py-1.5 border border-border"
                style={{ background: "hsl(var(--background))" }}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <AlertTriangle className="h-3 w-3 text-yellow-400 shrink-0" />
                  <span className="text-xs text-foreground truncate">{issue.message || issue.code}</span>
                </div>
                {route ? (
                  route.route ? (
                    <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 shrink-0" asChild>
                      <a href={route.route}>
                        Corrigir <ExternalLink className="h-2.5 w-2.5" />
                      </a>
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] gap-1 shrink-0"
                      onClick={() => toast.info(`"${route.label}" — em breve disponível`)}
                    >
                      Corrigir <ExternalLink className="h-2.5 w-2.5" />
                    </Button>
                  )
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] gap-1 shrink-0"
                    onClick={() => toast.info("Correção ainda não disponível")}
                  >
                    Corrigir <ExternalLink className="h-2.5 w-2.5" />
                  </Button>
                )}
              </div>
            );
          })}
          {issues.length > MAX_ISSUES_COLLAPSED && (
            <button
              onClick={() => setShowAllIssues(!showAllIssues)}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors pt-1 px-1"
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${showAllIssues ? "rotate-180" : ""}`} />
              {showAllIssues ? "Ver menos" : `Ver mais ${issues.length - MAX_ISSUES_COLLAPSED} pendência(s)`}
            </button>
          )}
        </div>
      )}

      {issues.length === 0 && (
        <p className="text-xs text-green-400 flex items-center gap-1.5">
          <CheckCircle2 className="h-3 w-3" />
          Nenhuma pendência encontrada
        </p>
      )}
    </div>
  );
}
