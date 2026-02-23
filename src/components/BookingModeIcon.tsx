import { HandMetal, LayoutDashboard, Zap } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const MODE_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  handoff_manual: { icon: HandMetal, label: "Handoff Manual", color: "text-amber-400" },
  assisted_slots_dashboard: { icon: LayoutDashboard, label: "Assistido (Dashboard)", color: "text-sky-400" },
  auto_slots_bot: { icon: Zap, label: "Automático (Bot)", color: "text-emerald-400" },
};

interface BookingModeIconProps {
  mode: string;
  size?: "sm" | "md";
  showLabel?: boolean;
}

export function BookingModeIcon({ mode, size = "sm", showLabel = false }: BookingModeIconProps) {
  const config = MODE_CONFIG[mode];
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