import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { Award, Plus, Trash2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";
import SubSectionShell from "./SubSectionShell";

interface ProfessionalUnit {
  id: number;
  professional: number;
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

const unpack = (data: any): any[] => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

interface Props {
  professionalId: number;
}

export default function ProfessionalSpecialtiesSubSection({ professionalId }: Props) {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [newProfUnitId, setNewProfUnitId] = useState<number | "">("");
  const [newSpecId, setNewSpecId] = useState<number | "">("");

  // Need professional-units to map sub-resources
  const { data: profUnits = [] } = useQuery<ProfessionalUnit[]>({
    queryKey: ["professional-units", professionalId],
    queryFn: async () => {
      const { data } = await api.get(`/api/booking/professional-units/`, {
        params: { professional: professionalId },
      });
      return unpack(data);
    },
  });

  const profUnitIds = profUnits.map((p) => p.id);

  // Catalog of all specialties available to link
  const { data: specialties = [] } = useQuery<Specialty[]>({
    queryKey: ["specialties-catalog"],
    queryFn: async () => {
      const { data } = await api.get(`/api/settings/specialties/`);
      return unpack(data);
    },
  });

  // Fetch professional-specialties for each professional_unit (concurrent)
  const queryKey = ["professional-specialties", professionalId, profUnitIds.join(",")];
  const { data: items = [], isLoading } = useQuery<ProfessionalSpecialty[]>({
    queryKey,
    queryFn: async () => {
      if (profUnitIds.length === 0) return [];
      const all: ProfessionalSpecialty[] = [];
      const seen = new Set<number>();
      const reqs = profUnitIds.map((puId) =>
        api.get(`/api/booking/professional-specialties/`, { params: { professional_unit: puId } })
          .then((r) => unpack(r.data))
          .catch(() => [])
      );
      const results = await Promise.all(reqs);
      for (const list of results) {
        for (const it of list) {
          if (!seen.has(it.id)) { seen.add(it.id); all.push(it); }
        }
      }
      return all;
    },
    enabled: profUnitIds.length > 0,
  });

  const createLink = useMutation({
    mutationFn: async (payload: { professional_unit: number; specialty: number }) => {
      await fetchCsrf();
      const { data } = await api.post(`/api/booking/professional-specialties/`, {
        ...payload,
        is_active: true,
      });
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
      const prev = qc.getQueryData<ProfessionalSpecialty[]>(queryKey);
      qc.setQueryData<ProfessionalSpecialty[]>(queryKey, (old) =>
        old?.map((s) => (s.id === id ? { ...s, is_active } : s))
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
      await api.delete(`/api/booking/professional-specialties/${id}/`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast.success("Vínculo removido");
    },
    onError: () => toast.error("Erro ao remover vínculo"),
  });

  return (
    <SubSectionShell icon={Award} title="Especialidades" description="Especialidades por unidade do profissional">
      {profUnits.length === 0 ? (
        <p className="text-xs text-muted-foreground px-3">Vincule uma unidade primeiro para gerenciar especialidades.</p>
      ) : (
        <>
          <div className="min-w-[26rem] grid grid-cols-[1fr_1fr_auto_2rem] gap-2 px-3 py-1 items-center">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Unidade</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Especialidade</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
            <span />
          </div>

          {isLoading ? (
            <p className="text-xs text-muted-foreground px-3">Carregando…</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-muted-foreground px-3">Nenhuma especialidade vinculada.</p>
          ) : (
            items.map((item) => {
              const active = item.is_active !== false;
              const pu = profUnits.find((p) => p.id === item.professional_unit);
              return (
                <div
                  key={item.id}
                  className="min-w-[26rem] grid grid-cols-[1fr_1fr_auto_2rem] gap-2 items-center rounded-lg px-3 py-2 border border-border"
                  style={{ background: "hsl(var(--surface-elevated))" }}
                >
                  <span className="text-xs text-muted-foreground truncate">
                    {item.unit_name ?? pu?.unit_name ?? "—"}
                  </span>
                  <span className="text-sm font-medium text-foreground truncate">
                    {item.specialty_name ?? specialties.find((s) => s.id === item.specialty)?.name ?? `#${item.specialty}`}
                  </span>
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

          {showNew ? (
            <div className="flex items-center gap-2 pt-2 px-3">
              <select
                value={newProfUnitId}
                onChange={(e) => setNewProfUnitId(e.target.value ? Number(e.target.value) : "")}
                className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground flex-1"
              >
                <option value="">Unidade</option>
                {profUnits.map((p) => (
                  <option key={p.id} value={p.id}>{p.unit_name ?? `Unidade #${p.unit}`}</option>
                ))}
              </select>
              <select
                value={newSpecId}
                onChange={(e) => setNewSpecId(e.target.value ? Number(e.target.value) : "")}
                className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground flex-1"
              >
                <option value="">Especialidade</option>
                {specialties.map((s) => (
                  <option key={s.id} value={s.id}>{s.name ?? `#${s.id}`}</option>
                ))}
              </select>
              <Button
                size="sm"
                className="h-8 text-xs"
                disabled={!newProfUnitId || !newSpecId || createLink.isPending}
                onClick={() => createLink.mutate({ professional_unit: newProfUnitId as number, specialty: newSpecId as number })}
              >
                {createLink.isPending ? "…" : "Salvar"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => { setShowNew(false); setNewProfUnitId(""); setNewSpecId(""); }}
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
              Vincular especialidade
            </button>
          )}
        </>
      )}
    </SubSectionShell>
  );
}
