import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { useAuth } from "@/contexts/AuthContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Plus } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

interface ServiceCategory {
  id: number;
  name?: string;
  slug?: string;
  code?: string;
  is_active?: boolean;
  status?: string;
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
    queryKey: ["service-categories"],
    queryFn: async () => {
      await fetchCsrf();
      const { data } = await api.get("/api/settings/service-categories/");
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
      const { data } = await api.post("/api/settings/service-categories/", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["service-categories"] });
      setShowNew(false);
      setNewName("");
      setNewCode("");
      toast.success("Categoria criada com sucesso");
    },
    onError: () => toast.error("Erro ao criar categoria"),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      await fetchCsrf();
      await api.patch(`/api/settings/service-categories/${id}/`, { is_active, status: is_active ? "active" : "inactive" });
    },
    onMutate: async ({ id, is_active }) => {
      await queryClient.cancelQueries({ queryKey: ["service-categories"] });
      const prev = queryClient.getQueryData(["service-categories"]);
      queryClient.setQueryData(["service-categories"], (old: any[]) =>
        old?.map((s: any) => (s.id === id ? { ...s, is_active, status: is_active ? "active" : "inactive" } : s))
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) queryClient.setQueryData(["service-categories"], ctx.prev);
      toast.error("Erro ao alterar status");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["service-categories"] }),
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
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground px-3">Carregando…</p>
        ) : (items as ServiceCategory[]).length === 0 ? (
          <p className="text-xs text-muted-foreground px-3">Nenhuma categoria encontrada.</p>
        ) : (
          (items as ServiceCategory[]).map((item) => {
            const active = item.is_active !== false && item.status !== "inactive";
            return (
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
                <Switch
                  checked={active}
                  onCheckedChange={(checked) => toggleActive.mutate({ id: item.id, is_active: checked })}
                  className="scale-75"
                />
              </div>
            );
          })
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
