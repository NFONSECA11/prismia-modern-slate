import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { useAuth } from "@/contexts/AuthContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface ProfessionalProcedure {
  id: number;
  professional_name?: string;
  professional?: number;
  procedure_name?: string;
  procedure_slug?: string;
  procedure?: number;
  unit?: number;
  unit_name?: string;
  is_active?: boolean;
  status?: string;
}

export default function ServicesByProfessionalSection() {
  const { user, activeUnit } = useAuth();
  const queryClient = useQueryClient();

  const [showNew, setShowNew] = useState(false);
  const [newProfId, setNewProfId] = useState<number | "">("");
  const [newProcedureId, setNewProcedureId] = useState<number | "">("");

  const { data: professionalsData = [] } = useQuery({
    queryKey: ["professionals", activeUnit?.id],
    queryFn: async () => {
      const { data } = await api.get(`/api/booking/professionals/`, {
        params: { unit: activeUnit!.id },
      });
      return Array.isArray(data) ? data : (data?.results ?? []);
    },
    enabled: !!activeUnit?.id,
  });

  const { data: unitProcedures = [] } = useQuery({
    queryKey: ["unit-procedures", activeUnit?.id],
    queryFn: async () => {
      await fetchCsrf();
      const { data } = await api.get("/api/settings/unit-procedures/", { params: { unit: activeUnit!.id } });
      if (Array.isArray(data)) return data;
      if (data?.results) return data.results;
      if (data?.data) return data.data;
      const inner = data?.result;
      if (Array.isArray(inner)) return inner;
      if (inner?.results) return inner.results;
      return [];
    },
    enabled: !!activeUnit?.id,
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["services-by-professional"],
    queryFn: async () => {
      await fetchCsrf();
      const { data } = await api.get("/api/settings/professional-procedures/");
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

  const createItem = useMutation({
    mutationFn: async (payload: { professional: number; procedure: number }) => {
      await fetchCsrf();
      const { data } = await api.post("/api/settings/professional-procedures/", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services-by-professional"] });
      setShowNew(false);
      setNewProfId("");
      setNewProcedureId("");
      toast.success("Serviço vinculado com sucesso");
    },
    onError: (err: any) => {
      console.error("[svc-prof] POST error:", JSON.stringify(err?.response?.data));
      toast.error("Erro ao vincular serviço");
    },
  });

  const deleteItem = useMutation({
    mutationFn: async (id: number) => {
      await fetchCsrf();
      await api.delete(`/api/settings/professional-procedures/${id}/`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["services-by-professional"] });
      toast.success("Vínculo removido");
    },
    onError: () => toast.error("Erro ao remover vínculo"),
  });

  const getProfName = (id: number | undefined) =>
    professionalsData.find((p: any) => p.id === id)?.name ?? `#${id ?? "—"}`;

  return (
    <Collapsible defaultOpen={false} id="section-servicos-profissional">
      <CollapsibleTrigger
        className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated"
        style={{ background: "hsl(var(--surface))" }}
      >
        <div className="text-left">
          <span className="text-sm font-bold text-foreground">Serviços por Profissional</span>
          <p className="text-xs text-muted-foreground">
            Vínculos entre profissionais e serviços
          </p>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
      </CollapsibleTrigger>
      <CollapsibleContent
        className="mt-2 rounded-xl border border-border p-4 space-y-1"
        style={{ background: "hsl(var(--surface))" }}
      >
        {/* Header */}
        <div className="grid grid-cols-[1fr_1fr_auto_2rem] gap-2 px-3 py-1 items-center">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Profissional</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Serviço</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground w-16 text-right">Status</span>
          <span />
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground px-3">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3">Nenhum serviço encontrado.</p>
        ) : (
          (items as ProfessionalProcedure[]).map((item) => {
            const active = item.is_active !== false && item.status !== "inactive";
            return (
              <div
                key={item.id}
                className="grid grid-cols-[1fr_1fr_auto_2rem] gap-2 items-center rounded-lg px-3 py-2 border border-border"
                style={{ background: "hsl(var(--surface-elevated))" }}
              >
                <span className="text-sm font-medium text-foreground truncate">
                  {item.professional_name ?? getProfName(item.professional)}
                </span>
                <span className="text-sm text-foreground truncate">
                  {item.procedure_name ?? item.procedure_slug ?? `#${item.procedure ?? "—"}`}
                </span>
                <span className={`text-xs font-medium w-16 text-right ${active ? "text-green-400" : "text-muted-foreground"}`}>
                  {active ? "Ativo" : "Inativo"}
                </span>
                <button
                  onClick={() => deleteItem.mutate(item.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  title="Remover vínculo"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}

        {/* Create */}
        {showNew ? (
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <select
              value={newProfId}
              onChange={(e) => setNewProfId(e.target.value ? Number(e.target.value) : "")}
              className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground"
            >
              <option value="">Profissional</option>
              {professionalsData.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select
              value={newProcedureId}
              onChange={(e) => setNewProcedureId(e.target.value ? Number(e.target.value) : "")}
              className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground min-w-[140px]"
            >
              <option value="">Procedimento</option>
              {(unitProcedures as any[]).map((p: any) => (
                <option key={p.id} value={p.procedure ?? p.id}>
                  {p.procedure_name ?? p.procedure_slug ?? `#${p.procedure ?? p.id}`}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={!newProfId || !newProcedureId || createItem.isPending}
              onClick={() =>
                createItem.mutate({
                  professional: newProfId as number,
                  procedure: newProcedureId as number,
                })
              }
            >
              {createItem.isPending ? "…" : "Salvar"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => { setShowNew(false); setNewProfId(""); setNewProcedureId(""); }}
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
