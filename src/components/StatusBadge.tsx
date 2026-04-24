import { BookingStatus } from "@/types/booking";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Sparkles } from "lucide-react";

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
    label: "Concluído",
    className: "bg-accent/15 text-accent border border-accent/30",
    dot: "bg-accent",
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
  textClass: string;
}

const AI_TAG_CONFIG: Record<AiTag, AiTagConfig> = {
  cancel: {
    regex: /BR_TAG_AI_DIRECT_CANCEL/i,
    label: "✨",
    tooltip: "Cancelado diretamente pela IA",
    textClass: "text-red-500",
  },
  reschedule: {
    regex: /BR_TAG_AI_DIRECT_RESCHEDULE/i,
    label: "✨",
    tooltip: "Reagendado diretamente pela IA",
    textClass: "text-amber-500",
  },
  schedule: {
    regex: /BR_TAG_AI_DIRECT_SCHEDULE/i,
    label: "✨",
    tooltip: "Agendado diretamente pela IA",
    textClass: "text-emerald-500",
  },
};

// Map ai_events[].type → AiTag
const AI_EVENT_TYPE_MAP: Record<string, AiTag> = {
  direct_cancel: "cancel",
  direct_reschedule: "reschedule",
  direct_schedule: "schedule",
};

export interface AiEvent {
  type: string;
  ts?: string;
  br_id?: number;
  procedure_slug?: string;
  procedure_name?: string;
  professional_id?: number;
  professional_name?: string;
  scheduled_at?: string;
  policy?: string;
  policy_key?: string;
  policy_value?: string;
  reason?: string;
  unit?: string;
  old_dt?: string;
  new_dt?: string;
  /** "ai" (default) ou "human" — diferencia ações da IA das ações manuais do operador */
  actor?: "ai" | "human";
  /** Nome do operador humano quando actor="human" */
  actor_name?: string;
}

/**
 * Extract ai_events JSON from notes. Tolerates the malformed shape
 * `{"ai_events"[...]}` (missing colon after key) seen in early backend payloads.
 */
export function extractAiEvents(notes?: string | null): AiEvent[] {
  if (!notes) return [];

  // Find the start of an ai_events object — accept both `"ai_events":` and `"ai_events"[`
  const re = /\{\s*"ai_events"\s*:?\s*(\[[\s\S]*?\])\s*\}/;
  const match = notes.match(re);
  if (!match) return [];

  try {
    const arr = JSON.parse(match[1]);
    if (!Array.isArray(arr)) return [];
    return arr.filter((e) => e && typeof e === "object" && typeof e.type === "string") as AiEvent[];
  } catch {
    return [];
  }
}

/** Get the latest AI event (by ts, falling back to array order) */
export function getLatestAiEvent(notes?: string | null): AiEvent | null {
  const events = extractAiEvents(notes);
  if (events.length === 0) return null;

  const sorted = [...events].sort((a, b) => {
    const ta = a.ts ? Date.parse(a.ts) : 0;
    const tb = b.ts ? Date.parse(b.ts) : 0;
    return ta - tb;
  });
  return sorted[sorted.length - 1] ?? null;
}

/** Detect which AI tag (if any) is present in notes — JSON ai_events first, regex fallback */
export function detectAiTag(notes?: string | null): AiTag | null {
  if (!notes) return null;

  // 1) New format: ai_events JSON
  const latestEvent = getLatestAiEvent(notes);
  if (latestEvent) {
    const mapped = AI_EVENT_TYPE_MAP[latestEvent.type];
    if (mapped) return mapped;
  }

  // 2) Legacy format: BR_TAG_AI_DIRECT_* regex
  let latestTag: AiTag | null = null;
  let latestIndex = -1;

  for (const [key, config] of Object.entries(AI_TAG_CONFIG)) {
    const flags = config.regex.flags.includes("g") ? config.regex.flags : `${config.regex.flags}g`;
    const matcher = new RegExp(config.regex.source, flags);

    let match: RegExpExecArray | null = null;
    let lastMatchIndex = -1;

    while ((match = matcher.exec(notes)) !== null) {
      lastMatchIndex = match.index;
      if (match.index === matcher.lastIndex) matcher.lastIndex += 1;
    }

    if (lastMatchIndex > latestIndex) {
      latestIndex = lastMatchIndex;
      latestTag = key as AiTag;
    }
  }

  return latestTag;
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
            <span className={`inline-flex items-center justify-center leading-none cursor-default ${tagConfig.textClass}`}>
              <Sparkles className="h-3.5 w-3.5" />
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
