import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { useAuth } from "@/contexts/AuthContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
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
  const { units, user, company } = useAuth();
  const queryClient = useQueryClient();

  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDuration, setNewDuration] = useState("");
  const [newPriceMin, setNewPriceMin] = useState("");
  const [newPriceMax, setNewPriceMax] = useState("");

  const proceduresQuery = useQuery({
    queryKey: ["procedures"],
    queryFn: async () => {
      await fetchCsrf();
      const { data } = await api.get("/api/settings/procedures/");
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

  const allProcedures = (proceduresQuery.data ?? []) as any[];
  const anyLoading = proceduresQuery.isLoading;

  const toggleEnabled = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      await fetchCsrf();
      await api.patch(`/api/settings/procedures/${id}/`, { is_active });
    },
    onMutate: async ({ id, is_active }) => {
      const key = ["procedures"];
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData(key);
      queryClient.setQueryData(key, (old: any[]) =>
        old?.map((p: any) => (p.id === id ? { ...p, is_active } : p))
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context) queryClient.setQueryData(["procedures"], context.prev);
      toast.error("Erro ao alterar status do procedimento");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["procedures"] });
    },
  });

  const createProcedure = useMutation({
    mutationFn: async (payload: { name: string; company: number; duration_min?: number; price_min?: string; price_max?: string }) => {
      await fetchCsrf();
      const { data } = await api.post("/api/settings/procedures/", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procedures"] });
      setShowNew(false);
      setNewName("");
      setNewDuration("");
      setNewPriceMin("");
      setNewPriceMax("");
      toast.success("Procedimento adicionado com sucesso");
    },
    onError: (err: any) => {
      console.error("[create-procedure] response:", JSON.stringify(err?.response?.data), "status:", err?.response?.status);
      toast.error("Erro ao adicionar procedimento");
    },
  });

  const deleteProcedure = useMutation({
    mutationFn: async (id: number) => {
      await fetchCsrf();
      await api.delete(`/api/settings/procedures/${id}/`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procedures"] });
      toast.success("Procedimento removido com sucesso");
    },
    onError: () => toast.error("Erro ao remover procedimento"),
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
        <div className="grid grid-cols-[3rem_1fr_1fr_5rem_5rem_5rem_auto_2rem] gap-2 px-3 py-1 items-center">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Empresa</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Nome Empresa</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Nome</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Duração</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Preço Mín</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Preço Máx</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
          <span />
        </div>

        {anyLoading ? (
          <p className="text-xs text-muted-foreground px-3">Carregando…</p>
        ) : allProcedures.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3">Nenhum procedimento encontrado.</p>
        ) : (
          allProcedures.map((proc) => {
            const active = proc.is_active !== false;
            return (
              <div
                key={proc.id}
                className="grid grid-cols-[3rem_1fr_1fr_5rem_5rem_5rem_auto_2rem] gap-2 items-center rounded-lg px-3 py-2 border border-border"
                style={{ background: "hsl(var(--surface-elevated))" }}
              >
                <span className="text-xs font-mono text-muted-foreground">{proc.company_id ?? proc.company ?? company?.id ?? "—"}</span>
                <span className="text-xs text-muted-foreground">{proc.company_name ?? company?.name ?? "—"}</span>
                <span className="text-sm font-medium text-foreground truncate">
                  {proc.procedure_name ?? proc.name ?? proc.procedure_slug ?? `#${proc.id}`}
                </span>
                <span className="text-xs text-muted-foreground">{proc.duration_min ? `${proc.duration_min} min` : "—"}</span>
                <span className="text-xs text-muted-foreground">{proc.price_min != null ? `R$ ${Number(proc.price_min).toFixed(2)}` : "—"}</span>
                <span className="text-xs text-muted-foreground">{proc.price_max != null ? `R$ ${Number(proc.price_max).toFixed(2)}` : "—"}</span>
                <Switch
                  checked={active}
                  onCheckedChange={(checked) =>
                    toggleEnabled.mutate({ id: proc.id, is_active: checked })
                  }
                  className="scale-75"
                />
                <button
                  onClick={() => deleteProcedure.mutate(proc.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  title="Remover procedimento"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}

        {/* Criar procedimento */}
        {showNew ? (
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <div className="h-8 px-3 rounded-md border border-border bg-background inline-flex items-center">
              <span className="text-xs text-muted-foreground">
                Empresa: <span className="text-foreground font-medium">{company?.name ?? "—"}</span>
              </span>
            </div>
            <Input
              placeholder="Nome do procedimento"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-8 text-sm flex-1 min-w-[140px]"
            />
            <Input
              placeholder="Duração (min)"
              type="number"
              value={newDuration}
              onChange={(e) => setNewDuration(e.target.value)}
              className="h-8 text-sm w-24"
            />
            <Input
              placeholder="Preço mín"
              type="number"
              step="0.01"
              value={newPriceMin}
              onChange={(e) => setNewPriceMin(e.target.value)}
              className="h-8 text-sm w-24"
            />
            <Input
              placeholder="Preço máx"
              type="number"
              step="0.01"
              value={newPriceMax}
              onChange={(e) => setNewPriceMax(e.target.value)}
              className="h-8 text-sm w-24"
            />
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={!company?.id || !newName.trim() || createProcedure.isPending}
              onClick={() =>
                createProcedure.mutate({
                  name: newName.trim(),
                  company: company?.id as number,
                  ...(newDuration ? { duration_min: Number(newDuration) } : {}),
                  ...(newPriceMin ? { price_min: newPriceMin } : {}),
                  ...(newPriceMax ? { price_max: newPriceMax } : {}),
                })
              }
            >
              {createProcedure.isPending ? "…" : "Salvar"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => { setShowNew(false); setNewName(""); setNewDuration(""); setNewPriceMin(""); setNewPriceMax(""); }}
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
