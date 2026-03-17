import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BookingConfirmation, ConfirmationStatus } from "@/types/booking";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Ban,
  Hourglass,
} from "lucide-react";

interface ConfirmationConfig {
  label: string;
  icon: React.ElementType;
  colorClass: string; // text color using design tokens
}

const STATUS_CONFIG: Record<ConfirmationStatus, ConfirmationConfig> = {
  sent: {
    label: "Aguardando confirmação",
    icon: Hourglass,
    colorClass: "text-status-pending",
  },
  confirmed: {
    label: "Confirmado",
    icon: CheckCircle2,
    colorClass: "text-status-confirmed",
  },
  declined: {
    label: "Recusado",
    icon: XCircle,
    colorClass: "text-status-canceled",
  },
  reschedule_requested: {
    label: "Reagendamento solicitado",
    icon: RefreshCw,
    colorClass: "text-status-pending",
  },
  canceled: {
    label: "Confirmação cancelada",
    icon: Ban,
    colorClass: "text-status-canceled",
  },
  expired: {
    label: "Confirmação expirada",
    icon: Clock,
    colorClass: "text-muted-foreground",
  },
};

function formatDateTime(dateStr?: string): string {
  if (!dateStr) return "—";
  try {
    return format(new Date(dateStr), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
  } catch {
    return dateStr;
  }
}

interface ConfirmationIndicatorProps {
  confirmation: BookingConfirmation | null | undefined;
  /** compact = just icon, used in agenda cards */
  compact?: boolean;
}

export function ConfirmationIndicator({ confirmation, compact }: ConfirmationIndicatorProps) {
  if (!confirmation) return null;

  const config = STATUS_CONFIG[confirmation.status] ?? STATUS_CONFIG.sent;
  const Icon = config.icon;

  const tooltipContent = (
    <div className="flex flex-col gap-1.5 text-xs max-w-[240px]">
      <div className="font-semibold flex items-center gap-1.5">
        <Icon className={`h-3.5 w-3.5 ${config.colorClass}`} />
        <span>{config.label}</span>
      </div>
      {confirmation.sent_at && (
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Enviado:</span>
          <span>{formatDateTime(confirmation.sent_at)}</span>
        </div>
      )}
      {confirmation.responded_at && (
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Respondido:</span>
          <span>{formatDateTime(confirmation.responded_at)}</span>
        </div>
      )}
      {confirmation.expires_at && !confirmation.responded_at && (
        <div className="flex justify-between gap-3">
          <span className="text-muted-foreground">Expira:</span>
          <span>{formatDateTime(confirmation.expires_at)}</span>
        </div>
      )}
    </div>
  );

  if (compact) {
    return (
      <Tooltip>
      <TooltipTrigger asChild>
          <span className={`inline-flex ${config.colorClass}`}>
            <Icon className="h-3.5 w-3.5" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="z-[100]">{tooltipContent}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center gap-1 text-[10px] font-medium leading-tight cursor-default ${config.colorClass}`}>
          <Icon className="h-3 w-3 flex-shrink-0" />
          {config.label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{tooltipContent}</TooltipContent>
    </Tooltip>
  );
}
