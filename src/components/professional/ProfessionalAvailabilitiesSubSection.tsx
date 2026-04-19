import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { Clock, Plus, Trash2, Pencil } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { toast } from "sonner";
import SubSectionShell from "./SubSectionShell";

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
const dayLabel = (k: string) => DAY_KEYS.find((d) => d.key === k)?.label ?? k;

interface ProfessionalUnit {
  id: number;
  unit: number;
  unit_name?: string;
}

interface Availability {
  id: number;
  professional_unit: number;
  unit_name?: string;
  slot_minutes?: number;
  buffer_minutes?: number;
  weekly?: Record<string, { start: string; end: string }[]>;
  is_active?: boolean;
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

export default function ProfessionalAvailabilitiesSubSection({ professionalId }: Props) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formProfUnit, setFormProfUnit] = useState<number | "">("");
  const [slot, setSlot] = useState("60");
  const [buffer, setBuffer] = useState("0");
  const [entries, setEntries] = useState<{ day: string; start: string; end: string }[]>([
    { day: "", start: "", end: "" },
  ]);

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
  const queryKey = ["professional-availabilities", professionalId, profUnitIds.join(",")];

  const { data: items = [], isLoading } = useQuery<Availability[]>({
    queryKey,
    queryFn: async () => {
      if (profUnitIds.length === 0) return [];
      const all: Availability[] = [];
      const seen = new Set<number>();
      const reqs = profUnitIds.map((puId) =>
        api.get(`/api/booking/professional-availabilities/`, { params: { professional_unit: puId } })
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

  const resetForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormProfUnit("");
    setSlot("60");
    setBuffer("0");
    setEntries([{ day: "", start: "", end: "" }]);
  };

  const startEdit = (a: Availability) => {
    setEditingId(a.id);
    setFormProfUnit(a.professional_unit);
    setSlot(String(a.slot_minutes ?? 60));
    setBuffer(String(a.buffer_minutes ?? 0));
    const newEntries: { day: string; start: string; end: string }[] = [];
    Object.entries(a.weekly ?? {}).forEach(([day, slots]) => {
      if (Array.isArray(slots)) {
        slots.forEach((s) => newEntries.push({ day, start: s.start ?? "", end: s.end ?? "" }));
      }
    });
    setEntries(newEntries.length > 0 ? newEntries : [{ day: "", start: "", end: "" }]);
    setShowForm(true);
  };

  const buildWeekly = (): Record<string, { start: string; end: string }[]> => {
    const weekly: Record<string, { start: string; end: string }[]> = {};
    for (const e of entries) {
      if (e.day && e.start && e.end) {
        if (!weekly[e.day]) weekly[e.day] = [];
        weekly[e.day].push({ start: e.start, end: e.end });
      }
    }
    return weekly;
  };

  const createAv = useMutation({
    mutationFn: async (payload: any) => {
      await fetchCsrf();
      const { data } = await api.post(`/api/booking/professional-availabilities/`, payload);
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey }); resetForm(); toast.success("Disponibilidade criada"); },
    onError: (err: any) => toast.error("Erro ao criar disponibilidade", { description: JSON.stringify(err?.response?.data ?? err?.message ?? "") }),
  });

  const updateAv = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: any }) => {
      await fetchCsrf();
      // Use set-week to atomically replace the weekly schedule
      const { data } = await api.put(`/api/booking/professional-availabilities/${id}/set-week/`, payload);
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey }); resetForm(); toast.success("Disponibilidade atualizada"); },
    onError: (err: any) => toast.error("Erro ao atualizar disponibilidade", { description: JSON.stringify(err?.response?.data ?? err?.message ?? "") }),
  });

  const toggleAv = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      await fetchCsrf();
      await api.patch(`/api/booking/professional-availabilities/${id}/`, { is_active });
    },
    onMutate: async ({ id, is_active }) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<Availability[]>(queryKey);
      qc.setQueryData<Availability[]>(queryKey, (old) => old?.map((a) => a.id === id ? { ...a, is_active } : a));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev); toast.error("Erro ao alterar status"); },
    onSettled: () => qc.invalidateQueries({ queryKey }),
  });

  const removeAv = useMutation({
    mutationFn: async (id: number) => {
      await fetchCsrf();
      await api.delete(`/api/booking/professional-availabilities/${id}/`);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey }); toast.success("Disponibilidade removida"); },
    onError: () => toast.error("Erro ao remover disponibilidade"),
  });

  // Flatten for display
  const flatRows: { avail: Availability; dayKey: string; start: string; end: string }[] = [];
  items.forEach((a) => {
    const w = a.weekly ?? {};
    Object.entries(w).forEach(([dayKey, slots]) => {
      if (Array.isArray(slots)) {
        slots.forEach((s) => flatRows.push({ avail: a, dayKey, start: s.start ?? "—", end: s.end ?? "—" }));
      }
    });
    if (Object.keys(w).length === 0) {
      flatRows.push({ avail: a, dayKey: "—", start: "—", end: "—" });
    }
  });
  flatRows.sort((a, b) => (DAY_ORDER[a.dayKey] ?? 99) - (DAY_ORDER[b.dayKey] ?? 99));

  const canSave = formProfUnit && entries.some((e) => e.day && e.start && e.end);

  return (
    <SubSectionShell icon={Clock} title="Disponibilidades" description="Horários e dias semanais por unidade">
      {profUnits.length === 0 ? (
        <p className="text-xs text-muted-foreground px-3">Vincule uma unidade primeiro para gerenciar disponibilidades.</p>
      ) : (
        <>
          <div className="grid grid-cols-[1fr_4rem_4rem_4rem_3.5rem_3.5rem_auto_2rem_2rem] gap-2 px-3 py-1 items-center">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Unidade</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Dia</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Início</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Fim</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Slot</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Buf.</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
            <span /><span />
          </div>

          {isLoading ? (
            <p className="text-xs text-muted-foreground px-3">Carregando…</p>
          ) : flatRows.length === 0 ? (
            <p className="text-xs text-muted-foreground px-3">Nenhuma disponibilidade configurada.</p>
          ) : (
            flatRows.map((row, idx) => {
              const a = row.avail;
              const active = a.is_active !== false;
              const pu = profUnits.find((p) => p.id === a.professional_unit);
              return (
                <div
                  key={`${a.id}-${row.dayKey}-${idx}`}
                  className="grid grid-cols-[1fr_4rem_4rem_4rem_3.5rem_3.5rem_auto_2rem_2rem] gap-2 items-center rounded-lg px-3 py-2 border border-border"
                  style={{ background: "hsl(var(--surface-elevated))" }}
                >
                  <span className="text-xs text-foreground truncate">{a.unit_name ?? pu?.unit_name ?? "—"}</span>
                  <span className="text-xs text-muted-foreground">{dayLabel(row.dayKey)}</span>
                  <span className="text-xs text-muted-foreground">{row.start}</span>
                  <span className="text-xs text-muted-foreground">{row.end}</span>
                  <span className="text-xs text-muted-foreground">{a.slot_minutes ?? "—"}m</span>
                  <span className="text-xs text-muted-foreground">{a.buffer_minutes ?? 0}m</span>
                  <Switch
                    checked={active}
                    onCheckedChange={(checked) => toggleAv.mutate({ id: a.id, is_active: checked })}
                    className="scale-75"
                  />
                  <button onClick={() => startEdit(a)} className="text-muted-foreground hover:text-primary transition-colors" title="Editar">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => removeAv.mutate(a.id)} className="text-muted-foreground hover:text-destructive transition-colors" title="Remover">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })
          )}

          {showForm ? (
            <div className="space-y-2 pt-2 rounded-lg border border-border p-3" style={{ background: "hsl(var(--surface-elevated))" }}>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={formProfUnit}
                  onChange={(e) => setFormProfUnit(e.target.value ? Number(e.target.value) : "")}
                  disabled={!!editingId}
                  className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground disabled:opacity-60"
                >
                  <option value="">Unidade</option>
                  {profUnits.map((p) => (
                    <option key={p.id} value={p.id}>{p.unit_name ?? `Unidade #${p.unit}`}</option>
                  ))}
                </select>
                <Input type="number" value={slot} onChange={(e) => setSlot(e.target.value)} className="h-8 text-sm w-20" placeholder="Slot" />
                <Input type="number" value={buffer} onChange={(e) => setBuffer(e.target.value)} className="h-8 text-sm w-20" placeholder="Buffer" />
              </div>

              {entries.map((entry, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <select
                    value={entry.day}
                    onChange={(e) => setEntries((prev) => prev.map((x, i) => i === idx ? { ...x, day: e.target.value } : x))}
                    className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground"
                  >
                    <option value="">Dia</option>
                    {DAY_KEYS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
                  </select>
                  <Input type="time" value={entry.start} onChange={(e) => setEntries((prev) => prev.map((x, i) => i === idx ? { ...x, start: e.target.value } : x))} className="h-8 text-sm w-28" />
                  <Input type="time" value={entry.end} onChange={(e) => setEntries((prev) => prev.map((x, i) => i === idx ? { ...x, end: e.target.value } : x))} className="h-8 text-sm w-28" />
                  {entries.length > 1 && (
                    <button onClick={() => setEntries((prev) => prev.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}

              <button
                onClick={() => setEntries((prev) => [...prev, { day: "", start: "", end: "" }])}
                className="flex items-center gap-1 text-xs text-primary hover:text-primary/80"
              >
                <Plus className="h-3 w-3" /> Adicionar dia/horário
              </button>

              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  className="h-8 text-xs"
                  disabled={!canSave || createAv.isPending || updateAv.isPending}
                  onClick={() => {
                    const weekly = buildWeekly();
                    if (editingId) {
                      updateAv.mutate({
                        id: editingId,
                        payload: {
                          professional_unit: formProfUnit as number,
                          slot_minutes: parseInt(slot) || 60,
                          buffer_minutes: parseInt(buffer) || 0,
                          weekly,
                        },
                      });
                    } else {
                      createAv.mutate({
                        professional_unit: formProfUnit as number,
                        slot_minutes: parseInt(slot) || 60,
                        buffer_minutes: parseInt(buffer) || 0,
                        weekly,
                        is_active: true,
                      });
                    }
                  }}
                >
                  {(createAv.isPending || updateAv.isPending) ? "…" : editingId ? "Atualizar" : "Salvar"}
                </Button>
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={resetForm}>Cancelar</Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors pt-2 px-3"
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar disponibilidade
            </button>
          )}
        </>
      )}
    </SubSectionShell>
  );
}
