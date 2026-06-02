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
  company_id?: number;
  company_name?: string;
  professional: number;
  professional_id?: number;
  professional_name?: string;
  professional__name?: string;
  unit: number;
  unit_id?: number;
  unit_name?: string;
  unit__name?: string;
  is_active?: boolean;
  priority?: number;
}

const unpack = (data: any): any[] => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data)) return data.data;
  if (data?.result) return unpack(data.result);
  return [];
};

const normalizeLink = (item: any): ProfessionalUnit => {
  const professionalValue = item?.professional ?? item?.professional_id;
  const unitValue = item?.unit ?? item?.unit_id;
  const professional = typeof professionalValue === "object" ? Number(professionalValue?.id ?? 0) : Number(professionalValue ?? 0);
  const unit = typeof unitValue === "object" ? Number(unitValue?.id ?? 0) : Number(unitValue ?? 0);

  return {
    ...item,
    professional,
    professional_id: professional || undefined,
    professional_name:
      item?.professional_name ??
      item?.professional__name ??
      (typeof professionalValue === "object" ? professionalValue?.name : undefined),
    unit,
    unit_id: unit || undefined,
    unit_name:
      item?.unit_name ??
      item?.unit__name ??
      (typeof unitValue === "object" ? unitValue?.name : undefined),
  };
};

export default function ProfessionalUnitsLinkSection() {
  const { company, units, activeUnit, isLoading: isAuthLoading, isAuthenticated } = useAuth();
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
    enabled: !isAuthLoading && isAuthenticated,
  });

  const queryKey = ["professional-units-all", activeUnit?.id ?? "all", professionals.map((p: any) => p.id).join(",")];
  const { data: items = [], isLoading } = useQuery<ProfessionalUnit[]>({
    queryKey,
    queryFn: async () => {
      const all: ProfessionalUnit[] = [];
      const seen = new Set<number>();
      const pushList = (list: ProfessionalUnit[]) => {
        for (const it of list) {
          if (it.id && !seen.has(it.id)) { seen.add(it.id); all.push(it); }
        }
      };

      // 1) Listagem global (sem filtros)
      try {
        const { data } = await api.get(`/api/booking/professional-units/`, { params: { page_size: 500 } });
        const list = unpack(data).map(normalizeLink).filter((item) => item.id && item.professional && item.unit);
        console.info("[professional-units] global response count:", list.length, "raw:", data);
        pushList(list);
      } catch (e) {
        console.warn("[professional-units] global fetch failed", e);
      }

      // 2) Itera por cada unidade conhecida (caso o backend filtre por unidade ativa)
      if (units.length > 0) {
        const unitReqs = units.map((u) =>
          api.get(`/api/booking/professional-units/`, { params: { unit: u.id, page_size: 500 } })
            .then((r) => unpack(r.data).map(normalizeLink))
            .catch(() => [])
        );
        const unitResults = await Promise.all(unitReqs);
        for (const list of unitResults) {
          pushList(list.filter((item) => item.id && item.professional && item.unit));
        }
      }

      // 3) Itera por cada profissional como rede de segurança final
      if (professionals.length > 0) {
        const reqs = professionals.map((p: any) =>
          api.get(`/api/booking/professional-units/`, { params: { professional: p.id, page_size: 500 } })
            .then((r) => unpack(r.data).map(normalizeLink))
            .catch(() => [])
        );
        const results = await Promise.all(reqs);
        for (const list of results) {
          pushList(list.filter((item) => item.id && item.professional && item.unit));
        }
      }

      console.info("[professional-units] total merged:", all.length);
      return all;
    },
    enabled: !isAuthLoading && isAuthenticated,
  });

  const normalizedItems = items.map(normalizeLink).filter((item) => item.id && item.professional && item.unit);

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
      qc.invalidateQueries({ queryKey: ["professional-units-by-unit"] });
      qc.invalidateQueries({ queryKey: ["professional-units"] });
      qc.invalidateQueries({ queryKey: ["professional-units-as-options"] });
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
    onSettled: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["professional-units-by-unit"] });
    },
  });

  const removeLink = useMutation({
    mutationFn: async (id: number) => {
      await fetchCsrf();
      await api.delete(`/api/booking/professional-units/${id}/`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["professional-units-by-unit"] });
      qc.invalidateQueries({ queryKey: ["professional-units"] });
      qc.invalidateQueries({ queryKey: ["professional-units-as-options"] });
      toast.success("Vínculo removido");
    },
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
        className="mt-2 rounded-xl border border-border p-4 space-y-1 overflow-x-auto"
        style={{ background: "hsl(var(--surface))" }}
      >
        <div className="min-w-[40rem] grid grid-cols-[3rem_8rem_minmax(0,1fr)_minmax(0,1fr)_4rem_auto_2rem] gap-2 px-3 py-1 items-center">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">ID</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Empresa</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Profissional</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Unidade</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Prior.</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
          <span />
        </div>

        {isAuthLoading || isLoading ? (
          <p className="text-xs text-muted-foreground px-3">Carregando…</p>
        ) : normalizedItems.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3">Nenhum vínculo encontrado.</p>
        ) : (
          normalizedItems.map((item) => {
            const active = item.is_active !== false;
            return (
              <div
                key={item.id}
                className="min-w-[40rem] grid grid-cols-[3rem_8rem_minmax(0,1fr)_minmax(0,1fr)_4rem_auto_2rem] gap-2 items-center rounded-lg px-3 py-2 border border-border"
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
