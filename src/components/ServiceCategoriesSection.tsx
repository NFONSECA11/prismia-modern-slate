import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { useAuth } from "@/contexts/AuthContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

interface ProcedureSpecialty {
  id: number;
  name?: string;
  slug?: string;
  code?: string;
  description?: string;
  company?: number;
  company_name?: string;
}

export default function ServiceCategoriesSection() {
  const { user, company } = useAuth();
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["procedure-specialties"],
    queryFn: async () => {
      await fetchCsrf();
      const { data } = await api.get("/api/settings/procedure-specialties/");
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

  const createCategory = useMutation({
    mutationFn: async (payload: { name: string; company?: number; code?: string }) => {
      await fetchCsrf();
      const { data } = await api.post("/api/settings/procedure-specialties/", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["procedure-specialties"] });
      setShowNew(false);
      setNewName("");
      setNewCode("");
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

  return (
    <Collapsible defaultOpen={false} id="section-categorias-servicos">
      <CollapsibleTrigger
        className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated"
        style={{ background: "hsl(var(--surface))" }}
      >
        <div className="text-left">
          <span className="text-sm font-bold text-foreground">Categorias dos Serviços</span>
          <p className="text-xs text-muted-foreground">
            Gerenciar categorias para organização dos serviços
          </p>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
      </CollapsibleTrigger>
      <CollapsibleContent
        className="mt-2 rounded-xl border border-border p-4 space-y-1"
        style={{ background: "hsl(var(--surface))" }}
      >
        {/* Header */}
        <div className="grid grid-cols-[5rem_3rem_1fr_8rem_auto] gap-2 px-3 py-1 items-center">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Empresa</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">ID</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Nome</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Código</span>
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
              className="grid grid-cols-[5rem_3rem_1fr_8rem_auto] gap-2 items-center rounded-lg px-3 py-2 border border-border"
              style={{ background: "hsl(var(--surface-elevated))" }}
            >
              <span className="text-xs text-muted-foreground truncate">
                {item.company_name ?? company?.name ?? "—"}
              </span>
              <span className="text-xs font-mono text-muted-foreground">{item.id}</span>
              <span className="text-sm font-medium text-foreground truncate">
                {item.name ?? item.slug ?? `#${item.id}`}
              </span>
              <span className="text-xs font-mono text-muted-foreground">
                {item.code ?? item.slug ?? "—"}
              </span>
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
            <Input
              placeholder="Empresa"
              value={company?.name ?? ""}
              disabled
              className="h-8 text-sm w-28"
            />
            <Input
              placeholder="Nome da categoria"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="h-8 text-sm flex-1"
            />
            <Input
              placeholder="Código"
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              className="h-8 text-sm w-28"
            />
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={!newName.trim() || createCategory.isPending}
              onClick={() => createCategory.mutate({ name: newName.trim(), ...(company?.id ? { company: company.id } : {}), ...(newCode.trim() ? { code: newCode.trim() } : {}) })}
            >
              {createCategory.isPending ? "…" : "Salvar"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => { setShowNew(false); setNewName(""); setNewCode(""); }}
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
