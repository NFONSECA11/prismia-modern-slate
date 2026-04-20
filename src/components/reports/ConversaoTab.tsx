import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2 } from "lucide-react";
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  fetchConversionFunnel,
  fetchConversionLosses,
  fetchConversionOverview,
  fetchConversionWaitlist,
  type ReportFilters,
} from "@/lib/reportsApi";
import { ReportCard, ReportKpi } from "./ReportCard";

interface Props {
  filters: ReportFilters;
}

const fmtPct = (n?: number) =>
  n === undefined || n === null ? "—" : `${n.toFixed(1)}%`;
const fmtNum = (n?: number) =>
  n === undefined || n === null ? "—" : n.toLocaleString("pt-BR");

export function ConversaoTab({ filters }: Props) {
  const overview = useQuery({
    queryKey: ["reports", "conversion", "overview", filters],
    queryFn: () => fetchConversionOverview(filters),
  });
  const funnel = useQuery({
    queryKey: ["reports", "conversion", "funnel", filters],
    queryFn: () => fetchConversionFunnel(filters),
  });
  const losses = useQuery({
    queryKey: ["reports", "conversion", "losses", filters],
    queryFn: () => fetchConversionLosses(filters),
  });
  const waitlist = useQuery({
    queryKey: ["reports", "conversion", "waitlist", filters],
    queryFn: () => fetchConversionWaitlist(filters),
  });

  const o = overview.data;
  const isLoadingAny =
    overview.isLoading || funnel.isLoading || losses.isLoading || waitlist.isLoading;

  return (
    <div className="space-y-4">
      {isLoadingAny && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando dados…
        </div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <ReportKpi
          label="Conversas iniciadas"
          value={fmtNum(o?.conversations_started)}
          sub="no período"
        />
        {(() => {
          const rate = o?.conversation_to_attempt_rate;
          const distorted = rate !== undefined && rate !== null && rate > 100;
          if (!distorted) {
            return (
              <ReportKpi
                label="Tentativas de booking"
                value={fmtNum(o?.booking_attempts)}
                sub={o ? `${fmtPct(rate)} das conversas` : undefined}
              />
            );
          }
          return (
            <div
              className="rounded-xl border border-border p-4"
              style={{ background: "hsl(var(--surface-elevated))" }}
            >
              <div className="text-xs text-muted-foreground mb-1.5">Tentativas de booking</div>
              <div className="text-2xl font-semibold text-foreground">{fmtNum(o?.booking_attempts)}</div>
              <div className="flex items-center gap-1 text-xs text-status-pending mt-1">
                <span>{fmtPct(rate)} das conversas</span>
                <TooltipProvider delayDuration={150}>
                  <UiTooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex"
                        aria-label="Aviso de distorção de dados"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      Taxa acima de 100% indica possível distorção dos dados de
                      desenvolvimento (tentativas registradas sem conversa
                      correspondente no período filtrado).
                    </TooltipContent>
                  </UiTooltip>
                </TooltipProvider>
              </div>
            </div>
          );
        })()}
        <ReportKpi
          label="Confirmados"
          value={fmtNum(o?.confirmed_bookings)}
          sub={
            o
              ? `${fmtPct(o.attempt_to_confirm_rate)} das tentativas`
              : undefined
          }
          tone="good"
        />
        <ReportKpi
          label="Conversa → confirmação"
          value={fmtPct(o?.conversation_to_confirm_rate)}
          sub="taxa global"
          tone="warn"
        />
      </div>

      {/* Funil + Taxas */}
      <div className="grid md:grid-cols-2 gap-3">
        <ReportCard title="Funil de conversão">
          <div className="space-y-3">
            {(funnel.data?.steps ?? []).map((s, idx) => {
              const colors = ["bg-primary", "bg-primary/70", "bg-status-confirmed"];
              return (
                <div key={s.key} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-32 flex-shrink-0">
                    {s.label}
                  </span>
                  <div
                    className="flex-1 h-7 rounded-md overflow-hidden"
                    style={{ background: "hsl(var(--surface-elevated))" }}
                  >
                    <div
                      className={`h-full flex items-center px-2 rounded-md ${colors[idx] ?? "bg-primary"}`}
                      style={{ width: `${Math.max(s.pct, 6)}%` }}
                    >
                      <span className="text-xs font-medium text-primary-foreground">
                        {fmtNum(s.value)}
                      </span>
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground w-12 text-right">
                    {s.pct > 100 ? "—" : fmtPct(s.pct)}
                  </span>
                </div>
              );
            })}
            {!(funnel.data?.steps?.length) && !funnel.isLoading && (
              <p className="text-xs text-muted-foreground italic">Sem dados.</p>
            )}
          </div>
        </ReportCard>

        <ReportCard title="Taxas de conversão">
          <ul className="divide-y divide-border">
            <RateRow label="Conversa → tentativa" value={fmtPct(o?.conversation_to_attempt_rate)} />
            <RateRow label="Tentativa → confirmação" value={fmtPct(o?.attempt_to_confirm_rate)} />
            <RateRow
              label="Conversa → confirmação"
              value={fmtPct(o?.conversation_to_confirm_rate)}
              tone="warn"
            />
            <RateRow
              label="Recuperação via waitlist"
              value={fmtPct(waitlist.data?.recovery_rate)}
              tone="good"
            />
          </ul>
        </ReportCard>
      </div>

      {/* Perdas + Waitlist */}
      <div className="grid md:grid-cols-2 gap-3">
        <ReportCard title="Perdas — motivo">
          <p className="text-xs text-muted-foreground mb-3">
            Total: <strong className="text-foreground">{fmtNum(losses.data?.total)}</strong>{" "}
            tentativas sem conversão
          </p>
          <div className="space-y-2.5">
            {(losses.data?.items ?? []).map((it, idx) => {
              const palette = ["bg-status-pending", "bg-muted-foreground/60", "bg-muted-foreground/40"];
              return (
                <div key={it.key} className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground w-40 flex-shrink-0 truncate">
                    {it.label}
                  </span>
                  <div
                    className="flex-1 h-5 rounded-md overflow-hidden"
                    style={{ background: "hsl(var(--surface-elevated))" }}
                  >
                    <div
                      className={`h-full flex items-center px-2 rounded-md ${palette[idx] ?? "bg-muted-foreground/40"}`}
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
              );
            })}
            {!(losses.data?.items?.length) && !losses.isLoading && (
              <p className="text-xs text-muted-foreground italic">Sem perdas no período.</p>
            )}
          </div>
        </ReportCard>

        <ReportCard title="Waitlist">
          <div className="grid grid-cols-3 gap-2 mb-4">
            <MiniStat label="Entradas" value={fmtNum(waitlist.data?.entries)} />
            <MiniStat label="Recuperações" value={fmtNum(waitlist.data?.recoveries)} tone="good" />
            <MiniStat
              label="Taxa recuperação"
              value={fmtPct(waitlist.data?.recovery_rate)}
              tone="good"
            />
          </div>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={waitlist.data?.series ?? []}>
                <defs>
                  <linearGradient id="gEntries" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gRec" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--status-confirmed))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--status-confirmed))" stopOpacity={0} />
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
                  dataKey="entries"
                  name="Entradas"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#gEntries)"
                />
                <Area
                  type="monotone"
                  dataKey="recoveries"
                  name="Recuperações"
                  stroke="hsl(var(--status-confirmed))"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  fill="url(#gRec)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </ReportCard>
      </div>
    </div>
  );
}

function RateRow({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warn" | "good";
}) {
  const cls =
    tone === "good" ? "text-status-confirmed" : tone === "warn" ? "text-status-pending" : "text-foreground";
  return (
    <li className="flex items-center justify-between py-2.5">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={`text-base font-semibold ${cls}`}>{value}</span>
    </li>
  );
}

function MiniStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "good";
}) {
  const cls = tone === "good" ? "text-status-confirmed" : "text-foreground";
  return (
    <div
      className="rounded-lg p-2.5"
      style={{ background: "hsl(var(--surface-elevated))" }}
    >
      <div className="text-[11px] text-muted-foreground mb-0.5">{label}</div>
      <div className={`text-base font-semibold ${cls}`}>{value}</div>
    </div>
  );
}
