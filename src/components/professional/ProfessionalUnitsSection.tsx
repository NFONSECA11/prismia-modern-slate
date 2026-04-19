import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronDown, MapPin, Plus, Trash2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { fetchCsrf } from "@/lib/authApi";
import api from "@/lib/api";
import { toast } from "sonner";

interface ProfessionalItem {
  id: number;
  name: string;
  code?: string;
}

interface ProfessionalUnitRow {
  id: number;
  professional: number;
  professional_name?: string;
  unit: number;
  unit_name?: string;
  is_active?: boolean;
  priority?: number;
}

interface Props {
  professionals: ProfessionalItem[];
  isLoading?: boolean;
}

const unpack = (data: any): any[] => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

export default function ProfessionalUnitsSection({ professionals, isLoading }: Props) {
  const { units } = useAuth();
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [newProfessionalId, setNewProfessionalId] = useState<number | "">("");
  const [newUnitId, setNewUnitId] = useState<number | "">("");
  const [newPriority, setNewPriority] = useState("0");

  const queryKey = ["professional-units-all", professionals.map((p) => p.id).join(",")];

  const { data: items = [], isLoading: isLoadingItems } = useQuery<ProfessionalUnitRow[]>({
    queryKey,
    queryFn: async () => {
      if (professionals.length === 0) return [];
      const results = await Promise.all(
        professionals.map((professional) =>
          api
            .get(`/api/booking/professional-units/`, { params: { professional: professional.id } })
            .then((response) =>
              unpack(response.data).map((item) => ({
                ...item,
                professional: item.professional ?? professional.id,
                professional_name: item.professional_name ?? professional.name,
              }))
            )
            .catch(() => [])
        )
      );

      return results
        .flat()
        .sort((a, b) => {
          const nameA = (a.professional_name ?? "").toLowerCase();
          const nameB = (b.professional_name ?? "").toLowerCase();
          if (nameA !== nameB) return nameA.localeCompare(nameB);
          return (a.unit_name ?? "").localeCompare(b.unit_name ?? "");
        });
    },
    enabled: professionals.length > 0,
  });

  const createLink = useMutation({
    mutationFn: async (payload: { professional: number; unit: number; priority: number }) => {
      await fetchCsrf();
      const { data } = await api.post(`/api/booking/professional-units/`, {
        professional: payload.professional,
        unit: payload.unit,
        is_active: true,
        priority: payload.priority,
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["professional-units"] });
      setShowNew(false);
      setNewProfessionalId("");
      setNewUnitId("");
      setNewPriority("0");
      toast.success("Unidade vinculada");
    },
    onError: () => toast.error("Erro ao vincular unidade"),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      await fetchCsrf();
      await api.patch(`/api/booking/professional-units/${id}/`, { is_active });
    },
    onMutate: async ({ id, is_active }) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<ProfessionalUnitRow[]>(queryKey);
      qc.setQueryData<ProfessionalUnitRow[]>(queryKey, (old) => old?.map((item) => (item.id === id ? { ...item, is_active } : item)));
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: ["professional-units"] });
      toast.success("Vínculo removido");
    },
    onError: () => toast.error("Erro ao remover vínculo"),
  });

  return (
    <Collapsible defaultOpen={false}>
      <CollapsibleTrigger
        className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated"
        style={{ background: "hsl(var(--surface))" }}
      >
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-primary shrink-0" />
          <div className="text-left">
            <span className="text-sm font-bold text-foreground block">Profissionais → Unidades</span>
            <p className="text-xs text-muted-foreground">Unidades vinculadas a cada profissional</p>
          </div>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-2 rounded-xl border border-border p-4 space-y-2" style={{ background: "hsl(var(--surface))" }}>
        <div className="grid grid-cols-[1fr_1fr_4rem_auto_2rem] gap-2 px-3 py-1 items-center">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Profissional</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Unidade</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Prior.</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
          <span />
        </div>

        {isLoading || isLoadingItems ? (
          <p className="text-xs text-muted-foreground px-3">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3">Nenhum vínculo encontrado.</p>
        ) : (
          items.map((item) => {
            const active = item.is_active !== false;
            const unitName = item.unit_name ?? units.find((unit) => unit.id === item.unit)?.name ?? `#${item.unit}`;
            return (
              <div
                key={item.id}
                className="grid grid-cols-[1fr_1fr_4rem_auto_2rem] gap-2 items-center rounded-lg px-3 py-2 border border-border"
                style={{ background: "hsl(var(--surface-elevated))" }}
              >
                <span className="text-sm font-medium text-foreground truncate">{item.professional_name ?? `#${item.professional}`}</span>
                <span className="text-sm text-foreground truncate">{unitName}</span>
                <span className="text-xs font-mono text-muted-foreground">{item.priority ?? 0}</span>
                <Switch checked={active} onCheckedChange={(checked) => toggleActive.mutate({ id: item.id, is_active: checked })} className="scale-75" />
                <button onClick={() => removeLink.mutate(item.id)} className="text-muted-foreground hover:text-destructive transition-colors" title="Remover vínculo">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}

        {showNew ? (
          <div className="flex flex-wrap items-center gap-2 pt-2 px-3">
            <select
              value={newProfessionalId}
              onChange={(e) => setNewProfessionalId(e.target.value ? Number(e.target.value) : "")}
              className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground flex-1"
            >
              <option value="">Profissional</option>
              {professionals.map((professional) => (
                <option key={professional.id} value={professional.id}>{professional.name}</option>
              ))}
            </select>
            <select
              value={newUnitId}
              onChange={(e) => setNewUnitId(e.target.value ? Number(e.target.value) : "")}
              className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground flex-1"
            >
              <option value="">Unidade</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>{unit.name}</option>
              ))}
            </select>
            <Input type="number" placeholder="Prior." value={newPriority} onChange={(e) => setNewPriority(e.target.value)} className="h-8 text-sm w-20" />
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={!newProfessionalId || !newUnitId || createLink.isPending}
              onClick={() => createLink.mutate({ professional: newProfessionalId as number, unit: newUnitId as number, priority: parseInt(newPriority) || 0 })}
            >
              {createLink.isPending ? "…" : "Salvar"}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setShowNew(false); setNewProfessionalId(""); setNewUnitId(""); setNewPriority("0"); }}>
              Cancelar
            </Button>
          </div>
        ) : (
          <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors pt-2 px-3">
            <Plus className="h-3.5 w-3.5" />
            Vincular unidade
          </button>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}