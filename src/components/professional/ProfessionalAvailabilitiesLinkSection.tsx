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

const normalize = (item: any): Availability => {
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
};

const fmt = (t: string) => (t || "").slice(0, 5);

export default function ProfessionalAvailabilitiesLinkSection() {
  const { company, units, isLoading: isAuthLoading, isAuthenticated } = useAuth();
  const qc = useQueryClient();

  const [openProfName, setOpenProfName] = useState<string | null>(null);
  const [showNewFor, setShowNewFor] = useState<string | null>(null);
  const [newPuId, setNewPuId] = useState<number | "">("");
  const [newSlot, setNewSlot] = useState<number>(60);
  const [newBuffer, setNewBuffer] = useState<number>(0);
  const [newWeekly, setNewWeekly] = useState<Weekly>({});

  // Profissionais (global + por unidade) só para enriquecer o select de PU no formulário
  const { data: professionalsCatalog = [] } = useQuery<any[]>({
    queryKey: ["professionals-catalog-availabilities", units.map((u) => u.id).join(",")],
    queryFn: async () => {
      const seen = new Set<number>();
      const all: any[] = [];
      const push = (list: any[]) => {
        for (const p of list) {
          const id = Number(p?.id);
          if (id && !seen.has(id)) { seen.add(id); all.push(p); }
        }
      };
      try {
        const { data } = await api.get(`/api/booking/professionals/`, { params: { page_size: 500 } });
        push(unpack(data));
      } catch {}
      if (units.length > 0) {
        const reqs = units.map((u) =>
          api.get(`/api/booking/professionals/`, { params: { unit: u.id, page_size: 500 } })
            .then((r) => unpack(r.data))
            .catch(() => [])
        );
        const results = await Promise.all(reqs);
        for (const list of results) push(list);
      }
      return all;
    },
    enabled: !isAuthLoading && isAuthenticated,
  });

  // Vínculos professional_unit (todos) — para popular o select do form
  const { data: allPuLinks = [] } = useQuery<any[]>({
    queryKey: ["professional-units-all-availabilities"],
    queryFn: async () => {
      const { data } = await api.get(`/api/booking/professional-units/`, { params: { page_size: 1000 } });
      return unpack(data);
    },
    enabled: !isAuthLoading && isAuthenticated,
  });

  const queryKey = ["professional-availabilities-all"];

  const { data: items = [], isLoading } = useQuery<Availability[]>({
    queryKey,
    queryFn: async () => {
      const { data } = await api.get(`/api/booking/professional-availabilities/`, { params: { page_size: 500 } });
      const list = unpack(data).map(normalize).filter((it) => it.id);
      console.info("[professional-availabilities] count:", list.length);
      return list;
    },
    enabled: !isAuthLoading && isAuthenticated,
  });

  // Agrupa por nome do profissional
  const grouped = useMemo(() => {
    const map = new Map<string, Availability[]>();
    for (const it of items) {
      const key = it.professional_name ?? `#${it.professional_unit_id}`;
      const arr = map.get(key) ?? [];
      arr.push(it);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items]);

  const puOptionsByProf = useMemo(() => {
    // Para o profissional aberto, pegamos os PU links cujo professional_name bate
    return (profName: string) => {
      const profId = professionalsCatalog.find((p: any) => p?.name === profName)?.id;
      return allPuLinks
        .filter((l: any) => {
          if (l?.is_active === false) return false;
          const pid = typeof l?.professional === "object" ? l?.professional?.id : (l?.professional ?? l?.professional_id);
          return Number(pid) === Number(profId);
        })
        .map((l: any) => {
          const unitV = l?.unit ?? l?.unit_id;
          const unitId = typeof unitV === "object" ? Number(unitV?.id ?? 0) : Number(unitV ?? 0);
          const unitName =
            l?.unit_name ?? l?.unit__name ??
            (typeof unitV === "object" ? unitV?.name : undefined) ??
            units.find((u) => u.id === unitId)?.name ?? `#${unitId}`;
          return { id: Number(l?.id), unitName };
        })
        .filter((o) => o.id);
    };
  }, [allPuLinks, professionalsCatalog, units]);

  const createAvailability = useMutation({
    mutationFn: async (payload: { professional_unit: number; slot_minutes: number; buffer_minutes: number; weekly: Weekly }) => {
      await fetchCsrf();
      const { data } = await api.post(`/api/booking/professional-availabilities/`, {
        ...payload,
        is_active: true,
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      setShowNewFor(null);
      setNewPuId(""); setNewSlot(60); setNewBuffer(0); setNewWeekly({});
      toast.success("Disponibilidade criada");
    },
    onError: () => toast.error("Erro ao criar disponibilidade"),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      await fetchCsrf();
      await api.patch(`/api/booking/professional-availabilities/${id}/`, { is_active });
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
      await api.delete(`/api/booking/professional-availabilities/${id}/`);
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
        ) : grouped.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3">Nenhuma disponibilidade encontrada.</p>
        ) : (
          grouped.map(([profName, list]) => {
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
                          <div className="grid grid-cols-7 gap-1">
                            {DAY_KEYS.map((d) => {
                              const slots = item.weekly?.[d] ?? [];
                              return (
                                <div
                                  key={d}
                                  className="rounded-md border border-border px-1.5 py-1 min-h-[3.5rem]"
                                  style={{ background: "hsl(var(--surface-elevated))" }}
                                >
                                  <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground text-center">
                                    {DAY_LABELS[d]}
                                  </div>
                                  <div className="space-y-0.5 mt-1">
                                    {slots.length === 0 ? (
                                      <div className="text-[10px] text-muted-foreground/60 text-center">—</div>
                                    ) : (
                                      slots.map((s, i) => (
                                        <div key={i} className="text-[10px] font-mono text-foreground text-center">
                                          {fmt(s.start)}–{fmt(s.end)}
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
                            onClick={() => createAvailability.mutate({
                              professional_unit: newPuId as number,
                              slot_minutes: newSlot,
                              buffer_minutes: newBuffer,
                              weekly: newWeekly,
                            })}
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
