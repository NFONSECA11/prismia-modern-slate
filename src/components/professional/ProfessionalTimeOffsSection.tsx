import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CalendarOff, ChevronDown, Plus, Trash2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
}

interface Props {
  professionals: ProfessionalItem[];
  isLoading?: boolean;
}

type Mode = "all_day" | "period";

const unpack = (data: any): any[] => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data)) return data.data;
  return [];
};

export default function ProfessionalTimeOffsSection({ professionals, isLoading }: Props) {
  const qc = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [formProfUnit, setFormProfUnit] = useState<number | "">("");
  const [mode, setMode] = useState<Mode>("all_day");
  const [day, setDay] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [reason, setReason] = useState("");

  const queryKey = ["professional-timeoffs-all", professionals.map((p) => p.id).join(",")];

  const { data, isLoading: isLoadingItems } = useQuery<{ profUnits: ProfessionalUnit[]; items: TimeOff[] }>({
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
            .get(`/api/booking/professional-timeoffs/`, { params: { professional_unit: profUnit.id } })
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

      const items = itemResults.flat().sort((a, b) => {
        const nameA = (a.professional_name ?? "").toLowerCase();
        const nameB = (b.professional_name ?? "").toLowerCase();
        if (nameA !== nameB) return nameA.localeCompare(nameB);
        const startA = a.day ?? a.starts_at ?? "";
        const startB = b.day ?? b.starts_at ?? "";
        return String(startA).localeCompare(String(startB));
      });

      return { profUnits, items };
    },
    enabled: professionals.length > 0,
  });

  const profUnits = data?.profUnits ?? [];
  const items = data?.items ?? [];

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
      const { data } = await api.post(`/api/booking/professional-timeoffs/`, payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      resetForm();
      toast.success("Bloqueio criado");
    },
    onError: (err: any) => toast.error("Erro ao criar bloqueio", { description: JSON.stringify(err?.response?.data ?? err?.message ?? "") }),
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

  const canSave = !!formProfUnit && (mode === "all_day" ? !!day : !!startsAt && !!endsAt);
  const fmtDate = (value?: string) => {
    if (!value) return "—";
    try {
      return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
    } catch {
      return value;
    }
  };

  return (
    <Collapsible defaultOpen={false}>
      <CollapsibleTrigger className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated" style={{ background: "hsl(var(--surface))" }}>
        <div className="flex items-center gap-2">
          <CalendarOff className="h-4 w-4 text-primary shrink-0" />
          <div className="text-left">
            <span className="text-sm font-bold text-foreground block">Profissionais → Adição / Bloqueios</span>
            <p className="text-xs text-muted-foreground">Períodos de adição e bloqueio na agenda</p>
          </div>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
      </CollapsibleTrigger>

      <CollapsibleContent className="mt-2 rounded-xl border border-border p-4 space-y-2" style={{ background: "hsl(var(--surface))" }}>
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1.5fr_2rem] gap-2 px-3 py-1 items-center">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Profissional</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Unidade</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Tipo</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Início</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Fim</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Motivo</span>
          <span />
        </div>

        {isLoading || isLoadingItems ? (
          <p className="text-xs text-muted-foreground px-3">Carregando…</p>
        ) : profUnits.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3">Vincule uma unidade primeiro para gerenciar bloqueios.</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3">Nenhum bloqueio cadastrado.</p>
        ) : (
          items.map((item) => (
            <div key={item.id} className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_1.5fr_2rem] gap-2 items-center rounded-lg px-3 py-2 border border-border" style={{ background: "hsl(var(--surface-elevated))" }}>
              <span className="text-sm font-medium text-foreground truncate">{item.professional_name ?? "—"}</span>
              <span className="text-xs text-foreground truncate">{item.unit_name ?? "—"}</span>
              <span className="text-xs text-muted-foreground">{item.is_all_day ? "Dia inteiro" : "Período"}</span>
              <span className="text-xs text-muted-foreground">{item.is_all_day ? (item.day ?? "—") : fmtDate(item.starts_at)}</span>
              <span className="text-xs text-muted-foreground">{item.is_all_day ? "—" : fmtDate(item.ends_at)}</span>
              <span className="text-xs text-muted-foreground truncate">{item.reason ?? "—"}</span>
              <button onClick={() => removeBlock.mutate(item.id)} className="text-muted-foreground hover:text-destructive transition-colors" title="Remover">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}

        {showNew ? (
          <div className="space-y-2 pt-2 rounded-lg border border-border p-3" style={{ background: "hsl(var(--surface-elevated))" }}>
            <div className="flex flex-wrap items-center gap-2">
              <select value={formProfUnit} onChange={(e) => setFormProfUnit(e.target.value ? Number(e.target.value) : "")} className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground flex-1 min-w-[220px]">
                <option value="">Profissional / Unidade</option>
                {profUnits.map((profUnit) => (
                  <option key={profUnit.id} value={profUnit.id}>{`${profUnit.professional_name ?? `#${profUnit.professional}`} — ${profUnit.unit_name ?? `#${profUnit.unit}`}`}</option>
                ))}
              </select>
              <select value={mode} onChange={(e) => setMode(e.target.value as Mode)} className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground">
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
              <Input placeholder="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} className="h-8 text-sm flex-1 min-w-[120px]" />
            </div>

            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="h-8 text-xs"
                disabled={!canSave || createBlock.isPending}
                onClick={() => {
                  const payload: any = { professional_unit: formProfUnit, exception_mode: "block", is_all_day: mode === "all_day", ...(reason.trim() ? { reason: reason.trim() } : {}) };
                  if (mode === "all_day") payload.day = day;
                  else {
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
          <button onClick={() => setShowNew(true)} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors pt-2 px-3">
            <Plus className="h-3.5 w-3.5" />
            Adicionar bloqueio
          </button>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}