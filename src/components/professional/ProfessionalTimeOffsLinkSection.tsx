import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { useAuth } from "@/contexts/AuthContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Plus, Trash2, CalendarOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useMemo, useState } from "react";
import { toast } from "sonner";

interface PuOption {
  id: number;
  label: string;
}

interface TimeOff {
  id: number;
  professional_unit: number;
  professional_name?: string;
  unit_name?: string;
  exception_mode?: string;
  is_all_day?: boolean;
  day?: string;
  starts_at?: string;
  ends_at?: string;
  reason?: string;
  is_active?: boolean;
}

const unpack = (data: any): any[] => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data)) return data.data;
  if (data?.result) return unpack(data.result);
  return [];
};

const parsePuLabel = (label?: string | null) => {
  const raw = String(label ?? "").trim();
  if (!raw) return { professionalName: undefined, unitName: undefined };
  const [professionalName, ...unitParts] = raw.split("@");
  const unitName = unitParts.join("@").trim();
  return {
    professionalName: professionalName?.trim() || undefined,
    unitName: unitName || undefined,
  };
};

type Mode = "all_day" | "period";

export default function ProfessionalTimeOffsLinkSection() {
  const { isLoading: isAuthLoading, isAuthenticated } = useAuth();
  const qc = useQueryClient();

  const [openProfName, setOpenProfName] = useState<string | null>(null);
  const [showNewFor, setShowNewFor] = useState<string | null>(null);
  const [formProfUnit, setFormProfUnit] = useState<number | "">("");
  const [mode, setMode] = useState<Mode>("all_day");
  const [day, setDay] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");

  const { data: puOptions = [] } = useQuery<PuOption[]>({
    queryKey: ["professional-units-as-options"],
    queryFn: async () => {
      const { data } = await api.get(`/api/booking/professional-units/as-options/`);
      return unpack(data)
        .map((o: any) => ({ id: Number(o?.id), label: String(o?.label ?? "").trim() }))
        .filter((o) => o.id && o.label);
    },
    enabled: !isAuthLoading && isAuthenticated,
  });

  const puById = useMemo(() => {
    const map = new Map<number, PuOption>();
    for (const o of puOptions) map.set(o.id, o);
    return map;
  }, [puOptions]);

  const queryKey = ["professional-timeoffs-all", puOptions.map((o) => o.id).join(",")];

  const { data: items = [], isLoading } = useQuery<TimeOff[]>({
    queryKey,
    queryFn: async () => {
      if (puOptions.length === 0) return [];
      const reqs = puOptions.map((o) =>
        api
          .get(`/api/booking/professional-timeoffs/`, { params: { professional_unit: o.id } })
          .then((r) => unpack(r.data))
          .catch(() => []),
      );
      const results = await Promise.all(reqs);
      const seen = new Set<number>();
      const all: TimeOff[] = [];
      for (const list of results) {
        for (const it of list as TimeOff[]) {
          if (it?.id && !seen.has(it.id)) {
            seen.add(it.id);
            all.push(it);
          }
        }
      }
      return all;
    },
    enabled: !isAuthLoading && isAuthenticated && puOptions.length > 0,
  });

  const professionalGroups = useMemo(() => {
    const byName = new Map<string, { profName: string; list: TimeOff[] }>();

    for (const option of puOptions) {
      const { professionalName } = parsePuLabel(option.label);
      if (!professionalName) continue;
      if (!byName.has(professionalName)) {
        byName.set(professionalName, { profName: professionalName, list: [] });
      }
    }

    for (const item of items) {
      const option = puById.get(item.professional_unit);
      const parsed = parsePuLabel(option?.label);
      const profName = parsed.professionalName ?? item.professional_name ?? `PU #${item.professional_unit}`;
      const unitName = parsed.unitName ?? item.unit_name;
      const group = byName.get(profName) ?? { profName, list: [] };
      group.list.push({ ...item, professional_name: profName, unit_name: unitName });
      byName.set(profName, group);
    }

    return Array.from(byName.values()).sort((a, b) => a.profName.localeCompare(b.profName));
  }, [items, puById, puOptions]);

  const puOptionsByProf = useMemo(() => {
    return (profName: string) =>
      puOptions
        .map((option) => {
          const parsed = parsePuLabel(option.label);
          return {
            id: option.id,
            profName: parsed.professionalName,
            unitName: parsed.unitName,
            label: option.label,
          };
        })
        .filter((option) => option.profName === profName);
  }, [puOptions]);

  const resetForm = () => {
    setShowNewFor(null);
    setFormProfUnit("");
    setMode("all_day");
    setDay("");
    setStartsAt("");
    setEndsAt("");
    setReason("");
  };

  const createBlock = useMutation({
    mutationFn: async (payload: any) => {
      await fetchCsrf();
      const { data } = await api.post(`/api/booking/professional-timeoffs/`, payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      resetForm();
      toast.success("Bloqueio criado");
    },
    onError: (err: any) =>
      toast.error("Erro ao criar bloqueio", {
        description: JSON.stringify(err?.response?.data ?? err?.message ?? ""),
      }),
  });

  const removeBlock = useMutation({
    mutationFn: async (id: number) => {
      await fetchCsrf();
      await api.delete(`/api/booking/professional-timeoffs/${id}/`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast.success("Bloqueio removido");
    },
    onError: () => toast.error("Erro ao remover bloqueio"),
  });

  const fmtDateTime = (v?: string) => {
    if (!v) return "—";
    try {
      return new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    } catch {
      return v;
    }
  };

  const fmtDate = (v?: string) => {
    if (!v) return "—";
    try {
      return new Date(v + "T00:00:00").toLocaleDateString("pt-BR");
    } catch {
      return v;
    }
  };

  const canSave = !!formProfUnit && (mode === "all_day" ? !!day : !!startsAt && !!endsAt);

  return (
    <Collapsible defaultOpen={false} id="section-profissionais-bloqueios">
      <CollapsibleTrigger
        className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated"
        style={{ background: "hsl(var(--surface))" }}
      >
        <div className="flex items-center gap-2">
          <CalendarOff className="h-4 w-4 text-primary shrink-0" />
          <div className="text-left">
            <span className="text-sm font-bold text-foreground">Profissionais → Adição / Bloqueio</span>
            <p className="text-xs text-muted-foreground">Bloqueios e exceções de agenda por profissional/unidade</p>
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
          <p className="text-xs text-muted-foreground px-3">Nenhum profissional/unidade encontrado.</p>
        ) : (
          professionalGroups.map(({ profName, list }) => {
            const isOpen = openProfName === profName;
            const profPuOptions = puOptionsByProf(profName);
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
                    {list.length === 0 ? (
                      <p className="text-xs text-muted-foreground px-1 py-2">Nenhum bloqueio cadastrado.</p>
                    ) : (
                      <>
                        <div className="grid grid-cols-[1.2fr_0.8fr_1fr_1fr_1.4fr_2rem] gap-2 px-2 py-1 items-center">
                          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Unidade</span>
                          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Tipo</span>
                          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Início</span>
                          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Fim</span>
                          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Motivo</span>
                          <span />
                        </div>
                        {list.map((b) => (
                          <div
                            key={b.id}
                            className="grid grid-cols-[1.2fr_0.8fr_1fr_1fr_1.4fr_2rem] gap-2 items-center rounded-md px-2 py-2 border border-border"
                            style={{ background: "hsl(var(--surface))" }}
                          >
                            <span className="text-xs text-foreground truncate">{b.unit_name ?? "—"}</span>
                            <span className="text-xs text-muted-foreground">
                              {b.is_all_day ? "Dia inteiro" : "Período"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {b.is_all_day ? fmtDate(b.day) : fmtDateTime(b.starts_at)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {b.is_all_day ? "—" : fmtDateTime(b.ends_at)}
                            </span>
                            <span className="text-xs text-muted-foreground truncate">{b.reason ?? "—"}</span>
                            <button
                              onClick={() => removeBlock.mutate(b.id)}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                              title="Remover"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                      </>
                    )}

                    {showNewFor === profName ? (
                      <div
                        className="rounded-md border border-border p-3 mt-2 space-y-2"
                        style={{ background: "hsl(var(--surface)) " }}
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <select
                            value={formProfUnit}
                            onChange={(e) => setFormProfUnit(e.target.value ? Number(e.target.value) : "")}
                            className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground"
                          >
                            <option value="">Unidade</option>
                            {profPuOptions.map((p) => (
                              <option key={p.id} value={p.id}>{p.unitName ?? p.label}</option>
                            ))}
                          </select>
                          <select
                            value={mode}
                            onChange={(e) => setMode(e.target.value as Mode)}
                            className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground"
                          >
                            <option value="all_day">Dia inteiro</option>
                            <option value="period">Período</option>
                          </select>
                          {mode === "all_day" ? (
                            <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="h-8 text-sm w-40" />
                          ) : (
                            <>
                              <Input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="h-8 text-sm w-44" />
                              <Input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="h-8 text-sm w-44" />
                            </>
                          )}
                          <Input
                            placeholder="Motivo (opcional)"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            className="h-8 text-sm flex-1 min-w-[120px]"
                          />
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            className="h-8 text-xs"
                            disabled={!canSave || createBlock.isPending}
                            onClick={() => {
                              const payload: any = {
                                professional_unit: formProfUnit,
                                exception_mode: "block",
                                is_all_day: mode === "all_day",
                                ...(reason.trim() ? { reason: reason.trim() } : {}),
                              };
                              if (mode === "all_day") {
                                payload.day = day;
                              } else {
                                payload.starts_at = startsAt;
                                payload.ends_at = endsAt;
                              }
                              createBlock.mutate(payload);
                            }}
                          >
                            {createBlock.isPending ? "…" : "Salvar"}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={resetForm}>Cancelar</Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          resetForm();
                          setShowNewFor(profName);
                          if (profPuOptions.length === 1) setFormProfUnit(profPuOptions[0].id);
                        }}
                        className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors pt-1 px-1"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Adicionar bloqueio
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
