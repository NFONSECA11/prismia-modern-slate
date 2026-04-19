import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface ProfessionalItem {
  id: number;
  name: string;
  code?: string;
}

interface Props {
  icon: LucideIcon;
  title: string;
  description: string;
  professionals: ProfessionalItem[];
  isLoading?: boolean;
  emptyMessage: string;
  renderSubSection: (professionalId: number) => ReactNode;
}

export default function ProfessionalSubSectionListCard({
  icon: Icon,
  title,
  description,
  professionals,
  isLoading,
  emptyMessage,
  renderSubSection,
}: Props) {
  return (
    <Collapsible defaultOpen={false}>
      <CollapsibleTrigger
        className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated"
        style={{ background: "hsl(var(--surface))" }}
      >
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary shrink-0" />
          <div className="text-left">
            <span className="text-sm font-bold text-foreground">{title}</span>
            <p className="text-xs text-muted-foreground">{description}</p>
          </div>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
      </CollapsibleTrigger>

      <CollapsibleContent
        className="mt-2 rounded-xl border border-border p-4 space-y-4"
        style={{ background: "hsl(var(--surface))" }}
      >
        {isLoading ? (
          <p className="text-xs text-muted-foreground px-3">Carregando…</p>
        ) : professionals.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3">{emptyMessage}</p>
        ) : (
          professionals.map((professional) => (
            <div key={professional.id} className="space-y-2 rounded-xl border border-border p-3" style={{ background: "hsl(var(--surface-elevated))" }}>
              <div className="px-1">
                <span className="text-sm font-semibold text-foreground block">{professional.name}</span>
                <span className="text-[10px] font-mono text-muted-foreground">{professional.code ?? `#${professional.id}`}</span>
              </div>
              {renderSubSection(professional.id)}
            </div>
          ))
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
