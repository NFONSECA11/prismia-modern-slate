import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import {
  fetchPerformanceAiIntents,
  fetchPerformanceAiVsHuman,
  fetchPerformanceHumanService,
  fetchPerformanceOverview,
  type ReportFilters,
} from "@/lib/reportsApi";
import { ReportCard, ReportKpi } from "./ReportCard";

interface Props {
  filters: ReportFilters;
}

const fmtNum = (n?: number) =>
  n === undefined || n === null ? "—" : n.toLocaleString("pt-BR");
const fmtPct = (n?: number) =>
  n === undefined || n === null ? "—" : `${n.toFixed(1)}%`;

const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--status-confirmed))",
  "hsl(var(--muted-foreground))",
  "hsl(var(--border))",
];
const BAR_COLORS = [
  "bg-primary",
  "bg-primary/70",
  "bg-status-confirmed",
  "bg-muted-foreground/40",
];

export function PerformanceTab({ filters }: Props) {
  const overview = useQuery({
    queryKey: ["reports", "performance", "overview", filters],
    queryFn: () => fetchPerformanceOverview(filters),
  });
  const intents = useQuery({
    queryKey: ["reports", "performance", "ai-intents", filters],
    queryFn: () => fetchPerformanceAiIntents(filters),
  });
  const aiVsHuman = useQuery({
    queryKey: ["reports", "performance", "ai-vs-human", filters],
    queryFn: () => fetchPerformanceAiVsHuman(filters),
  });
  const human = useQuery({
    queryKey: ["reports", "performance", "human-service", filters],
    queryFn: () => fetchPerformanceHumanService(filters),
  });

  const o = overview.data;
  const isLoadingAny =
    overview.isLoading || intents.isLoading || aiVsHuman.isLoading || human.isLoading;

  return (
    <div className="space-y-4">
      {isLoadingAny && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando dados…
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ReportKpi
          label="Taxa de handoff"
          value={fmtPct(o?.handoff_rate)}
          sub={o ? `${fmtNum(o.handoff_count)} conversas para humano` : undefined}
          tone="accent"
        />
        <ReportKpi
          label="Tempo médio confirmação"
          value={o?.human_confirmation_avg_minutes != null ? `${o.human_confirmation_avg_minutes} min` : "—"}
          sub="após handoff"
          tone="good"
        />
        <ReportKpi
          label="Total agendamentos"
          value={fmtNum(aiVsHuman.data?.total)}
          sub="IA + Humano"
          tone="good"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <ReportCard title="IA vs humano — agendamentos confirmados">
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-2">
            {(aiVsHuman.data?.items ?? []).map((it, idx) => (
              <span key={it.key} className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ background: PIE_COLORS[idx % PIE_COLORS.length] }}
                />
                {it.label} {fmtPct(it.pct)}
              </span>
            ))}
          </div>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={aiVsHuman.data?.items ?? []}
                  dataKey="count"
                  nameKey="label"
                  innerRadius="60%"
                  outerRadius="90%"
                  paddingAngle={2}
                >
                  {(aiVsHuman.data?.items ?? []).map((_, idx) => (
                    <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--surface))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number, _n, p: { payload: { pct: number; label: string } }) =>
                    [`${fmtNum(v)} (${fmtPct(p.payload.pct)})`, p.payload.label]
                  }
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {!(aiVsHuman.data?.items?.length) && !aiVsHuman.isLoading && (
            <p className="text-xs text-muted-foreground italic mt-2">Sem dados.</p>
          )}
        </ReportCard>

        <ReportCard title="Intents da IA">
          <div className="space-y-2.5">
            {(intents.data?.items ?? []).map((it, idx) => (
              <div key={it.key} className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground w-32 flex-shrink-0 truncate">
                  {it.label}
                </span>
                <div
                  className="flex-1 h-5 rounded-md overflow-hidden"
                  style={{ background: "hsl(var(--surface-elevated))" }}
                >
                  <div
                    className={`h-full flex items-center px-2 rounded-md ${BAR_COLORS[idx % BAR_COLORS.length]}`}
                    style={{ width: `${Math.max(it.pct, 4)}%` }}
                  >
                    <span className="text-[11px] font-medium text-primary-foreground">
                      {fmtPct(it.pct)}
                    </span>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground w-10 text-right">
                  {fmtNum(it.count)}
                </span>
              </div>
            ))}
            {!(intents.data?.items?.length) && !intents.isLoading && (
              <p className="text-xs text-muted-foreground italic">Sem dados.</p>
            )}
          </div>
          {intents.data?.total === 0 && (
            <p className="text-[11px] text-muted-foreground italic mt-3">
              * sem dados de intents no período
            </p>
          )}
        </ReportCard>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <ReportCard title="Atendimento humano por agente">
          <div className="grid grid-cols-[1fr_70px_80px] gap-2 pb-2 border-b border-border text-[11px] font-medium text-muted-foreground">
            <span>Agente</span>
            <span className="text-right">Handoffs</span>
            <span className="text-right">Tempo médio</span>
          </div>
          {(human.data?.agents ?? []).map((a, idx) => (
            <div
              key={a.key ?? idx}
              className="grid grid-cols-[1fr_70px_80px] gap-2 py-2 border-b border-border text-xs"
            >
              <span className="text-foreground truncate">{a.label}</span>
              <span className="text-right text-foreground">{fmtNum(a.handoff_count)}</span>
              <span className="text-right text-foreground">
                {a.confirmation_avg_minutes != null ? `${a.confirmation_avg_minutes} min` : "—"}
              </span>
            </div>
          ))}
          {!(human.data?.agents?.length) && !human.isLoading && (
            <p className="text-xs text-muted-foreground italic mt-3">Sem dados.</p>
          )}
        </ReportCard>

        <ReportCard title="Performance geral">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Total de agentes</span>
              <span className="text-foreground font-medium">{fmtNum(human.data?.agents?.length)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Tempo médio confirmação</span>
              <span className="text-foreground font-medium">
                {fmtNum(human.data?.agents?.[0]?.confirmation_avg_minutes)} min
              </span>
            </div>
          </div>
        </ReportCard>
      </div>
    </div>
  );
}
