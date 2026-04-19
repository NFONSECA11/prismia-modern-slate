import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Award, ChevronDown, Plus, Trash2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { fetchCsrf } from "@/lib/authApi";
import api from "@/lib/api";
import { toast } from "sonner";

interface ProfessionalItem {
  id: number;
  name: string;
}

interface ProfessionalUnit {
  id: number;
  professional: number;
  professional_name?: string;
  unit: number;
  unit_name?: string;
}

interface ProfessionalSpecialty {
  id: number;
  professional_unit: number;
  professional_name?: string;
  unit_name?: string;
  specialty: number;
  specialty_name?: string;
  is_active?: boolean;
}

interface Specialty {
  id: number;
  name?: string;
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

export default function ProfessionalSpecialtiesSection({ professionals, isLoading }: Props) {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [newProfUnitId, setNewProfUnitId] = useState<number | "">("");
  const [newSpecId, setNewSpecId] = useState<number | "">("");

  const queryKey = ["professional-specialties-all", professionals.map((p) => p.id).join(",")];

  const { data, isLoading: isLoadingItems } = useQuery<{
    profUnits: ProfessionalUnit[];
    items: ProfessionalSpecialty[];
    specialties: Specialty[];
  }>({
    queryKey,
    queryFn: async () => {
      if (professionals.length === 0) return { profUnits: [], items: [], specialties: [] };

      const profUnitResults = await Promise.all(
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

      const profUnits = profUnitResults.flat();
      const { data: specialtiesResponse } = await api.get(`/api/settings/specialties/`);
      const specialties = unpack(specialtiesResponse);

      const specialtyResults = await Promise.all(
        profUnits.map((profUnit) =>
          api
            .get(`/api/booking/professional-specialties/`, { params: { professional_unit: profUnit.id } })
            .then((response) =>
              unpack(response.data).map((item) => ({
                ...item,
                professional_name: item.professional_name ?? profUnit.professional_name,
                unit_name: item.unit_name ?? profUnit.unit_name,
              }))
            )
            .catch(() => [])
        )
      );

      const items = specialtyResults.flat().sort((a, b) => {
        const nameA = (a.professional_name ?? "").toLowerCase();
        const nameB = (b.professional_name ?? "").toLowerCase();
        if (nameA !== nameB) return nameA.localeCompare(nameB);
        return (a.specialty_name ?? "").localeCompare(b.specialty_name ?? "");
      });

      return { profUnits, items, specialties };
    },
    enabled: professionals.length > 0,
  });

  const profUnits = data?.profUnits ?? [];
  const items = data?.items ?? [];
  const specialties = data?.specialties ?? [];

  const createLink = useMutation({
    mutationFn: async (payload: { professional_unit: number; specialty: number }) => {
      await fetchCsrf();
      const { data } = await api.post(`/api/booking/professional-specialties/`, { ...payload, is_active: true });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      setShowNew(false);
      setNewProfUnitId("");
      setNewSpecId("");
      toast.success("Especialidade vinculada");
    },
    onError: () => toast.error("Erro ao vincular especialidade"),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      await fetchCsrf();
      await api.patch(`/api/booking/professional-specialties/${id}/`, { is_active });
    },
    onMutate: async ({ id, is_active }) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<{ profUnits: ProfessionalUnit[]; items: ProfessionalSpecialty[]; specialties: Specialty[] }>(queryKey);
      qc.setQueryData(queryKey, (old: any) => old ? { ...old, items: old.items.map((item: ProfessionalSpecialty) => item.id === id ? { ...item, is_active } : item) } : old);
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
      await api.delete(`/api/booking/professional-specialties/${id}/`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast.success("Vínculo removido");
    },
    onError: () => toast.error("Erro ao remover vínculo"),
  });

  return (
    <Collapsible defaultOpen={false}>
      <CollapsibleTrigger className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated" style={{ background: "hsl(var(--surface))" }}>
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-primary shrink-0" />
          <div className="text-left">
            <span className="text-sm font-bold text-foreground block">Profissionais → Especialidades</span>
            <p className="text-xs text-muted-foreground">Especialidades disponíveis por profissional</p>
          </div>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-2 rounded-xl border border-border p-4 space-y-2" style={{ background: "hsl(var(--surface))" }}>
        <div className="grid grid-cols-[1fr_1fr_1fr_auto_2rem] gap-2 px-3 py-1 items-center">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Profissional</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Unidade</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Especialidade</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
          <span />
        </div>

        {isLoading || isLoadingItems ? (
          <p className="text-xs text-muted-foreground px-3">Carregando…</p>
        ) : profUnits.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3">Vincule uma unidade primeiro para gerenciar especialidades.</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3">Nenhuma especialidade vinculada.</p>
        ) : (
          items.map((item) => {
            const active = item.is_active !== false;
            return (
              <div key={item.id} className="grid grid-cols-[1fr_1fr_1fr_auto_2rem] gap-2 items-center rounded-lg px-3 py-2 border border-border" style={{ background: "hsl(var(--surface-elevated))" }}>
                <span className="text-sm font-medium text-foreground truncate">{item.professional_name ?? "—"}</span>
                <span className="text-xs text-muted-foreground truncate">{item.unit_name ?? "—"}</span>
                <span className="text-sm text-foreground truncate">{item.specialty_name ?? specialties.find((specialty) => specialty.id === item.specialty)?.name ?? `#${item.specialty}`}</span>
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
            <select value={newProfUnitId} onChange={(e) => setNewProfUnitId(e.target.value ? Number(e.target.value) : "")} className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground flex-1">
              <option value="">Profissional / Unidade</option>
              {profUnits.map((profUnit) => (
                <option key={profUnit.id} value={profUnit.id}>{`${profUnit.professional_name ?? `#${profUnit.professional}`} — ${profUnit.unit_name ?? `#${profUnit.unit}`}`}</option>
              ))}
            </select>
            <select value={newSpecId} onChange={(e) => setNewSpecId(e.target.value ? Number(e.target.value) : "")} className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground flex-1">
              <option value="">Especialidade</option>
              {specialties.map((specialty) => (
                <option key={specialty.id} value={specialty.id}>{specialty.name ?? `#${specialty.id}`}</option>
              ))}
            </select>
            <Button size="sm" className="h-8 text-xs" disabled={!newProfUnitId || !newSpecId || createLink.isPending} onClick={() => createLink.mutate({ professional_unit: newProfUnitId as number, specialty: newSpecId as number })}>
              {createLink.isPending ? "…" : "Salvar"}
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => { setShowNew(false); setNewProfUnitId(""); setNewSpecId(""); }}>
              Cancelar
            </Button>
          </div>
        ) : (
          <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors pt-2 px-3">
            <Plus className="h-3.5 w-3.5" />
            Vincular especialidade
          </button>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}