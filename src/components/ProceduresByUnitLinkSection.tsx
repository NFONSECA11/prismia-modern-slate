import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { useAuth } from "@/contexts/AuthContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Plus, Trash2, Plug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState, useMemo } from "react";
import { toast } from "sonner";

interface UnitProcedureLink {
  id: number;
  procedure?: number;
  procedure_name?: string;
  unit?: number;
  unit_name?: string;
  override_duration_min?: number | null;
  override_price_min?: string | number | null;
  override_price_max?: string | number | null;
}

export default function ProceduresByUnitLinkSection() {
  const { user, units } = useAuth();
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [newProcedureId, setNewProcedureId] = useState<number | "">("");
  const [newUnitId, setNewUnitId] = useState<number | "">("");
  const [newDuration, setNewDuration] = useState("");
  const [newPriceMin, setNewPriceMin] = useState("");
  const [newPriceMax, setNewPriceMax] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["unit-procedures"],
    queryFn: async () => {
      await fetchCsrf();
      const all: any[] = [];
      for (const u of units) {
        try {
          const { data } = await api.get("/api/settings/unit-procedures/", { params: { unit: u.id } });
          const list = Array.isArray(data) ? data : (data?.results ?? data?.result?.results ?? []);
          list.forEach((item: any) => { if (!all.find((x) => x.id === item.id)) all.push(item); });
        } catch {}
      }
      return all;
    },
    enabled: !!user && units.length > 0,
  });

  // Fetch procedures for the select
  const { data: procedures = [] } = useQuery({
    queryKey: ["procedures"],
    queryFn: async () => {
      await fetchCsrf();
      const { data } = await api.get("/api/settings/procedures/");
      if (Array.isArray(data)) return data;
      if (data?.results) return data.results;
      const inner = data?.result;
      if (Array.isArray(inner)) return inner;
      if (inner?.results) return inner.results;
      return [];
    },
    enabled: !!user,
  });

  const procMap = useMemo(() => {
    const m = new Map<number, string>();
    procedures.forEach((p: any) => m.set(p.id, p.name ?? p.procedure_name ?? `#${p.id}`));
    return m;
  }, [procedures]);

  const unitMap = useMemo(() => {
    const m = new Map<number, string>();
    units.forEach((u: any) => m.set(u.id, u.name ?? `#${u.id}`));
    return m;
  }, [units]);

  const createLink = useMutation({
    mutationFn: async (payload: { procedure: number; unit: number }) => {
      await fetchCsrf();
      const { data } = await api.post("/api/settings/unit-procedures/", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unit-procedures"] });
      setShowNew(false);
      setNewProcedureId("");
      setNewUnitId("");
      toast.success("Vínculo criado com sucesso");
    },
    onError: () => toast.error("Erro ao criar vínculo"),
  });

  const deleteLink = useMutation({
    mutationFn: async (id: number) => {
      await fetchCsrf();
      await api.delete(`/api/settings/unit-procedures/${id}/`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["unit-procedures"] });
      toast.success("Vínculo removido com sucesso");
    },
    onError: () => toast.error("Erro ao remover vínculo"),
  });

  const getProcName = (item: UnitProcedureLink) =>
    item.procedure_name ?? (item.procedure ? procMap.get(item.procedure) ?? `#${item.procedure}` : "—");

  const getUnitName = (item: UnitProcedureLink) =>
    item.unit_name ?? (item.unit ? unitMap.get(item.unit) ?? `#${item.unit}` : "—");

  return (
    <Collapsible defaultOpen={false} id="section-procedimento-unidade">
      <CollapsibleTrigger
        className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated"
        style={{ background: "hsl(var(--surface))" }}
      >
        <div className="flex items-center gap-2">
          <Plug className="h-4 w-4 text-primary shrink-0" />
          <div className="text-left">
            <span className="text-sm font-bold text-foreground">Unidade X Procedimento</span>
            <p className="text-xs text-muted-foreground">
              Gerenciar vínculos entre unidades e procedimentos
            </p>
          </div>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
      </CollapsibleTrigger>
      <CollapsibleContent
        className="mt-2 rounded-xl border border-border p-4 space-y-1"
        style={{ background: "hsl(var(--surface))" }}
      >
        {/* Header */}
        <div className="grid grid-cols-[3rem_1fr_1fr_auto] gap-2 px-3 py-1 items-center">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">ID</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Unidade</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Procedimento</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground text-right">Ações</span>
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground px-3">Carregando…</p>
        ) : (items as UnitProcedureLink[]).length === 0 ? (
          <p className="text-xs text-muted-foreground px-3">Nenhum vínculo encontrado.</p>
        ) : (
          (items as UnitProcedureLink[]).map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[3rem_1fr_1fr_auto] gap-2 items-center rounded-lg px-3 py-2 border border-border"
              style={{ background: "hsl(var(--surface-elevated))" }}
            >
              <span className="text-xs font-mono text-muted-foreground">{item.id}</span>
              <span className="text-sm text-foreground truncate">{getUnitName(item)}</span>
              <span className="text-sm font-medium text-foreground truncate">{getProcName(item)}</span>
              <button
                onClick={() => deleteLink.mutate(item.id)}
                className="flex items-center justify-end text-muted-foreground hover:text-destructive transition-colors"
                title="Remover vínculo"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}

        {/* Criar vínculo */}
        {showNew ? (
          <div className="flex items-center gap-2 pt-2 px-3">
            <select
              value={newUnitId}
              onChange={(e) => setNewUnitId(e.target.value ? Number(e.target.value) : "")}
              className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground flex-1"
            >
              <option value="">Unidade</option>
              {units.map((u: any) => (
                <option key={u.id} value={u.id}>{u.name ?? `#${u.id}`}</option>
              ))}
            </select>
            <select
              value={newProcedureId}
              onChange={(e) => setNewProcedureId(e.target.value ? Number(e.target.value) : "")}
              className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground flex-1"
            >
              <option value="">Procedimento</option>
              {procedures.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name ?? p.procedure_name ?? `#${p.id}`}</option>
              ))}
            </select>
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={!newProcedureId || !newUnitId || createLink.isPending}
              onClick={() => createLink.mutate({ procedure: newProcedureId as number, unit: newUnitId as number })}
            >
              {createLink.isPending ? "…" : "Salvar"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => { setShowNew(false); setNewProcedureId(""); setNewUnitId(""); }}
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
            Adicionar vínculo
          </button>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
