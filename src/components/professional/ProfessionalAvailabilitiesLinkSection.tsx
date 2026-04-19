import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { useAuth } from "@/contexts/AuthContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Plus, Trash2, CalendarClock, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";
import { toast } from "sonner";

type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
type Slot = { start: string; end: string };
type Weekly = Partial<Record<DayKey, Slot[]>>;

interface PuOption {
  id: number;
  label: string;
  professional_id: number;
  professional_name: string;
  unit_id: number;
  unit_name: string;
}

interface Availability {
  id: number;
  company_id?: number;
  professional_unit_id: number;
  professional_unit?: number;
  professional_name?: string;
  unit_name?: string;
  slot_minutes: number;
  buffer_minutes: number;
  weekly: Weekly;
  is_active?: boolean;
}

const DAY_KEYS: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const DAY_LABELS: Record<DayKey, string> = {
  mon: "Seg", tue: "Ter", wed: "Qua", thu: "Qui", fri: "Sex", sat: "Sáb", sun: "Dom",
};

const unpack = (data: any): any[] => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data)) return data.data;
  if (data?.result) return unpack(data.result);
  return [];
};

const fmt = (t: string) => (t || "").slice(0, 5);

export default function ProfessionalAvailabilitiesLinkSection() {
  const { company, isLoading: isAuthLoading, isAuthenticated } = useAuth();
  const qc = useQueryClient();

  const [openProfName, setOpenProfName] = useState<string | null>(null);
  const [showNewFor, setShowNewFor] = useState<string | null>(null);
  const [newPuId, setNewPuId] = useState<number | "">("");
  const [newSlot, setNewSlot] = useState<number>(60);
  const [newBuffer, setNewBuffer] = useState<number>(0);
  const [newWeekly, setNewWeekly] = useState<Weekly>({});

  // Fonte única: PUs já enriquecidos com nome do profissional e da unidade
  const { data: puOptions = [] } = useQuery<PuOption[]>({
    queryKey: ["professional-units-as-options"],
    queryFn: async () => {
      const { data } = await api.get(`/api/booking/professional-units/as-options/`);
      return unpack(data).map((o: any) => ({
        id: Number(o?.id),
        label: String(o?.label ?? ""),
        professional_id: Number(o?.professional_id),
        professional_name: String(o?.professional_name ?? ""),
        unit_id: Number(o?.unit_id),
        unit_name: String(o?.unit_name ?? ""),
      })).filter((o) => o.id);
    },
    enabled: !isAuthLoading && isAuthenticated,
  });

  // Map id -> opção para enriquecer availabilities sem nomes
  const puById = useMemo(() => {
    const map = new Map<number, PuOption>();
    for (const o of puOptions) map.set(o.id, o);
    return map;
  }, [puOptions]);

  const queryKey = ["professional-availabilities-all"];

  const { data: items = [], isLoading } = useQuery<Availability[]>({
    queryKey,
    queryFn: async () => {
      const { data } = await api.get(`/api/settings/professional-availabilities/`, { params: { page_size: 500 } });
      return unpack(data).map((item: any): Availability => {
        const puId = Number(
          item?.professional_unit_id ??
          item?.professional_unit ??
          (typeof item?.professional_unit === "object" ? item?.professional_unit?.id : 0) ??
          0
        );
        return {
          id: Number(item?.id),
          company_id: item?.company_id,
          professional_unit_id: puId,
          professional_unit: puId,
          professional_name:
            item?.professional_unit__professional__name ??
            item?.professional_name ??
            item?.professional__name,
          unit_name:
            item?.professional_unit__unit__name ??
            item?.unit_name ??
            item?.unit__name,
          slot_minutes: Number(item?.slot_minutes ?? 60),
          buffer_minutes: Number(item?.buffer_minutes ?? 0),
          weekly: (item?.weekly && typeof item.weekly === "object") ? item.weekly as Weekly : {},
          is_active: item?.is_active,
        };
      }).filter((it) => it.id);
    },
    enabled: !isAuthLoading && isAuthenticated,
  });

  // Agrupa por nome de profissional usando puOptions como base
  const professionalGroups = useMemo(() => {
    const byName = new Map<string, { profName: string; list: Availability[] }>();

    // Garante grupos para todos os profissionais com PU
    for (const o of puOptions) {
      if (!o.professional_name) continue;
      if (!byName.has(o.professional_name)) {
        byName.set(o.professional_name, { profName: o.professional_name, list: [] });
      }
    }

    for (const it of items) {
      const enriched = puById.get(it.professional_unit_id);
      const profName = enriched?.professional_name ?? it.professional_name ?? `#${it.professional_unit_id}`;
      const unitName = enriched?.unit_name ?? it.unit_name;
      const group = byName.get(profName) ?? { profName, list: [] };
      group.list.push({ ...it, professional_name: profName, unit_name: unitName });
      byName.set(profName, group);
    }

    return Array.from(byName.values()).sort((a, b) => a.profName.localeCompare(b.profName));
  }, [puOptions, puById, items]);

  // PUs disponíveis para um profissional específico (apenas unidade, prof já é fixo pelo grupo)
  const puOptionsByProf = useMemo(() => {
    return (profName: string) =>
      puOptions
        .filter((o) => o.professional_name === profName)
        .map((o) => ({ id: o.id, unitName: o.unit_name }));
  }, [puOptions]);

  const createAvailability = useMutation({
    mutationFn: async (payload: {
      professional_unit: number;
      slot_minutes: number;
      buffer_minutes: number;
      weekly: Weekly;
    }) => {
      await fetchCsrf();
      const body: Record<string, any> = {
        professional_unit: payload.professional_unit,
        slot_minutes: payload.slot_minutes,
        buffer_minutes: payload.buffer_minutes,
        weekly: payload.weekly,
        is_active: true,
      };
      console.info("[create-availability] post payload:", body);
      const { data } = await api.post(`/api/settings/professional-availabilities/`, body);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      setShowNewFor(null);
      setNewPuId(""); setNewSlot(60); setNewBuffer(0); setNewWeekly({});
      toast.success("Disponibilidade criada");
    },
    onError: (err: any) => toast.error("Erro ao criar disponibilidade", { description: JSON.stringify(err?.response?.data ?? err?.message ?? "") }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      await fetchCsrf();
      await api.patch(`/api/settings/professional-availabilities/${id}/`, { is_active });
    },
    onMutate: async ({ id, is_active }) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<Availability[]>(queryKey);
      qc.setQueryData<Availability[]>(queryKey, (old) =>
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

  const removeAvailability = useMutation({
    mutationFn: async (id: number) => {
      await fetchCsrf();
      await api.delete(`/api/settings/professional-availabilities/${id}/`);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey }); toast.success("Disponibilidade removida"); },
    onError: () => toast.error("Erro ao remover disponibilidade"),
  });

  const addSlot = (day: DayKey) => {
    setNewWeekly((w) => ({ ...w, [day]: [...(w[day] ?? []), { start: "08:00", end: "12:00" }] }));
  };
  const removeSlot = (day: DayKey, idx: number) => {
    setNewWeekly((w) => {
      const arr = [...(w[day] ?? [])];
      arr.splice(idx, 1);
      const next = { ...w };
      if (arr.length) next[day] = arr; else delete next[day];
      return next;
    });
  };
  const updateSlot = (day: DayKey, idx: number, field: "start" | "end", value: string) => {
    setNewWeekly((w) => {
      const arr = [...(w[day] ?? [])];
      arr[idx] = { ...arr[idx], [field]: value };
      return { ...w, [day]: arr };
    });
  };

  return (
    <Collapsible defaultOpen={false} id="section-profissionais-disponibilidades">
      <CollapsibleTrigger
        className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated"
        style={{ background: "hsl(var(--surface))" }}
      >
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary shrink-0" />
          <div className="text-left">
            <span className="text-sm font-bold text-foreground">Profissionais → Disponibilidades</span>
            <p className="text-xs text-muted-foreground">Horários semanais por profissional/unidade (slot + buffer)</p>
          </div>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
      </CollapsibleTrigger>
      <CollapsibleContent
        className="mt-2 rounded-xl border border-border p-4 space-y-2"
        style={{ background: "hsl(var(--surface))" }}
      >
        {isAuthLoading || isLoading ? (
          <p className="text-xs text-muted-foreground px-3">Carregando…</p>
        ) : professionalGroups.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3">Nenhuma disponibilidade encontrada.</p>
        ) : (
          professionalGroups.map(({ profName, list }) => {
            const isOpen = openProfName === profName;
            return (
              <div
                key={profName}
                className="rounded-lg border border-border"
                style={{ background: "hsl(var(--surface-elevated))" }}
              >
                <button
                  onClick={() => setOpenProfName(isOpen ? null : profName)}
                  className="w-full px-3 py-2 flex items-center justify-between gap-2 hover:bg-surface/50 transition-colors rounded-lg"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ChevronDown
                      className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isOpen ? "" : "-rotate-90"}`}
                    />
                    <span className="text-sm font-medium text-foreground truncate">{profName}</span>
                    <span className="text-[10px] text-muted-foreground">({list.length})</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="px-3 pb-3 space-y-2">
                    {list.map((item) => {
                      const active = item.is_active !== false;
                      return (
                        <div
                          key={item.id}
                          className="rounded-md px-3 py-2 border border-border space-y-2"
                          style={{ background: "hsl(var(--surface))" }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                              <span className="text-xs font-mono text-muted-foreground">#{item.id}</span>
                              <span className="text-xs text-foreground font-medium truncate">{item.unit_name ?? "—"}</span>
                              <span className="text-[10px] text-muted-foreground">slot {item.slot_minutes}min</span>
                              <span className="text-[10px] text-muted-foreground">buffer {item.buffer_minutes}min</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={active}
                                onCheckedChange={(checked) => toggleActive.mutate({ id: item.id, is_active: checked })}
                                className="scale-75"
                              />
                              <button
                                onClick={() => removeAvailability.mutate(item.id)}
                                className="text-muted-foreground hover:text-destructive transition-colors"
                                title="Remover"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-7 gap-2">
                            {DAY_KEYS.map((d) => {
                              const slots = item.weekly?.[d] ?? [];
                              return (
                                <div
                                  key={d}
                                  className="rounded-md border border-border px-2 py-2 min-h-[5rem]"
                                  style={{ background: "hsl(var(--surface-elevated))" }}
                                >
                                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground text-center">
                                    {DAY_LABELS[d]}
                                  </div>
                                  <div className="space-y-1 mt-1.5">
                                    {slots.length === 0 ? (
                                      <div className="text-sm text-muted-foreground/60 text-center">—</div>
                                    ) : (
                                      slots.map((s, i) => (
                                        <div key={i} className="text-sm font-mono text-foreground text-center leading-tight">
                                          {fmt(s.start)}<br />{fmt(s.end)}
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}

                    {showNewFor === profName ? (
                      <div
                        className="rounded-md border border-border p-3 mt-2 space-y-3"
                        style={{ background: "hsl(var(--surface))" }}
                      >
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Empresa</span>
                            <div className="h-8 px-2 flex items-center text-xs text-foreground rounded-md border border-border bg-background/60 truncate">
                              {company?.name ?? "—"}
                            </div>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Unidade</span>
                            <select
                              value={newPuId}
                              onChange={(e) => setNewPuId(e.target.value ? Number(e.target.value) : "")}
                              className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground"
                            >
                              <option value="">Selecione…</option>
                              {puOptionsByProf(profName).map((u) => (
                                <option key={u.id} value={u.id}>{u.unitName}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Slot (min)</span>
                            <input
                              type="number"
                              min={5}
                              step={5}
                              value={newSlot}
                              onChange={(e) => setNewSlot(Number(e.target.value || 0))}
                              className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Buffer (min)</span>
                            <input
                              type="number"
                              min={0}
                              step={5}
                              value={newBuffer}
                              onChange={(e) => setNewBuffer(Number(e.target.value || 0))}
                              className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Horários semanais</span>
                          {DAY_KEYS.map((d) => {
                            const slots = newWeekly[d] ?? [];
                            return (
                              <div key={d} className="flex items-start gap-2">
                                <div className="w-12 pt-1.5 text-xs font-medium text-foreground">{DAY_LABELS[d]}</div>
                                <div className="flex-1 space-y-1">
                                  {slots.length === 0 && (
                                    <div className="text-[11px] text-muted-foreground/70 italic pt-1.5">sem horários</div>
                                  )}
                                  {slots.map((s, i) => (
                                    <div key={i} className="flex items-center gap-1.5">
                                      <input
                                        type="time"
                                        value={s.start}
                                        onChange={(e) => updateSlot(d, i, "start", e.target.value)}
                                        className="h-7 text-xs rounded-md border border-border px-2 bg-background text-foreground"
                                      />
                                      <span className="text-xs text-muted-foreground">–</span>
                                      <input
                                        type="time"
                                        value={s.end}
                                        onChange={(e) => updateSlot(d, i, "end", e.target.value)}
                                        className="h-7 text-xs rounded-md border border-border px-2 bg-background text-foreground"
                                      />
                                      <button
                                        onClick={() => removeSlot(d, i)}
                                        className="text-muted-foreground hover:text-destructive transition-colors"
                                        title="Remover slot"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                                <button
                                  onClick={() => addSlot(d)}
                                  className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors pt-1.5"
                                >
                                  <Plus className="h-3 w-3" />
                                  slot
                                </button>
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-xs"
                            onClick={() => { setShowNewFor(null); setNewPuId(""); setNewSlot(60); setNewBuffer(0); setNewWeekly({}); }}
                          >
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            className="h-8 text-xs"
                            disabled={!newPuId || Object.keys(newWeekly).length === 0 || createAvailability.isPending}
                            onClick={() => {
                              createAvailability.mutate({
                                professional_unit: newPuId as number,
                                slot_minutes: newSlot,
                                buffer_minutes: newBuffer,
                                weekly: newWeekly,
                              });
                            }}
                          >
                            {createAvailability.isPending ? "…" : "Salvar"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setShowNewFor(profName);
                          setNewPuId(""); setNewSlot(60); setNewBuffer(0); setNewWeekly({});
                        }}
                        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors pt-2 px-2"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Adicionar disponibilidade
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
