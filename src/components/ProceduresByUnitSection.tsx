import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { useAuth } from "@/contexts/AuthContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface UnitProcedure {
  id: number;
  procedure_name?: string;
  procedure_slug?: string;
  procedure?: number;
  unit?: number;
  unit_name?: string;
  enabled?: boolean;
  is_active?: boolean;
  duration_override?: number | null;
  price_override?: string | number | null;
  duration?: number | null;
  price?: string | number | null;
}

export default function ProceduresByUnitSection() {
  const { units, user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch for each unit
  const unitQueries = units.map((unit) => {
    const query = useQuery({
      queryKey: ["unit-procedures", unit.id],
      queryFn: async () => {
        await fetchCsrf();
        const { data } = await api.get("/api/settings/unit-procedures/", { params: { unit: unit.id } });
        if (Array.isArray(data)) return data;
        if (data?.results) return data.results;
        if (data?.data) return data.data;
        const inner = data?.result;
        if (Array.isArray(inner)) return inner;
        if (inner?.results) return inner.results;
        return [];
      },
      enabled: !!user,
    });
    return { unit, ...query };
  });

  const toggleEnabled = useMutation({
    mutationFn: async ({ id, enabled, unitId }: { id: number; enabled: boolean; unitId: number }) => {
      await fetchCsrf();
      await api.patch(`/api/settings/unit-procedures/${id}/`, { enabled });
    },
    onMutate: async ({ id, enabled, unitId }) => {
      const key = ["unit-procedures", unitId];
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData(key);
      queryClient.setQueryData(key, (old: any[]) =>
        old?.map((p: any) => (p.id === id ? { ...p, enabled } : p))
      );
      return { prev, unitId };
    },
    onError: (_err, _vars, context) => {
      if (context) queryClient.setQueryData(["unit-procedures", context.unitId], context.prev);
      toast.error("Erro ao alterar status do procedimento");
    },
    onSettled: (_d, _e, vars) => {
      queryClient.invalidateQueries({ queryKey: ["unit-procedures", vars.unitId] });
    },
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
        {units.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3">Nenhuma unidade encontrada.</p>
        ) : (
          unitQueries.map(({ unit, data: procedures = [], isLoading }) => (
            <div key={unit.id} className="space-y-1">
              <span className="text-xs font-bold text-foreground px-3">{unit.name}</span>

              {/* Header */}
              <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-1 items-center">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Procedimento
                </span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground w-20 text-right">
                  Duração
                </span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground w-16 text-right">
                  Ativo
                </span>
              </div>

              {isLoading ? (
                <p className="text-xs text-muted-foreground px-3">Carregando…</p>
              ) : (procedures as UnitProcedure[]).length === 0 ? (
                <p className="text-xs text-muted-foreground px-3">Nenhum procedimento nesta unidade.</p>
              ) : (
                (procedures as UnitProcedure[]).map((proc) => {
                  const active = proc.enabled !== false && proc.is_active !== false;
                  const duration = proc.duration_override ?? proc.duration;
                  return (
                    <div
                      key={proc.id}
                      className="grid grid-cols-[1fr_auto_auto] gap-2 items-center rounded-lg px-3 py-2 border border-border"
                      style={{ background: "hsl(var(--surface-elevated))" }}
                    >
                      <span className="text-sm font-medium text-foreground truncate">
                        {proc.procedure_name ?? proc.procedure_slug ?? `#${proc.procedure ?? proc.id}`}
                      </span>
                      <span className="text-xs text-muted-foreground w-20 text-right">
                        {duration ? `${duration} min` : "—"}
                      </span>
                      <div className="w-16 flex justify-end">
                        <Switch
                          checked={active}
                          onCheckedChange={(checked) =>
                            toggleEnabled.mutate({ id: proc.id, enabled: checked, unitId: unit.id })
                          }
                          className="scale-75"
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ))
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
