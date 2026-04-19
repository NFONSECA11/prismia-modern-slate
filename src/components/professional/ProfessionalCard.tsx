import { Trash2, User } from "lucide-react";
import { Switch } from "@/components/ui/switch";

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
    <div
      className="grid grid-cols-[3rem_minmax(0,1fr)_6rem_auto_2rem] gap-2 items-center rounded-lg px-3 py-2 border border-border"
      style={{ background: "hsl(var(--surface-elevated))" }}
    >
      <span className="text-xs font-mono text-muted-foreground">{professional.id}</span>
      <div className="flex min-w-0 items-center gap-3">
        <User className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm font-medium text-foreground truncate">{professional.name}</span>
      </div>
      <span className="text-xs font-mono text-muted-foreground truncate">{professional.code ?? "—"}</span>
      <Switch
        checked={active}
        onCheckedChange={(checked) => onToggleActive(professional.id, checked)}
        className="scale-75"
      />
      <button
        onClick={() => onDelete(professional.id)}
        className="flex items-center justify-end text-muted-foreground hover:text-destructive transition-colors"
        title="Remover profissional"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
