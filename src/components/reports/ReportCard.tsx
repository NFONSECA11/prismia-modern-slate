import { ReactNode } from "react";

interface Props {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function ReportCard({ title, action, children, className = "" }: Props) {
  return (
    <div
      className={`rounded-2xl border border-border p-3 sm:p-5 ${className}`}
      style={{ background: "hsl(var(--surface))" }}
    >
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

interface KpiProps {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "default" | "good" | "warn" | "accent";
}

const toneClass: Record<NonNullable<KpiProps["tone"]>, string> = {
  default: "text-foreground",
  good: "text-status-confirmed",
  warn: "text-status-pending",
  accent: "text-primary",
};

export function ReportKpi({ label, value, sub, tone = "default" }: KpiProps) {
  return (
    <div
      className="rounded-xl border border-border p-3 sm:p-4"
      style={{ background: "hsl(var(--surface-elevated))" }}
    >
      <div className="text-xs text-muted-foreground mb-1.5">{label}</div>
      <div className={`text-2xl font-semibold ${toneClass[tone]}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
    </div>
  );
}
