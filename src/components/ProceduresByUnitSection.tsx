import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { useAuth } from "@/contexts/AuthContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

interface UnitProcedure {
  id: number;
  procedure_name?: string;
  procedure_slug?: string;
  procedure?: number;
  unit?: number;
  unit_name?: string;
  enabled?: boolean;
  is_active?: boolean;
  duration_override?: number | null;
  price_override_min?: string | number | null;
  price_override_max?: string | number | null;
  price_override?: string | number | null;
  duration?: number | null;
  price?: string | number | null;
}

export default function ProceduresByUnitSection() {
  const { units, user, company } = useAuth();
  const queryClient = useQueryClient();

  const unitQueries = units.map((unit) => {
    const query = useQuery({
      queryKey: ["unit-procedures", unit.id],
      queryFn: async () => {
        await fetchCsrf();
        const { data } = await api.get("/api/settings/unit-procedures/", { params: { unit: unit.id } });
        if (Array.isArray(data)) return data;
        if (data?.results) return data.results;
        if (data?.data) return data.data;
        const inner = data?.result;
        if (Array.isArray(inner)) return inner;
        if (inner?.results) return inner.results;
        return [];
      },
      enabled: !!user,
    });
    return { unit, ...query };
  });

  const allProcedures: (UnitProcedure & { unitId: number; companyId: number | null; companyName: string })[] = [];
  let anyLoading = false;

  unitQueries.forEach(({ unit, data = [], isLoading }) => {
    if (isLoading) anyLoading = true;
    (data as any[]).forEach((proc) => {
      allProcedures.push({
        ...proc,
        unitId: unit.id,
        companyId: proc.company_id ?? proc.company ?? company?.id ?? null,
        companyName: proc.company_name ?? company?.name ?? "",
      });
    });
  });

  const toggleEnabled = useMutation({
    mutationFn: async ({ id, enabled, unitId }: { id: number; enabled: boolean; unitId: number }) => {
      await fetchCsrf();
      await api.patch(`/api/settings/unit-procedures/${id}/`, { enabled });
    },
    onMutate: async ({ id, enabled, unitId }) => {
      const key = ["unit-procedures", unitId];
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData(key);
      queryClient.setQueryData(key, (old: any[]) =>
        old?.map((p: any) => (p.id === id ? { ...p, enabled } : p))
      );
      return { prev, unitId };
    },
    onError: (_err, _vars, context) => {
      if (context) queryClient.setQueryData(["unit-procedures", context.unitId], context.prev);
      toast.error("Erro ao alterar status do procedimento");
    },
    onSettled: (_d, _e, vars) => {
      queryClient.invalidateQueries({ queryKey: ["unit-procedures", vars.unitId] });
    },
  });

  const normalizeKey = (key: string) =>
    key
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();

  const pickFirst = (obj: any, keys: string[]) => {
    for (const key of keys) {
      const value = obj?.[key];
      if (value !== undefined && value !== null && value !== "") return value;
    }
    return null;
  };

  const pickFirstDeep = (obj: any, aliases: string[]) => {
    if (!obj || typeof obj !== "object") return null;
    const wanted = aliases.map(normalizeKey);
    const queue: any[] = [obj];
    const seen = new Set<any>();

    while (queue.length) {
      const current = queue.shift();
      if (!current || typeof current !== "object" || seen.has(current)) continue;
      seen.add(current);

      for (const [rawKey, rawValue] of Object.entries(current)) {
        const key = normalizeKey(rawKey);
        const isMatch = wanted.some((w) => key === w || key.includes(w));

        if (isMatch && rawValue !== undefined && rawValue !== null && rawValue !== "" && typeof rawValue !== "object") {
          return rawValue;
        }

        if (rawValue && typeof rawValue === "object") {
          queue.push(rawValue);
        }
      }
    }

    return null;
  };

  const getDuration = (proc: any) =>
    pickFirst(proc, ["duration_override", "duration"]) ??
    pickFirstDeep(proc, [
      "duration_min",
      "duration_minutes",
      "duration_in_minutes",
      "procedure_duration",
      "default_duration",
      "duracao",
      "duracao_min",
      "tempo",
    ]);

  const getPriceMin = (proc: any) =>
    pickFirst(proc, ["price_override_min", "price_override", "price"]) ??
    pickFirstDeep(proc, [
      "price_min",
      "min_price",
      "default_price",
      "starting_price",
      "price_from",
      "preco_min",
      "valor_min",
      "preco_inicial",
      "valor_inicial",
      "preco",
      "valor",
    ]);

  const getPriceMax = (proc: any) =>
    pickFirst(proc, ["price_override_max"]) ??
    pickFirstDeep(proc, ["price_max", "max_price", "preco_max", "valor_max"]);

  return (
    <Collapsible defaultOpen={false} id="section-procedimentos-unidade">
      <CollapsibleTrigger
        className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated"
        style={{ background: "hsl(var(--surface))" }}
      >
        <div className="text-left">
          <span className="text-sm font-bold text-foreground">Procedimentos</span>
          <p className="text-xs text-muted-foreground">
            Procedimentos cadastrados em cada unidade
          </p>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
      </CollapsibleTrigger>
      <CollapsibleContent
        className="mt-2 rounded-xl border border-border p-4 space-y-1"
        style={{ background: "hsl(var(--surface))" }}
      >
        {/* Header */}
        <div className="grid grid-cols-[3rem_1fr_1fr_4.5rem_4.5rem_4.5rem_auto] gap-2 px-3 py-1 items-center">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Empresa</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Nome Empresa</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Nome</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground text-right">Duração</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground text-right">Preço Min</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground text-right">Preço Max</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
        </div>

        {anyLoading ? (
          <p className="text-xs text-muted-foreground px-3">Carregando…</p>
        ) : allProcedures.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3">Nenhum procedimento encontrado.</p>
        ) : (
          allProcedures.map((proc) => {
            const active = proc.enabled !== false && proc.is_active !== false;
            const duration = getDuration(proc);
            const priceMin = getPriceMin(proc);
            const priceMax = getPriceMax(proc);
            return (
              <div
                key={proc.id}
                className="grid grid-cols-[3rem_1fr_1fr_4.5rem_4.5rem_4.5rem_auto] gap-2 items-center rounded-lg px-3 py-2 border border-border"
                style={{ background: "hsl(var(--surface-elevated))" }}
              >
                <span className="text-xs font-mono text-muted-foreground">{proc.companyId ?? "—"}</span>
                <span className="text-xs text-muted-foreground">{proc.companyName}</span>
                <span className="text-sm font-medium text-foreground truncate">
                  {proc.procedure_name ?? proc.procedure_slug ?? `#${proc.procedure ?? proc.id}`}
                </span>
                <span className="text-xs font-mono text-muted-foreground text-right">
                  {duration != null ? `${duration}m` : "—"}
                </span>
                <span className="text-xs font-mono text-muted-foreground text-right">
                  {priceMin != null ? priceMin : "—"}
                </span>
                <span className="text-xs font-mono text-muted-foreground text-right">
                  {priceMax != null ? priceMax : "—"}
                </span>
                <Switch
                  checked={active}
                  onCheckedChange={(checked) =>
                    toggleEnabled.mutate({ id: proc.id, enabled: checked, unitId: proc.unitId })
                  }
                  className="scale-75"
                />
              </div>
            );
          })
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
