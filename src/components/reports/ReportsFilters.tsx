import { Building2, CalendarRange, Stethoscope, UserRound } from "lucide-react";
import type { ReportFilters } from "@/lib/reportsApi";

interface Option { id: number | string; name: string }

interface Props {
  value: ReportFilters;
  onChange: (next: ReportFilters) => void;
  units?: Option[];
  professionals?: Option[];
  procedures?: Option[];
}

export function ReportsFilters({ value, onChange, units = [], professionals = [], procedures = [] }: Props) {
  const set = (patch: Partial<ReportFilters>) => onChange({ ...value, ...patch });

  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded-xl border border-border px-3 py-2"
      style={{ background: "hsl(var(--surface))" }}
    >
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarRange className="h-3.5 w-3.5" />
        <span>Período</span>
      </div>
      <input
        type="date"
        value={value.date_from ?? ""}
        onChange={(e) => set({ date_from: e.target.value })}
        className="text-xs px-2 py-1 rounded-md border border-border bg-background text-foreground"
      />
      <span className="text-xs text-muted-foreground">até</span>
      <input
        type="date"
        value={value.date_to ?? ""}
        onChange={(e) => set({ date_to: e.target.value })}
        className="text-xs px-2 py-1 rounded-md border border-border bg-background text-foreground"
      />

      {units.length > 0 && (
        <label className="flex items-center gap-1.5">
          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            value={value.unit_id ?? ""}
            onChange={(e) => set({ unit_id: e.target.value || undefined })}
            className="text-xs px-2 py-1 rounded-md border border-border bg-background text-foreground"
          >
            <option value="">Todas as unidades</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </label>
      )}

      {professionals.length > 0 && (
        <label className="flex items-center gap-1.5">
          <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            value={value.professional_id ?? ""}
            onChange={(e) => set({ professional_id: e.target.value || undefined })}
            className="text-xs px-2 py-1 rounded-md border border-border bg-background text-foreground"
          >
            <option value="">Todos os profissionais</option>
            {professionals.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      )}

      {procedures.length > 0 && (
        <label className="flex items-center gap-1.5">
          <Stethoscope className="h-3.5 w-3.5 text-muted-foreground" />
          <select
            value={value.procedure_id ?? ""}
            onChange={(e) => set({ procedure_id: e.target.value || undefined })}
            className="text-xs px-2 py-1 rounded-md border border-border bg-background text-foreground"
          >
            <option value="">Todos os procedimentos</option>
            {procedures.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}
