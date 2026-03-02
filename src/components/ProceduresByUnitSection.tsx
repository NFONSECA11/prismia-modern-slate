import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { useAuth } from "@/contexts/AuthContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Plus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState } from "react";

interface UnitProcedure {
  id: number;
  procedure_name?: string;
  procedure_slug?: string;
  procedure?: number;
  unit?: number;
  unit_name?: string;
  enabled?: boolean;
  is_active?: boolean;
}

export default function ProceduresByUnitSection() {
  const { units, user, company, activeUnit } = useAuth();
  const queryClient = useQueryClient();

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newUnitId, setNewUnitId] = useState<number | "">(activeUnit?.id ?? "");

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

  const allProcedures: (UnitProcedure & { unitId: number; companyId: number | null; companyName: string })[] = [];
  let anyLoading = false;

  unitQueries.forEach(({ unit, data = [], isLoading }) => {
    if (isLoading) anyLoading = true;
    (data as any[]).forEach((proc) => {
      allProcedures.push({
        ...proc,
        unitId: unit.id,
        companyId: proc.company_id ?? proc.company ?? company?.id ?? null,
        companyName: proc.company_name ?? company?.name ?? "",
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

  const createProcedure = useMutation({
    mutationFn: async (payload: { procedure_name: string; unit: number }) => {
      await fetchCsrf();
      const { data } = await api.post("/api/settings/unit-procedures/", payload);
      return data;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ["unit-procedures", vars.unit] });
      setShowNew(false);
      setNewName("");
      setNewUnitId(activeUnit?.id ?? "");
      toast.success("Procedimento adicionado com sucesso");
    },
    onError: () => {
      toast.error("Erro ao adicionar procedimento");
    },
  });

  return (
    <Collapsible defaultOpen={false} id="section-procedimentos-unidade">
      <CollapsibleTrigger
        className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated"
        style={{ background: "hsl(var(--surface))" }}
      >
        <div className="text-left">
          <span className="text-sm font-bold text-foreground">Procedimentos</span>
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
        <div className="grid grid-cols-[3rem_1fr_1fr_auto] gap-2 px-3 py-1 items-center">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Empresa</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Nome Empresa</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Nome</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
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
                className="grid grid-cols-[3rem_1fr_1fr_auto] gap-2 items-center rounded-lg px-3 py-2 border border-border"
                style={{ background: "hsl(var(--surface-elevated))" }}
              >
                <span className="text-xs font-mono text-muted-foreground">{proc.companyId ?? "—"}</span>
                <span className="text-xs text-muted-foreground">{proc.companyName}</span>
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
              </div>
            );
          })
        )}

        {/* Criar procedimento */}
        {showNew ? (
          <div className="flex items-center gap-2 pt-2">
            <select
              value={newUnitId}
              onChange={(e) => setNewUnitId(e.target.value ? Number(e.target.value) : "")}
              className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground z-50"
            >
              <option value="">Unidade</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <Input
              placeholder="Nome do procedimento"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-8 text-sm flex-1"
            />
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={!newName.trim() || !newUnitId || createProcedure.isPending}
              onClick={() =>
                createProcedure.mutate({
                  procedure_name: newName.trim(),
                  unit: newUnitId as number,
                })
              }
            >
              {createProcedure.isPending ? "…" : "Salvar"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => { setShowNew(false); setNewName(""); }}
            >
              Cancelar
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors pt-2 px-3"
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar procedimento
          </button>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
