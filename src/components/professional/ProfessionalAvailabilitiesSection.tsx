import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ChevronDown, Clock, Pencil, Plus, Trash2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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

interface Availability {
  id: number;
  professional_unit: number;
  professional_name?: string;
  unit_name?: string;
  slot_minutes?: number;
  buffer_minutes?: number;
  weekly?: Record<string, { start: string; end: string }[]>;
  is_active?: boolean;
}

interface Props {
  professionals: ProfessionalItem[];
  isLoading?: boolean;
}

const DAY_KEYS = [
  { key: "mon", label: "Seg" },
  { key: "tue", label: "Ter" },
  { key: "wed", label: "Qua" },
  { key: "thu", label: "Qui" },
  { key: "fri", label: "Sex" },
  { key: "sat", label: "Sáb" },
  { key: "sun", label: "Dom" },
] as const;

const DAY_ORDER: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

const unpack = (data: any): any[] => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

const dayLabel = (day: string) => DAY_KEYS.find((item) => item.key === day)?.label ?? day;

export default function ProfessionalAvailabilitiesSection({ professionals, isLoading }: Props) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formProfUnit, setFormProfUnit] = useState<number | "">("");
  const [slot, setSlot] = useState("60");
  const [buffer, setBuffer] = useState("0");
  const [entries, setEntries] = useState<{ day: string; start: string; end: string }[]>([{ day: "", start: "", end: "" }]);

  const queryKey = ["professional-availabilities-all", professionals.map((p) => p.id).join(",")];

  const { data, isLoading: isLoadingItems } = useQuery<{ profUnits: ProfessionalUnit[]; items: Availability[] }>({
    queryKey,
    queryFn: async () => {
      if (professionals.length === 0) return { profUnits: [], items: [] };

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
      const itemResults = await Promise.all(
        profUnits.map((profUnit) =>
          api
            .get(`/api/booking/professional-availabilities/`, { params: { professional_unit: profUnit.id } })
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

      return { profUnits, items: itemResults.flat() };
    },
    enabled: professionals.length > 0,
  });

  const profUnits = data?.profUnits ?? [];
  const items = data?.items ?? [];

  const flatRows: { avail: Availability; dayKey: string; start: string; end: string }[] = [];
  items.forEach((item) => {
    const weekly = item.weekly ?? {};
    Object.entries(weekly).forEach(([dayKey, slots]) => {
      if (Array.isArray(slots)) {
        slots.forEach((slotItem) => flatRows.push({ avail: item, dayKey, start: slotItem.start ?? "—", end: slotItem.end ?? "—" }));
      }
    });
    if (Object.keys(weekly).length === 0) flatRows.push({ avail: item, dayKey: "—", start: "—", end: "—" });
  });

  flatRows.sort((a, b) => {
    const nameA = (a.avail.professional_name ?? "").toLowerCase();
    const nameB = (b.avail.professional_name ?? "").toLowerCase();
    if (nameA !== nameB) return nameA.localeCompare(nameB);
    return (DAY_ORDER[a.dayKey] ?? 99) - (DAY_ORDER[b.dayKey] ?? 99);
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormProfUnit("");
    setSlot("60");
    setBuffer("0");
    setEntries([{ day: "", start: "", end: "" }]);
  };

  const startEdit = (availability: Availability) => {
    setEditingId(availability.id);
    setFormProfUnit(availability.professional_unit);
    setSlot(String(availability.slot_minutes ?? 60));
    setBuffer(String(availability.buffer_minutes ?? 0));
    const nextEntries: { day: string; start: string; end: string }[] = [];
    Object.entries(availability.weekly ?? {}).forEach(([day, slots]) => {
      if (Array.isArray(slots)) slots.forEach((slotItem) => nextEntries.push({ day, start: slotItem.start ?? "", end: slotItem.end ?? "" }));
    });
    setEntries(nextEntries.length > 0 ? nextEntries : [{ day: "", start: "", end: "" }]);
    setShowForm(true);
  };

  const buildWeekly = () => {
    const weekly: Record<string, { start: string; end: string }[]> = {};
    for (const entry of entries) {
      if (entry.day && entry.start && entry.end) {
        if (!weekly[entry.day]) weekly[entry.day] = [];
        weekly[entry.day].push({ start: entry.start, end: entry.end });
      }
    }
    return weekly;
  };

  const createAvailability = useMutation({
    mutationFn: async (payload: any) => {
      await fetchCsrf();
      const { data } = await api.post(`/api/booking/professional-availabilities/`, payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      resetForm();
      toast.success("Disponibilidade criada");
    },
    onError: (err: any) => toast.error("Erro ao criar disponibilidade", { description: JSON.stringify(err?.response?.data ?? err?.message ?? "") }),
  });

  const updateAvailability = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: any }) => {
      await fetchCsrf();
      const { data } = await api.put(`/api/booking/professional-availabilities/${id}/set-week/`, payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      resetForm();
      toast.success("Disponibilidade atualizada");
    },
    onError: (err: any) => toast.error("Erro ao atualizar disponibilidade", { description: JSON.stringify(err?.response?.data ?? err?.message ?? "") }),
  });

  const toggleAvailability = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      await fetchCsrf();
      await api.patch(`/api/booking/professional-availabilities/${id}/`, { is_active });
    },
    onMutate: async ({ id, is_active }) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<{ profUnits: ProfessionalUnit[]; items: Availability[] }>(queryKey);
      qc.setQueryData(queryKey, (old: any) => old ? { ...old, items: old.items.map((item: Availability) => item.id === id ? { ...item, is_active } : item) } : old);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      toast.error("Erro ao alterar status");
    },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  const removeAvailability = useMutation({
    mutationFn: async (id: number) => {
      await fetchCsrf();
      await api.delete(`/api/booking/professional-availabilities/${id}/`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast.success("Disponibilidade removida");
    },
    onError: () => toast.error("Erro ao remover disponibilidade"),
  });

  const canSave = !!formProfUnit && entries.some((entry) => entry.day && entry.start && entry.end);

  return (
    <Collapsible defaultOpen={false}>
      <CollapsibleTrigger className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated" style={{ background: "hsl(var(--surface))" }}>
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-primary shrink-0" />
          <div className="text-left">
            <span className="text-sm font-bold text-foreground block">Profissionais → Disponibilidades</span>
            <p className="text-xs text-muted-foreground">Horários e dias de disponibilidade</p>
          </div>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-2 rounded-xl border border-border p-4 space-y-2" style={{ background: "hsl(var(--surface))" }}>
        <div className="grid grid-cols-[1fr_1fr_4rem_4rem_4rem_3.5rem_3.5rem_auto_2rem_2rem] gap-2 px-3 py-1 items-center">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Profissional</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Unidade</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Dia</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Início</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Fim</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Slot</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Buf.</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
          <span />
          <span />
        </div>

        {isLoading || isLoadingItems ? (
          <p className="text-xs text-muted-foreground px-3">Carregando…</p>
        ) : profUnits.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3">Vincule uma unidade primeiro para gerenciar disponibilidades.</p>
        ) : flatRows.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3">Nenhuma disponibilidade configurada.</p>
        ) : (
          flatRows.map((row, index) => {
            const active = row.avail.is_active !== false;
            return (
              <div key={`${row.avail.id}-${row.dayKey}-${index}`} className="grid grid-cols-[1fr_1fr_4rem_4rem_4rem_3.5rem_3.5rem_auto_2rem_2rem] gap-2 items-center rounded-lg px-3 py-2 border border-border" style={{ background: "hsl(var(--surface-elevated))" }}>
                <span className="text-sm font-medium text-foreground truncate">{row.avail.professional_name ?? "—"}</span>
                <span className="text-xs text-foreground truncate">{row.avail.unit_name ?? "—"}</span>
                <span className="text-xs text-muted-foreground">{dayLabel(row.dayKey)}</span>
                <span className="text-xs text-muted-foreground">{row.start}</span>
                <span className="text-xs text-muted-foreground">{row.end}</span>
                <span className="text-xs text-muted-foreground">{row.avail.slot_minutes ?? "—"}m</span>
                <span className="text-xs text-muted-foreground">{row.avail.buffer_minutes ?? 0}m</span>
                <Switch checked={active} onCheckedChange={(checked) => toggleAvailability.mutate({ id: row.avail.id, is_active: checked })} className="scale-75" />
                <button onClick={() => startEdit(row.avail)} className="text-muted-foreground hover:text-primary transition-colors" title="Editar">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => removeAvailability.mutate(row.avail.id)} className="text-muted-foreground hover:text-destructive transition-colors" title="Remover">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}

        {showForm ? (
          <div className="space-y-2 pt-2 rounded-lg border border-border p-3" style={{ background: "hsl(var(--surface-elevated))" }}>
            <div className="flex flex-wrap items-center gap-2">
              <select value={formProfUnit} onChange={(e) => setFormProfUnit(e.target.value ? Number(e.target.value) : "")} disabled={!!editingId} className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground disabled:opacity-60 min-w-[220px]">
                <option value="">Profissional / Unidade</option>
                {profUnits.map((profUnit) => (
                  <option key={profUnit.id} value={profUnit.id}>{`${profUnit.professional_name ?? `#${profUnit.professional}`} — ${profUnit.unit_name ?? `#${profUnit.unit}`}`}</option>
                ))}
              </select>
              <Input type="number" value={slot} onChange={(e) => setSlot(e.target.value)} className="h-8 text-sm w-20" placeholder="Slot" />
              <Input type="number" value={buffer} onChange={(e) => setBuffer(e.target.value)} className="h-8 text-sm w-20" placeholder="Buffer" />
            </div>

            {entries.map((entry, index) => (
              <div key={index} className="flex items-center gap-2">
                <select value={entry.day} onChange={(e) => setEntries((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, day: e.target.value } : item))} className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground">
                  <option value="">Dia</option>
                  {DAY_KEYS.map((day) => <option key={day.key} value={day.key}>{day.label}</option>)}
                </select>
                <Input type="time" value={entry.start} onChange={(e) => setEntries((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, start: e.target.value } : item))} className="h-8 text-sm w-28" />
                <Input type="time" value={entry.end} onChange={(e) => setEntries((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, end: e.target.value } : item))} className="h-8 text-sm w-28" />
                {entries.length > 1 && (
                  <button onClick={() => setEntries((prev) => prev.filter((_, itemIndex) => itemIndex !== index))} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}

            <button onClick={() => setEntries((prev) => [...prev, { day: "", start: "", end: "" }])} className="flex items-center gap-1 text-xs text-primary hover:text-primary/80">
              <Plus className="h-3 w-3" /> Adicionar dia/horário
            </button>

            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                className="h-8 text-xs"
                disabled={!canSave || createAvailability.isPending || updateAvailability.isPending}
                onClick={() => {
                  const payload = { professional_unit: formProfUnit as number, slot_minutes: parseInt(slot) || 60, buffer_minutes: parseInt(buffer) || 0, weekly: buildWeekly(), ...(editingId ? {} : { is_active: true }) };
                  if (editingId) updateAvailability.mutate({ id: editingId, payload });
                  else createAvailability.mutate(payload);
                }}
              >
                {(createAvailability.isPending || updateAvailability.isPending) ? "…" : editingId ? "Atualizar" : "Salvar"}
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={resetForm}>Cancelar</Button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowForm(true)} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors pt-2 px-3">
            <Plus className="h-3.5 w-3.5" />
            Adicionar disponibilidade
          </button>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}