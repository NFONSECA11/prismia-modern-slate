import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

interface ProfessionalProcedure {
  id: number;
  professional_name?: string;
  professional?: number;
  procedure_name?: string;
  procedure_slug?: string;
  procedure?: number;
  unit?: number;
  unit_name?: string;
  is_active?: boolean;
  status?: string;
}

export default function ProfessionalProceduresSection() {
  const { units } = useAuth();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["professional-procedures"],
    queryFn: async () => {
      const { data } = await api.get("/api/settings/professional-procedures/");
      return Array.isArray(data) ? data : (data?.results ?? []);
    },
  });

  // Group by unit
  const grouped: Record<number, { unitName: string; items: ProfessionalProcedure[] }> = {};
  (items as ProfessionalProcedure[]).forEach((item) => {
    const unitId = item.unit ?? 0;
    if (!grouped[unitId]) {
      const unitName =
        item.unit_name ?? units.find((u) => u.id === unitId)?.name ?? `Unidade ${unitId}`;
      grouped[unitId] = { unitName, items: [] };
    }
    grouped[unitId].items.push(item);
  });

  return (
    <Collapsible defaultOpen={false} id="section-servicos-mapeamentos">
      <CollapsibleTrigger
        className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated"
        style={{ background: "hsl(var(--surface))" }}
      >
        <div className="text-left">
          <span className="text-sm font-bold text-foreground">Serviços & Mapeamentos</span>
          <p className="text-xs text-muted-foreground">
            Vínculos entre profissionais e procedimentos
          </p>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
      </CollapsibleTrigger>
      <CollapsibleContent
        className="mt-2 rounded-xl border border-border p-4 space-y-4"
        style={{ background: "hsl(var(--surface))" }}
      >
        {isLoading ? (
          <p className="text-xs text-muted-foreground px-3">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3">Nenhum mapeamento encontrado.</p>
        ) : (
          Object.entries(grouped).map(([unitId, group]) => (
            <div key={unitId} className="space-y-1">
              <span className="text-xs font-bold text-foreground px-3">
                {group.unitName}
              </span>

              {/* Header */}
              <div className="grid grid-cols-[1fr_1fr_auto] gap-2 px-3 py-1 items-center">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Profissional
                </span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  Procedimento
                </span>
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground w-16 text-right">
                  Status
                </span>
              </div>

              {group.items.map((item) => {
                const active = item.is_active !== false && item.status !== "inactive";
                return (
                  <div
                    key={item.id}
                    className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center rounded-lg px-3 py-2 border border-border"
                    style={{ background: "hsl(var(--surface-elevated))" }}
                  >
                    <span className="text-sm font-medium text-foreground truncate">
                      {item.professional_name ?? `#${item.professional ?? "—"}`}
                    </span>
                    <span className="text-sm text-foreground truncate">
                      {item.procedure_name ?? item.procedure_slug ?? `#${item.procedure ?? "—"}`}
                    </span>
                    <span
                      className={`text-xs font-medium w-16 text-right ${active ? "text-green-400" : "text-muted-foreground"}`}
                    >
                      {active ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                );
              })}
            </div>
          ))
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
