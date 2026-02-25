import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { useAuth } from "@/contexts/AuthContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

interface Procedure {
  id: number;
  name?: string;
  slug?: string;
  duration?: number;
  price?: string | number;
  is_active?: boolean;
  status?: string;
}

interface UnitProcedures {
  unitId: number;
  unitName: string;
  procedures: Procedure[];
}

export default function ProceduresByUnitSection() {
  const { units, user } = useAuth();

  const { data: rawProcedures = [], isLoading } = useQuery({
    queryKey: ["procedures-by-unit"],
    queryFn: async () => {
      await fetchCsrf();
      const { data } = await api.get("/api/booking/procedures/");
      if (Array.isArray(data)) return data;
      if (data?.results && Array.isArray(data.results)) return data.results;
      if (data?.data && Array.isArray(data.data)) return data.data;
      const inner = data?.result;
      if (Array.isArray(inner)) return inner;
      if (inner?.results && Array.isArray(inner.results)) return inner.results;
      return [];
    },
    enabled: !!user,
  });

  // Group procedures by unit
  const grouped: UnitProcedures[] = [];
  const byUnit: Record<string, Procedure[]> = {};

  (rawProcedures as any[]).forEach((proc) => {
    const unitKey = String(proc.unit ?? "none");
    if (!byUnit[unitKey]) byUnit[unitKey] = [];
    byUnit[unitKey].push(proc);
  });

  Object.entries(byUnit).forEach(([unitKey, procs]) => {
    const unitId = unitKey === "none" ? 0 : Number(unitKey);
    const unitName =
      (procs[0] as any)?.unit_name ??
      units.find((u) => u.id === unitId)?.name ??
      (unitKey === "none" ? "Sem unidade" : `Unidade ${unitKey}`);
    grouped.push({ unitId, unitName, procedures: procs });
  });

  return (
    <Collapsible defaultOpen={false} id="section-procedimentos-unidade">
      <CollapsibleTrigger
        className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated"
        style={{ background: "hsl(var(--surface))" }}
      >
        <div className="text-left">
          <span className="text-sm font-bold text-foreground">Procedimentos por Unidade</span>
          <p className="text-xs text-muted-foreground">
            Procedimentos cadastrados em cada unidade
          </p>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
      </CollapsibleTrigger>
      <CollapsibleContent
        className="mt-2 rounded-xl border border-border p-4 space-y-4"
        style={{ background: "hsl(var(--surface))" }}
      >
        {isLoading ? (
          <p className="text-xs text-muted-foreground px-3">Carregando…</p>
        ) : rawProcedures.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3">Nenhum procedimento encontrado.</p>
        ) : (
          grouped.map((group) => (
            <div key={group.unitId} className="space-y-1">
              <span className="text-xs font-bold text-foreground px-3">
                {group.unitName}
              </span>

              {/* Header */}
              <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-1 items-center">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Nome
                </span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground w-20 text-right">
                  Duração
                </span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground w-16 text-right">
                  Status
                </span>
              </div>

              {group.procedures.map((proc) => {
                const active = proc.is_active !== false && proc.status !== "inactive";
                return (
                  <div
                    key={proc.id}
                    className="grid grid-cols-[1fr_auto_auto] gap-2 items-center rounded-lg px-3 py-2 border border-border"
                    style={{ background: "hsl(var(--surface-elevated))" }}
                  >
                    <span className="text-sm font-medium text-foreground truncate">
                      {proc.name ?? proc.slug ?? `#${proc.id}`}
                    </span>
                    <span className="text-xs text-muted-foreground w-20 text-right">
                      {proc.duration ? `${proc.duration} min` : "—"}
                    </span>
                    <span
                      className={`text-xs font-medium w-16 text-right ${active ? "text-green-400" : "text-muted-foreground"}`}
                    >
                      {active ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
