import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { CalendarOff, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { toast } from "sonner";
import SubSectionShell from "./SubSectionShell";

interface ProfessionalUnit {
  id: number;
  unit: number;
  unit_name?: string;
}

interface TimeOff {
  id: number;
  professional_unit: number;
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
  return [];
};

interface Props {
  professionalId: number;
}

type Mode = "all_day" | "period";

export default function ProfessionalTimeOffsSubSection({ professionalId }: Props) {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [formProfUnit, setFormProfUnit] = useState<number | "">("");
  const [mode, setMode] = useState<Mode>("all_day");
  const [day, setDay] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");

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
  const queryKey = ["professional-timeoffs", professionalId, profUnitIds.join(",")];

  const { data: items = [], isLoading } = useQuery<TimeOff[]>({
    queryKey,
    queryFn: async () => {
      if (profUnitIds.length === 0) return [];
      const all: TimeOff[] = [];
      const seen = new Set<number>();
      const reqs = profUnitIds.map((puId) =>
        api.get(`/api/settings/professional-time-offs/`, { params: { professional_unit: puId } })
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
    setShowNew(false);
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
      const { data } = await api.post(`/api/settings/professional-time-offs/`, payload);
      return data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey }); resetForm(); toast.success("Bloqueio criado"); },
    onError: (err: any) => toast.error("Erro ao criar bloqueio", { description: JSON.stringify(err?.response?.data ?? err?.message ?? "") }),
  });

  const removeBlock = useMutation({
    mutationFn: async (id: number) => {
      await fetchCsrf();
      await api.delete(`/api/settings/professional-time-offs/${id}/`);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey }); toast.success("Bloqueio removido"); },
    onError: () => toast.error("Erro ao remover bloqueio"),
  });

  const fmtDate = (v?: string) => {
    if (!v) return "—";
    try { return new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); } catch { return v; }
  };

  const canSave = !!formProfUnit && (mode === "all_day" ? !!day : !!startsAt && !!endsAt);

  return (
    <SubSectionShell icon={CalendarOff} title="Adição / Bloqueios" description="Períodos de bloqueio na agenda">
      {profUnits.length === 0 ? (
        <p className="text-xs text-muted-foreground px-3">Vincule uma unidade primeiro para gerenciar bloqueios.</p>
      ) : (
        <>
          <div className="min-w-[32rem] grid grid-cols-[1fr_1fr_1fr_1fr_1.5fr_2rem] gap-2 px-3 py-1 items-center">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Unidade</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Tipo</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Início</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Fim</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Motivo</span>
            <span />
          </div>

          {isLoading ? (
            <p className="text-xs text-muted-foreground px-3">Carregando…</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-muted-foreground px-3">Nenhum bloqueio cadastrado.</p>
          ) : (
            items.map((b) => {
              const pu = profUnits.find((p) => p.id === b.professional_unit);
              return (
                <div
                  key={b.id}
                  className="min-w-[32rem] grid grid-cols-[1fr_1fr_1fr_1fr_1.5fr_2rem] gap-2 items-center rounded-lg px-3 py-2 border border-border"
                  style={{ background: "hsl(var(--surface-elevated))" }}
                >
                  <span className="text-xs text-foreground truncate">{b.unit_name ?? pu?.unit_name ?? "—"}</span>
                  <span className="text-xs text-muted-foreground">
                    {b.is_all_day ? "Dia inteiro" : "Período"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {b.is_all_day ? (b.day ?? "—") : fmtDate(b.starts_at)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {b.is_all_day ? "—" : fmtDate(b.ends_at)}
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
              );
            })
          )}

          {showNew ? (
            <div className="space-y-2 pt-2 rounded-lg border border-border p-3" style={{ background: "hsl(var(--surface-elevated))" }}>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={formProfUnit}
                  onChange={(e) => setFormProfUnit(e.target.value ? Number(e.target.value) : "")}
                  className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground"
                >
                  <option value="">Unidade</option>
                  {profUnits.map((p) => (
                    <option key={p.id} value={p.id}>{p.unit_name ?? `Unidade #${p.unit}`}</option>
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
              onClick={() => setShowNew(true)}
              className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors pt-2 px-3"
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar bloqueio
            </button>
          )}
        </>
      )}
    </SubSectionShell>
  );
}
