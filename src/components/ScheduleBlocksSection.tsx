import { useAuth } from "@/contexts/AuthContext";
import { ChevronDown, Plus, Trash2, CalendarOff } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function ScheduleBlocksSection() {
  const { company, units, activeUnit } = useAuth();
  const queryClient = useQueryClient();

  const [showNew, setShowNew] = useState(false);
  const [newProfId, setNewProfId] = useState<number | "">("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [newReason, setNewReason] = useState("");

  const { data: professionalsData = [] } = useQuery({
    queryKey: ["professionals", activeUnit?.id],
    queryFn: async () => {
      const { data } = await api.get(`/api/booking/professionals/`, {
        params: { unit: activeUnit!.id },
      });
      return Array.isArray(data) ? data : (data?.results ?? []);
    },
    enabled: !!activeUnit?.id,
  });

  const { data: blocks = [], isLoading } = useQuery({
    queryKey: ["schedule-blocks"],
    queryFn: async () => {
      const { data } = await api.get("/api/settings/professional-time-offs/");
      const list = Array.isArray(data) ? data : (data?.results ?? []);
      if (list.length > 0) console.log("[time-offs] sample keys:", Object.keys(list[0]), "sample:", list[0]);
      return list;
    },
  });

  const createBlock = useMutation({
    mutationFn: async (payload: { professional: number; starts_at: string; ends_at: string; reason?: string; company?: number }) => {
      await fetchCsrf();
      const { data } = await api.post("/api/settings/professional-time-offs/", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule-blocks"] });
      setShowNew(false);
      setNewProfId("");
      setNewStart("");
      setNewEnd("");
      setNewReason("");
      toast.success("Bloqueio criado com sucesso");
    },
    onError: () => toast.error("Erro ao criar bloqueio"),
  });

  const deleteBlock = useMutation({
    mutationFn: async (id: number) => {
      await fetchCsrf();
      await api.delete(`/api/settings/professional-time-offs/${id}/`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["schedule-blocks"] });
      toast.success("Bloqueio removido");
    },
    onError: () => toast.error("Erro ao remover bloqueio"),
  });

  const getProfName = (id: number) =>
    professionalsData.find((p: any) => p.id === id)?.name ?? `#${id}`;

  return (
    <Collapsible defaultOpen={false} id="section-bloqueios">
      <CollapsibleTrigger
        className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated"
        style={{ background: "hsl(var(--surface))" }}
      >
        <div className="flex items-center gap-2">
          <CalendarOff className="h-4 w-4 text-primary" />
          <span className="text-sm font-bold text-foreground">Bloqueios de Agenda</span>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
      </CollapsibleTrigger>
      <CollapsibleContent
        className="mt-2 rounded-xl border border-border p-4 space-y-1"
        style={{ background: "hsl(var(--surface))" }}
      >
        {/* Header */}
        <div className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_auto_2rem] gap-2 px-3 py-1 items-center">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Empresa</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Profissional</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Início</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Fim</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Motivo</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
          <span />
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground px-3">Carregando…</p>
        ) : blocks.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3">Nenhum bloqueio encontrado.</p>
        ) : (
          blocks.map((b: any) => {
            const isActive = b.is_active !== false && b.status !== "inactive";
            const startRaw = b.starts_at ?? b.start_date ?? b.start ?? b.start_datetime;
            const endRaw = b.ends_at ?? b.end_date ?? b.end ?? b.end_datetime;
            const fmtDate = (v: any) => {
              if (!v) return "—";
              try { return new Date(v).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }); } catch { return String(v); }
            };
            return (
              <div
                key={b.id}
                className="grid grid-cols-[1fr_1fr_1fr_1fr_1fr_auto_2rem] gap-2 items-center rounded-lg px-3 py-2 border border-border"
                style={{ background: "hsl(var(--surface-elevated))" }}
              >
                <span className="text-xs text-muted-foreground">{b.company_name ?? company?.name ?? "—"}</span>
                <span className="text-sm font-medium text-foreground">{b.professional_name ?? getProfName(b.professional)}</span>
                <span className="text-xs text-muted-foreground">{fmtDate(startRaw)}</span>
                <span className="text-xs text-muted-foreground">{fmtDate(endRaw)}</span>
                <span className="text-xs text-muted-foreground truncate">{b.reason ?? "—"}</span>
                <span className={`text-xs font-medium ${isActive ? "text-green-400" : "text-muted-foreground"}`}>
                  {isActive ? "Ativo" : "Inativo"}
                </span>
                <button
                  onClick={() => deleteBlock.mutate(b.id)}
                  className="text-muted-foreground hover:text-destructive transition-colors"
                  title="Remover bloqueio"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}

        {/* Create */}
        {showNew ? (
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Input
              placeholder="Empresa"
              value={company?.name ?? ""}
              disabled
              className="h-8 text-sm w-28 opacity-70"
            />
            <select
              value={newProfId}
              onChange={(e) => setNewProfId(e.target.value ? Number(e.target.value) : "")}
              className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground"
            >
              <option value="">Profissional</option>
              {professionalsData.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <Input
              type="datetime-local"
              value={newStart}
              onChange={(e) => setNewStart(e.target.value)}
              className="h-8 text-sm w-44"
            />
            <Input
              type="datetime-local"
              value={newEnd}
              onChange={(e) => setNewEnd(e.target.value)}
              className="h-8 text-sm w-44"
            />
            <Input
              placeholder="Motivo"
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              className="h-8 text-sm flex-1 min-w-[100px]"
            />
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={!newProfId || !newStart || !newEnd || createBlock.isPending}
              onClick={() =>
                createBlock.mutate({
                  professional: newProfId as number,
                  starts_at: newStart,
                  ends_at: newEnd,
                  ...(newReason.trim() ? { reason: newReason.trim() } : {}),
                  ...(company?.id ? { company: company.id } : {}),
                })
              }
            >
              {createBlock.isPending ? "…" : "Salvar"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => { setShowNew(false); setNewProfId(""); setNewStart(""); setNewEnd(""); setNewReason(""); }}
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
            Adicionar bloqueio
          </button>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
