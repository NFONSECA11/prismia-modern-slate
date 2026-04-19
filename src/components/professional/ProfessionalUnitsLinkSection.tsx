import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { useAuth } from "@/contexts/AuthContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Plus, Trash2, Link2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { toast } from "sonner";

interface ProfessionalUnit {
  id: number;
  professional: number;
  professional_name?: string;
  unit: number;
  unit_name?: string;
  is_active?: boolean;
  priority?: number;
}

const unpack = (data: any): any[] => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

export default function ProfessionalUnitsLinkSection() {
  const { company, units, activeUnit } = useAuth();
  const qc = useQueryClient();

  const [showNew, setShowNew] = useState(false);
  const [newProfId, setNewProfId] = useState<number | "">("");
  const [newUnitId, setNewUnitId] = useState<number | "">("");
  const [newPriority, setNewPriority] = useState("0");

  // Professionals (catalog for select + names)
  const { data: professionals = [] } = useQuery<any[]>({
    queryKey: ["professionals-all", activeUnit?.id],
    queryFn: async () => {
      const { data } = await api.get(`/api/booking/professionals/`, {
        params: activeUnit?.id ? { unit: activeUnit.id } : undefined,
      });
      return unpack(data);
    },
  });

  // Aggregate links: try unfiltered first, then per professional
  const queryKey = ["professional-units-all", professionals.map((p: any) => p.id).join(",")];
  const { data: items = [], isLoading } = useQuery<ProfessionalUnit[]>({
    queryKey,
    queryFn: async () => {
      try {
        const { data } = await api.get(`/api/booking/professional-units/`);
        const list = unpack(data);
        if (list.length > 0) return list;
      } catch {}

      if (professionals.length === 0) return [];
      const reqs = professionals.map((p: any) =>
        api.get(`/api/booking/professional-units/`, { params: { professional: p.id } })
          .then((r) => unpack(r.data))
          .catch(() => [])
      );
      const results = await Promise.all(reqs);
      const all: ProfessionalUnit[] = [];
      const seen = new Set<number>();
      for (const list of results) {
        for (const it of list) {
          if (!seen.has(it.id)) { seen.add(it.id); all.push(it); }
        }
      }
      return all;
    },
    enabled: professionals.length > 0,
  });

  const createLink = useMutation({
    mutationFn: async (payload: { professional: number; unit: number; priority: number }) => {
      await fetchCsrf();
      const { data } = await api.post(`/api/booking/professional-units/`, {
        ...payload,
        is_active: true,
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      setShowNew(false);
      setNewProfId("");
      setNewUnitId("");
      setNewPriority("0");
      toast.success("Vínculo criado");
    },
    onError: () => toast.error("Erro ao criar vínculo"),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      await fetchCsrf();
      await api.patch(`/api/booking/professional-units/${id}/`, { is_active });
    },
    onMutate: async ({ id, is_active }) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<ProfessionalUnit[]>(queryKey);
      qc.setQueryData<ProfessionalUnit[]>(queryKey, (old) =>
        old?.map((u) => (u.id === id ? { ...u, is_active } : u))
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toast.error("Erro ao alterar status");
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  const removeLink = useMutation({
    mutationFn: async (id: number) => {
      await fetchCsrf();
      await api.delete(`/api/booking/professional-units/${id}/`);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey }); toast.success("Vínculo removido"); },
    onError: () => toast.error("Erro ao remover vínculo"),
  });

  const profName = (id: number, fallback?: string) =>
    fallback ?? professionals.find((p) => p.id === id)?.name ?? `#${id}`;
  const unitName = (id: number, fallback?: string) =>
    fallback ?? units.find((u) => u.id === id)?.name ?? `#${id}`;

  return (
    <Collapsible defaultOpen={false} id="section-profissionais-unidades">
      <CollapsibleTrigger
        className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated"
        style={{ background: "hsl(var(--surface))" }}
      >
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary shrink-0" />
          <div className="text-left">
            <span className="text-sm font-bold text-foreground">Profissionais → Unidades</span>
            <p className="text-xs text-muted-foreground">Vínculos entre profissionais e unidades</p>
          </div>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
      </CollapsibleTrigger>
      <CollapsibleContent
        className="mt-2 rounded-xl border border-border p-4 space-y-1"
        style={{ background: "hsl(var(--surface))" }}
      >
        <div className="grid grid-cols-[3rem_8rem_minmax(0,1fr)_minmax(0,1fr)_4rem_auto_2rem] gap-2 px-3 py-1 items-center">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">ID</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Empresa</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Profissional</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Unidade</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Prior.</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
          <span />
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground px-3">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3">Nenhum vínculo encontrado.</p>
        ) : (
          items.map((item) => {
            const active = item.is_active !== false;
            return (
              <div
                key={item.id}
                className="grid grid-cols-[3rem_8rem_minmax(0,1fr)_minmax(0,1fr)_4rem_auto_2rem] gap-2 items-center rounded-lg px-3 py-2 border border-border"
                style={{ background: "hsl(var(--surface-elevated))" }}
              >
                <span className="text-xs font-mono text-muted-foreground">{item.id}</span>
                <span className="text-xs text-muted-foreground truncate">{company?.name ?? "—"}</span>
                <span className="text-sm font-medium text-foreground truncate">{profName(item.professional, item.professional_name)}</span>
                <span className="text-sm text-foreground truncate">{unitName(item.unit, item.unit_name)}</span>
                <span className="text-xs font-mono text-muted-foreground">{item.priority ?? 0}</span>
                <Switch
                  checked={active}
                  onCheckedChange={(checked) => toggleActive.mutate({ id: item.id, is_active: checked })}
                  className="scale-75"
                />
                <button
                  onClick={() => removeLink.mutate(item.id)}
                  className="flex items-center justify-end text-muted-foreground hover:text-destructive transition-colors"
                  title="Remover vínculo"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}

        {showNew ? (
          <div
            className="rounded-lg border border-border p-3 mt-2 space-y-2"
            style={{ background: "hsl(var(--surface-elevated))" }}
          >
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Empresa</span>
                <div className="h-8 px-2 flex items-center text-xs text-foreground rounded-md border border-border bg-background/60 truncate">
                  {company?.name ?? "—"}
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Profissional</span>
                <select
                  value={newProfId}
                  onChange={(e) => setNewProfId(e.target.value ? Number(e.target.value) : "")}
                  className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground"
                >
                  <option value="">Selecione…</option>
                  {professionals.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Unidade</span>
                <select
                  value={newUnitId}
                  onChange={(e) => setNewUnitId(e.target.value ? Number(e.target.value) : "")}
                  className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground"
                >
                  <option value="">Selecione…</option>
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Prioridade</span>
                <Input
                  type="number"
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => { setShowNew(false); setNewProfId(""); setNewUnitId(""); setNewPriority("0"); }}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs"
                disabled={!newProfId || !newUnitId || createLink.isPending}
                onClick={() => createLink.mutate({
                  professional: newProfId as number,
                  unit: newUnitId as number,
                  priority: parseInt(newPriority) || 0,
                })}
              >
                {createLink.isPending ? "…" : "Salvar"}
              </Button>
            </div>
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
