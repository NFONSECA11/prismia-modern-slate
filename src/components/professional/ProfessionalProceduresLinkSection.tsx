import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { useAuth } from "@/contexts/AuthContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Plus, Trash2, Stethoscope } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { toast } from "sonner";

interface ProfessionalProcedure {
  id: number;
  professional: number;
  professional_id?: number;
  professional_name?: string;
  professional__name?: string;
  unit?: number;
  unit_id?: number;
  unit_name?: string;
  unit__name?: string;
  procedure: number;
  procedure_id?: number;
  procedure_name?: string;
  procedure__name?: string;
  is_active?: boolean;
}

const unpack = (data: any): any[] => {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.data)) return data.data;
  if (data?.result) return unpack(data.result);
  return [];
};

const normalizeLink = (item: any): ProfessionalProcedure => {
  const profV = item?.professional ?? item?.professional_id;
  const unitV = item?.unit ?? item?.unit_id;
  const procV = item?.procedure ?? item?.procedure_id;
  const professional = typeof profV === "object" ? Number(profV?.id ?? 0) : Number(profV ?? 0);
  const unit = typeof unitV === "object" ? Number(unitV?.id ?? 0) : Number(unitV ?? 0);
  const procedure = typeof procV === "object" ? Number(procV?.id ?? 0) : Number(procV ?? 0);

  return {
    ...item,
    professional,
    professional_id: professional || undefined,
    professional_name:
      item?.professional_name ??
      item?.professional__name ??
      (typeof profV === "object" ? profV?.name : undefined),
    unit: unit || undefined,
    unit_id: unit || undefined,
    unit_name:
      item?.unit_name ??
      item?.unit__name ??
      (typeof unitV === "object" ? unitV?.name : undefined),
    procedure,
    procedure_id: procedure || undefined,
    procedure_name:
      item?.procedure_name ??
      item?.procedure__name ??
      (typeof procV === "object" ? procV?.name : undefined),
  };
};

export default function ProfessionalProceduresLinkSection() {
  const { units, isLoading: isAuthLoading, isAuthenticated } = useAuth();
  const qc = useQueryClient();

  const [showNew, setShowNew] = useState(false);
  const [newProfId, setNewProfId] = useState<number | "">("");
  const [newProcId, setNewProcId] = useState<number | "">("");

  // Catalogs
  const { data: professionals = [] } = useQuery<any[]>({
    queryKey: ["professionals-all-procs"],
    queryFn: async () => {
      const { data } = await api.get(`/api/booking/professionals/`, { params: { page_size: 500 } });
      return unpack(data);
    },
    enabled: !isAuthLoading && isAuthenticated,
  });

  const { data: procedures = [] } = useQuery<any[]>({
    queryKey: ["procedures-all"],
    queryFn: async () => {
      const { data } = await api.get(`/api/booking/procedures/`, { params: { page_size: 500 } });
      return unpack(data);
    },
    enabled: !isAuthLoading && isAuthenticated,
  });

  const queryKey = [
    "professional-procedures-all",
    professionals.map((p: any) => p.id).join(","),
    units.map((u) => u.id).join(","),
  ];

  const { data: items = [], isLoading } = useQuery<ProfessionalProcedure[]>({
    queryKey,
    queryFn: async () => {
      const all: ProfessionalProcedure[] = [];
      const seen = new Set<number>();
      const pushList = (list: ProfessionalProcedure[]) => {
        for (const it of list) {
          if (it.id && !seen.has(it.id)) { seen.add(it.id); all.push(it); }
        }
      };

      // 1) Global
      try {
        const { data } = await api.get(`/api/booking/professional-procedures/`, { params: { page_size: 500 } });
        const raw = unpack(data);
        console.info("[professional-procedures] global raw:", raw.slice(0, 3), "totalRaw:", raw.length);
        const list = raw.map(normalizeLink).filter((it) => it.id);
        console.info("[professional-procedures] global count:", list.length);
        pushList(list);
      } catch (e) {
        console.warn("[professional-procedures] global fetch failed", e);
      }

      // 2) Por unidade
      if (units.length > 0) {
        const reqs = units.map((u) =>
          api.get(`/api/booking/professional-procedures/`, { params: { unit: u.id, page_size: 500 } })
            .then((r) => unpack(r.data).map(normalizeLink))
            .catch(() => [])
        );
        const results = await Promise.all(reqs);
        for (const list of results) {
          pushList(list.filter((it) => it.id && it.professional && it.procedure));
        }
      }

      // 3) Por profissional
      if (professionals.length > 0) {
        const reqs = professionals.map((p: any) =>
          api.get(`/api/booking/professional-procedures/`, { params: { professional: p.id, page_size: 500 } })
            .then((r) => unpack(r.data).map(normalizeLink))
            .catch(() => [])
        );
        const results = await Promise.all(reqs);
        for (const list of results) {
          pushList(list.filter((it) => it.id && it.professional && it.procedure));
        }
      }

      console.info("[professional-procedures] total merged:", all.length);
      return all;
    },
    enabled: !isAuthLoading && isAuthenticated,
  });

  const createLink = useMutation({
    mutationFn: async (payload: { professional: number; procedure: number }) => {
      await fetchCsrf();
      const { data } = await api.post(`/api/booking/professional-procedures/`, {
        ...payload,
        is_active: true,
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      setShowNew(false);
      setNewProfId("");
      setNewProcId("");
      toast.success("Vínculo criado");
    },
    onError: () => toast.error("Erro ao criar vínculo"),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      await fetchCsrf();
      await api.patch(`/api/booking/professional-procedures/${id}/`, { is_active });
    },
    onMutate: async ({ id, is_active }) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<ProfessionalProcedure[]>(queryKey);
      qc.setQueryData<ProfessionalProcedure[]>(queryKey, (old) =>
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

  const removeLink = useMutation({
    mutationFn: async (id: number) => {
      await fetchCsrf();
      await api.delete(`/api/booking/professional-procedures/${id}/`);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey }); toast.success("Vínculo removido"); },
    onError: () => toast.error("Erro ao remover vínculo"),
  });

  const profName = (id: number, fallback?: string) =>
    fallback ?? professionals.find((p) => p.id === id)?.name ?? `#${id}`;
  const unitName = (id?: number, fallback?: string) =>
    fallback ?? (id ? units.find((u) => u.id === id)?.name : undefined) ?? "—";
  const procName = (id: number, fallback?: string) =>
    fallback ?? procedures.find((p) => p.id === id)?.name ?? `#${id}`;

  return (
    <Collapsible defaultOpen={false} id="section-profissionais-procedimentos">
      <CollapsibleTrigger
        className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated"
        style={{ background: "hsl(var(--surface))" }}
      >
        <div className="flex items-center gap-2">
          <Stethoscope className="h-4 w-4 text-primary shrink-0" />
          <div className="text-left">
            <span className="text-sm font-bold text-foreground">Profissionais → Procedimentos</span>
            <p className="text-xs text-muted-foreground">Vínculos entre profissionais e procedimentos</p>
          </div>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
      </CollapsibleTrigger>
      <CollapsibleContent
        className="mt-2 rounded-xl border border-border p-4 space-y-1"
        style={{ background: "hsl(var(--surface))" }}
      >
        <div className="grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto_2rem] gap-2 px-3 py-1 items-center">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">ID</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Profissional</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Unidade</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Procedimento</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
          <span />
        </div>

        {isAuthLoading || isLoading ? (
          <p className="text-xs text-muted-foreground px-3">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3">Nenhum vínculo encontrado.</p>
        ) : (
          items.map((item) => {
            const active = item.is_active !== false;
            return (
              <div
                key={item.id}
                className="grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto_2rem] gap-2 items-center rounded-lg px-3 py-2 border border-border"
                style={{ background: "hsl(var(--surface-elevated))" }}
              >
                <span className="text-xs font-mono text-muted-foreground">{item.id}</span>
                <span className="text-sm font-medium text-foreground truncate">{profName(item.professional, item.professional_name)}</span>
                <span className="text-xs text-muted-foreground truncate">{unitName(item.unit, item.unit_name)}</span>
                <span className="text-sm text-foreground truncate">{procName(item.procedure, item.procedure_name)}</span>
                <Switch
                  checked={active}
                  onCheckedChange={(checked) => toggleActive.mutate({ id: item.id, is_active: checked })}
                  className="scale-75"
                />
                <button
                  onClick={() => removeLink.mutate(item.id)}
                  className="flex items-center justify-end text-muted-foreground hover:text-destructive transition-colors"
                  title="Remover vínculo"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })
        )}

        {showNew ? (
          <div
            className="rounded-lg border border-border p-3 mt-2 space-y-2"
            style={{ background: "hsl(var(--surface-elevated))" }}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Profissional</span>
                <select
                  value={newProfId}
                  onChange={(e) => setNewProfId(e.target.value ? Number(e.target.value) : "")}
                  className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground"
                >
                  <option value="">Selecione…</option>
                  {professionals.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Procedimento</span>
                <select
                  value={newProcId}
                  onChange={(e) => setNewProcId(e.target.value ? Number(e.target.value) : "")}
                  className="h-8 text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground"
                >
                  <option value="">Selecione…</option>
                  {procedures.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => { setShowNew(false); setNewProfId(""); setNewProcId(""); }}
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs"
                disabled={!newProfId || !newProcId || createLink.isPending}
                onClick={() => createLink.mutate({
                  professional: newProfId as number,
                  procedure: newProcId as number,
                })}
              >
                {createLink.isPending ? "…" : "Salvar"}
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors pt-2 px-3"
          >
            <Plus className="h-3.5 w-3.5" />
            Adicionar vínculo
          </button>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
