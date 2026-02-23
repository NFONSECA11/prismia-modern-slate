import { PhoneForwarded, CalendarClock, Bot } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const MODE_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  handoff_manual: { icon: PhoneForwarded, label: "Handoff Manual", color: "text-status-handoff" },
  assisted_slots_dashboard: { icon: CalendarClock, label: "Assistido", color: "text-status-assisted" },
  auto_slots_bot: { icon: Bot, label: "Automático", color: "text-primary" },
};

interface BookingModeIconProps {
  mode: string;
  size?: "sm" | "md";
}

export function BookingModeIcon({ mode, size = "sm" }: BookingModeIconProps) {
  const config = MODE_CONFIG[mode];
  if (!config) return <span className="text-[10px] text-muted-foreground/50">{mode}</span>;

  const Icon = config.icon;
  const iconSize = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center ${config.color}`}>
          <Icon className={iconSize} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {config.label}
      </TooltipContent>
    </Tooltip>
  );
}
