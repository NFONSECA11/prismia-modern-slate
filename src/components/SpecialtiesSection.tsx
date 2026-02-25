import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { useAuth } from "@/contexts/AuthContext";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

interface Specialty {
  id: number;
  name?: string;
  slug?: string;
  is_active?: boolean;
  status?: string;
  description?: string;
}

export default function SpecialtiesSection() {
  const { user } = useAuth();

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["specialties"],
    queryFn: async () => {
      await fetchCsrf();
      const { data } = await api.get("/api/settings/specialties/");
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

  return (
    <Collapsible defaultOpen={false} id="section-especialidades">
      <CollapsibleTrigger
        className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated"
        style={{ background: "hsl(var(--surface))" }}
      >
        <div className="text-left">
          <span className="text-sm font-bold text-foreground">Especialidades</span>
          <p className="text-xs text-muted-foreground">
            Especialidades disponíveis na empresa
          </p>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
      </CollapsibleTrigger>
      <CollapsibleContent
        className="mt-2 rounded-xl border border-border p-4 space-y-1"
        style={{ background: "hsl(var(--surface))" }}
      >
        {/* Header */}
        <div className="grid grid-cols-[auto_1fr_auto] gap-2 px-3 py-1 items-center">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground w-12">ID</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Nome</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground w-16 text-right">Status</span>
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground px-3">Carregando…</p>
        ) : (items as Specialty[]).length === 0 ? (
          <p className="text-xs text-muted-foreground px-3">Nenhuma especialidade encontrada.</p>
        ) : (
          (items as Specialty[]).map((item) => {
            const active = item.is_active !== false && item.status !== "inactive";
            return (
              <div
                key={item.id}
                className="grid grid-cols-[auto_1fr_auto] gap-2 items-center rounded-lg px-3 py-2 border border-border"
                style={{ background: "hsl(var(--surface-elevated))" }}
              >
                <span className="text-xs font-mono text-muted-foreground w-12">{item.id}</span>
                <span className="text-sm font-medium text-foreground truncate">
                  {item.name ?? item.slug ?? `#${item.id}`}
                </span>
                <span
                  className={`text-xs font-medium w-16 text-right ${active ? "text-green-400" : "text-muted-foreground"}`}
                >
                  {active ? "Ativo" : "Inativo"}
                </span>
              </div>
            );
          })
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
