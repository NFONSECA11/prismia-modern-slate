import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { useAuth } from "@/contexts/AuthContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Plus, Trash2, CalendarClock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";
import { toast } from "sonner";

interface Availability {
  id: number;
  professional: number;
  professional_name?: string;
  professional__name?: string;
  unit?: number;
  unit_id?: number;
  unit_name?: string;
  unit__name?: string;
  professional_unit?: number;
  weekday: number;
  start_time: string;
  end_time: string;
  is_active?: boolean;
}

const WEEKDAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

const unpack = (data: any): any[] => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data)) return data.data;
  if (data?.result) return unpack(data.result);
  return [];
};

const normalize = (item: any): Availability => {
  const profV = item?.professional ?? item?.professional_id;
  const unitV = item?.unit ?? item?.unit_id;
  const professional = typeof profV === "object" ? Number(profV?.id ?? 0) : Number(profV ?? 0);
  const unit = typeof unitV === "object" ? Number(unitV?.id ?? 0) : Number(unitV ?? 0);
  return {
    ...item,
    professional,
    professional_name:
      item?.professional_name ??
      item?.professional__name ??
      (typeof profV === "object" ? profV?.name : undefined),
    unit: unit || undefined,
    unit_name:
      item?.unit_name ??
      item?.unit__name ??
      (typeof unitV === "object" ? unitV?.name : undefined),
    weekday: Number(item?.weekday ?? 0),
    start_time: String(item?.start_time ?? "").slice(0, 5),
    end_time: String(item?.end_time ?? "").slice(0, 5),
  };
};

const fmtTime = (t: string) => (t || "").slice(0, 5);

export default function ProfessionalAvailabilitiesLinkSection() {
  const { company, units, isLoading: isAuthLoading, isAuthenticated } = useAuth();
  const qc = useQueryClient();

  const [openProfId, setOpenProfId] = useState<number | null>(null);
  const [showNewFor, setShowNewFor] = useState<number | null>(null);
  const [newPuId, setNewPuId] = useState<number | "">("");
  const [newWeekday, setNewWeekday] = useState<number | "">("");
  const [newStart, setNewStart] = useState<string>("08:00");
  const [newEnd, setNewEnd] = useState<string>("18:00");

  const { data: professionals = [] } = useQuery<any[]>({
    queryKey: ["professionals-all-availabilities"],
    queryFn: async () => {
      const { data } = await api.get(`/api/booking/professionals/`, { params: { page_size: 500 } });
      return unpack(data);
    },
    enabled: !isAuthLoading && isAuthenticated,
  });

  const { data: profUnitLinks = [] } = useQuery<any[]>({
    queryKey: ["professional-units-for-availability", showNewFor],
    queryFn: async () => {
      if (!showNewFor) return [];
      const { data } = await api.get(`/api/booking/professional-units/`, {
        params: { professional: showNewFor, page_size: 500 },
      });
      return unpack(data).filter((it: any) => it?.is_active !== false);
    },
    enabled: !isAuthLoading && isAuthenticated && !!showNewFor,
  });

  const availableUnits = profUnitLinks
    .map((link: any) => {
      const unitV = link?.unit ?? link?.unit_id;
      const unitId = typeof unitV === "object" ? Number(unitV?.id ?? 0) : Number(unitV ?? 0);
      const name =
        link?.unit_name ??
        link?.unit__name ??
        (typeof unitV === "object" ? unitV?.name : undefined) ??
        units.find((u) => u.id === unitId)?.name ??
        `#${unitId}`;
      return { id: Number(link?.id), unitId, name };
    })
    .filter((u) => u.id);

  const queryKey = [
    "professional-availabilities-all",
    professionals.map((p: any) => p.id).join(","),
    units.map((u) => u.id).join(","),
  ];

  const { data: items = [], isLoading } = useQuery<Availability[]>({
    queryKey,
    queryFn: async () => {
      const all: Availability[] = [];
      const seen = new Set<number>();
      const push = (list: Availability[]) => {
        for (const it of list) if (it.id && !seen.has(it.id)) { seen.add(it.id); all.push(it); }
      };

      try {
        const { data } = await api.get(`/api/booking/professional-availabilities/`, { params: { page_size: 500 } });
        push(unpack(data).map(normalize).filter((it) => it.id));
      } catch (e) {
        console.warn("[professional-availabilities] global fetch failed", e);
      }

      if (professionals.length > 0) {
        const reqs = professionals.map((p: any) =>
          api.get(`/api/booking/professional-availabilities/`, { params: { professional: p.id, page_size: 500 } })
            .then((r) => unpack(r.data).map(normalize))
            .catch(() => [])
        );
        const results = await Promise.all(reqs);
        for (const list of results) push(list.filter((it) => it.id));
      }

      console.info("[professional-availabilities] total merged:", all.length);
      return all;
    },
    enabled: !isAuthLoading && isAuthenticated,
  });

  const grouped = useMemo(() => {
    const map = new Map<number, Availability[]>();
    for (const it of items) {
      const arr = map.get(it.professional) ?? [];
      arr.push(it);
      map.set(it.professional, arr);
    }
    for (const [, arr] of map) {
      arr.sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time));
    }
    return map;
  }, [items]);

  const createAvailability = useMutation({
    mutationFn: async (payload: { professional: number; professional_unit: number; weekday: number; start_time: string; end_time: string }) => {
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
      setNewPuId(""); setNewWeekday(""); setNewStart("08:00"); setNewEnd("18:00");
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

  const unitName = (id?: number, fallback?: string) =>
    fallback ?? (id ? units.find((u) => u.id === id)?.name : undefined) ?? "—";

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
            <p className="text-xs text-muted-foreground">Horários semanais por profissional e unidade</p>
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
        ) : professionals.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3">Nenhum profissional encontrado.</p>
        ) : (
          professionals.map((prof: any) => {
            const list = grouped.get(prof.id) ?? [];
            const isOpen = openProfId === prof.id;
            return (
              <div
                key={prof.id}
                className="rounded-lg border border-border"
                style={{ background: "hsl(var(--surface-elevated))" }}
              >
                <button
                  onClick={() => setOpenProfId(isOpen ? null : prof.id)}
                  className="w-full px-3 py-2 flex items-center justify-between gap-2 hover:bg-surface/50 transition-colors rounded-lg"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ChevronDown
                      className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${isOpen ? "" : "-rotate-90"}`}
                    />
                    <span className="text-sm font-medium text-foreground truncate">{prof.name}</span>
                    <span className="text-[10px] text-muted-foreground">({list.length})</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="px-3 pb-3 space-y-1">
                    <div className="grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto_2rem] gap-2 px-2 py-1 items-center">
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">ID</span>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Unidade</span>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Dia</span>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Início</span>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Fim</span>
                      <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
                      <span />
                    </div>

                    {list.length === 0 ? (
                      <p className="text-xs text-muted-foreground px-2">Nenhuma disponibilidade.</p>
                    ) : (
                      list.map((item) => {
                        const active = item.is_active !== false;
                        return (
                          <div
                            key={item.id}
                            className="grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto_2rem] gap-2 items-center rounded-md px-2 py-1.5 border border-border"
                            style={{ background: "hsl(var(--surface))" }}
                          >
                            <span className="text-xs font-mono text-muted-foreground">{item.id}</span>
                            <span className="text-xs text-muted-foreground truncate">{unitName(item.unit, item.unit_name)}</span>
                            <span className="text-xs text-foreground">{WEEKDAYS[item.weekday] ?? `#${item.weekday}`}</span>
                            <span className="text-xs font-mono text-foreground">{fmtTime(item.start_time)}</span>
                            <span className="text-xs font-mono text-foreground">{fmtTime(item.end_time)}</span>
                            <Switch
                              checked={active}
                              onCheckedChange={(checked) => toggleActive.mutate({ id: item.id, is_active: checked })}
                              className="scale-75"
                            />
                            <button
                              onClick={() => removeAvailability.mutate(item.id)}
                              className="flex items-center justify-end text-muted-foreground hover:text-destructive transition-colors"
                              title="Remover"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })
                    )}

                    {showNewFor === prof.id ? (
                      <div
                        className="rounded-md border border-border p-3 mt-2 space-y-2"
                        style={{ background: "hsl(var(--surface))" }}
                      >
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
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
                              {availableUnits.map((u) => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Dia</span>
                            <select
                              value={newWeekday}
                              onChange={(e) => setNewWeekday(e.target.value === "" ? "" : Number(e.target.value))}
                              className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground"
                            >
                              <option value="">Selecione…</option>
                              {WEEKDAYS.map((d, i) => (
                                <option key={i} value={i}>{d}</option>
                              ))}
                            </select>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Início</span>
                            <input
                              type="time"
                              value={newStart}
                              onChange={(e) => setNewStart(e.target.value)}
                              className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground"
                            />
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Fim</span>
                            <input
                              type="time"
                              value={newEnd}
                              onChange={(e) => setNewEnd(e.target.value)}
                              className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground"
                            />
                          </div>
                        </div>
                        <div className="flex items-center justify-end gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-xs"
                            onClick={() => { setShowNewFor(null); setNewPuId(""); setNewWeekday(""); setNewStart("08:00"); setNewEnd("18:00"); }}
                          >
                            Cancelar
                          </Button>
                          <Button
                            size="sm"
                            className="h-8 text-xs"
                            disabled={!newPuId || newWeekday === "" || !newStart || !newEnd || createAvailability.isPending}
                            onClick={() => createAvailability.mutate({
                              professional: prof.id,
                              professional_unit: newPuId as number,
                              weekday: newWeekday as number,
                              start_time: newStart,
                              end_time: newEnd,
                            })}
                          >
                            {createAvailability.isPending ? "…" : "Salvar"}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setShowNewFor(prof.id);
                          setNewPuId(""); setNewWeekday(""); setNewStart("08:00"); setNewEnd("18:00");
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
