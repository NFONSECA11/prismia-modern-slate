import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { useAuth } from "@/contexts/AuthContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Plus, Trash2, Link } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useMemo } from "react";
import { toast } from "sonner";

interface ProcedureSpecialty {
  id: number;
  specialty?: number;
  specialty_name?: string;
  procedure?: number;
  procedure_name?: string;
  company?: number;
  company_name?: string;
}

export default function ServiceCategoriesSection() {
  const { user, company, units, activeUnit } = useAuth();
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [newSpecialtyId, setNewSpecialtyId] = useState<number | "">("");
  const [newProcedureId, setNewProcedureId] = useState<number | "">("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["procedure-specialties"],
    queryFn: async () => {
      await fetchCsrf();
      const { data } = await api.get("/api/settings/procedure-specialties/");
      console.log("[procedure-specialties] raw response:", data);
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

  // Fetch specialties for lookup & creation select
  const { data: specialties = [] } = useQuery({
    queryKey: ["specialties"],
    queryFn: async () => {
      await fetchCsrf();
      const { data } = await api.get("/api/settings/specialties/");
      if (Array.isArray(data)) return data;
      if (data?.results) return data.results;
      const inner = data?.result;
      if (Array.isArray(inner)) return inner;
      if (inner?.results) return inner.results;
      return [];
    },
    enabled: !!user,
  });

  // Fetch procedures for lookup & creation select
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

  const specMap = useMemo(() => {
    const m = new Map<number, string>();
    specialties.forEach((s: any) => m.set(s.id, s.name ?? s.slug ?? `#${s.id}`));
    return m;
  }, [specialties]);

  const procMap = useMemo(() => {
    const m = new Map<number, string>();
    procedures.forEach((p: any) => m.set(p.id, p.name ?? p.procedure_name ?? p.slug ?? `#${p.id}`));
    return m;
  }, [procedures]);

  const createCategory = useMutation({
    mutationFn: async (payload: { specialty: number; procedure: number; company?: number }) => {
      await fetchCsrf();
      const { data } = await api.post("/api/settings/procedure-specialties/", {
        ...payload,
        company: payload.company ?? company?.id,
      });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procedure-specialties"] });
      setShowNew(false);
      setNewSpecialtyId("");
      setNewProcedureId("");
      toast.success("Categoria criada com sucesso");
    },
    onError: () => toast.error("Erro ao criar categoria"),
  });

  const deleteCategory = useMutation({
    mutationFn: async (id: number) => {
      await fetchCsrf();
      await api.delete(`/api/settings/procedure-specialties/${id}/`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procedure-specialties"] });
      toast.success("Categoria removida com sucesso");
    },
    onError: () => toast.error("Erro ao remover categoria"),
  });

  const getSpecName = (item: ProcedureSpecialty) =>
    item.specialty_name ?? (item.specialty ? specMap.get(item.specialty) ?? `#${item.specialty}` : "—");

  const getProcName = (item: ProcedureSpecialty) =>
    item.procedure_name ?? (item.procedure ? procMap.get(item.procedure) ?? `#${item.procedure}` : "—");

  return (
    <Collapsible defaultOpen={false} id="section-categorias-servicos">
      <CollapsibleTrigger
        className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated"
        style={{ background: "hsl(var(--surface))" }}
      >
        <div className="flex items-center gap-2">
          <Link className="h-4 w-4 text-primary shrink-0" />
          <div className="text-left">
            <span className="text-sm font-bold text-foreground">Especialidade X Procedimento</span>
            <p className="text-xs text-muted-foreground">
              Gerenciar vínculos entre especialidades e procedimentos
            </p>
          </div>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
      </CollapsibleTrigger>
      <CollapsibleContent
        className="mt-2 rounded-xl border border-border p-4 space-y-1 overflow-x-auto"
        style={{ background: "hsl(var(--surface))" }}
      >
        {/* Header */}
        <div className="min-w-[30rem] grid grid-cols-[3rem_1fr_1fr_auto] gap-2 px-3 py-1 items-center">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">ID</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Especialidade</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Procedimento</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground text-right">Ações</span>
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground px-3">Carregando…</p>
        ) : (items as ProcedureSpecialty[]).length === 0 ? (
          <p className="text-xs text-muted-foreground px-3">Nenhuma categoria encontrada.</p>
        ) : (
          (items as ProcedureSpecialty[]).map((item) => (
            <div
              key={item.id}
              className="min-w-[30rem] grid grid-cols-[3rem_1fr_1fr_auto] gap-2 items-center rounded-lg px-3 py-2 border border-border"
              style={{ background: "hsl(var(--surface-elevated))" }}
            >
              <span className="text-xs font-mono text-muted-foreground">{item.id}</span>
              <span className="text-sm font-medium text-foreground truncate">{getSpecName(item)}</span>
              <span className="text-sm text-foreground truncate">{getProcName(item)}</span>
              <button
                onClick={() => deleteCategory.mutate(item.id)}
                className="flex items-center justify-end text-muted-foreground hover:text-destructive transition-colors"
                title="Remover categoria"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}

        {/* Criar categoria */}
        {showNew ? (
          <div className="flex items-center gap-2 pt-2 px-3">
            <select
              value={newSpecialtyId}
              onChange={(e) => setNewSpecialtyId(e.target.value ? Number(e.target.value) : "")}
              className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground flex-1"
            >
              <option value="">Especialidade</option>
              {specialties.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name ?? s.slug ?? `#${s.id}`}</option>
              ))}
            </select>
            <select
              value={newProcedureId}
              onChange={(e) => setNewProcedureId(e.target.value ? Number(e.target.value) : "")}
              className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground flex-1"
            >
              <option value="">Procedimento</option>
              {procedures.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name ?? p.procedure_name ?? p.slug ?? `#${p.id}`}</option>
              ))}
            </select>
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={!newSpecialtyId || !newProcedureId || createCategory.isPending}
              onClick={() => createCategory.mutate({ specialty: newSpecialtyId as number, procedure: newProcedureId as number })}
            >
              {createCategory.isPending ? "…" : "Salvar"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => { setShowNew(false); setNewSpecialtyId(""); setNewProcedureId(""); }}
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
            Adicionar categoria
          </button>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
