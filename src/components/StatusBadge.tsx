import { BookingStatus } from "@/types/booking";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface StatusConfig {
  label: string;
  className: string;
  dot: string;
}

const STATUS_MAP: Record<string, StatusConfig> = {
  confirmed: {
    label: "Confirmado",
    className: "bg-status-confirmed-bg text-status-confirmed border border-status-confirmed/25",
    dot: "bg-status-confirmed",
  },
  pending: {
    label: "Pendente",
    className: "bg-status-pending-bg text-status-pending border border-status-pending/25",
    dot: "bg-status-pending",
  },
  handoff: {
    label: "Handoff",
    className: "bg-status-handoff-bg text-status-handoff border border-status-handoff/25",
    dot: "bg-status-handoff",
  },
  assisted: {
    label: "Assisted",
    className: "bg-status-assisted-bg text-status-assisted border border-status-assisted/25",
    dot: "bg-status-assisted",
  },
  canceled: {
    label: "Cancelado",
    className: "bg-status-canceled-bg text-status-canceled border border-status-canceled/25",
    dot: "bg-status-canceled",
  },
  cancelled: {
    label: "Cancelado",
    className: "bg-status-canceled-bg text-status-canceled border border-status-canceled/25",
    dot: "bg-status-canceled",
  },
  failed: {
    label: "Falhou",
    className: "bg-status-canceled-bg text-status-canceled border border-status-canceled/25",
    dot: "bg-status-canceled",
  },
  awaiting_choice: {
    label: "Aguardando Escolha",
    className: "bg-status-pending-bg text-status-pending border border-status-pending/25",
    dot: "bg-status-pending",
  },
};

// ── AI Tag configs ───────────────────────────────────────────────────────────

export type AiTag = "cancel" | "reschedule" | "schedule";

interface AiTagConfig {
  regex: RegExp;
  label: string;
  tooltip: string;
  bgClass: string;
  textClass: string;
}

const AI_TAG_CONFIG: Record<AiTag, AiTagConfig> = {
  cancel: {
    regex: /BR_TAG_AI_DIRECT_CANCEL/i,
    label: "IA",
    tooltip: "Cancelado diretamente pela IA",
    bgClass: "bg-background border border-border",
    textClass: "text-status-canceled",
  },
  reschedule: {
    regex: /BR_TAG_AI_DIRECT_RESCHEDULE/i,
    label: "IA",
    tooltip: "Reagendado diretamente pela IA",
    bgClass: "bg-background border border-border",
    textClass: "text-status-pending",
  },
  schedule: {
    regex: /BR_TAG_AI_DIRECT_SCHEDULE/i,
    label: "IA",
    tooltip: "Agendado diretamente pela IA",
    bgClass: "bg-background border border-border",
    textClass: "text-status-confirmed",
  },
};

/** Detect which AI tag (if any) is present in notes */
export function detectAiTag(notes?: string | null): AiTag | null {
  if (!notes) return null;
  for (const [key, config] of Object.entries(AI_TAG_CONFIG)) {
    if (config.regex.test(notes)) return key as AiTag;
  }
  return null;
}

// ── Component ────────────────────────────────────────────────────────────────

interface StatusBadgeProps {
  status: BookingStatus;
  size?: "sm" | "md";
  hasSchedule?: boolean;
  procedureName?: string;
  aiTag?: AiTag | null;
}

export function StatusBadge({ status, size = "md", hasSchedule, procedureName, aiTag }: StatusBadgeProps) {
  const config = STATUS_MAP[status] ?? STATUS_MAP.pending;
  const sizeClass = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs";

  let label = config.label;
  if (status === "confirmed") {
    const isCancelProcedure = procedureName?.toLowerCase().trim() === "cancelar";
    if (isCancelProcedure) {
      label = "Executado";
    } else if (hasSchedule) {
      label = "Agendado";
    }
  }

  const tagConfig = aiTag ? AI_TAG_CONFIG[aiTag] : null;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-flex items-center gap-1.5 rounded-full font-medium ${sizeClass} ${config.className}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${config.dot} flex-shrink-0`} />
        {label}
      </span>
      {tagConfig && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={`relative inline-flex items-center justify-center h-[18px] min-w-[22px] px-1 rounded-[4px] bg-white ${tagConfig.textClass} text-[8px] font-extrabold tracking-wide leading-none cursor-default shadow-[0_1px_3px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.06] mb-1`}>
              {tagConfig.label}
              <svg className="absolute -bottom-[5px] left-1/2 -translate-x-1/2 w-[8px] h-[5px]" viewBox="0 0 8 5" fill="none">
                <path d="M0 0L4 5L8 0" fill="white" />
                <path d="M0 0L4 5L8 0" stroke="rgba(0,0,0,0.06)" strokeWidth="0.5" strokeLinejoin="round" fill="none" />
              </svg>
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="z-[9999] max-w-[220px] text-xs">
            {tagConfig.tooltip}
          </TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}
