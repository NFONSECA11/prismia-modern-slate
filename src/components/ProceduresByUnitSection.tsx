import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { useAuth } from "@/contexts/AuthContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { Switch } from "@/components/ui/switch";
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
  code?: string;
  slug?: string;
}

export default function ProceduresByUnitSection() {
  const { units, user } = useAuth();
  const queryClient = useQueryClient();

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

  const allProcedures: (UnitProcedure & { unitId: number; unitName: string })[] = [];
  let anyLoading = false;

  unitQueries.forEach(({ unit, data = [], isLoading }) => {
    if (isLoading) anyLoading = true;
    (data as UnitProcedure[]).forEach((proc) => {
      allProcedures.push({
        ...proc,
        unitId: unit.id,
        unitName: proc.unit_name ?? unit.name,
      });
    });
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
        className="mt-2 rounded-xl border border-border p-4 space-y-1"
        style={{ background: "hsl(var(--surface))" }}
      >
        {/* Header */}
        <div className="grid grid-cols-[3rem_1fr_1fr_auto_5rem] gap-2 px-3 py-1 items-center">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Unidade</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Nome Unidade</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Nome</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground text-right">Código</span>
        </div>

        {anyLoading ? (
          <p className="text-xs text-muted-foreground px-3">Carregando…</p>
        ) : allProcedures.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3">Nenhum procedimento encontrado.</p>
        ) : (
          allProcedures.map((proc) => {
            const active = proc.enabled !== false && proc.is_active !== false;
            return (
              <div
                key={proc.id}
                className="grid grid-cols-[3rem_1fr_1fr_auto_5rem] gap-2 items-center rounded-lg px-3 py-2 border border-border"
                style={{ background: "hsl(var(--surface-elevated))" }}
              >
                <span className="text-xs font-mono text-muted-foreground">{proc.unitId}</span>
                <span className="text-xs text-muted-foreground">{proc.unitName}</span>
                <span className="text-sm font-medium text-foreground truncate">
                  {proc.procedure_name ?? proc.procedure_slug ?? `#${proc.procedure ?? proc.id}`}
                </span>
                <Switch
                  checked={active}
                  onCheckedChange={(checked) =>
                    toggleEnabled.mutate({ id: proc.id, enabled: checked, unitId: proc.unitId })
                  }
                  className="scale-75"
                />
                <span className="text-xs font-mono text-muted-foreground text-right">
                  {proc.code ?? proc.slug ?? proc.procedure_slug ?? "—"}
                </span>
              </div>
            );
          })
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
