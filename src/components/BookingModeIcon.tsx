import { HandMetal, LayoutDashboard, Zap } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { extractAiEvents } from "@/components/StatusBadge";

const MODE_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  handoff_manual: { icon: HandMetal, label: "Handoff Manual", color: "text-amber-500" },
  assisted_slots_dashboard: { icon: LayoutDashboard, label: "Assistido (Dashboard)", color: "text-sky-500" },
  auto_slots_bot: { icon: Zap, label: "Automático (Bot)", color: "text-emerald-500" },
};

// Configuração para BRs que vieram de handoff da IA mas foram agendadas/operadas manualmente.
// Sobrepõe o booking_mode atual para preservar a "origem mão".
const HANDOFF_ORIGIN_CONFIG = {
  icon: HandMetal,
  label: "Handoff Manual (origem IA)",
  color: "text-amber-500",
};

/**
 * Detecta se a BR passou por handoff em algum momento — via ai_events JSON
 * (type: "ai_handoff") ou via tag legada BR_TAG_AI_HANDOFF no notes.
 */
function hasHandoffInHistory(notes?: string | null): boolean {
  if (!notes) return false;
  const events = extractAiEvents(notes);
  if (events.some((e) => e.type === "ai_handoff" || e.type === "handoff")) return true;
  return /BR_TAG_AI_HANDOFF/i.test(notes);
}

interface BookingModeIconProps {
  mode: string;
  /** Notes da BR — usado para detectar handoff histórico (opcional). */
  notes?: string | null;
  /** Força exibir como "handoff origem IA" (quando a detecção foi feita por outro componente). */
  forceHandoffOrigin?: boolean;
  size?: "sm" | "md";
  showLabel?: boolean;
}

export function BookingModeIcon({ mode, notes, forceHandoffOrigin, size = "sm", showLabel = false }: BookingModeIconProps) {
  // Se a BR teve handoff em algum momento, exibe a mão (independente do booking_mode atual).
  const hasHandoff = forceHandoffOrigin || hasHandoffInHistory(notes);
  const overrideHandoff = hasHandoff && mode !== "handoff_manual";
  const config = overrideHandoff ? HANDOFF_ORIGIN_CONFIG : MODE_CONFIG[mode];
  if (!config) return <span className="text-[10px] text-muted-foreground/50">{mode}</span>;

  const Icon = config.icon;
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  const content = (
    <span className={`inline-flex items-center gap-1.5 ${config.color} ${!showLabel ? "cursor-help" : ""}`}>
      <Icon className={iconSize} />
      {showLabel && <span className="text-xs font-medium">{config.label}</span>}
    </span>
  );

  if (showLabel) return content;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {content}
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs font-medium">
        {config.label}
      </TooltipContent>
    </Tooltip>
  );
}
