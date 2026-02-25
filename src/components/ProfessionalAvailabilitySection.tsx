import { useAuth } from "@/contexts/AuthContext";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

const WEEKDAYS = [
  { value: 0, label: "Segunda" },
  { value: 1, label: "Terça" },
  { value: 2, label: "Quarta" },
  { value: 3, label: "Quinta" },
  { value: 4, label: "Sexta" },
  { value: 5, label: "Sábado" },
  { value: 6, label: "Domingo" },
];

export default function ProfessionalAvailabilitySection() {
  const { units, activeUnit } = useAuth();
  const queryClient = useQueryClient();

  const [showNew, setShowNew] = useState(false);
  const [newProfId, setNewProfId] = useState<number | "">("");
  const [newWeekday, setNewWeekday] = useState<number | "">("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");

  // Fetch professionals from all units
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
      const list = Array.isArray(data) ? data : (data?.results ?? []);
      if (list.length > 0) console.log("[availabilities] sample keys:", Object.keys(list[0]), "sample:", list[0]);
      return list;
    },
  });

  const createAvailability = useMutation({
    mutationFn: async (payload: { professional: number; weekday?: number; start_time?: string; end_time?: string }) => {
      await fetchCsrf();
      const { data } = await api.post("/api/settings/professional-availabilities/", payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["professional-availabilities"] });
      setShowNew(false);
      setNewProfId("");
      setNewWeekday("");
      setNewStart("");
      setNewEnd("");
      toast.success("Disponibilidade criada com sucesso");
    },
    onError: () => toast.error("Erro ao criar disponibilidade"),
  });

  const toggleAvailability = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      await fetchCsrf();
      await api.patch(`/api/settings/professional-availabilities/${id}/`, { is_active, status: is_active ? "active" : "inactive" });
    },
    onMutate: async ({ id, is_active }) => {
      await queryClient.cancelQueries({ queryKey: ["professional-availabilities"] });
      const prev = queryClient.getQueryData(["professional-availabilities"]);
      queryClient.setQueryData(["professional-availabilities"], (old: any[]) =>
        old?.map((a: any) => a.id === id ? { ...a, is_active, status: is_active ? "active" : "inactive" } : a)
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

  const getWeekdayLabel = (val: any) => {
    const num = typeof val === "number" ? val : parseInt(val, 10);
    return WEEKDAYS.find((w) => w.value === num)?.label ?? val ?? "—";
  };

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
        <div className="grid grid-cols-[1fr_1fr_5rem_5rem_auto_2rem] gap-2 px-3 py-1 items-center">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Profissional</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Dia</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Início</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Fim</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
          <span />
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground px-3">Carregando…</p>
        ) : availabilities.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3">Nenhuma disponibilidade encontrada.</p>
        ) : (
          availabilities.map((a: any) => {
            const active = a.is_active !== false && a.status !== "inactive";
            const startTime = a.start_time ?? a.start ?? a.time_start ?? "—";
            const endTime = a.end_time ?? a.end ?? a.time_end ?? "—";
            const weekday = a.weekday ?? a.day_of_week ?? a.day;
            return (
              <div
                key={a.id}
                className="grid grid-cols-[1fr_1fr_5rem_5rem_auto_2rem] gap-2 items-center rounded-lg px-3 py-2 border border-border"
                style={{ background: "hsl(var(--surface-elevated))" }}
              >
                <span className="text-sm font-medium text-foreground">
                  {a.professional_name ?? getProfName(a.professional)}
                </span>
                <span className="text-xs text-muted-foreground">{getWeekdayLabel(weekday)}</span>
                <span className="text-xs text-muted-foreground">{startTime}</span>
                <span className="text-xs text-muted-foreground">{endTime}</span>
                <Switch
                  checked={active}
                  onCheckedChange={(checked) => toggleAvailability.mutate({ id: a.id, is_active: checked })}
                  className="scale-75"
                />
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
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <select
              value={newProfId}
              onChange={(e) => setNewProfId(e.target.value ? Number(e.target.value) : "")}
              className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground"
            >
              <option value="">Profissional</option>
              {allProfessionals.map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <select
              value={newWeekday}
              onChange={(e) => setNewWeekday(e.target.value !== "" ? Number(e.target.value) : "")}
              className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground"
            >
              <option value="">Dia</option>
              {WEEKDAYS.map((w) => (
                <option key={w.value} value={w.value}>{w.label}</option>
              ))}
            </select>
            <Input
              type="time"
              value={newStart}
              onChange={(e) => setNewStart(e.target.value)}
              className="h-8 text-sm w-28"
            />
            <Input
              type="time"
              value={newEnd}
              onChange={(e) => setNewEnd(e.target.value)}
              className="h-8 text-sm w-28"
            />
            <Button
              size="sm"
              className="h-8 text-xs"
              disabled={!newProfId || newWeekday === "" || !newStart || !newEnd || createAvailability.isPending}
              onClick={() =>
                createAvailability.mutate({
                  professional: newProfId as number,
                  weekday: newWeekday as number,
                  start_time: newStart,
                  end_time: newEnd,
                })
              }
            >
              {createAvailability.isPending ? "…" : "Salvar"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-8 text-xs"
              onClick={() => { setShowNew(false); setNewProfId(""); setNewWeekday(""); setNewStart(""); setNewEnd(""); }}
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
            Adicionar disponibilidade
          </button>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
