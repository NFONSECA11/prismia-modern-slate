import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { useAuth } from "@/contexts/AuthContext";
import { MapPin, Plus, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { toast } from "sonner";
import SubSectionShell from "./SubSectionShell";

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

interface Props {
  professionalId: number;
}

export default function ProfessionalUnitsSubSection({ professionalId }: Props) {
  const { units } = useAuth();
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [newUnitId, setNewUnitId] = useState<number | "">("");
  const [newPriority, setNewPriority] = useState("0");

  const queryKey = ["professional-units", professionalId];

  const { data: items = [], isLoading } = useQuery<ProfessionalUnit[]>({
    queryKey,
    queryFn: async () => {
      const { data } = await api.get(`/api/booking/professional-units/`, {
        params: { professional: professionalId },
      });
      return unpack(data);
    },
  });

  const createLink = useMutation({
    mutationFn: async (payload: { unit: number; priority: number }) => {
      await fetchCsrf();
      const { data } = await api.post(`/api/booking/professional-units/`, {
        professional: professionalId,
        unit: payload.unit,
        is_active: true,
        priority: payload.priority,
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      setShowNew(false);
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast.success("Vínculo removido");
    },
    onError: () => toast.error("Erro ao remover vínculo"),
  });

  // Available units for new link (exclude already-linked)
  const linkedUnitIds = new Set(items.map((i) => i.unit));
  const availableUnits = units.filter((u) => !linkedUnitIds.has(u.id));

  return (
    <SubSectionShell icon={MapPin} title="Unidades" description="Unidades onde este profissional atua">
      {/* Header */}
      <div className="grid grid-cols-[1fr_4rem_auto_2rem] gap-2 px-3 py-1 items-center">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Unidade</span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Prior.</span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
        <span />
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground px-3">Carregando…</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground px-3">Nenhuma unidade vinculada.</p>
      ) : (
        items.map((item) => {
          const active = item.is_active !== false;
          return (
            <div
              key={item.id}
              className="grid grid-cols-[1fr_4rem_auto_2rem] gap-2 items-center rounded-lg px-3 py-2 border border-border"
              style={{ background: "hsl(var(--surface-elevated))" }}
            >
              <span className="text-sm font-medium text-foreground truncate">
                {item.unit_name ?? units.find((u) => u.id === item.unit)?.name ?? `#${item.unit}`}
              </span>
              <span className="text-xs font-mono text-muted-foreground">{item.priority ?? 0}</span>
              <Switch
                checked={active}
                onCheckedChange={(checked) => toggleActive.mutate({ id: item.id, is_active: checked })}
                className="scale-75"
              />
              <button
                onClick={() => removeLink.mutate(item.id)}
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
        <div className="flex items-center gap-2 pt-2 px-3">
          <select
            value={newUnitId}
            onChange={(e) => setNewUnitId(e.target.value ? Number(e.target.value) : "")}
            className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground flex-1"
          >
            <option value="">Selecione a unidade</option>
            {availableUnits.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <Input
            type="number"
            placeholder="Prior."
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value)}
            className="h-8 text-sm w-20"
          />
          <Button
            size="sm"
            className="h-8 text-xs"
            disabled={!newUnitId || createLink.isPending}
            onClick={() => createLink.mutate({ unit: newUnitId as number, priority: parseInt(newPriority) || 0 })}
          >
            {createLink.isPending ? "…" : "Salvar"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-xs"
            onClick={() => { setShowNew(false); setNewUnitId(""); setNewPriority("0"); }}
          >
            Cancelar
          </Button>
        </div>
      ) : availableUnits.length > 0 ? (
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors pt-2 px-3"
        >
          <Plus className="h-3.5 w-3.5" />
          Vincular unidade
        </button>
      ) : null}
    </SubSectionShell>
  );
}
