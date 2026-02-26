import { useAuth } from "@/contexts/AuthContext";
import { ChevronDown, Plus, Trash2, Pencil } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const DAY_KEYS: { key: string; label: string }[] = [
  { key: "mon", label: "Segunda" },
  { key: "tue", label: "Terça" },
  { key: "wed", label: "Quarta" },
  { key: "thu", label: "Quinta" },
  { key: "fri", label: "Sexta" },
  { key: "sat", label: "Sábado" },
  { key: "sun", label: "Domingo" },
];

const dayLabel = (key: string) => DAY_KEYS.find((d) => d.key === key)?.label ?? key;

export default function ProfessionalAvailabilitySection() {
  const { company, units } = useAuth();
  const queryClient = useQueryClient();

  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [newProfId, setNewProfId] = useState<number | "">("");
  const [newSlot, setNewSlot] = useState("60");
  const [newBuffer, setNewBuffer] = useState("0");
  const [weeklyEntries, setWeeklyEntries] = useState<{ day: string; start: string; end: string }[]>([
    { day: "", start: "", end: "" },
  ]);

  const addWeeklyEntry = () => setWeeklyEntries((prev) => [...prev, { day: "", start: "", end: "" }]);
  const removeWeeklyEntry = (idx: number) => setWeeklyEntries((prev) => prev.filter((_, i) => i !== idx));
  const updateWeeklyEntry = (idx: number, field: "day" | "start" | "end", value: string) =>
    setWeeklyEntries((prev) => prev.map((e, i) => (i === idx ? { ...e, [field]: value } : e)));

  const resetForm = () => {
    setShowNew(false);
    setEditingId(null);
    setNewProfId("");
    setNewSlot("60");
    setNewBuffer("0");
    setWeeklyEntries([{ day: "", start: "", end: "" }]);
  };

  const startEditing = (avail: any) => {
    setEditingId(avail.id);
    setNewProfId(avail.professional);
    setNewSlot(String(avail.slot_minutes ?? 60));
    setNewBuffer(String(avail.buffer_minutes ?? 0));
    const weekly = avail.weekly ?? {};
    const entries: { day: string; start: string; end: string }[] = [];
    Object.entries(weekly).forEach(([dayKey, slots]: [string, any]) => {
      if (Array.isArray(slots)) {
        slots.forEach((slot: any) => {
          entries.push({ day: dayKey, start: slot.start ?? "", end: slot.end ?? "" });
        });
      }
    });
    setWeeklyEntries(entries.length > 0 ? entries : [{ day: "", start: "", end: "" }]);
    setShowNew(true);
  };

  const buildWeekly = () => {
    const weekly: Record<string, { start: string; end: string }[]> = {};
    for (const e of weeklyEntries) {
      if (e.day && e.start && e.end) {
        if (!weekly[e.day]) weekly[e.day] = [];
        weekly[e.day].push({ start: e.start, end: e.end });
      }
    }
    return weekly;
  };

  const canSave = newProfId && weeklyEntries.some((e) => e.day && e.start && e.end);

  const { data: allProfessionals = [] } = useQuery({
    queryKey: ["professionals-all-units", units.map((u) => u.id).join(",")],
    queryFn: async () => {
      const results: any[] = [];
      const seen = new Set<number>();
      for (const unit of units) {
        const { data } = await api.get(`/api/booking/professionals/`, { params: { unit: unit.id } });
        const list = Array.isArray(data) ? data : (data?.results ?? []);
        for (const p of list) {
          if (!seen.has(p.id)) { seen.add(p.id); results.push(p); }
        }
      }
      return results;
    },
    enabled: units.length > 0,
  });

  const { data: availabilities = [], isLoading } = useQuery({
    queryKey: ["professional-availabilities"],
    queryFn: async () => {
      const { data } = await api.get("/api/settings/professional-availabilities/");
      return Array.isArray(data) ? data : (data?.results ?? []);
    },
  });

  const createAvailability = useMutation({
    mutationFn: async (payload: any) => {
      await fetchCsrf();
      const { data } = await api.post("/api/settings/professional-availabilities/", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["professional-availabilities"] });
      resetForm();
      toast.success("Disponibilidade criada com sucesso");
    },
    onError: (err: any) => {
      const detail = err?.response?.data;
      const msg = typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : "Erro desconhecido";
      console.error("[create-availability] 400 response:", detail);
      toast.error("Erro ao criar disponibilidade", { description: msg });
    },
  });

  const updateAvailability = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: any }) => {
      await fetchCsrf();
      const { data } = await api.patch(`/api/settings/professional-availabilities/${id}/`, payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["professional-availabilities"] });
      resetForm();
      toast.success("Disponibilidade atualizada com sucesso");
    },
    onError: (err: any) => {
      const detail = err?.response?.data;
      const msg = typeof detail === "string" ? detail : detail ? JSON.stringify(detail) : "Erro desconhecido";
      toast.error("Erro ao atualizar disponibilidade", { description: msg });
    },
  });

  const toggleAvailability = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      await fetchCsrf();
      await api.patch(`/api/settings/professional-availabilities/${id}/`, { is_active });
    },
    onMutate: async ({ id, is_active }) => {
      await queryClient.cancelQueries({ queryKey: ["professional-availabilities"] });
      const prev = queryClient.getQueryData(["professional-availabilities"]);
      queryClient.setQueryData(["professional-availabilities"], (old: any[]) =>
        old?.map((a: any) => a.id === id ? { ...a, is_active } : a)
      );
      return { prev };
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(["professional-availabilities"], context?.prev);
      toast.error("Erro ao alterar status");
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["professional-availabilities"] });
    },
  });

  const deleteAvailability = useMutation({
    mutationFn: async (id: number) => {
      await fetchCsrf();
      await api.delete(`/api/settings/professional-availabilities/${id}/`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["professional-availabilities"] });
      toast.success("Disponibilidade removida");
    },
    onError: () => toast.error("Erro ao remover disponibilidade"),
  });

  const getProfName = (id: number) =>
    allProfessionals.find((p: any) => p.id === id)?.name ?? `#${id}`;

  const DAY_ORDER: Record<string, number> = { mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6 };

  // Flatten weekly object into rows for display
  const flatRows: { avail: any; dayKey: string; start: string; end: string }[] = [];
  availabilities.forEach((a: any) => {
    const weekly = a.weekly ?? {};
    Object.entries(weekly).forEach(([dayKey, slots]: [string, any]) => {
      if (Array.isArray(slots)) {
        slots.forEach((slot: any) => {
          flatRows.push({ avail: a, dayKey, start: slot.start ?? "—", end: slot.end ?? "—" });
        });
      }
    });
    if (Object.keys(weekly).length === 0) {
      flatRows.push({ avail: a, dayKey: "—", start: "—", end: "—" });
    }
  });

  // Sort by professional name, then weekday order
  flatRows.sort((a, b) => {
    const nameA = (a.avail.professional_name ?? getProfName(a.avail.professional)).toLowerCase();
    const nameB = (b.avail.professional_name ?? getProfName(b.avail.professional)).toLowerCase();
    if (nameA !== nameB) return nameA.localeCompare(nameB);
    return (DAY_ORDER[a.dayKey] ?? 99) - (DAY_ORDER[b.dayKey] ?? 99);
  });

  return (
    <Collapsible defaultOpen={false} id="section-disponibilidade">
      <CollapsibleTrigger
        className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated"
        style={{ background: "hsl(var(--surface))" }}
      >
        <div className="text-left">
          <span className="text-sm font-bold text-foreground">Disponibilidade de Profissionais</span>
          <p className="text-xs text-muted-foreground">Gerenciar horários e dias de disponibilidade</p>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
      </CollapsibleTrigger>
      <CollapsibleContent
        className="mt-2 rounded-xl border border-border p-4 space-y-1"
        style={{ background: "hsl(var(--surface))" }}
      >
        {/* Header */}
        <div className="grid grid-cols-[1fr_5rem_5rem_5rem_4rem_4rem_auto_2rem_2rem] gap-2 px-3 py-1 items-center">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Profissional</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Dia</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Início</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Fim</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Slot</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Buffer</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
          <span />
          <span />
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground px-3">Carregando…</p>
        ) : flatRows.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3">Nenhuma disponibilidade encontrada.</p>
        ) : (
          flatRows.map((row, idx) => {
            const a = row.avail;
            const active = a.is_active !== false;
            return (
              <div
                key={`${a.id}-${row.dayKey}-${idx}`}
                className="grid grid-cols-[1fr_5rem_5rem_5rem_4rem_4rem_auto_2rem_2rem] gap-2 items-center rounded-lg px-3 py-2 border border-border"
                style={{ background: "hsl(var(--surface-elevated))" }}
              >
                <span className="text-sm font-medium text-foreground">
                  {a.professional_name ?? getProfName(a.professional)}
                </span>
                <span className="text-xs text-muted-foreground">{dayLabel(row.dayKey)}</span>
                <span className="text-xs text-muted-foreground">{row.start}</span>
                <span className="text-xs text-muted-foreground">{row.end}</span>
                <span className="text-xs text-muted-foreground">{a.slot_minutes ?? "—"}min</span>
                <span className="text-xs text-muted-foreground">{a.buffer_minutes ?? 0}min</span>
                <Switch
                  checked={active}
                  onCheckedChange={(checked) => toggleAvailability.mutate({ id: a.id, is_active: checked })}
                  className="scale-75"
                />
                <button
                  onClick={() => startEditing(a)}
                  className="text-muted-foreground hover:text-primary transition-colors"
                  title="Editar disponibilidade"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => deleteAvailability.mutate(a.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  title="Remover disponibilidade"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}

        {/* Create */}
        {showNew ? (
          <div className="space-y-2 pt-2 rounded-lg border border-border p-3" style={{ background: "hsl(var(--surface-elevated))" }}>
            {/* Top row: profissional, slot, buffer */}
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={newProfId}
                onChange={(e) => setNewProfId(e.target.value ? Number(e.target.value) : "")}
                disabled={!!editingId}
                className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground disabled:opacity-60"
              >
                <option value="">Profissional</option>
                {allProfessionals.map((p: any) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <Input type="number" value={newSlot} onChange={(e) => setNewSlot(e.target.value)} className="h-8 text-sm w-20" placeholder="Slot min" />
              <Input type="number" value={newBuffer} onChange={(e) => setNewBuffer(e.target.value)} className="h-8 text-sm w-20" placeholder="Buffer" />
            </div>

            {/* Day/time entries */}
            {weeklyEntries.map((entry, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <select
                  value={entry.day}
                  onChange={(e) => updateWeeklyEntry(idx, "day", e.target.value)}
                  className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground"
                >
                  <option value="">Dia</option>
                  {DAY_KEYS.map((d) => (
                    <option key={d.key} value={d.key}>{d.label}</option>
                  ))}
                </select>
                <Input type="time" value={entry.start} onChange={(e) => updateWeeklyEntry(idx, "start", e.target.value)} className="h-8 text-sm w-28" />
                <Input type="time" value={entry.end} onChange={(e) => updateWeeklyEntry(idx, "end", e.target.value)} className="h-8 text-sm w-28" />
                {weeklyEntries.length > 1 && (
                  <button onClick={() => removeWeeklyEntry(idx)} className="text-muted-foreground hover:text-destructive transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}

            <button
              onClick={addWeeklyEntry}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              <Plus className="h-3 w-3" />
              Adicionar dia/horário
            </button>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                className="h-8 text-xs"
                disabled={!canSave || createAvailability.isPending || updateAvailability.isPending}
                onClick={() => {
                  const payload = {
                    professional: newProfId as number,
                    company: company?.id,
                    slot_minutes: parseInt(newSlot) || 60,
                    buffer_minutes: parseInt(newBuffer) || 0,
                    weekly: buildWeekly(),
                  };
                  if (editingId) {
                    updateAvailability.mutate({ id: editingId, payload });
                  } else {
                    createAvailability.mutate(payload);
                  }
                }}
              >
                {(createAvailability.isPending || updateAvailability.isPending) ? "…" : editingId ? "Atualizar" : "Salvar"}
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={resetForm}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors pt-2 px-3"
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar disponibilidade
          </button>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
