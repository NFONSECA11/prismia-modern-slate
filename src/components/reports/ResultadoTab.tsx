import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  fetchResultsOverview,
  fetchResultsRevenue,
  fetchResultsRevenueBreakdown,
  type ReportFilters,
} from "@/lib/reportsApi";
import { ReportCard, ReportKpi } from "./ReportCard";

interface Props {
  filters: ReportFilters;
}

const fmtBRL = (n?: number) =>
  n === undefined || n === null
    ? "—"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
        maximumFractionDigits: 0,
      }).format(n);

const fmtPct = (n?: number) =>
  n === undefined || n === null ? "—" : `${n.toFixed(1)}%`;

const fmtNum = (n?: number) =>
  n === undefined || n === null ? "—" : n.toLocaleString("pt-BR");

const BAR_COLORS = [
  "bg-status-confirmed",
  "bg-primary",
  "bg-primary/70",
  "bg-status-confirmed/70",
];

export function ResultadoTab({ filters }: Props) {
  const [groupBy, setGroupBy] = useState<"day" | "week" | "month">("day");
  const [dimRevenue, setDimRevenue] = useState<"unit" | "professional" | "procedure" | "source">("unit");

  const overview = useQuery({
    queryKey: ["reports", "results", "overview", filters],
    queryFn: () => fetchResultsOverview(filters),
  });
  const revenue = useQuery({
    queryKey: ["reports", "results", "revenue", filters, groupBy],
    queryFn: () => fetchResultsRevenue({ ...filters, group_by: groupBy }),
  });
  const breakdownPrimary = useQuery({
    queryKey: ["reports", "results", "revenue-breakdown", filters, dimRevenue],
    queryFn: () => fetchResultsRevenueBreakdown({ ...filters, dimension: dimRevenue }),
  });
  const breakdownProf = useQuery({
    queryKey: ["reports", "results", "revenue-breakdown", filters, "professional-list"],
    queryFn: () => fetchResultsRevenueBreakdown({ ...filters, dimension: "professional" }),
  });

  const o = overview.data;
  const isLoadingAny =
    overview.isLoading ||
    revenue.isLoading ||
    breakdownPrimary.isLoading ||
    breakdownProf.isLoading;

  return (
    <div className="space-y-4">
      {isLoadingAny && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando dados…
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ReportKpi label="Receita estimada" value={fmtBRL(o?.estimated_revenue)} sub="no período" tone="good" />
        <ReportKpi label="Ticket médio" value={fmtBRL(o?.avg_ticket)} sub="por agendamento" tone="accent" />
        <ReportKpi
          label="Receita recuperada — waitlist"
          value={fmtBRL(o?.recovered_revenue_waitlist)}
          sub="no período"
          tone="good"
        />
        <ReportKpi
          label="Agendamentos confirmados"
          value={fmtNum(o?.confirmed_bookings)}
          sub="com valor associado"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <ReportCard
          title="Receita ao longo do tempo"
          action={
            <select
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as "day" | "week" | "month")}
              className="text-xs px-2 py-1 rounded-md border border-border bg-background text-foreground"
            >
              <option value="day">Por dia</option>
              <option value="week">Por semana</option>
              <option value="month">Por mês</option>
            </select>
          }
        >
          <div className="flex items-center gap-3 text-xs text-muted-foreground mb-2">
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-primary" /> Receita estimada
            </span>
          </div>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenue.data?.series ?? []}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  width={56}
                  tickFormatter={(v) => fmtBRL(v as number)}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--surface))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => fmtBRL(v)}
                />
                <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ReportCard>

        <ReportCard
          title="Receita por dimensão"
          action={
            <select
              value={dimRevenue}
              onChange={(e) =>
                setDimRevenue(e.target.value as "unit" | "professional" | "procedure" | "source")
              }
              className="text-xs px-2 py-1 rounded-md border border-border bg-background text-foreground"
            >
              <option value="unit">Unidade</option>
              <option value="professional">Profissional</option>
              <option value="procedure">Procedimento</option>
              <option value="source">Origem</option>
            </select>
          }
        >
          <RevenueBarList items={breakdownPrimary.data?.items ?? []} />
          {!(breakdownPrimary.data?.items?.length) && !breakdownPrimary.isLoading && (
            <p className="text-xs text-muted-foreground italic">Sem dados.</p>
          )}
        </ReportCard>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <ReportCard title="Receita por profissional">
          <RevenueBarList items={breakdownProf.data?.items ?? []} />
          {!(breakdownProf.data?.items?.length) && !breakdownProf.isLoading && (
            <p className="text-xs text-muted-foreground italic">Sem dados.</p>
          )}
        </ReportCard>

        <ReportCard title="Receita recuperada">
          <p className="text-xs text-muted-foreground mb-3">
            Agendamentos que seriam perdidos e foram convertidos pelo sistema.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <RecoveredCard
              label="Via waitlist"
              value={fmtBRL(breakdownPrimary.data?.recovered_waitlist?.revenue ?? o?.recovered_revenue_waitlist)}
              desc={
                breakdownPrimary.data?.recovered_waitlist
                  ? `${fmtNum(breakdownPrimary.data.recovered_waitlist.bookings)} agendamentos recuperados`
                  : undefined
              }
              tone="good"
            />
            <RecoveredCard
              label="Via reagendamento"
              value={fmtBRL(breakdownPrimary.data?.recovered_reschedule?.revenue ?? 0)}
              desc={
                breakdownPrimary.data?.recovered_reschedule?.bookings
                  ? `${fmtNum(breakdownPrimary.data.recovered_reschedule.bookings)} agendamentos`
                  : "nenhum no período"
              }
            />
          </div>
        </ReportCard>
      </div>
    </div>
  );
}

function RevenueBarList({
  items,
}: {
  items: { key: string; label: string; revenue: number; pct: number }[];
}) {
  return (
    <div className="space-y-2.5">
      {items.map((it, idx) => (
        <div key={it.key} className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-36 flex-shrink-0 truncate">
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
                {fmtBRL(it.revenue)}
              </span>
            </div>
          </div>
          <span className="text-xs text-muted-foreground w-20 text-right">
            {fmtBRL(it.revenue)}
          </span>
        </div>
      ))}
    </div>
  );
}

function RecoveredCard({
  label,
  value,
  desc,
  tone = "default",
}: {
  label: string;
  value: string;
  desc?: string;
  tone?: "default" | "good";
}) {
  const valueCls = tone === "good" ? "text-status-confirmed" : "text-muted-foreground";
  const borderCls = tone === "good" ? "border-l-status-confirmed" : "border-l-border";
  return (
    <div
      className={`rounded-lg p-3 border-l-4 ${borderCls}`}
      style={{ background: "hsl(var(--surface-elevated))" }}
    >
      <div className="text-[11px] text-muted-foreground mb-1">{label}</div>
      <div className={`text-lg font-semibold ${valueCls}`}>{value}</div>
      {desc && <div className="text-[11px] text-muted-foreground mt-1">{desc}</div>}
    </div>
  );
}
