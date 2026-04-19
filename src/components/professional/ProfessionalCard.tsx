import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Trash2, User } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import ProfessionalUnitsSubSection from "./ProfessionalUnitsSubSection";
import ProfessionalSpecialtiesSubSection from "./ProfessionalSpecialtiesSubSection";
import ProfessionalAvailabilitiesSubSection from "./ProfessionalAvailabilitiesSubSection";
import ProfessionalTimeOffsSubSection from "./ProfessionalTimeOffsSubSection";

interface Professional {
  id: number;
  name: string;
  code?: string;
  is_active?: boolean;
  status?: string;
}

interface Props {
  professional: Professional;
  onToggleActive: (id: number, isActive: boolean) => void;
  onDelete: (id: number) => void;
}

export default function ProfessionalCard({ professional, onToggleActive, onDelete }: Props) {
  const active = professional.is_active !== false && professional.status !== "inactive";

  return (
    <Collapsible defaultOpen={false}>
      <CollapsibleTrigger
        className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated group"
        style={{ background: "hsl(var(--surface-elevated))" }}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <User className="h-4 w-4 text-primary shrink-0" />
          <div className="text-left min-w-0 flex-1">
            <span className="text-sm font-bold text-foreground truncate block">{professional.name}</span>
            {professional.code && (
              <span className="text-[10px] font-mono text-muted-foreground">{professional.code}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div onClick={(e) => e.stopPropagation()} role="presentation">
            <Switch
              checked={active}
              onCheckedChange={(checked) => onToggleActive(professional.id, checked)}
              className="scale-75"
            />
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(professional.id); }}
            className="text-muted-foreground hover:text-destructive transition-colors"
            title="Remover profissional"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 ml-4 space-y-2 pl-3 border-l-2 border-border">
        <ProfessionalUnitsSubSection professionalId={professional.id} />
        <ProfessionalSpecialtiesSubSection professionalId={professional.id} />
        <ProfessionalAvailabilitiesSubSection professionalId={professional.id} />
        <ProfessionalTimeOffsSubSection professionalId={professional.id} />
      </CollapsibleContent>
    </Collapsible>
  );
}
