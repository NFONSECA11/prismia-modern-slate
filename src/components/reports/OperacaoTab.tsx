import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

import {
  fetchOperationsBookings,
  fetchOperationsBookingSources,
  fetchOperationsDistribution,
  fetchOperationsOverview,
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
  "hsl(var(--status-handoff))",
  "hsl(var(--status-pending))",
];
const BAR_COLORS = [
  "bg-primary",
  "bg-primary/70",
  "bg-status-confirmed",
  "bg-status-confirmed/70",
];

export function OperacaoTab({ filters }: Props) {
  const overview = useQuery({
    queryKey: ["reports", "operations", "overview", filters],
    queryFn: () => fetchOperationsOverview(filters),
  });

  const [groupBy, setGroupBy] = useStateGroupBy();
  const bookings = useQuery({
    queryKey: ["reports", "operations", "bookings", filters, groupBy],
    queryFn: () => fetchOperationsBookings({ ...filters, group_by: groupBy }),
  });

  const [dimension, setDimension] = useStateDimension();
  const distribution = useQuery({
    queryKey: ["reports", "operations", "distribution", filters, dimension],
    queryFn: () =>
      fetchOperationsDistribution({ ...filters, dimension }),
  });

  const sources = useQuery({
    queryKey: ["reports", "operations", "booking-sources", filters],
    queryFn: () => fetchOperationsBookingSources(filters),
  });

  const o = overview.data;
  const isLoadingAny =
    overview.isLoading || bookings.isLoading || distribution.isLoading || sources.isLoading;

  return (
    <div className="space-y-4">
      {isLoadingAny && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando dados…
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ReportKpi label="Agendamentos confirmados" value={fmtNum(o?.confirmed)} sub="no período" tone="good" />
        <ReportKpi label="Slots disponíveis" value={fmtNum(o?.available_slots)} sub="no horizonte" />
        <ReportKpi
          label="Slots preenchidos"
          value={fmtNum(o?.filled_slots)}
          sub={o ? `de ${fmtNum(o.available_slots)} disponíveis` : undefined}
        />
        <ReportKpi
          label="Taxa de ocupação"
          value={fmtPct(o?.occupancy_rate)}
          sub="oportunidade de crescimento"
          tone="warn"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <ReportCard
          title="Tendência de agendamentos"
          action={
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as any)}
              className="text-xs px-2 py-1 rounded-md border border-border bg-background text-foreground"
            >
              <option value="day">Por dia</option>
              <option value="week">Por semana</option>
              <option value="month">Por mês</option>
            </select>
          }
        >
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={bookings.data?.series ?? []}>
                <defs>
                  <linearGradient id="gOpsTrend" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} width={28} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--surface))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="confirmed"
                  name="Confirmados"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#gOpsTrend)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ReportCard>

        <ReportCard title="Ocupação por unidade">
          <BarList items={(sourcesUnitFromOverview(o) ?? []).length ? [] : []} />
          <BarList
            items={
              (distribution.data?.dimension === "unit"
                ? distribution.data?.items
                : []) ?? []
            }
            valueLabel={(v) => `${v} agend.`}
          />
          {distribution.data?.dimension !== "unit" && (
            <p className="text-xs text-muted-foreground italic">
              Selecione "Unidade" no card abaixo para alimentar este painel, ou aguarde dados específicos.
            </p>
          )}
        </ReportCard>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <ReportCard
          title="Distribuição"
          action={
            <select
              value={dimension}
              onChange={(e) => setDimension(e.target.value as any)}
              className="text-xs px-2 py-1 rounded-md border border-border bg-background text-foreground"
            >
              <option value="professional">Profissional</option>
              <option value="unit">Unidade</option>
              <option value="procedure">Procedimento</option>
            </select>
          }
        >
          <BarList
            items={distribution.data?.items ?? []}
            valueLabel={(v) => fmtNum(v)}
          />
          {!(distribution.data?.items?.length) && !distribution.isLoading && (
            <p className="text-xs text-muted-foreground italic">Sem dados.</p>
          )}
        </ReportCard>

        <ReportCard title="Origem dos agendamentos">
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mb-2">
            {(sources.data?.items ?? []).map((it, idx) => (
              <span key={it.key} className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-sm"
                  style={{ background: PIE_COLORS[idx % PIE_COLORS.length] }}
                />
                {it.label} {fmtPct(it.pct)}
              </span>
            ))}
          </div>
          <div className="h-36">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sources.data?.items ?? []}
                  dataKey="count"
                  nameKey="label"
                  innerRadius="60%"
                  outerRadius="90%"
                  paddingAngle={2}
                >
                  {(sources.data?.items ?? []).map((_, idx) => (
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
                  formatter={(v: number, _n, p: any) =>
                    [`${fmtNum(v)} (${fmtPct(p.payload.pct)})`, p.payload.label]
                  }
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {!(sources.data?.items?.length) && !sources.isLoading && (
            <p className="text-xs text-muted-foreground italic mt-2">Sem dados.</p>
          )}
        </ReportCard>
      </div>
    </div>
  );
}

function BarList({
  items,
  valueLabel = (v: number) => String(v),
}: {
  items: { key: string; label: string; count: number; pct: number }[];
  valueLabel?: (v: number) => string;
}) {
  return (
    <div className="space-y-2.5">
      {items.map((it, idx) => (
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
                {valueLabel(it.count)}
              </span>
            </div>
          </div>
          <span className="text-xs text-muted-foreground w-12 text-right">
            {it.pct.toFixed(0)}%
          </span>
        </div>
      ))}
    </div>
  );
}

// helpers para estado local sem importar React extra
import { useState } from "react";
function useStateGroupBy() {
  return useState<"day" | "week" | "month">("day");
}
function useStateDimension() {
  return useState<"unit" | "professional" | "procedure">("professional");
}

// placeholder para tipagem (não usado em runtime)
function sourcesUnitFromOverview(_o: unknown) {
  return null;
}
