import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BookingRequest, BookingStatus, BookingMode, Professional } from "@/types/booking";
import { StatusBadge, detectAiTag, extractAiEvents, type AiEvent } from "@/components/StatusBadge";
import { ConfirmationIndicator } from "@/components/ConfirmationIndicator";
import { BookingModeIcon } from "@/components/BookingModeIcon";
import { markConversationRead } from "@/lib/conversationReadState";

import { useAuth } from "@/contexts/AuthContext";
import {
  confirmBooking,
  cancelBooking,
  reopenBooking,
  handoffOn,
  handoffOff,
  suggestSlots,
  fetchBookingRequestById,
  fetchBookingMessages,
  sendBookingMessage,
  patchBooking,
  fetchBookingsByPhone,
  fetchBookingPhoneById,
} from "@/lib/bookingApi";
import { rememberBookingProcedureNameOverride } from "@/lib/bookingProcedureNameOverrides";
import type { BookingMessage } from "@/lib/bookingApi";
import api from "@/lib/api";
import {
  X,
  Phone,
  Calendar,
  Clock,
  User,
  Building2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Hash,
  BotMessageSquare,
  BotOff,
  Ban,
  CalendarSearch,
  XCircle,
  RotateCcw,
  PhoneForwarded,
  PhoneOff,
  Hourglass,
  CalendarClock,
  CalendarPlus,
  CalendarX,
  Bot,
  MessageSquare,
  Send,
  Zap,
  Pencil,
  Trash2,
  Plus,
  ClipboardList,
  Check,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Search,
} from "lucide-react";

interface BookingDrawerProps {
  booking: BookingRequest | null;
  onClose: () => void;
  onConfirmed: () => void;
  logoUrl?: string | null;
  logoAlt?: string | null;
  mode?: "details" | "manage";
}

const TERMINAL_STATUSES: BookingStatus[] = ["confirmed", "canceled", "cancelled", "failed"];
function isTerminal(status: BookingStatus) {
  return TERMINAL_STATUSES.includes(status);
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55")) return `(${digits.slice(2, 4)}) ${digits.slice(4, 5)} ${digits.slice(5, 9)}-${digits.slice(9)}`;
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return raw;
}

type DetailTone =
  | "default"
  | "primary"
  | "confirmed"
  | "pending"
  | "handoff"
  | "assisted"
  | "canceled";

const DETAIL_TONE_STYLES: Record<DetailTone, { card: string; chip: string; label: string }> = {
  default: {
    card: "bg-surface-elevated/50 border-border/40",
    chip: "bg-surface text-muted-foreground",
    label: "text-muted-foreground",
  },
  primary: {
    card: "bg-surface-elevated/50 border-border/40",
    chip: "bg-primary/15 text-primary",
    label: "text-primary/80",
  },
  confirmed: {
    card: "bg-status-confirmed-bg/40 border-status-confirmed/20",
    chip: "bg-status-confirmed/15 text-status-confirmed",
    label: "text-status-confirmed/80",
  },
  pending: {
    card: "bg-status-pending-bg/40 border-status-pending/20",
    chip: "bg-status-pending/15 text-status-pending",
    label: "text-status-pending/80",
  },
  handoff: {
    card: "bg-status-handoff-bg/40 border-status-handoff/20",
    chip: "bg-status-handoff/15 text-status-handoff",
    label: "text-status-handoff/80",
  },
  assisted: {
    card: "bg-status-assisted-bg/40 border-status-assisted/20",
    chip: "bg-status-assisted/15 text-status-assisted",
    label: "text-status-assisted/80",
  },
  canceled: {
    card: "bg-status-canceled-bg/40 border-status-canceled/20",
    chip: "bg-status-canceled/15 text-status-canceled",
    label: "text-status-canceled/80",
  },
};

function DetailRow({
  icon: Icon,
  label,
  value,
  className,
  tone = "default",
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  className?: string;
  tone?: DetailTone;
}) {
  const t = DETAIL_TONE_STYLES[tone];
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${t.card} ${className ?? ""}`}>
      <div className={`flex h-7 w-7 items-center justify-center rounded-lg flex-shrink-0 mt-0.5 ${t.chip}`}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className={`text-[10px] font-medium uppercase tracking-wider ${t.label}`}>
          {label}
        </span>
        <span className="text-sm text-foreground leading-snug">{value}</span>
      </div>
    </div>
  );
}

// ── Notes Log Parser ─────────────────────────────────────────────────────────
// Converte o texto bruto de notes em entradas estruturadas e legíveis.

type NoteEntryKind = "ai_schedule" | "ai_reschedule" | "ai_cancel" | "ai_handoff" | "handoff_schedule" | "handoff_reschedule" | "handoff_cancel" | "manual_schedule" | "reschedule" | "cancel" | "generic";

interface NoteEntry {
  kind: NoteEntryKind;
  timestamp?: string;
  title: string;
  body: string;
  meta: Array<{ label: string; value: string }>;
}

const NOTE_KIND_STYLES: Record<NoteEntryKind, { card: string; chip: string; icon: React.ElementType; title: string }> = {
  ai_schedule: {
    card: "bg-surface-elevated/40 border-border/40",
    chip: "bg-status-confirmed/20 text-status-confirmed",
    icon: Sparkles,
    title: "IA · Agendamento direto",
  },
  ai_reschedule: {
    card: "bg-surface-elevated/40 border-border/40",
    chip: "bg-status-pending/20 text-status-pending",
    icon: Sparkles,
    title: "IA · Reagendamento direto",
  },
  ai_cancel: {
    card: "bg-surface-elevated/40 border-border/40",
    chip: "bg-status-canceled/20 text-status-canceled",
    icon: Sparkles,
    title: "IA · Cancelamento direto",
  },
  ai_handoff: {
    card: "bg-surface-elevated/40 border-border/40",
    chip: "bg-status-handoff/20 text-status-handoff",
    icon: PhoneForwarded,
    title: "IA · Transferência para humano",
  },
  handoff_schedule: {
    card: "bg-surface-elevated/40 border-border/40",
    chip: "bg-status-handoff/20 text-status-handoff",
    icon: CalendarPlus,
    title: "Handoff · Agendamento",
  },
  handoff_reschedule: {
    card: "bg-surface-elevated/40 border-border/40",
    chip: "bg-status-handoff/20 text-status-handoff",
    icon: CalendarClock,
    title: "Handoff · Reagendamento",
  },
  handoff_cancel: {
    card: "bg-surface-elevated/40 border-border/40",
    chip: "bg-status-handoff/20 text-status-handoff",
    icon: CalendarX,
    title: "Handoff · Cancelamento",
  },
  manual_schedule: {
    card: "bg-surface-elevated/40 border-border/40",
    chip: "bg-status-confirmed/20 text-status-confirmed",
    icon: Calendar,
    title: "Agendamento manual",
  },
  reschedule: {
    card: "bg-surface-elevated/40 border-border/40",
    chip: "bg-status-pending/20 text-status-pending",
    icon: RotateCcw,
    title: "Reagendamento",
  },
  cancel: {
    card: "bg-surface-elevated/40 border-border/40",
    chip: "bg-status-canceled/20 text-status-canceled",
    icon: XCircle,
    title: "Cancelamento",
  },
  generic: {
    card: "bg-surface-elevated/40 border-border/40",
    chip: "bg-surface-elevated text-muted-foreground",
    icon: MessageSquare,
    title: "Nota",
  },
};

function parseNoteMeta(body: string): { cleanBody: string; meta: Array<{ label: string; value: string }> } {
  const meta: Array<{ label: string; value: string }> = [];
  const parts = body.split("|").map((p) => p.trim()).filter(Boolean);
  const remaining: string[] = [];
  for (const part of parts) {
    // Esconde marcadores técnicos BR_TAG_* da exibição (continuam no notes para detecção)
    if (/^BR_TAG_[A-Z_]+\s*=\s*\d+\s*$/i.test(part)) continue;
    const m = part.match(/^([^:]+):\s*(.+)$/);
    if (m) {
      const label = m[1].trim();
      const value = m[2].trim();
      if (/^policy$/i.test(label)) continue;
      meta.push({ label, value });
    } else {
      remaining.push(part);
    }
  }
  return { cleanBody: remaining.join(" · "), meta };
}

function detectNoteKind(body: string): NoteEntryKind {
  const lower = body.toLowerCase();
  const isAi = /autom[áa]tic[oa] pela ia/.test(lower) || /policy\s*[:=]/i.test(body) || /BR_TAG_AI_(DIRECT|HANDOFF)/i.test(body) || /atendimento\s+humano\s+solicitado\s+pela\s+ia/i.test(body);

  // Para notas de IA, classificar pelo TIPO DE AÇÃO declarado no início
  // ("CANCELAMENTO/REAGENDAMENTO/AGENDAMENTO AUTOMATICO PELA IA"),
  // não por ocorrências da palavra no motivo.
  if (isAi) {
    // Handoff (transferência para humano) tem prioridade — pode coexistir com palavras como "agendamento"
    if (
      /BR_TAG_AI_HANDOFF/i.test(body) ||
      /policy\s*[:=]\s*\w*handoff/i.test(body) ||
      /atendimento\s+humano\s+solicitado\s+pela\s+ia/i.test(body)
    ) {
      return "ai_handoff";
    }
    const actionMatch = lower.match(/(cancelamento|reagendamento|agendamento)\s+autom[áa]tic[oa]\s+pela\s+ia/);
    const action = actionMatch?.[1];
    if (action === "cancelamento" || /policy\s*[:=]\s*\w*cancel/i.test(body) || /BR_TAG_AI_DIRECT_CANCEL/i.test(body)) return "ai_cancel";
    if (action === "reagendamento" || /policy\s*[:=]\s*\w*reschedule/i.test(body) || /BR_TAG_AI_DIRECT_RESCHEDULE/i.test(body)) return "ai_reschedule";
    if (action === "agendamento" || /policy\s*[:=]\s*\w*(schedule|book_new)/i.test(body) || /BR_TAG_AI_DIRECT_(SCHEDULE|BOOK)/i.test(body)) return "ai_schedule";
    return "ai_schedule";
  }

  // Notas manuais: ordem importa (reagendamento contém "agendamento")
  if (/BR_TAG_MANUAL_SCHEDULE/i.test(body) || /agendamento\s+manual/i.test(body)) return "manual_schedule";
  if (/cancelamento/i.test(body)) return "cancel";
  if (/reagendamento/i.test(body)) return "reschedule";
  return "generic";
}

const AI_EVENT_KIND_MAP: Record<string, NoteEntryKind> = {
  direct_schedule: "ai_schedule",
  direct_reschedule: "ai_reschedule",
  direct_cancel: "ai_cancel",
  ai_handoff: "ai_handoff",
  handoff: "ai_handoff",
  handoff_schedule: "handoff_schedule",
  handoff_reschedule: "handoff_reschedule",
  handoff_cancel: "handoff_cancel",
  // Eventos manuais (operador humano via Dashboard)
  manual_schedule: "manual_schedule",
  manual_reschedule: "reschedule",
  manual_cancel: "cancel",
};

function formatEventTimestamp(ts?: string): string | undefined {
  if (!ts) return undefined;
  try {
    return format(new Date(ts), "dd/MM/yyyy HH:mm", { locale: ptBR });
  } catch {
    return undefined;
  }
}

function aiEventToEntry(event: AiEvent): NoteEntry {
  const kind = AI_EVENT_KIND_MAP[event.type] ?? "ai_schedule";
  const meta: Array<{ label: string; value: string }> = [];

  if (event.procedure_name) {
    const proc = event.procedure_slug
      ? `${event.procedure_name} (${event.procedure_slug})`
      : event.procedure_name;
    meta.push({ label: "Procedimento", value: proc });
  }
  if (event.professional_name) {
    const prof = event.professional_id
      ? `${event.professional_name} (#${event.professional_id})`
      : event.professional_name;
    meta.push({ label: "Profissional", value: prof });
  }
  const scheduled = formatEventTimestamp(event.scheduled_at);
  if (scheduled) meta.push({ label: "Agendado para", value: scheduled });

  const oldDt = formatEventTimestamp(event.old_dt);
  if (oldDt) meta.push({ label: "De", value: oldDt });
  const newDt = formatEventTimestamp(event.new_dt);
  if (newDt) meta.push({ label: "Para", value: newDt });

  // Policy: aceita tanto `policy` (string) quanto `policy_key`/`policy_value`
  let policyValue: string | undefined;
  if (event.policy_key && event.policy_value) {
    policyValue = `${event.policy_key}=${event.policy_value}`;
  } else if (event.policy) {
    policyValue = event.policy;
  }
  if (policyValue) meta.push({ label: "Policy", value: policyValue });

  if (event.br_id) meta.push({ label: "BR", value: `#${event.br_id}` });
  if (event.cancelled_br_id) meta.push({ label: "BR cancelada", value: `#${event.cancelled_br_id}` });
  if (event.cancelled_from_br_id) meta.push({ label: "Cancelado por", value: `BR #${event.cancelled_from_br_id}` });
  if (event.replaced_by_br_id) meta.push({ label: "Substituído por", value: `BR #${event.replaced_by_br_id}` });
  if (event.unit) meta.push({ label: "Unidade", value: event.unit });
  if (event.actor === "human" && event.actor_name) {
    meta.push({ label: "Operador", value: event.actor_name });
  }
  if (event.reason) meta.push({ label: "Motivo", value: event.reason });

  // Para eventos manuais, sobrescreve o título padrão da IA
  const baseTitle = NOTE_KIND_STYLES[kind].title;
  const isManual = event.actor === "human" || event.type.startsWith("manual_");
  const title = isManual
    ? (kind === "manual_schedule"
        ? "Agendamento manual via Dashboard"
        : kind === "reschedule"
          ? "Reagendamento manual via Dashboard"
          : kind === "cancel"
            ? "Cancelamento manual via Dashboard"
            : baseTitle)
    : baseTitle;

  return {
    kind,
    timestamp: formatEventTimestamp(event.ts),
    title,
    body: "",
    meta,
  };
}

function parseNotes(notes: string): NoteEntry[] {
  // 0) Extrai ai_events JSON e remove o bloco do texto bruto antes do parsing legado.
  const aiEvents = extractAiEvents(notes);
  const aiEntries = aiEvents.map(aiEventToEntry);

  let working = notes;
  // Remove tanto o formato correto `"ai_events":` quanto o malformado `"ai_events"[`
  working = working.replace(/\{\s*"ai_events"\s*:?\s*\[[\s\S]*?\]\s*\}/g, "");

  // Remove linhas que são apenas tags técnicas (BR_TAG_X = 1234)
  const cleaned = working
    .split("\n")
    .filter((ln) => !/^\s*BR_TAG_[A-Z_]+\s*=\s*\d+\s*$/i.test(ln))
    .join("\n");

  const entries: NoteEntry[] = [];

  // 1) Captura texto "solto" antes da primeira tag [timestamp] como uma entrada separada,
  //    para não perder notas antigas que o backend grava sem timestamp inline (ex: handoff IA).
  const firstTs = cleaned.search(/\[\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}\]/);
  const preamble = (firstTs === -1 ? cleaned : cleaned.slice(0, firstTs)).trim();
  if (preamble) {
    const kind = detectNoteKind(preamble);
    const { cleanBody, meta } = parseNoteMeta(preamble.replace(/\n+/g, " | "));
    entries.push({
      kind,
      title: NOTE_KIND_STYLES[kind].title,
      body: cleanBody || preamble,
      meta,
    });
  }

  // 2) Entradas com timestamp explícito
  const entryRegex = /\[(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2})\]\s*([\s\S]*?)(?=\n\[\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}\]|$)/g;
  let match: RegExpExecArray | null;
  while ((match = entryRegex.exec(cleaned)) !== null) {
    const timestamp = match[1];
    const raw = match[2].trim();
    if (!raw) continue;
    const kind = detectNoteKind(raw);
    const { cleanBody, meta } = parseNoteMeta(raw);
    entries.push({
      kind,
      timestamp,
      title: NOTE_KIND_STYLES[kind].title,
      body: cleanBody || raw,
      meta,
    });
  }

  if (entries.length === 0 && aiEntries.length === 0 && cleaned.trim()) {
    entries.push({ kind: "generic", title: "Nota", body: cleaned.trim(), meta: [] });
  }

  // Combina ai_events (mais ricos) com entradas legadas; ordena por timestamp quando possível.
  const all = [...aiEntries, ...entries];
  return all;
}

/**
 * Mescla um novo evento manual no bloco JSON `{"ai_events":[...]}` dentro de `notes`,
 * preservando todo o restante do texto e qualquer evento prévio (ex.: `ai_handoff`).
 */
function appendManualAiEvent(existingNotesRaw: string, manualEvent: Record<string, unknown>): string {
  const existingMatch = existingNotesRaw.match(/\{\s*"ai_events"\s*:?\s*(\[[\s\S]*?\])\s*\}/);
  let mergedEvents: any[] = [manualEvent];
  let notesWithoutBlock = existingNotesRaw;
  if (existingMatch) {
    try {
      const arr = JSON.parse(existingMatch[1]);
      if (Array.isArray(arr)) mergedEvents = [...arr, manualEvent];
    } catch {
      /* substitui bloco malformado */
    }
    notesWithoutBlock = existingNotesRaw.replace(existingMatch[0], "").trim();
  }
  const aiEventsBlock = JSON.stringify({ ai_events: mergedEvents });
  return [notesWithoutBlock, aiEventsBlock].filter(Boolean).join("\n");
}

/**
 * Faz PATCH no `notes` de uma BR cancelada para registrar o evento `manual_cancel`,
 * fazendo merge com qualquer bloco `ai_events` existente. Usado para rastreabilidade
 * quando a BR é cancelada como efeito colateral de outra ação (ex.: reagendamento).
 */
async function logManualCancelOnTargetBR(
  targetId: number,
  manualEvent: Record<string, unknown>,
): Promise<void> {
  try {
    const fresh = await fetchBookingRequestById(targetId);
    const currentNotes = (fresh?.notes ?? "").trim();
    const updatedNotes = appendManualAiEvent(currentNotes, manualEvent);
    await patchBooking(targetId, { notes: updatedNotes, allow_terminal_status_via_patch: true });
  } catch (err) {
    console.warn(`[logManualCancelOnTargetBR] falhou para BR #${targetId}:`, err);
  }
}

function NotesLog({ notes }: { notes: string }) {
  const entries = parseNotes(notes);
  if (entries.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 mt-1">
      {entries.map((entry, i) => {
        const style = NOTE_KIND_STYLES[entry.kind];
        const Icon = style.icon;
        return (
          <div key={i} className={`rounded-lg border p-2.5 ${style.card}`}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`flex h-5 w-5 items-center justify-center rounded ${style.chip}`}>
                <Icon className="h-3 w-3" />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
                {entry.title}
              </span>
              {entry.timestamp && (
                <span className="ml-auto text-[10px] font-mono text-muted-foreground">
                  {entry.timestamp}
                </span>
              )}
            </div>
            {entry.meta.length > 0 ? (
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {entry.meta.map((m, j) => (
                  <div key={j} className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground/80">
                      {m.label}
                    </span>
                    <span className="text-xs text-foreground break-words" title={m.value}>
                      {m.value}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              entry.body && (
                <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap">
                  {entry.body}
                </p>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}

function TerminalBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-surface-elevated text-muted-foreground border border-border">
      <Ban className="h-3 w-3" />
      Terminal
    </span>
  );
}

function ActionButton({
  onClick,
  disabled,
  loading,
  icon: Icon,
  label,
  variant = "default",
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon: React.ElementType;
  label: string;
  variant?: "primary" | "danger" | "default";
}) {
  const classes = {
    primary:
      "gradient-primary text-primary-foreground hover:opacity-90",
    danger:
      "bg-status-canceled/10 text-status-canceled border border-status-canceled/30 hover:bg-status-canceled/20",
    default:
      "border border-border text-muted-foreground hover:text-foreground hover:bg-surface-elevated",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed ${classes[variant]}`}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {label}
    </button>
  );
}

import { cancelledBookingCache, extractCancelledIdFromNotes, isRescheduleFromNotes, extractProcedureFromNotes } from "@/lib/cancelledBookingCache";

export function BookingDrawer({ booking, onClose, onConfirmed, logoUrl, logoAlt, mode: drawerMode = "details" }: BookingDrawerProps) {
  const queryClient = useQueryClient();
  const [actionDone, setActionDone] = useState<string | null>(null);
  type ScheduleLogEntry = {
    ts: string;
    label: string;
    status: "info" | "success" | "warning" | "error";
    detail?: string;
  };
  const [scheduleLog, setScheduleLog] = useState<ScheduleLogEntry[]>([]);
  const pushScheduleLog = (entry: Omit<ScheduleLogEntry, "ts">) => {
    const now = new Date();
    const ts = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    setScheduleLog((prev) => [...prev, { ...entry, ts }]);
  };
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<number | null>(null);
  const [selectedProcedureId, setSelectedProcedureId] = useState<number | null>(null);
  const [selectedSpecialtyId, setSelectedSpecialtyId] = useState<number | null>(null);
  const [mockAssignedProfessional, setMockAssignedProfessional] = useState<{ id: number; name: string } | null>(null);
  const [assignLeadName, setAssignLeadName] = useState("");
  const [scheduleReason, setScheduleReason] = useState("");
  const [cancelBookingIdField, setCancelBookingIdField] = useState("");
  const [overrideProcedureName, setOverrideProcedureName] = useState<string | null>(null);
  const [forceBotOff, setForceBotOff] = useState(false);
  const lastCancelledIdRef = useRef<string | null>(null);
  // Reagendamento manual: busca de BRs do cliente pelo telefone do BR atual
  const [rescheduleSearchResults, setRescheduleSearchResults] = useState<BookingRequest[] | null>(null);
  const [rescheduleSearchLoading, setRescheduleSearchLoading] = useState(false);
  const [rescheduleSearchError, setRescheduleSearchError] = useState<string | null>(null);
  const [selectedClientBooking, setSelectedClientBooking] = useState<BookingRequest | null>(null);
  type RescheduleLogEntry = { ts: string; label: string; status: "info" | "success" | "warning" | "error"; detail?: string };
  const [rescheduleLog, setRescheduleLog] = useState<RescheduleLogEntry[]>([]);
  const pushRescheduleLog = (entry: Omit<RescheduleLogEntry, "ts">) => {
    const now = new Date();
    const ts = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    setRescheduleLog((prev) => [...prev, { ...entry, ts }]);
  };
  const [messageText, setMessageText] = useState("");
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [editingQuickReplies, setEditingQuickReplies] = useState(false);
  const [conversationCollapsed, setConversationCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem("conversation_collapsed");
      return saved === null ? true : saved === "true";
    } catch {
      return true;
    }
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const toggleConversationCollapsed = () => {
    setConversationCollapsed((prev) => {
      const next = !prev;
      try { localStorage.setItem("conversation_collapsed", String(next)); } catch {}
      return next;
    });
  };

  const DEFAULT_QUICK_REPLIES = [
    "Olá! Como posso te ajudar?",
    "Vou verificar a disponibilidade para você.",
    "Seu agendamento foi confirmado!",
    "Poderia me informar seu nome completo?",
    "Qual procedimento você deseja agendar?",
  ];

  const getQuickReplies = (): string[] => {
    try {
      const saved = localStorage.getItem("quick_replies");
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_QUICK_REPLIES;
  };

  const [quickReplies, setQuickReplies] = useState<string[]>(getQuickReplies);

  // Reset form state when a different booking is opened
  useEffect(() => {
    const rawName = booking?.lead_name ?? "";
    setAssignLeadName(rawName.toLowerCase() === "não informado" ? "" : rawName);
    setScheduleReason("");
    setCancelBookingIdField("");
    setOverrideProcedureName(null);
    setForceBotOff(false);
    lastCancelledIdRef.current = null;
    setSelectedProfessionalId(null);
    setSelectedProcedureId(null);
    setSelectedSpecialtyId(null);
    setMockAssignedProfessional(null);
    setMessageText("");
    setActionDone(null);
    setScheduleLog([]);
    setRescheduleSearchResults(null);
    setRescheduleSearchLoading(false);
    setRescheduleSearchError(null);
    setSelectedClientBooking(null);
    setRescheduleLog([]);
    // IA mode: pré-seleciona a aba conforme procedure_code
    const code = ((booking as any)?.procedure_code ?? booking?.procedure_slug ?? "").trim().toLowerCase();
    if (code === "cancel") setIaOpType("cancel");
    else if (code === "reschedule") setIaOpType("reschedule");
    else setIaOpType("schedule");
    // Reset stale mutation errors
    confirmMut.reset();
    cancelMut.reset();
    cancelConfirmedMut.reset();
    reopenMut.reset();
    handoffOnMut.reset();
    handoffOffMut.reset();
    suggestMut.reset();
  }, [booking?.id]);
  const saveQuickReplies = (replies: string[]) => {
    setQuickReplies(replies);
    localStorage.setItem("quick_replies", JSON.stringify(replies));
  };

  const effectiveProfessionalName =
    mockAssignedProfessional?.name ?? booking?.professional_name ?? "";
  const hasProfessional = !!(
    effectiveProfessionalName &&
    effectiveProfessionalName.trim() &&
    effectiveProfessionalName.trim() !== "None"
  );

  const earlyProcCode = ((booking as any)?.procedure_code ?? booking?.procedure_slug ?? "").trim().toLowerCase();
  const needsProfessional = !!booking && (!hasProfessional || earlyProcCode === "reschedule");

  // Resolve booking's unit id from auth units (booking has unit_name only)
  const { user, units: authUnits, aiEnabled } = useAuth();

  // IA Enabled: tipo de operação manual selecionada no Drawer (Agendamento / Reagendamento / Cancelamento).
  // Estrutura visual apenas — ações ainda não conectadas.
  type IaOpType = "schedule" | "reschedule" | "cancel";
  const [iaOpType, setIaOpType] = useState<IaOpType>("schedule");
  // Busca dados de agenda também no modo dedicado de gerenciamento aberto pelo ícone.
  const needsSchedulingLookups =
    !!booking &&
    ((drawerMode === "manage" && (iaOpType === "schedule" || iaOpType === "reschedule" || iaOpType === "cancel")) ||
      (aiEnabled && (iaOpType === "schedule" || iaOpType === "reschedule" || iaOpType === "cancel")));
  const bookingUnitId = (() => {
    const name = (booking?.unit_name ?? "").trim().toLowerCase();
    if (!name) return null;
    const match = authUnits.find((u) => (u.name ?? "").trim().toLowerCase() === name);
    return match?.id ?? null;
  })();

  const { data: professionals = [] } = useQuery({
    queryKey: ["professionals-unit-drawer", bookingUnitId ?? "all"],
    queryFn: async () => {
      const { data } = await api.get("/api/booking/professionals/", {
        params: bookingUnitId ? { unit: bookingUnitId } : undefined,
      });
      const result = Array.isArray(data) ? data : (data?.results ?? []);
      return result as { id: number; name: string; code?: string }[];
    },
    enabled: needsProfessional || needsSchedulingLookups,
  });

  // Safety net: also fetch professional-units links for the booking unit and filter client-side,
  // in case the /professionals/?unit= endpoint ignores the param.
  const { data: profUnitLinks = [] } = useQuery({
    queryKey: ["professional-units-drawer", bookingUnitId],
    queryFn: async () => {
      const { data } = await api.get("/api/booking/professional-units/", {
        params: { unit: bookingUnitId, page_size: 500 },
      });
      const arr = Array.isArray(data) ? data : (data?.results ?? data?.result?.results ?? data?.result ?? []);
      return Array.isArray(arr) ? (arr as { professional?: number | { id: number }; unit?: number | { id: number }; is_active?: boolean }[]) : [];
    },
    enabled: (needsProfessional || needsSchedulingLookups) && !!bookingUnitId,
  });

  const allowedProfIds = (() => {
    if (!bookingUnitId) return null; // no filter when unit cannot be resolved
    const ids = new Set<number>();
    for (const link of profUnitLinks) {
      if (link.is_active === false) continue;
      const profVal = link.professional as any;
      const unitVal = link.unit as any;
      const profId = typeof profVal === "object" ? Number(profVal?.id ?? 0) : Number(profVal ?? 0);
      const unitId = typeof unitVal === "object" ? Number(unitVal?.id ?? 0) : Number(unitVal ?? 0);
      if (profId && (!unitId || unitId === bookingUnitId)) ids.add(profId);
    }
    return ids;
  })();

  const professionalsForUnit = allowedProfIds
    ? professionals.filter((p) => allowedProfIds.has(p.id))
    : professionals;

  // Fetch professional-procedures links (to filter procedures by selected professional)
  const { data: profProcLinks = [] } = useQuery({
    queryKey: ["professional-procedures-drawer"],
    queryFn: async () => {
      const { data } = await api.get("/api/settings/professional-procedures/");
      const arr = Array.isArray(data) ? data : (data?.results ?? data?.result?.results ?? data?.result ?? []);
      return Array.isArray(arr) ? arr as { id: number; professional?: number; procedure?: number; procedure_name?: string }[] : [];
    },
    enabled: needsProfessional || needsSchedulingLookups,
  });

  // Fetch all procedures
  const { data: allProcedures = [] } = useQuery({
    queryKey: ["procedures-drawer"],
    queryFn: async () => {
      const { data } = await api.get("/api/settings/procedures/");
      const arr = Array.isArray(data) ? data : (data?.results ?? data?.result?.results ?? data?.result ?? []);
      return Array.isArray(arr) ? arr as { id: number; name?: string; slug?: string }[] : [];
    },
    enabled: needsProfessional || needsSchedulingLookups,
  });

  // Fetch all specialties
  const { data: allSpecialties = [] } = useQuery({
    queryKey: ["specialties-drawer"],
    queryFn: async () => {
      const { data } = await api.get("/api/settings/specialties/");
      const arr = Array.isArray(data) ? data : (data?.results ?? data?.result?.results ?? data?.result ?? []);
      return Array.isArray(arr) ? arr as { id: number; name?: string }[] : [];
    },
    enabled: needsProfessional || needsSchedulingLookups,
  });

  // Fetch procedure-specialties links (to auto-resolve specialty)
  const { data: procSpecLinks = [] } = useQuery({
    queryKey: ["procedure-specialties-drawer"],
    queryFn: async () => {
      const { data } = await api.get("/api/settings/procedure-specialties/");
      const arr = Array.isArray(data) ? data : (data?.results ?? data?.result?.results ?? data?.result ?? []);
      return Array.isArray(arr) ? arr as { id: number; procedure?: number; specialty?: number }[] : [];
    },
    enabled: needsProfessional || needsSchedulingLookups,
  });

  // Fetch unit-procedures links (to resolve procedure_code = unit-procedure ID)
  const { data: unitProcLinks = [] } = useQuery({
    queryKey: ["unit-procedures-drawer"],
    queryFn: async () => {
      const { data } = await api.get("/api/settings/unit-procedures/");
      const arr = Array.isArray(data) ? data : (data?.results ?? data?.result?.results ?? data?.result ?? []);
      return Array.isArray(arr) ? arr as { id: number; procedure?: number; unit?: number; unit_name?: string }[] : [];
    },
    enabled: needsProfessional || needsSchedulingLookups,
  });

  // Derived: procedures available for selected professional
  const proceduresForProfessional = selectedProfessionalId
    ? allProcedures.filter((p) =>
        profProcLinks.some((link) => link.professional === selectedProfessionalId && link.procedure === p.id)
      )
    : [];

  // Derived: procedures available for the current booking's unit (fallback to all procedures)
  const proceduresForUnit = (() => {
    const unitName = (booking?.unit_name ?? "").trim().toLowerCase();
    if (!unitName) return allProcedures;
    const unitProcedureIds = new Set(
      unitProcLinks
        .filter((up) => (up.unit_name ?? "").trim().toLowerCase() === unitName)
        .map((up) => up.procedure)
        .filter((id): id is number => typeof id === "number")
    );
    if (unitProcedureIds.size === 0) return allProcedures;
    return allProcedures.filter((p) => unitProcedureIds.has(p.id));
  })();

  // Auto-resolve specialty when procedure changes
  const autoSpecialtyId = selectedProcedureId
    ? procSpecLinks.find((ps) => ps.procedure === selectedProcedureId)?.specialty ?? null
    : null;


  // Auto-resolve unit-procedure ID (procedure_code) for the selected procedure + unit
  const resolvedUnitProcId = selectedProcedureId
    ? (unitProcLinks.find((up) => up.procedure === selectedProcedureId && up.unit_name?.toLowerCase() === booking?.unit_name?.toLowerCase())?.id
       ?? unitProcLinks.find((up) => up.procedure === selectedProcedureId)?.id
       ?? null)
    : null;

  const { data: bookingDetailForBot, refetch: refetchBookingDetailForBot } = useQuery({
    queryKey: ["booking-request-detail-bot", booking?.id],
    queryFn: () => fetchBookingRequestById(booking!.id),
    enabled: !!booking,
    staleTime: 0,
  });

  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["booking-messages", booking?.id],
    queryFn: () => fetchBookingMessages(booking!.id, 30),
    enabled: !!booking,
    refetchInterval: 30_000,
  });

  // Mark conversation as read using the latest incoming message timestamp while drawer is open
  useEffect(() => {
    if (!booking?.id) return;
    const latestIncomingTs = messages.reduce((latest, msg) => {
      const role = (msg.role ?? "").toLowerCase();
      const isUser = role.includes("user") || role.includes("lead") || role.includes("client") || role === "in" || role === "inbound";
      if (!isUser || !msg.created_at) return latest;
      const ts = new Date(msg.created_at).getTime();
      return Number.isFinite(ts) && ts > latest ? ts : latest;
    }, 0);
    markConversationRead(booking.id, latestIncomingTs || booking.updated_at || undefined);
  }, [booking?.id, booking?.updated_at, messages]);

  // Auto-fill cancel booking ID from booking data or conversation messages
  const pCodeForAutoFill = ((bookingDetailForBot as any)?.procedure_code ?? (booking as any)?.procedure_code ?? booking?.procedure_slug ?? "").trim().toLowerCase();
  const pCodeAutoFillIsCancel = pCodeForAutoFill === "cancel" || (booking?.procedure_name ?? "").trim().toLowerCase().startsWith("cancelar agendamento");
  const pCodeAutoFillNeedsId = pCodeAutoFillIsCancel || pCodeForAutoFill === "reschedule";
  useEffect(() => {
    if (!pCodeAutoFillNeedsId || cancelBookingIdField || lastCancelledIdRef.current) return;
    // 1) From vars_snapshot.booking_reference
    const ref = (booking as any)?.vars_snapshot?.booking_reference;
    if (ref) { setCancelBookingIdField(String(ref)); return; }
    // 2) From procedure_name e.g. "Cancelar agendamento #472"
    const procName = booking?.procedure_name ?? "";
    const procMatch = procName.match(/#(\d+)/);
    if (procMatch) { setCancelBookingIdField(procMatch[1]); return; }
    // 3) From messages
    if (!messages.length) return;
    for (const msg of messages) {
      const body = (msg as any).body ?? (msg as any).text ?? "";
      const match = body.match(/agendamento\s*(?:n[uú]mero|#|nº)?\s*(\d+)/i);
      if (match) { setCancelBookingIdField(match[1]); return; }
    }
    for (const msg of messages) {
      const dir = ((msg as any).direction ?? "").toString().toLowerCase();
      const body = ((msg as any).body ?? (msg as any).text ?? "").trim();
      if (dir === "in" && /^\d{1,6}$/.test(body)) { setCancelBookingIdField(body); return; }
    }
  }, [pCodeForAutoFill, messages, booking?.id]);

  const sendMsgMutation = useMutation({
    mutationFn: (text: string) => sendBookingMessage(booking!.id, text),
    onSuccess: () => {
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["booking-messages", booking?.id] });
    },
  });

  // ── Auto-preenchimento para BRs com ai_events handoff_schedule/reschedule/cancel ──
  // Usa a BR detalhada quando disponível, porque a listagem pode vir resumida.
  useEffect(() => {
    const sourceBooking = (bookingDetailForBot as BookingRequest | undefined) ?? booking;
    if (!sourceBooking) return;

    const events = extractAiEvents(sourceBooking.notes);
    const handoffEvents = events.filter((e) =>
      e.type === "handoff_schedule" || e.type === "handoff_reschedule" || e.type === "handoff_cancel"
    );
    if (handoffEvents.length === 0) return;

    const latest = handoffEvents[handoffEvents.length - 1];
    const targetTab: IaOpType =
      latest.type === "handoff_cancel"
        ? "cancel"
        : latest.type === "handoff_reschedule"
          ? "reschedule"
          : "schedule";
    setIaOpType(targetTab);

    // Motivo padrão para handoff_schedule (Política de Agendamento Manual)
    if (latest.type === "handoff_schedule") {
      setScheduleReason((prev) => prev.trim() ? prev : "Política de Agendamento Manual");
    }

    // Auto-preenchimento do ID da BR alvo para handoff_reschedule:
    // o evento traz a BR antiga em br_id ou cancelled_br_id.
    if (latest.type === "handoff_reschedule") {
      const parsePossibleId = (value: unknown): number | null => {
        if (typeof value === "number" && Number.isFinite(value) && value > 0) return value;
        if (typeof value === "string") {
          const parsed = Number(value.trim());
          if (Number.isFinite(parsed) && parsed > 0) return parsed;
        }
        return null;
      };
      const targetBrId =
        parsePossibleId((latest as any).cancelled_br_id) ||
        parsePossibleId(varsSnapshot.target_br_id) ||
        parsePossibleId(varsSnapshot.booking_reference) ||
        parsePossibleId((latest as any).br_id) ||
        null;
      if (targetBrId) {
        setCancelBookingIdField((prev) => (prev.trim() ? prev : String(targetBrId)));
      }
    }

    const normalize = (value: string) =>
      (value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

    const leadName = sourceBooking.lead_name ?? "";
    if (leadName && normalize(leadName) !== "nao informado") {
      setAssignLeadName(leadName);
    }

    const profName = (sourceBooking.professional_name ?? "").trim();
    const profNameNormalized = normalize(profName);
    const profValid = profName && !["nao informado", "none"].includes(profNameNormalized);
    if (professionals.length > 0) {
      let resolvedProfId: number | null = null;
      if (sourceBooking.professional_id && professionals.some((p) => p.id === sourceBooking.professional_id)) {
        resolvedProfId = sourceBooking.professional_id;
      } else if (profValid) {
        const matched =
          professionals.find((p) => normalize(p.name) === profNameNormalized) ??
          professionals.find((p) => normalize(p.name).includes(profNameNormalized) || profNameNormalized.includes(normalize(p.name)));
        if (matched) resolvedProfId = matched.id;
      }
      if (resolvedProfId) setSelectedProfessionalId(resolvedProfId);
    }

    if (allProcedures.length > 0) {
      const procTarget = normalize(sourceBooking.procedure_name ?? "");
      if (procTarget) {
        const matchedProc =
          allProcedures.find((p) => normalize(p.name ?? "") === procTarget) ??
          allProcedures.find((p) =>
            normalize(p.name ?? "").includes(procTarget) || procTarget.includes(normalize(p.name ?? ""))
          );
        if (matchedProc) setSelectedProcedureId(matchedProc.id);
      }
    }
  }, [booking, bookingDetailForBot, professionals, allProcedures]);

  // ── Sincroniza selectedClientBooking quando o ID da BR alvo é digitado/auto-preenchido ──
  // Garante que a Data/Hora apareça mesmo sem clicar em "Buscar BRs" (ex: handoff_reschedule).
  useEffect(() => {
    const idStr = cancelBookingIdField.trim();
    const idNum = Number(idStr);
    if (!idStr || !Number.isFinite(idNum) || idNum <= 0) return;
    if (selectedClientBooking?.id === idNum) return;
    if (booking?.id === idNum) return;
    let cancelled = false;
    (async () => {
      try {
        const br = await fetchBookingRequestById(idNum);
        if (!cancelled && br) setSelectedClientBooking(br);
      } catch (err) {
        console.warn("[BookingDrawer] failed to fetch target BR", idNum, err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [cancelBookingIdField, selectedClientBooking?.id, booking?.id]);

  const detailOrBooking = (bookingDetailForBot as BookingRequest | undefined) ?? booking;
  const latestHandoffActionEvent = (() => {
    const events = extractAiEvents(detailOrBooking?.notes);
    const handoffEvents = events.filter((e) =>
      e.type === "handoff_schedule" || e.type === "handoff_reschedule" || e.type === "handoff_cancel"
    );
    return handoffEvents.length > 0 ? handoffEvents[handoffEvents.length - 1] : null;
  })();

  const autofillLeadName = (detailOrBooking?.lead_name ?? "").trim();

  const normalizeAutofill = (value: string) =>
    (value ?? "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const varsSnapshot = ((detailOrBooking as any)?.vars_snapshot ?? {}) as Record<string, unknown>;
  const snapshotProfessionalId = typeof varsSnapshot.professional_id === "number" ? (varsSnapshot.professional_id as number) : null;
  const snapshotProcedureName = typeof varsSnapshot.procedure_name === "string" ? (varsSnapshot.procedure_name as string) : "";

  const autofillProfessionalId = selectedProfessionalId ?? (() => {
    // 1) ID direto na BR
    if (detailOrBooking?.professional_id && professionals.some((p) => p.id === detailOrBooking.professional_id)) {
      return detailOrBooking.professional_id;
    }
    // 2) ID do vars_snapshot (cliente expressou preferência)
    if (snapshotProfessionalId && professionals.some((p) => p.id === snapshotProfessionalId)) {
      return snapshotProfessionalId;
    }
    // 3) Match por nome (BR ou último evento de handoff)
    const profName = (detailOrBooking?.professional_name ?? latestHandoffActionEvent?.professional_name ?? "").trim();
    const profNameNormalized = normalizeAutofill(profName);
    if (!profNameNormalized || ["nao informado", "none"].includes(profNameNormalized)) return null;
    const matched =
      professionals.find((p) => normalizeAutofill(p.name) === profNameNormalized) ??
      professionals.find((p) => normalizeAutofill(p.name).includes(profNameNormalized) || profNameNormalized.includes(normalizeAutofill(p.name)));
    return matched?.id ?? null;
  })();

  const autofillProcedureId = selectedProcedureId ?? (() => {
    const procName = detailOrBooking?.procedure_name ?? latestHandoffActionEvent?.procedure_name ?? snapshotProcedureName ?? "";
    const procTarget = normalizeAutofill(procName);
    if (!procTarget) return null;
    const matched =
      allProcedures.find((p) => normalizeAutofill(p.name ?? "") === procTarget) ??
      allProcedures.find((p) => normalizeAutofill(p.name ?? "").includes(procTarget) || procTarget.includes(normalizeAutofill(p.name ?? "")));
    return matched?.id ?? null;
  })();

  const manageProfessionalOptions = autofillProfessionalId && !professionalsForUnit.some((p) => p.id === autofillProfessionalId)
    ? [...professionalsForUnit, ...professionals.filter((p) => p.id === autofillProfessionalId)]
    : professionalsForUnit;

  const effectiveProfessionalId = selectedProfessionalId ?? autofillProfessionalId;
  const effectiveProcedureId = selectedProcedureId ?? autofillProcedureId;

  const baseManageProcedureOptions = effectiveProfessionalId ? proceduresForProfessional : proceduresForUnit;
  const manageProcedureOptions = autofillProcedureId && !baseManageProcedureOptions.some((p) => p.id === autofillProcedureId)
    ? [...baseManageProcedureOptions, ...allProcedures.filter((p) => p.id === autofillProcedureId)]
    : baseManageProcedureOptions;

  const handleSendMessage = () => {
    const trimmed = messageText.trim();
    if (!trimmed || sendMsgMutation.isPending) return;
    sendMsgMutation.mutate(trimmed);
  };

  const assignProfMut = useMutation({
    mutationFn: async (profId: number) => {
      // Cancel flow: cancel the target booking by ID, then update current BR
      const procCode = ((bookingDetailForBot as any)?.procedure_code ?? (booking as any)?.procedure_code ?? booking?.procedure_slug ?? "").trim().toLowerCase();
      const procName = (booking?.procedure_name ?? "").trim().toLowerCase();
      const isCancelFlow = (procCode === "cancel" || procName.startsWith("cancelar agendamento")) && cancelBookingIdField.trim();
      const isRescheduleFlow = procCode === "reschedule" && cancelBookingIdField.trim();
      console.log("[BookingDrawer] mutationFn — procCode:", procCode, "isCancelFlow:", isCancelFlow, "isRescheduleFlow:", isRescheduleFlow);
      if (isCancelFlow) {
        const targetId = Number(cancelBookingIdField.trim());
        if (!targetId || isNaN(targetId)) throw new Error("ID de agendamento inválido");
        console.log("[BookingDrawer] Cancel flow — cancelling BR #", targetId, "and patching current BR #", booking!.id);
        await cancelBooking(targetId);
        try {
          console.log("[BookingDrawer] Cancel flow — calling handoffOn to turn bot OFF on BR #", booking!.id);
          await handoffOn(booking!.id);
        } catch (err) {
          console.warn("[BookingDrawer] handoffOn failed (may already be off):", err);
        }
        const now = new Date();
        const timestamp = `${String(now.getDate()).padStart(2,"0")}/${String(now.getMonth()+1).padStart(2,"0")}/${now.getFullYear()} ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
        const existingNotes = (bookingDetailForBot as any)?.notes ?? (booking as any)?.notes ?? "";
        const logEntry = `[${timestamp}] BR_TAG_CANCEL_DONE | Cancelamento do agendamento #${targetId} solicitado por ${assignLeadName.trim() || "N/A"}`;
        const newNotes = existingNotes ? `${existingNotes}\n${logEntry}` : logEntry;
        const patchResult = await patchBooking(booking!.id, {
          lead_name: assignLeadName.trim() || booking!.lead_name,
          procedure_name: `Cancelar agendamento #${targetId}`,
          notes: newNotes,
          conversation_bot_mode: "off",
          booking_mode: "handoff_manual",
          status: "failed",
          allow_terminal_status_via_patch: true,
        });
        console.log("[BookingDrawer] Cancel flow — PATCH result status =", (patchResult as any)?.status);
        return patchResult;
      }

      // Reschedule flow: cancel target BR + assign professional/procedure + handoffOff
      if (isRescheduleFlow) {
        const targetId = Number(cancelBookingIdField.trim());
        if (!targetId || isNaN(targetId)) throw new Error("ID de agendamento inválido");
        console.log("[BookingDrawer] Reschedule flow — cancelling BR #", targetId, "and assigning on current BR #", booking!.id);
        // Step 1: Cancel the target booking
        await cancelBooking(targetId);
        // Step 2: PATCH current BR with professional, procedure, lead_name
        const now = new Date();
        const timestamp = `${String(now.getDate()).padStart(2,"0")}/${String(now.getMonth()+1).padStart(2,"0")}/${now.getFullYear()} ${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
        const existingNotes = (bookingDetailForBot as any)?.notes ?? (booking as any)?.notes ?? "";
        const realProcName = selectedProcedureId ? (allProcedures.find((p) => p.id === selectedProcedureId)?.name ?? "") : "";
        const profName = professionals.find((p) => p.id === profId)?.name ?? "";
        const logEntry = `[${timestamp}] Reagendamento: cancelamento do agendamento #${targetId} | Procedimento: ${realProcName || "N/A"} | Profissional: ${profName || "N/A"} | por ${assignLeadName.trim() || "N/A"}`;
        const newNotes = existingNotes ? `${existingNotes}\n${logEntry}` : logEntry;
        const payload: Record<string, unknown> = {
          lead_name: assignLeadName.trim() || booking!.lead_name,
          notes: newNotes,
        };
        if (profId > 0) {
          payload.professional = profId;
          payload.booking_mode = "assisted_slots_dashboard";
        }
        if (selectedProcedureId) {
          payload.procedure = selectedProcedureId;
        }
        if (resolvedUnitProcId) payload.procedure_code = resolvedUnitProcId;
        const resolvedSpecialty = selectedSpecialtyId ?? autoSpecialtyId;
        if (resolvedSpecialty) payload.specialty = resolvedSpecialty;
        console.log("[BookingDrawer] Reschedule PATCH payload:", JSON.stringify(payload));
        return await patchBooking(booking!.id, payload);
      }

      const payload: Record<string, unknown> = {
        lead_name: assignLeadName.trim() || booking!.lead_name,
      };
      if (profId > 0) {
        payload.professional = profId;
        payload.booking_mode = "assisted_slots_dashboard";
      }
      if (selectedProcedureId) {
        payload.procedure = selectedProcedureId;
      }
      const resolvedSpecialty = selectedSpecialtyId ?? autoSpecialtyId;
      if (resolvedSpecialty) payload.specialty = resolvedSpecialty;

      console.log("[BookingDrawer] PATCH payload:", JSON.stringify(payload));
      return await patchBooking(booking!.id, payload);
    },
    onSuccess: async (result: any) => {
      const procCode = ((bookingDetailForBot as any)?.procedure_code ?? (booking as any)?.procedure_code ?? booking?.procedure_slug ?? "").trim().toLowerCase();
      const procName = (booking?.procedure_name ?? "").trim().toLowerCase();
      const wasCancelFlow = procCode === "cancel" || procName.startsWith("cancelar agendamento");
      const wasRescheduleFlow = procCode === "reschedule";
      console.log("[BookingDrawer] onSuccess — wasCancelFlow:", wasCancelFlow, "wasRescheduleFlow:", wasRescheduleFlow, "procCode:", procCode);
      
      // Capture procedure name BEFORE clearing state
      const savedProcName = selectedProcedureId ? allProcedures.find((p) => p.id === selectedProcedureId)?.name : undefined;
      
      setSelectedProfessionalId(null);
      setSelectedProcedureId(null);
      setSelectedSpecialtyId(null);

      if (wasCancelFlow) {
        const cancelledId = cancelBookingIdField.trim();
        lastCancelledIdRef.current = cancelledId;
        cancelledBookingCache.set(booking!.id, { cancelledId, botOff: true });
        console.log("[BookingDrawer] Cached cancel for BR", booking!.id, "→ cancelled", cancelledId);
        setOverrideProcedureName(`Cancelar agendamento #${cancelledId}`);
        setForceBotOff(true);
        setActionDone(`Agenda #${cancelledId} cancelada!`);
      } else if (wasRescheduleFlow) {
        const cancelledId = cancelBookingIdField.trim();
        lastCancelledIdRef.current = cancelledId;
        cancelledBookingCache.set(booking!.id, { cancelledId, botOff: false, realProcedureName: savedProcName || undefined });
        if (savedProcName) setOverrideProcedureName(savedProcName);
        try {
          console.log("[BookingDrawer] Reschedule flow — calling handoffOff to turn bot ON");
          await handoffOff(booking!.id);
          setActionDone(`Agenda #${cancelledId} cancelada e bot ligado!`);
        } catch (err) {
          console.error("[BookingDrawer] handoffOff after reschedule failed:", err);
          setActionDone(`Agenda #${cancelledId} cancelada, mas falha ao ligar bot.`);
        }
      } else if (isConvo) {
        try {
          console.log("[BookingDrawer] Conversation flow — calling handoffOff to turn bot ON");
          await handoffOff(booking!.id);
          setActionDone("Bot ligado!");
        } catch (err) {
          console.error("[BookingDrawer] handoffOff after assign failed:", err);
          setActionDone("Profissional atribuído, mas falha ao ligar bot.");
        }
      } else {
        setActionDone("Profissional atribuído!");
      }

      // Invalidate and refetch so the drawer updates status/bot badge/notes
      queryClient.invalidateQueries({ queryKey: ["booking-requests"] });
      queryClient.invalidateQueries({ queryKey: ["booking-requests-updated"] });
      queryClient.invalidateQueries({ queryKey: ["booking-request-detail-bot", booking!.id] });
      
      if (wasCancelFlow) {
        queryClient.setQueriesData<any>({ queryKey: ["booking-requests"] }, (old: any) => {
          if (!old?.results) return old;
          return {
            ...old,
            results: old.results.map((b: any) =>
              b.id === booking!.id ? { ...b, ...(result ?? {}), status: "failed", booking_mode: "handoff_manual", conversation_bot_mode: "off" } : b
            ),
          };
        });
        queryClient.setQueriesData<any>({ queryKey: ["booking-requests-updated"] }, (old: any) => {
          if (!old?.results) return old;
          return {
            ...old,
            results: old.results.map((b: any) =>
              b.id === booking!.id ? { ...b, ...(result ?? {}), status: "failed", booking_mode: "handoff_manual", conversation_bot_mode: "off" } : b
            ),
          };
        });
        queryClient.setQueryData(["booking-request-detail-bot", booking!.id], (old: any) => ({
          ...(old ?? booking),
          ...(result ?? {}),
          status: "failed",
          booking_mode: "handoff_manual",
          conversation_bot_mode: "off",
        }));
        await refetchBookingDetailForBot();
        setTimeout(() => {
          onConfirmed();
          setActionDone(null);
        }, 1200);
      } else {
        await refetchBookingDetailForBot();
        setTimeout(() => {
          onConfirmed();
          setActionDone(null);
        }, 1200);
      }
    },
    onError: (err: any) => {
      const status = err?.response?.status;
      const data = err?.response?.data;
      const contentType = String(err?.response?.headers?.["content-type"] ?? "").toLowerCase();
      const isHtml = contentType.includes("text/html") || (typeof data === "string" && data.trim().toLowerCase().startsWith("<!doctype"));
      
      console.error("[BookingDrawer] ASSIGN ERROR:", JSON.stringify({ status, data, contentType }, null, 2));
      
      let msg = "Erro ao atribuir profissional";
      if (isHtml) {
        msg = `Erro ${status || ""} — túnel retornou HTML. Tente novamente.`;
      } else if (data) {
        const detail = data?.detail || data?.error || data?.message || data?.code || (typeof data === "string" ? data : "");
        if (detail) msg = `Erro: ${detail}`;
        else msg = `Erro ${status || "desconhecido"} ao atribuir`;
      } else if (err?.message) {
        msg = err.message;
      }
      
      toast.error(msg);
      setActionDone(msg);
      setTimeout(() => setActionDone(null), 4000);
    },
  });

  const makeMutation = (fn: () => Promise<void>, successMsg: string) => ({
    mutationFn: fn,
    onSuccess: async () => {
      setActionDone(successMsg);
      await refetchBookingDetailForBot();
      setTimeout(() => {
        onConfirmed();
        if (successMsg === "Confirmado!" || successMsg === "Cancelado!") onClose();
        setActionDone(null);
      }, 1800);
    },
    onError: (err: any) => {
      const status = err?.response?.status;
      const data = err?.response?.data;
      const raw = typeof data === "string" ? data : (data?.code || data?.detail || data?.error || "");
      const rawStr = raw?.toString() || "";
      const isDuplicate = status === 409 || rawStr.includes("duplicate key") || rawStr.includes("uniq_confirmed") || rawStr.includes("already exists");
      const msg = isDuplicate
        ? "Esse horário já está confirmado para este profissional. Escolha outro horário."
        : (typeof data === "string" && data.length > 200) || rawStr.includes("<!") 
          ? "Erro ao processar a ação. Tente novamente."
          : (data?.detail || data?.error || "Erro ao confirmar.");
      toast.error(msg);
      setActionDone(null);
    },
  });

  const confirmMut = useMutation(
    makeMutation(
      () =>
        confirmBooking(booking!.id, {
          use_chosen_slot: !!(booking?.vars_snapshot?.chosen_slot || booking?.chosen_slot),
          notes: "Confirmado via Dashboard PrismIA",
        }),
      "Confirmado!"
    )
  );

  const cancelMut = useMutation(
    makeMutation(() => cancelBooking(booking!.id), "Cancelado!")
  );

  // Cancel a confirmed booking: reopen first, then cancel
  const cancelConfirmedMut = useMutation({
    mutationFn: async () => {
      // Step 1: try reopen (moves from confirmed → handoff)
      try {
        await reopenBooking(booking!.id);
        await new Promise(r => setTimeout(r, 500));
      } catch (reopenErr: any) {
        // If reopen fails (e.g. duplicate key / integrity error), proceed to cancel anyway
        console.warn("[cancelConfirmedMut] reopen failed, attempting cancel directly:", reopenErr?.response?.status);
      }
      // Step 2: cancel
      await cancelBooking(booking!.id);
    },
    onSuccess: async () => {
      setActionDone("Agendamento cancelado!");
      queryClient.invalidateQueries({ queryKey: ["booking-requests"] });
      await refetchBookingDetailForBot();
      setTimeout(() => {
        onConfirmed();
        onClose();
        setActionDone(null);
      }, 1800);
    },
    onError: (err: any) => {
      console.error("[cancelConfirmedMut] error:", err?.response?.status, JSON.stringify(err?.response?.data)?.substring(0, 300));
      // If reopen succeeded but cancel failed, at least refresh to show new status
      queryClient.invalidateQueries({ queryKey: ["booking-requests"] });
      refetchBookingDetailForBot();
      const data = err?.response?.data;
      const detail = typeof data === "object" ? (data?.detail || data?.error) : null;
      toast.error(typeof detail === "string" ? detail : "Erro ao cancelar agendamento. O booking foi reaberto.");
      setActionDone(null);
    },
  });

  const reopenMut = useMutation({
    mutationFn: () => reopenBooking(booking!.id),
    onMutate: async () => {
      // Optimistic: update cached booking list so status changes instantly
      await queryClient.cancelQueries({ queryKey: ["booking-requests"] });
      queryClient.setQueriesData<any>({ queryKey: ["booking-requests"] }, (old: any) => {
        if (!old?.results) return old;
        return {
          ...old,
          results: old.results.map((b: any) =>
            b.id === booking!.id ? { ...b, status: "handoff" } : b
          ),
        };
      });
      // Also update the detail query used for bot status
      queryClient.setQueryData(["booking-request-detail-bot", booking!.id], (old: any) =>
        old ? { ...old, status: "handoff" } : old
      );
    },
    onSuccess: async () => {
      setActionDone("Reaberto!");
      await refetchBookingDetailForBot();
      queryClient.invalidateQueries({ queryKey: ["booking-requests"] });
      setTimeout(() => {
        onConfirmed();
        setActionDone(null);
      }, 1200);
    },
  });

  const handoffOnMut = useMutation(
    makeMutation(() => handoffOn(booking!.id), "Handoff ativado!")
  );

  const handoffOffMut = useMutation(
    makeMutation(() => handoffOff(booking!.id), "Conversa encerrada — Bot ON!")
  );

  const suggestMut = useMutation(
    makeMutation(
      () => suggestSlots(booking!.id),
      "Sugestões enviadas!"
    )
  );

  // ── IA Enabled • Fluxo Agendar ────────────────────────────────────────────
  // Estados locais para o sub-fluxo de agendamento manual quando IA está ativa.
  type ScheduleStep = "form" | "choosing-slot";
  const [scheduleStep, setScheduleStep] = useState<ScheduleStep>("form");
  const [scheduleSlots, setScheduleSlots] = useState<Array<{ start_at: string; label: string }>>([]);
  const [pickingSlotIdx, setPickingSlotIdx] = useState<number | null>(null);

  // Reset schedule sub-flow when booking changes or tab changes
  useEffect(() => {
    setScheduleStep("form");
    setScheduleSlots([]);
    setPickingSlotIdx(null);
  }, [booking?.id, iaOpType]);

  const scheduleSuggestMut = useMutation({
    mutationFn: async () => {
      if (!booking) throw new Error("Sem agendamento aberto");
      const effLeadName = (assignLeadName || autofillLeadName).trim();
      const effProcedureId = effectiveProcedureId;
      const effProfessionalId = effectiveProfessionalId;
      if (!effLeadName) throw new Error("Informe o nome do cliente");
      if (!scheduleReason.trim()) throw new Error("Informe o motivo");
      if (!effProcedureId) throw new Error("Selecione o procedimento");

      setScheduleLog([]);
      const profNameForLog = effProfessionalId
        ? (professionals.find((p) => p.id === effProfessionalId)?.name ?? `#${effProfessionalId}`)
        : null;
      pushScheduleLog({
        label: "Buscando horários disponíveis…",
        status: "info",
        detail: profNameForLog
          ? `Profissional: ${profNameForLog}`
          : "Sem preferência de profissional",
      });

      // 1) PATCH na BR — coloca em "slots enviados pelo dashboard" e preserva o histórico existente.
      const existingVars = ((booking as any)?.vars_snapshot ?? {}) as Record<string, unknown>;
      const existingNotesRaw = (((bookingDetailForBot as any)?.notes ?? (booking as any)?.notes ?? "") as string).trim();
      const now = new Date();
      const ts = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const operatorName =
        (user?.first_name && `${user.first_name}${user.last_name ? " " + user.last_name : ""}`.trim()) ||
        user?.name ||
        user?.username ||
        "Operador";

      const selectedProc = effProcedureId ? allProcedures.find((p) => p.id === effProcedureId) : undefined;
      const procedureName = selectedProc?.name ?? booking.procedure_name ?? "";
      const procedureSlug = selectedProc?.slug ?? "";
      const profName = effProfessionalId
        ? (professionals.find((p) => p.id === effProfessionalId)?.name ?? "")
        : "Sem preferência";
      // Monta evento ai_events e faz merge com bloco existente (preserva ai_handoff prévio).
      const manualEvent = {
        type: "manual_schedule",
        ts: now.toISOString(),
        actor: "human",
        actor_name: operatorName,
        br_id: booking.id,
        procedure_slug: procedureSlug || undefined,
        procedure_name: procedureName || undefined,
        professional_id: effProfessionalId ?? undefined,
        professional_name: profName || undefined,
        unit: booking.unit_name || undefined,
        policy: "manual_dashboard",
        reason: scheduleReason.trim(),
      };
      const updatedNotes = appendManualAiEvent(existingNotesRaw, manualEvent);
      const procedureCode = procedureSlug || resolvedUnitProcId || "";
      console.log("[scheduleSuggestMut] PROCEDURE DEBUG:", {
        effProcedureId,
        nameFromAPI: selectedProc?.name,
        slugFromAPI: selectedProc?.slug,
        resolvedUnitProcId,
        effectiveProcedureCode: procedureCode,
        fullProcedureObject: selectedProc,
        bookingCurrentName: booking.procedure_name,
        finalNameToSend: procedureName,
      });
      const unitName = booking.unit_name ?? "";
      const selectedProfName = effProfessionalId
        ? (professionals.find((p) => p.id === effProfessionalId)?.name ?? "")
        : "";
      if (procedureName.trim()) rememberBookingProcedureNameOverride(booking.id, procedureName);

      // PATCH 1a: envia a FK `procedure` + `procedure_code` resolvido pela relação
      // unidade↔procedimento para o backend manter o contexto correto.
      // Também limpa flags de handoff/intent que forçam "Falar com atendente".
      const cleanedVars = { ...existingVars };
      delete (cleanedVars as any).intent;
      delete (cleanedVars as any).decision;
      delete (cleanedVars as any).reason_code;
      delete (cleanedVars as any).suggested_next_action;
      delete (cleanedVars as any).booking_target_resolved;
      delete (cleanedVars as any).context_resolution_mode;
      delete (cleanedVars as any).target_br_id;
      delete (cleanedVars as any).target_br_display_label;
      delete (cleanedVars as any).has_open_br;
      delete (cleanedVars as any).incoming_text;
      delete (cleanedVars as any).no_progress_attempts;
      delete (cleanedVars as any).confidence;

      const patch1: Record<string, unknown> = {
        lead_name: effLeadName,
        procedure: effProcedureId,
        procedure_name: procedureName,
        unit_name: unitName,
        booking_mode: "assisted_slots_dashboard",
        vars_snapshot: cleanedVars,
        notes: updatedNotes,
      };
      // Profissional é opcional: só envia se o usuário escolheu um.
      // Sem profissional → suggest_slots roda só com unidade + procedimento
      // e o cliente decide depois (slot carrega o profissional correspondente).
      if (effProfessionalId) {
        patch1.professional = effProfessionalId;
      }
      if (procedureCode) patch1.procedure_code = procedureCode;
      const resolvedSpecialty = selectedSpecialtyId ?? autoSpecialtyId;
      if (resolvedSpecialty) patch1.specialty = resolvedSpecialty;
      console.log("[scheduleSuggestMut] disparando PATCH 1a... payload:", JSON.stringify(patch1));
      try {
        const patch1aResult = await patchBooking(booking.id, patch1);
        console.log("[scheduleSuggestMut] PATCH 1a OK - resposta:", {
          returnedProcedureName: (patch1aResult as any)?.procedure_name,
          returnedProcedureFK: (patch1aResult as any)?.procedure,
          returnedLeadName: (patch1aResult as any)?.lead_name,
          fullResult: patch1aResult,
        });
      } catch (err: any) {
        console.error("[scheduleSuggestMut] PATCH 1a FALHOU:", {
          message: err?.message,
          status: err?.response?.status,
          data: err?.response?.data,
          headers: err?.response?.headers,
          stack: err?.stack,
        });
        pushScheduleLog({
          label: "Não foi possível preparar o agendamento",
          status: "error",
          detail: "Tente novamente em instantes.",
        });
        throw err;
      }

      // Confirma a persistência do PATCH 1 antes de disparar o suggest_slots.
      // Isso evita seguir o fluxo enquanto o backend ainda não refletiu o modo
      // "assisted_slots_dashboard" na BR.
      const detailAfterPatch1 = await fetchBookingRequestById(booking.id);
      console.log("[scheduleSuggestMut] BR after PATCH 1:", {
        id: detailAfterPatch1?.id,
        booking_mode: detailAfterPatch1?.booking_mode,
        procedure: (detailAfterPatch1 as any)?.procedure,
        procedure_name: detailAfterPatch1?.procedure_name,
      });
      if (detailAfterPatch1?.booking_mode !== "assisted_slots_dashboard") {
        pushScheduleLog({
          label: "Não foi possível preparar o agendamento",
          status: "error",
          detail: "Tente novamente em instantes.",
        });
        throw new Error("O BR não entrou em 'Slots disparados pelo dashboard' antes do suggest_slots.");
      }

      // 2) Solicita slots ao backend.
      // Se há profissional escolhido → envia procedure + unit + professional.
      // Sem profissional → envia só procedure + unit (backend retorna slots de vários profissionais).
      const suggestPayload: Record<string, unknown> = {};
      if (effProcedureId) suggestPayload.procedure = effProcedureId;
      if (procedureCode) suggestPayload.procedure_code = procedureCode;
      if (bookingUnitId) suggestPayload.unit = bookingUnitId;
      if (effProfessionalId) suggestPayload.professional = effProfessionalId;
      console.log("[scheduleSuggestMut] suggest_slots payload:", JSON.stringify(suggestPayload));
      let suggestResponse: any;
      try {
        suggestResponse = await suggestSlots(booking.id, suggestPayload as any);
        console.log("[scheduleSuggestMut] suggest_slots response:", suggestResponse);
      } catch (err: any) {
        const status = err?.response?.status;
        const data = err?.response?.data;
        const detail =
          (typeof data === "string" ? data : null) ??
          data?.detail ??
          data?.error ??
          data?.message ??
          JSON.stringify(data ?? {});
        console.error("[scheduleSuggestMut] suggest_slots FAILED", { status, data, payload: suggestPayload });
        pushScheduleLog({
          label: "Sem disponibilidade de horários",
          status: "warning",
          detail: effProfessionalId
            ? "Não encontramos disponibilidade para esse profissional. Tente outro ou deixe sem preferência."
            : "Não encontramos disponibilidade no momento.",
        });
        throw new Error(`suggest_slots ${status ?? "?"}: ${String(detail).slice(0, 300)}`);
      }

      // 3) Rebusca a BR após o envio dos slots
      const detailAfterSuggest = await fetchBookingRequestById(booking.id);
      console.log("[scheduleSuggestMut] BR after suggest:", {
        id: detailAfterSuggest?.id,
        status: detailAfterSuggest?.status,
        booking_mode: detailAfterSuggest?.booking_mode,
        offer_slots_count: Array.isArray(detailAfterSuggest?.offer_slots) ? detailAfterSuggest.offer_slots.length : 0,
      });
      const offerCount = Array.isArray(detailAfterSuggest?.offer_slots) ? detailAfterSuggest.offer_slots.length : 0;
      pushScheduleLog({
        label: offerCount > 0 ? "Horários encontrados" : "Sem horários disponíveis",
        status: offerCount > 0 ? "success" : "warning",
        detail: offerCount > 0
          ? `${offerCount} ${offerCount === 1 ? "horário será oferecido" : "horários serão oferecidos"} ao cliente`
          : "O bot vai conversar com o cliente para entender melhor",
      });

      // 4) PATCH na BR — coloca em automático (bot assume) e reforça os campos de procedimento
      // Tenta inferir profissional/professional_unit a partir dos slots devolvidos pelo backend.
      const offerSlotsRaw =
        (Array.isArray(detailAfterSuggest?.offer_slots) ? detailAfterSuggest.offer_slots : null) ??
        (Array.isArray((suggestResponse as any)?.offer_slots) ? (suggestResponse as any).offer_slots : null) ??
        (Array.isArray((suggestResponse as any)?.result?.offer_slots) ? (suggestResponse as any).result.offer_slots : null) ??
        [];
      const slotProfIds = Array.from(
        new Set(
          offerSlotsRaw
            .map((s: any) => Number(s?.professional_id))
            .filter((n: number) => Number.isFinite(n) && n > 0)
        )
      );
      const slotProfUnitIds = Array.from(
        new Set(
          offerSlotsRaw
            .map((s: any) => Number(s?.professional_unit_id))
            .filter((n: number) => Number.isFinite(n) && n > 0)
        )
      );
      const inferredProfessionalId =
        effProfessionalId ??
        (slotProfIds.length === 1 ? (slotProfIds[0] as number) : null);
      const inferredProfessionalUnitId =
        slotProfUnitIds.length === 1 ? (slotProfUnitIds[0] as number) : null;

      const patch2: Record<string, unknown> = {
        lead_name: effLeadName || detailAfterSuggest?.lead_name || booking.lead_name,
        booking_mode: "auto_slots_bot",
        conversation_bot_mode: "on",
        procedure_name: procedureName || detailAfterSuggest?.procedure_name || booking.procedure_name,
        unit_name: detailAfterSuggest?.unit_name || unitName,
        vars_snapshot: (detailAfterSuggest as any)?.vars_snapshot ?? cleanedVars,
      };
      if (effProcedureId) patch2.procedure = effProcedureId;
      if (detailAfterSuggest?.status) patch2.status = detailAfterSuggest.status;
      if (procedureCode) patch2.procedure_code = procedureCode;
      if (profName) patch2.professional_name = profName;
      if (resolvedSpecialty) patch2.specialty = resolvedSpecialty;
      if (inferredProfessionalId || detailAfterSuggest?.professional_id) {
        patch2.professional = inferredProfessionalId ?? detailAfterSuggest.professional_id;
      }
      if (inferredProfessionalUnitId) patch2.professional_unit = inferredProfessionalUnitId;
      console.log("[scheduleSuggestMut] PATCH 2 (auto) payload:", JSON.stringify(patch2), {
        slotProfIds,
        slotProfUnitIds,
        inferredProfessionalId,
        inferredProfessionalUnitId,
      });
      await patchBooking(booking.id, patch2);

      // 5) Refetch detalhes — se o backend tiver mantido "Falar com atendente",
      // faz um PATCH corretivo final com o procedimento real selecionado.
      let detail = await fetchBookingRequestById(booking.id);
      if (detail?.booking_mode !== "auto_slots_bot") {
        const patch2Retry: Record<string, unknown> = {
          ...patch2,
          status: detail?.status ?? patch2.status ?? "awaiting_choice",
          vars_snapshot: (detail as any)?.vars_snapshot ?? patch2.vars_snapshot,
        };
        console.warn("[scheduleSuggestMut] PATCH 2 retrying auto transition:", JSON.stringify({
          actualMode: detail?.booking_mode,
          payload: patch2Retry,
        }));
        await patchBooking(booking.id, patch2Retry);
        detail = await fetchBookingRequestById(booking.id);
      }
      if (detail?.booking_mode !== "auto_slots_bot") {
        pushScheduleLog({
          label: "Não foi possível ativar o bot",
          status: "error",
          detail: "Os horários foram enviados, mas o bot não assumiu a conversa.",
        });
        throw new Error("Os slots foram enviados, mas o BR continuou em 'Slots disparados pelo dashboard'.");
      }
      if (procedureName && detail?.procedure_name?.trim() !== procedureName.trim()) {
        const patch3: Record<string, unknown> = {
          procedure_name: procedureName,
        };
        if (procedureCode) patch3.procedure_code = procedureCode;
        console.warn("[scheduleSuggestMut] PATCH 3 correcting procedure_name:", JSON.stringify({
          expected: procedureName,
          actual: detail?.procedure_name,
          payload: patch3,
        }));
        await patchBooking(booking.id, patch3);
        detail = await fetchBookingRequestById(booking.id);
      }
      const slotsFromDetail = (detail?.offer_slots ?? []) as Array<{ start_at: string; label: string }>;

      const slotsFromResponse =
        (Array.isArray((suggestResponse as any)?.offer_slots) ? (suggestResponse as any).offer_slots : null) ??
        (Array.isArray((suggestResponse as any)?.slots) ? (suggestResponse as any).slots : null) ??
        (Array.isArray((suggestResponse as any)?.result?.offer_slots) ? (suggestResponse as any).result.offer_slots : null);

      const finalSlots = slotsFromDetail.length > 0 ? slotsFromDetail : (slotsFromResponse ?? []);
      return finalSlots as Array<{ start_at: string; label: string }>;
    },
    onSuccess: async (slots) => {
      if (!slots || slots.length === 0) {
        // PATCH e suggest funcionaram, mas backend não devolveu slots —
        // ainda assim o bot vai conduzir. Avisa e fecha.
        toast.warning("Nenhum horário retornado, mas o bot foi acionado para conversar com o cliente.");
        pushScheduleLog({
          label: "Bot assumiu a conversa",
          status: "warning",
          detail: "Sem horários no momento — o bot vai conduzir o cliente.",
        });
      } else {
        toast.success(`Bot acionado — ${slots.length} horário(s) serão oferecidos ao cliente.`);
        pushScheduleLog({
          label: "Pronto! Bot assumiu a conversa",
          status: "success",
          detail: `${slots.length} ${slots.length === 1 ? "horário foi enviado" : "horários foram enviados"} ao cliente.`,
        });
      }
      setActionDone("Bot assumiu a conversa!");
      await refetchBookingDetailForBot();
      queryClient.invalidateQueries({ queryKey: ["booking-requests"] });
      queryClient.invalidateQueries({ queryKey: ["booking-requests-updated"] });
      setTimeout(() => {
        onConfirmed();
        onClose();
        setActionDone(null);
      }, 1500);
    },
    onError: (err: any) => {
      console.error("[scheduleSuggestMut] error:", err?.response?.status, err?.response?.data);
      // Mensagem amigável — detalhe técnico fica só no console.
      // Não dispara toast aqui: o painel "Status do agendamento" já mostra o resultado.
      setScheduleLog((prev) => {
        const last = prev[prev.length - 1];
        if (last?.status === "error" || last?.status === "warning") return prev;
        const now = new Date();
        const ts = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
        return [...prev, { ts, label: "Sem disponibilidade de horários", status: "warning", detail: "Não encontramos disponibilidade no momento." }];
      });
    },
  });

  // ── Checar disponibilidade (sem alterar o BR) ───────────────────────────────
  // Só consulta /api/booking/suggest-slots/ e mostra os horários no log,
  // sem disparar PATCH nem mudar booking_mode.
  const checkSlotsMut = useMutation({
    mutationFn: async () => {
      if (!selectedProcedureId) throw new Error("Selecione o procedimento");
      if (!bookingUnitId) throw new Error("Unidade indisponível");

      setScheduleLog([]);
      const profNameForLog = selectedProfessionalId
        ? (professionals.find((p) => p.id === selectedProfessionalId)?.name ?? `#${selectedProfessionalId}`)
        : null;
      pushScheduleLog({
        label: "Consultando horários disponíveis…",
        status: "info",
        detail: profNameForLog
          ? `Profissional: ${profNameForLog}`
          : "Sem preferência de profissional",
      });

      const params: Record<string, unknown> = {
        procedure: selectedProcedureId,
        unit: bookingUnitId,
        n: 3,
      };
      if (selectedProfessionalId) params.professional = selectedProfessionalId;

      const { data } = await api.get("/api/booking/suggest-slots/", { params });
      const slots: Array<{ start_at?: string; label?: string }> =
        (Array.isArray(data) ? data : (data?.results ?? data?.slots ?? data?.offer_slots ?? [])) as any;
      return slots ?? [];
    },
    onSuccess: (slots) => {
      if (!slots || slots.length === 0) {
        pushScheduleLog({
          label: "Sem disponibilidade no momento",
          status: "warning",
          detail: "Não encontramos horários para esse procedimento.",
        });
        return;
      }
      const formatSlot = (s: any) => {
        if (s?.label) return String(s.label);
        if (s?.start_at) {
          const d = new Date(s.start_at);
          if (!Number.isNaN(d.getTime())) {
            return d.toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            });
          }
          return String(s.start_at);
        }
        return JSON.stringify(s);
      };
      pushScheduleLog({
        label: `${slots.length} horário(s) encontrado(s)`,
        status: "success",
        detail: slots.map(formatSlot).join(" • "),
      });
    },
    onError: (err: any) => {
      console.error("[checkSlotsMut] error:", err?.response?.status, err?.response?.data);
      setScheduleLog((prev) => {
        const last = prev[prev.length - 1];
        if (last?.status === "error" || last?.status === "warning") return prev;
        const now = new Date();
        const ts = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
        return [...prev, { ts, label: "Sem disponibilidade no momento", status: "warning", detail: "Não encontramos horários para esse procedimento." }];
      });
    },
  });

  // ── Checar disponibilidade no contexto do REAGENDAMENTO ─────────────────────
  // Mesma chamada de /api/booking/suggest-slots/, mas escreve em rescheduleLog
  // (que é o log exibido no painel de Reagendamento).
  const checkRescheduleSlotsMut = useMutation({
    mutationFn: async () => {
      if (!selectedProcedureId) throw new Error("Selecione o procedimento");
      if (!bookingUnitId) throw new Error("Unidade indisponível");

      setRescheduleLog([]);
      const profNameForLog = selectedProfessionalId
        ? (professionals.find((p) => p.id === selectedProfessionalId)?.name ?? `#${selectedProfessionalId}`)
        : null;
      pushRescheduleLog({
        label: "Consultando horários disponíveis…",
        status: "info",
        detail: profNameForLog ? `Profissional: ${profNameForLog}` : "Sem preferência de profissional",
      });

      const params: Record<string, unknown> = {
        procedure: selectedProcedureId,
        unit: bookingUnitId,
        n: 3,
      };
      if (selectedProfessionalId) params.professional = selectedProfessionalId;

      const { data } = await api.get("/api/booking/suggest-slots/", { params });
      const slots: Array<{ start_at?: string; label?: string }> =
        (Array.isArray(data) ? data : (data?.results ?? data?.slots ?? data?.offer_slots ?? [])) as any;
      return slots ?? [];
    },
    onSuccess: (slots) => {
      if (!slots || slots.length === 0) {
        pushRescheduleLog({
          label: "Sem disponibilidade no momento",
          status: "warning",
          detail: "Não encontramos horários para esse procedimento.",
        });
        return;
      }
      const formatSlot = (s: any) => {
        if (s?.label) return String(s.label);
        if (s?.start_at) {
          const d = new Date(s.start_at);
          if (!Number.isNaN(d.getTime())) {
            return d.toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            });
          }
          return String(s.start_at);
        }
        return JSON.stringify(s);
      };
      pushRescheduleLog({
        label: `${slots.length} horário(s) encontrado(s)`,
        status: "success",
        detail: slots.map(formatSlot).join(" • "),
      });
    },
    onError: (err: any) => {
      console.error("[checkRescheduleSlotsMut] error:", err?.response?.status, err?.response?.data);
      pushRescheduleLog({
        label: "Sem disponibilidade no momento",
        status: "warning",
        detail: "Não encontramos horários para esse procedimento.",
      });
    },
  });

  const handleSearchClientBookings = async () => {
    if (!booking) return;
    setRescheduleSearchLoading(true);
    setRescheduleSearchError(null);
    setRescheduleSearchResults(null);

    const detail = bookingDetailForBot as any;
    const typedId = cancelBookingIdField.trim();
    const typedName = assignLeadName.trim();
    const activeStatuses = ["confirmed", "pending", "awaiting_choice", "handoff", "assisted"];
    const unitName = (detail?.unit_name ?? booking.unit_name ?? "").toString();
    const normalizeName = (value: string) =>
      (value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

    try {
      // ── Modo 1: busca por ID ─────────────────────────────────────────────
      if (typedId) {
        const idNum = Number(typedId);
        if (!Number.isFinite(idNum) || idNum <= 0) {
          setRescheduleSearchError("ID do agendamento inválido.");
          setRescheduleSearchResults([]);
          return;
        }
        if (idNum === booking.id) {
          setRescheduleSearchError("Este é o BR atual. Informe outro ID.");
          setRescheduleSearchResults([]);
          return;
        }
        try {
          const found = await fetchBookingRequestById(idNum);
          if (!found) {
            setRescheduleSearchError(`Nenhum agendamento encontrado com ID ${idNum}.`);
            setRescheduleSearchResults([]);
            return;
          }
          if (!activeStatuses.includes(found.status)) {
            setRescheduleSearchError(`BR #${idNum} não está ativo (status: ${found.status}).`);
            setRescheduleSearchResults([]);
            return;
          }
          const candidateUnit = normalizeName(found.unit_name ?? "");
          if (unitName && candidateUnit && candidateUnit !== normalizeName(unitName)) {
            setRescheduleSearchError(`BR #${idNum} pertence a outra unidade (${found.unit_name}).`);
            setRescheduleSearchResults([]);
            return;
          }
          console.log("[handleSearchClientBookings] busca por ID:", idNum, "→ ok");
          setRescheduleSearchResults([found]);
          return;
        } catch (err) {
          console.error("[handleSearchClientBookings] erro busca por ID:", err);
          setRescheduleSearchError(`Falha ao buscar BR #${idNum}.`);
          setRescheduleSearchResults([]);
          return;
        }
      }

      // ── Modo 2: busca somente por NOME ───────────────────────────────────
      if (typedName) {
        const results = await fetchBookingsByPhone("", {
          excludeId: booking.id,
          statuses: activeStatuses,
          leadName: typedName,
          unitName,
        });
        console.log("[handleSearchClientBookings] busca por nome:", typedName, "→", results.length);
        setRescheduleSearchResults(results);
        if (results.length === 0) {
          setRescheduleSearchError(`Nenhum agendamento ativo encontrado para "${typedName}".`);
        }
        return;
      }

      // ── Modo 3: padrão — telefone do BR atual ────────────────────────────
      let phone = (
        detail?.contact_phone ??
        detail?.phone ??
        (booking as any).contact_phone ??
        (booking as any).phone ??
        ""
      ).toString().trim();

      if (!phone) {
        const fetched = await fetchBookingPhoneById(booking.id);
        phone = (fetched ?? "").toString().trim();
      }

      if (!phone) {
        setRescheduleSearchError("Telefone do cliente indisponível neste BR.");
        setRescheduleSearchResults([]);
        return;
      }

      const results = await fetchBookingsByPhone(phone, {
        excludeId: booking.id,
        statuses: activeStatuses,
        leadName: (detail?.lead_name ?? booking.lead_name ?? "").toString(),
        unitName,
      });
      console.log("[handleSearchClientBookings] busca por telefone:", phone, "→", results.length);
      setRescheduleSearchResults(results);
      if (results.length === 0) {
        setRescheduleSearchError("Nenhum agendamento ativo encontrado para este cliente nesta unidade.");
      }
    } catch (err: any) {
      console.error("[handleSearchClientBookings] error:", err);
      setRescheduleSearchError("Falha ao buscar agendamentos. Tente novamente.");
      setRescheduleSearchResults([]);
    } finally {
      setRescheduleSearchLoading(false);
    }
  };

  const selectClientBookingForReschedule = (br: BookingRequest) => {
    setCancelBookingIdField(String(br.id));
    setSelectedClientBooking(br);

    const normalize = (value: string) =>
      (value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();

    // Autopreenche Profissional: tenta por ID; se vier 0/inexistente, tenta por nome
    let resolvedProfId: number | null = null;
    if (br.professional_id && professionals.some((p) => p.id === br.professional_id)) {
      resolvedProfId = br.professional_id;
    } else if (br.professional_name) {
      const target = normalize(br.professional_name);
      const matched =
        professionals.find((p) => normalize(p.name) === target) ??
        professionals.find((p) => normalize(p.name).includes(target) || target.includes(normalize(p.name)));
      if (matched) resolvedProfId = matched.id;
    }
    if (resolvedProfId) setSelectedProfessionalId(resolvedProfId);

    // Autopreenche Procedimento: match exato → match parcial (acento/case-insensitive)
    const procTarget = normalize(br.procedure_name ?? "");
    let matchedProc =
      allProcedures.find((p) => normalize(p.name ?? "") === procTarget) ??
      allProcedures.find((p) => procTarget && (
        normalize(p.name ?? "").includes(procTarget) || procTarget.includes(normalize(p.name ?? ""))
      ));
    if (matchedProc) setSelectedProcedureId(matchedProc.id);

    if (br.lead_name && !assignLeadName.trim()) setAssignLeadName(br.lead_name);

    console.log("[selectClientBookingForReschedule] BR", br.id, "→ profId:", resolvedProfId, "procId:", matchedProc?.id, {
      brProfId: br.professional_id,
      brProfName: br.professional_name,
      brProcName: br.procedure_name,
      profsCount: professionals.length,
      procsCount: allProcedures.length,
    });

    setRescheduleSearchResults(null);
  };

  // ── Reagendamento manual: cancela BR antigo + PATCH atual + suggest_slots + bot ON ──
  const rescheduleSuggestMut = useMutation({
    mutationFn: async () => {
      if (!booking) throw new Error("Sem agendamento aberto");
      const targetIdRaw = cancelBookingIdField.trim();
      const targetId = Number(targetIdRaw);
      if (!targetId || Number.isNaN(targetId)) throw new Error("Informe o ID do agendamento a reagendar");
      if (!assignLeadName.trim()) throw new Error("Informe o nome do cliente");
      if (!selectedProfessionalId) throw new Error("Selecione o profissional");
      if (!selectedProcedureId) throw new Error("Selecione o procedimento");

      setRescheduleLog([]);
      const profName = professionals.find((p) => p.id === selectedProfessionalId)?.name ?? `#${selectedProfessionalId}`;
      const selectedProc = allProcedures.find((p) => p.id === selectedProcedureId);
      const procedureName = selectedProc?.name ?? booking.procedure_name ?? "";
      const procedureSlug = selectedProc?.slug ?? "";
      const procedureCode = procedureSlug || resolvedUnitProcId || "";

      // 1) Cancela o BR antigo
      pushRescheduleLog({ label: `Cancelando agendamento #${targetId}…`, status: "info" });
      try {
        await cancelBooking(targetId);
        pushRescheduleLog({ label: `Agendamento #${targetId} cancelado`, status: "success" });
      } catch (err: any) {
        const status = err?.response?.status;
        // 404 → já cancelado; segue
        if (status === 404) {
          pushRescheduleLog({ label: `Agendamento #${targetId} já estava cancelado`, status: "warning" });
        } else {
          pushRescheduleLog({
            label: "Não foi possível cancelar o agendamento antigo",
            status: "error",
            detail: `Status ${status ?? "?"}`,
          });
          throw err;
        }
      }

      // 1b) Loga manual_cancel na BR antiga para rastreabilidade
      const operatorNameForLog =
        (user?.first_name && `${user.first_name}${user.last_name ? " " + user.last_name : ""}`.trim()) ||
        user?.name ||
        user?.username ||
        "Operador";
      await logManualCancelOnTargetBR(targetId, {
        type: "manual_cancel",
        ts: new Date().toISOString(),
        actor: "human",
        actor_name: operatorNameForLog,
        br_id: targetId,
        replaced_by_br_id: booking.id,
        unit: booking.unit_name || undefined,
        policy: "manual_dashboard",
        reason: `Cancelado para reagendamento (nova BR #${booking.id})`,
      });

      // 2) PATCH no BR atual → modo "slots disparados pelo dashboard"
      const existingVars = ((booking as any)?.vars_snapshot ?? {}) as Record<string, unknown>;
      const cleanedVars = { ...existingVars };
      delete (cleanedVars as any).intent;
      delete (cleanedVars as any).decision;
      delete (cleanedVars as any).reason_code;
      delete (cleanedVars as any).suggested_next_action;
      delete (cleanedVars as any).booking_target_resolved;
      delete (cleanedVars as any).context_resolution_mode;
      delete (cleanedVars as any).target_br_id;
      delete (cleanedVars as any).target_br_display_label;
      delete (cleanedVars as any).has_open_br;
      delete (cleanedVars as any).incoming_text;
      delete (cleanedVars as any).no_progress_attempts;
      delete (cleanedVars as any).confidence;

      const existingNotesRaw = (((bookingDetailForBot as any)?.notes ?? (booking as any)?.notes ?? "") as string).trim();
      const now = new Date();
      const ts = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const operatorName =
        (user?.first_name && `${user.first_name}${user.last_name ? " " + user.last_name : ""}`.trim()) ||
        user?.name ||
        user?.username ||
        "Operador";
      const manualEvent = {
        type: "manual_reschedule",
        ts: now.toISOString(),
        actor: "human",
        actor_name: operatorName,
        br_id: booking.id,
        cancelled_br_id: targetId,
        procedure_slug: procedureSlug || undefined,
        procedure_name: procedureName || undefined,
        professional_id: selectedProfessionalId ?? undefined,
        professional_name: profName || undefined,
        unit: booking.unit_name || undefined,
        policy: "manual_dashboard",
        reason: assignLeadName.trim() ? `Solicitado por ${assignLeadName.trim()}` : "Reagendamento manual",
      };
      const updatedNotes = appendManualAiEvent(existingNotesRaw, manualEvent);

      if (procedureName.trim()) rememberBookingProcedureNameOverride(booking.id, procedureName);

      const patch1: Record<string, unknown> = {
        lead_name: assignLeadName.trim(),
        professional: selectedProfessionalId,
        procedure: selectedProcedureId,
        procedure_name: procedureName,
        unit_name: booking.unit_name ?? "",
        booking_mode: "assisted_slots_dashboard",
        vars_snapshot: cleanedVars,
        notes: updatedNotes,
      };
      if (procedureCode) patch1.procedure_code = procedureCode;
      const resolvedSpecialty = selectedSpecialtyId ?? autoSpecialtyId;
      if (resolvedSpecialty) patch1.specialty = resolvedSpecialty;

      pushRescheduleLog({ label: "Preparando agendamento…", status: "info", detail: `Profissional: ${profName} · ${procedureName}` });
      try {
        await patchBooking(booking.id, patch1);
      } catch (err: any) {
        pushRescheduleLog({ label: "Falha ao preparar o reagendamento", status: "error" });
        throw err;
      }

      const detailAfterPatch1 = await fetchBookingRequestById(booking.id);
      if (detailAfterPatch1?.booking_mode !== "assisted_slots_dashboard") {
        pushRescheduleLog({ label: "Não foi possível preparar o reagendamento", status: "error" });
        throw new Error("BR não entrou em assisted_slots_dashboard");
      }

      // 3) suggest_slots
      pushRescheduleLog({ label: "Buscando horários disponíveis…", status: "info" });
      const suggestPayload: Record<string, unknown> = {
        procedure: selectedProcedureId,
        professional: selectedProfessionalId,
      };
      if (procedureCode) suggestPayload.procedure_code = procedureCode;
      if (bookingUnitId) suggestPayload.unit = bookingUnitId;

      let suggestResponse: any;
      try {
        suggestResponse = await suggestSlots(booking.id, suggestPayload as any);
      } catch (err: any) {
        const status = err?.response?.status;
        pushRescheduleLog({
          label: "Sem disponibilidade de horários",
          status: "warning",
          detail: "Tente outro profissional ou procedimento.",
        });
        throw new Error(`suggest_slots ${status ?? "?"}`);
      }

      const detailAfterSuggest = await fetchBookingRequestById(booking.id);
      const offerCount = Array.isArray(detailAfterSuggest?.offer_slots) ? detailAfterSuggest.offer_slots.length : 0;
      pushRescheduleLog({
        label: offerCount > 0 ? "Horários encontrados" : "Sem horários disponíveis",
        status: offerCount > 0 ? "success" : "warning",
        detail: offerCount > 0
          ? `${offerCount} ${offerCount === 1 ? "horário será oferecido" : "horários serão oferecidos"} ao cliente`
          : "O bot vai conversar com o cliente para entender melhor",
      });

      // 4) PATCH 2 → volta para auto_slots_bot (IA assume)
      const offerSlotsRaw =
        (Array.isArray(detailAfterSuggest?.offer_slots) ? detailAfterSuggest.offer_slots : null) ??
        (Array.isArray((suggestResponse as any)?.offer_slots) ? (suggestResponse as any).offer_slots : null) ??
        [];
      const slotProfUnitIds = Array.from(
        new Set(
          offerSlotsRaw
            .map((s: any) => Number(s?.professional_unit_id))
            .filter((n: number) => Number.isFinite(n) && n > 0)
        )
      );
      const inferredProfessionalUnitId = slotProfUnitIds.length === 1 ? (slotProfUnitIds[0] as number) : null;

      const patch2: Record<string, unknown> = {
        lead_name: assignLeadName.trim() || detailAfterSuggest?.lead_name || booking.lead_name,
        booking_mode: "auto_slots_bot",
        conversation_bot_mode: "on",
        procedure: selectedProcedureId,
        procedure_name: procedureName || detailAfterSuggest?.procedure_name || booking.procedure_name,
        unit_name: detailAfterSuggest?.unit_name || booking.unit_name || "",
        professional: selectedProfessionalId,
        professional_name: profName,
        vars_snapshot: (detailAfterSuggest as any)?.vars_snapshot ?? cleanedVars,
      };
      if (detailAfterSuggest?.status) patch2.status = detailAfterSuggest.status;
      if (procedureCode) patch2.procedure_code = procedureCode;
      if (resolvedSpecialty) patch2.specialty = resolvedSpecialty;
      if (inferredProfessionalUnitId) patch2.professional_unit = inferredProfessionalUnitId;

      try {
        await patchBooking(booking.id, patch2);
      } catch (err) {
        console.warn("[rescheduleSuggestMut] PATCH 2 (auto) falhou, tentando handoffOff:", err);
      }

      // 5) Garante bot ON via handoffOff
      try {
        await handoffOff(booking.id);
      } catch (err) {
        console.warn("[rescheduleSuggestMut] handoffOff falhou (pode já estar ligado):", err);
      }

      const detailFinal = await fetchBookingRequestById(booking.id);
      const finalSlots = (detailFinal?.offer_slots ?? []) as Array<{ start_at: string; label: string }>;
      return { slots: finalSlots, cancelledId: targetId };
    },
    onSuccess: async ({ slots, cancelledId }) => {
      const count = slots?.length ?? 0;
      if (count === 0) {
        toast.warning(`Agendamento #${cancelledId} cancelado. Bot acionado, mas sem horários no momento.`);
        pushRescheduleLog({
          label: "Bot assumiu a conversa",
          status: "warning",
          detail: "Sem horários — o bot vai conduzir o cliente.",
        });
      } else {
        toast.success(`Reagendamento iniciado — ${count} horário(s) serão oferecidos ao cliente.`);
        pushRescheduleLog({
          label: "Pronto! Bot assumiu o reagendamento",
          status: "success",
          detail: `${count} ${count === 1 ? "horário foi enviado" : "horários foram enviados"} ao cliente.`,
        });
      }
      cancelledBookingCache.set(booking!.id, { cancelledId: String(cancelledId), botOff: false });
      setActionDone(`Agenda #${cancelledId} cancelada e bot reagendando!`);
      await refetchBookingDetailForBot();
      queryClient.invalidateQueries({ queryKey: ["booking-requests"] });
      queryClient.invalidateQueries({ queryKey: ["booking-requests-updated"] });
      setTimeout(() => {
        onConfirmed();
        onClose();
        setActionDone(null);
      }, 1800);
    },
    onError: (err: any) => {
      console.error("[rescheduleSuggestMut] error:", err?.response?.status, err?.response?.data);
      setRescheduleLog((prev) => {
        const last = prev[prev.length - 1];
        if (last?.status === "error" || last?.status === "warning") return prev;
        const now = new Date();
        const ts = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
        return [...prev, { ts, label: "Falha no reagendamento", status: "error", detail: err?.message ?? "Erro inesperado" }];
      });
    },
  });

  // ── Cancelamento manual (IA Ativa › Cancelamento): cancela BR alvo + bot OFF + log no BR atual ──
  const iaCancelMut = useMutation({
    mutationFn: async () => {
      if (!booking) throw new Error("Sem agendamento aberto");
      const targetIdRaw = cancelBookingIdField.trim();
      const targetId = Number(targetIdRaw);
      if (!targetId || Number.isNaN(targetId)) throw new Error("Informe o ID do agendamento a cancelar");
      if (!assignLeadName.trim()) throw new Error("Informe o nome do cliente");

      setRescheduleLog([]);

      // 1) Cancela o BR alvo
      pushRescheduleLog({ label: `Cancelando agendamento #${targetId}…`, status: "info" });
      try {
        await cancelBooking(targetId);
        pushRescheduleLog({ label: `Agendamento #${targetId} cancelado`, status: "success" });
      } catch (err: any) {
        const status = err?.response?.status;
        if (status === 404) {
          pushRescheduleLog({ label: `Agendamento #${targetId} já estava cancelado`, status: "warning" });
        } else {
          pushRescheduleLog({
            label: "Não foi possível cancelar o agendamento",
            status: "error",
            detail: `Status ${status ?? "?"}`,
          });
          throw err;
        }
      }

      // 2) Bot OFF no BR atual (operador assume)
      try {
        await handoffOn(booking.id);
      } catch (err) {
        console.warn("[iaCancelMut] handoffOn falhou (pode já estar off):", err);
      }

      // 3) Loga no BR atual
      const now = new Date();
      const ts = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const operatorName =
        (user?.first_name && `${user.first_name}${user.last_name ? " " + user.last_name : ""}`.trim()) ||
        user?.name ||
        user?.username ||
        "Operador";
      const existingNotesRaw = (((bookingDetailForBot as any)?.notes ?? (booking as any)?.notes ?? "") as string).trim();
      const manualEvent = {
        type: "manual_cancel",
        ts: now.toISOString(),
        actor: "human",
        actor_name: operatorName,
        br_id: booking.id,
        cancelled_br_id: targetId,
        unit: booking.unit_name || undefined,
        policy: "manual_dashboard",
        reason: assignLeadName.trim() ? `Solicitado por ${assignLeadName.trim()}` : "Cancelamento manual",
      };
      const updatedNotes = appendManualAiEvent(existingNotesRaw, manualEvent);

      // Loga manual_cancel também na BR cancelada (rastreabilidade do lado da vítima)
      await logManualCancelOnTargetBR(targetId, {
        type: "manual_cancel",
        ts: now.toISOString(),
        actor: "human",
        actor_name: operatorName,
        br_id: targetId,
        cancelled_from_br_id: booking.id,
        unit: booking.unit_name || undefined,
        policy: "manual_dashboard",
        reason: assignLeadName.trim() ? `Cancelado por ${operatorName} a pedido de ${assignLeadName.trim()}` : "Cancelamento manual via Dashboard",
      });

      try {
        await patchBooking(booking.id, {
          lead_name: assignLeadName.trim() || booking.lead_name,
          notes: updatedNotes,
          conversation_bot_mode: "off",
          booking_mode: "handoff_manual",
          status: "failed",
          allow_terminal_status_via_patch: true,
        });
      } catch (err) {
        console.warn("[iaCancelMut] patch de log/status falhou:", err);
      }

      return { cancelledId: targetId };
    },
    onSuccess: async ({ cancelledId }) => {
      toast.success(`Agendamento #${cancelledId} cancelado.`);
      pushRescheduleLog({
        label: "Cancelamento concluído",
        status: "success",
        detail: `Agendamento #${cancelledId} foi cancelado e o bot foi desligado.`,
      });
      cancelledBookingCache.set(booking!.id, { cancelledId: String(cancelledId), botOff: true });
      setActionDone(`Agenda #${cancelledId} cancelada!`);
      queryClient.setQueriesData<any>({ queryKey: ["booking-requests"] }, (old: any) => {
        if (!old?.results) return old;
        return {
          ...old,
          results: old.results.map((b: any) =>
            b.id === booking!.id ? { ...b, status: "failed", booking_mode: "handoff_manual", conversation_bot_mode: "off" } : b
          ),
        };
      });
      queryClient.setQueriesData<any>({ queryKey: ["booking-requests-updated"] }, (old: any) => {
        if (!old?.results) return old;
        return {
          ...old,
          results: old.results.map((b: any) =>
            b.id === booking!.id ? { ...b, status: "failed", booking_mode: "handoff_manual", conversation_bot_mode: "off" } : b
          ),
        };
      });
      queryClient.setQueryData(["booking-request-detail-bot", booking!.id], (old: any) => ({
        ...(old ?? booking),
        status: "failed",
        booking_mode: "handoff_manual",
        conversation_bot_mode: "off",
      }));
      await refetchBookingDetailForBot();
      queryClient.invalidateQueries({ queryKey: ["booking-requests"] });
      queryClient.invalidateQueries({ queryKey: ["booking-requests-updated"] });
      setTimeout(() => {
        onConfirmed();
        onClose();
        setActionDone(null);
      }, 1800);
    },
    onError: (err: any) => {
      console.error("[iaCancelMut] error:", err?.response?.status, err?.response?.data);
      setRescheduleLog((prev) => {
        const last = prev[prev.length - 1];
        if (last?.status === "error" || last?.status === "warning") return prev;
        const now = new Date();
        const ts = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
        return [...prev, { ts, label: "Falha no cancelamento", status: "error", detail: err?.message ?? "Erro inesperado" }];
      });
    },
  });

  const scheduleConfirmMut = useMutation({
    mutationFn: async (slot: { start_at: string; label: string } & { professional_id?: number; professional_unit_id?: number }) => {
      if (!booking) throw new Error("Sem agendamento aberto");
      // 1) Grava o slot escolhido em vars_snapshot.chosen_slot
      const existingVars = (booking as any)?.vars_snapshot ?? {};
      const chosenPatch: Record<string, unknown> = {
        vars_snapshot: { ...existingVars, chosen_slot: slot },
      };
      // Se o slot trouxer profissional/profissional_unit, reforça nos campos top-level
      const slotProfId = Number((slot as any)?.professional_id);
      const slotProfUnitId = Number((slot as any)?.professional_unit_id);
      if (Number.isFinite(slotProfId) && slotProfId > 0) chosenPatch.professional = slotProfId;
      if (Number.isFinite(slotProfUnitId) && slotProfUnitId > 0) chosenPatch.professional_unit = slotProfUnitId;
      console.log("[scheduleConfirmMut] chosen slot patch:", chosenPatch);
      await patchBooking(booking.id, chosenPatch);
      // 2) Confirma usando o slot escolhido
      await confirmBooking(booking.id, {
        use_chosen_slot: true,
        notes: "Confirmado via Dashboard PrismIA (IA Enabled)",
      });
    },
    onSuccess: async () => {
      setActionDone("Agendamento confirmado!");
      toast.success("Agendamento confirmado!");
      await refetchBookingDetailForBot();
      queryClient.invalidateQueries({ queryKey: ["booking-requests"] });
      setTimeout(() => {
        onConfirmed();
        onClose();
        setActionDone(null);
      }, 1500);
    },
    onError: (err: any) => {
      console.error("[scheduleConfirmMut] error:", err?.response?.status, err?.response?.data);
      setPickingSlotIdx(null);
      const data = err?.response?.data;
      const detail = typeof data === "object" ? (data?.detail || data?.error) : null;
      toast.error(typeof detail === "string" ? detail : "Não foi possível confirmar o horário.");
    },
  });

  if (!booking) return null;

  const hasChosenSlot = !!(booking.vars_snapshot?.chosen_slot || booking.chosen_slot);
  const chosenSlot = booking.chosen_slot || booking.vars_snapshot?.chosen_slot;
  const terminal = isTerminal(booking.status);
  const busy =
    confirmMut.isPending ||
    cancelMut.isPending ||
    cancelConfirmedMut.isPending ||
    reopenMut.isPending ||
    handoffOnMut.isPending ||
    handoffOffMut.isPending ||
    suggestMut.isPending ||
    scheduleSuggestMut.isPending;

  const bookingMode = booking.booking_mode as BookingMode;
  const pCodeRaw = ((bookingDetailForBot as any)?.procedure_code ?? (booking as any).procedure_code ?? booking.procedure_slug ?? "").trim().toLowerCase();
  const pCodeFallback = pCodeRaw || (booking.procedure_name ?? "").trim().toLowerCase();
  const isConvo = ["human", "prices"].includes(pCodeRaw) || ["human", "prices"].includes(pCodeFallback);
  const isCancelCode = pCodeRaw === "cancel" || pCodeFallback.startsWith("cancelar agendamento");
  const detailNotes = (bookingDetailForBot as any)?.notes ?? "";
  const isRescheduleCode = pCodeRaw === "reschedule" || isRescheduleFromNotes(detailNotes);

  const cachedCancel = booking ? cancelledBookingCache.get(booking.id) : undefined;
  const effectiveStatus = bookingDetailForBot?.status ?? booking.status;
  const effectiveBotMode = (bookingDetailForBot?.conversation_bot_mode ?? bookingDetailForBot?.vars_snapshot?.conversation_bot_mode ?? booking.conversation_bot_mode ?? booking.vars_snapshot?.conversation_bot_mode ?? "").toString().trim().toLowerCase();
  const baseBotOn = effectiveBotMode === "on" || (effectiveBotMode !== "off" && effectiveStatus !== "handoff" && effectiveStatus !== "awaiting_choice" && effectiveStatus !== "pending");
  // Cancel BRs: OFF only when handoff, ON for all other statuses
  const cancelBotOn = isCancelCode ? effectiveStatus !== "handoff" : undefined;
  const isBotOn = forceBotOff ? false : (cancelBotOn !== undefined ? cancelBotOn : baseBotOn);
  const botLabel = isBotOn ? "ON" : "OFF";

  const formattedCreated = (() => {
    try {
      return format(new Date(booking.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch {
      return "—";
    }
  })();

  // ── Render mode-specific actions ──────────────────────────────────────
  function renderActions() {
    if (actionDone) {
      return (
        <div className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-status-confirmed bg-status-confirmed-bg border border-status-confirmed/30 animate-fade-in">
          <CheckCircle2 className="h-4 w-4" />
          {actionDone}
        </div>
      );
    }

    const actions: React.ReactNode[] = [];

    if (bookingMode === "handoff_manual") {
      if (booking.status === "handoff") {
        if (!isConvo) actions.push(
          <ActionButton key="confirm" onClick={() => confirmMut.mutate()} disabled={busy} loading={confirmMut.isPending} icon={CheckCircle2} label="Confirmar" variant="primary" />,
        );
        actions.push(
          <ActionButton key="cancel" onClick={() => cancelMut.mutate()} disabled={busy} loading={cancelMut.isPending} icon={XCircle} label="Cancelar" variant="danger" />,
        );
      }
    } else if (bookingMode === "assisted_slots_dashboard") {
      if (booking.status === "handoff" && !hasChosenSlot) {
        if (!isConvo) actions.push(
          <ActionButton key="suggest" onClick={() => suggestMut.mutate()} disabled={busy} loading={suggestMut.isPending} icon={CalendarSearch} label="Sugerir Horários" variant="primary" />,
        );
        actions.push(
          <ActionButton key="cancel" onClick={() => cancelMut.mutate()} disabled={busy} loading={cancelMut.isPending} icon={XCircle} label="Cancelar" variant="danger" />,
        );
      } else if (booking.status === "awaiting_choice") {
        actions.push(
          <ActionButton key="cancel" onClick={() => cancelMut.mutate()} disabled={busy} loading={cancelMut.isPending} icon={XCircle} label="Cancelar" variant="danger" />,
        );
      } else if (hasChosenSlot && (booking.status === "handoff" || booking.status === "pending")) {
        if (!isConvo) actions.push(
          <ActionButton key="confirm" onClick={() => confirmMut.mutate()} disabled={busy} loading={confirmMut.isPending} icon={CheckCircle2} label="Confirmar" variant="primary" />,
        );
        actions.push(
          <ActionButton key="cancel" onClick={() => cancelMut.mutate()} disabled={busy} loading={cancelMut.isPending} icon={XCircle} label="Cancelar" variant="danger" />,
        );
      }
    } else if (bookingMode === "auto_slots_bot") {
      if (!terminal) {
        if (hasChosenSlot && !isConvo) {
          actions.push(
            <ActionButton key="confirm" onClick={() => confirmMut.mutate()} disabled={busy} loading={confirmMut.isPending} icon={CheckCircle2} label="Confirmar" variant="primary" />,
          );
        }
        actions.push(
          <ActionButton key="cancel" onClick={() => cancelMut.mutate()} disabled={busy} loading={cancelMut.isPending} icon={XCircle} label="Cancelar" variant="danger" />,
        );
      }
    } else {
      // fallback — generic
      if (!terminal) {
        if (!isConvo) {
          actions.push(
            <ActionButton key="suggest" onClick={() => suggestMut.mutate()} disabled={busy} loading={suggestMut.isPending} icon={CalendarSearch} label="Sugerir Horários" />,
            <ActionButton key="confirm" onClick={() => confirmMut.mutate()} disabled={busy} loading={confirmMut.isPending} icon={CheckCircle2} label="Confirmar" variant="primary" />,
          );
        }
      }
    }


    // Reopen for terminal
    if (terminal) {
      actions.push(
        <ActionButton key="reopen" onClick={() => reopenMut.mutate()} disabled={busy} loading={reopenMut.isPending} icon={RotateCcw} label="Reabrir" />,
      );
      if (booking.status === "confirmed" && pCodeRaw !== "cancel") {
        actions.push(
          <ActionButton key="cancel-booking" onClick={() => cancelConfirmedMut.mutate()} disabled={busy} loading={cancelConfirmedMut.isPending} icon={XCircle} label="Cancelar Agendamento" variant="danger" />,
        );
      }
    }

    return actions.length > 0 ? <div className="flex gap-2 flex-wrap">{actions}</div> : null;
  }

  const errorMutation = [confirmMut, cancelMut, cancelConfirmedMut, reopenMut, handoffOnMut, handoffOffMut, suggestMut].find(m => m.isError);
  const isCancelError = errorMutation === cancelMut || errorMutation === cancelConfirmedMut;
  const anyError = !!errorMutation;
  const errorDetail = (() => {
    if (!errorMutation?.error) return "Erro ao comunicar com o servidor. Tente novamente.";
    const err = errorMutation.error as any;
    const data = err?.response?.data;
    const status = err?.response?.status;
    const raw = typeof data === "string" ? data : (data?.code || data?.detail || data?.error || "");
    const rawStr = raw?.toString() || "";
    // Detecta conflito de horário duplicado (não para ações de cancelamento)
    const isDuplicate = !isCancelError && (status === 409 || rawStr.includes("duplicate key") || rawStr.includes("uniq_confirmed") || rawStr.includes("already exists"));
    if (isDuplicate) return "Esse horário já está confirmado para este profissional. Escolha outro horário.";
    if (raw === "missing_slots")
      return "Não há disponibilidades para esse profissional e esse procedimento.";
    // Nunca mostrar HTML bruto do Django ou strings longas
    if ((typeof data === "string" && data.length > 200) || rawStr.includes("<!"))
      return "Erro ao processar a ação. Tente novamente.";
    if (data?.detail) return data.detail;
    if (data?.error) return data.error;
    if (data?.code) return `Erro: ${data.code}`;
    return err?.message || "Erro ao comunicar com o servidor. Tente novamente.";
  })();

  const activeManageLog = iaOpType === "schedule" ? scheduleLog : rescheduleLog;

  if (drawerMode === "manage") {
    return (
      <>
        <div className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm" onClick={onClose} />
        <aside
          data-booking-drawer
          className="fixed right-6 z-50 w-full max-w-[480px] rounded-xl shadow-2xl animate-fade-in flex flex-col overflow-hidden"
          style={{
            top: "50%",
            transform: "translateY(-50%)",
            height: "min(735px, calc(100vh - 32px))",
            background: "hsl(var(--surface-raised))",
            border: "1px solid hsl(var(--border))",
          }}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-border" style={{ background: "hsl(var(--appointment-bg, var(--surface-elevated)) / 0.2)" }}>
            <div>
              <h2 className="text-sm font-semibold text-foreground leading-tight">Gerenciar agenda</h2>
              <p className="text-xs text-muted-foreground font-mono">#{booking.id}</p>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            <div className="rounded-xl p-4 border border-border" style={{ background: "hsl(var(--appointment-bg, var(--surface)) / 0.3)" }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-foreground">{booking.lead_name || "Cliente"}</p>
                  {(booking.contact_phone || booking.phone) && (
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {formatPhone(booking.contact_phone || booking.phone || "")}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">{booking.unit_name}</p>
                </div>
                <StatusBadge status={booking.status} size="md" hasSchedule={!!booking.scheduled_at} procedureName={booking.procedure_name} aiTag={detectAiTag(booking.notes)} />
              </div>
            </div>

            <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-surface border border-border w-full">
              {([
                { key: "schedule" as const, label: "Agendamento", Icon: Calendar },
                { key: "reschedule" as const, label: "Reagendamento", Icon: RotateCcw },
                { key: "cancel" as const, label: "Cancelamento", Icon: XCircle },
              ]).map(({ key, label, Icon }) => {
                const active = iaOpType === key;
                const activeTone =
                  key === "schedule"
                    ? "bg-status-confirmed/15 text-status-confirmed"
                    : key === "reschedule"
                      ? "bg-status-pending/15 text-status-pending"
                      : "bg-status-canceled/15 text-status-canceled";

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      if (iaOpType !== key) {
                        setAssignLeadName("");
                        setScheduleReason("");
                        setCancelBookingIdField("");
                        setSelectedProfessionalId(null);
                        setSelectedProcedureId(null);
                        setSelectedSpecialtyId(null);
                        setRescheduleSearchResults(null);
                        setRescheduleSearchError(null);
                        setSelectedClientBooking(null);
                        setScheduleLog([]);
                        setRescheduleLog([]);
                      }
                      setIaOpType(key);
                    }}
                    className={`flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-medium px-2.5 py-2 rounded-md transition-all ${active ? activeTone : "text-muted-foreground hover:text-foreground hover:bg-surface-elevated"}`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                );
              })}
            </div>

            <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
              <div>
                <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">Nome do Cliente *</label>
                <input
                  type="text"
                  value={assignLeadName || autofillLeadName}
                  onChange={(e) => setAssignLeadName(e.target.value)}
                  placeholder="Nome do cliente..."
                  className="text-sm bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 w-full placeholder:text-muted-foreground"
                />
              </div>

              {iaOpType === "schedule" && (
                <>
                  <div>
                    <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">Motivo *</label>
                    <input
                      type="text"
                      value={scheduleReason}
                      onChange={(e) => setScheduleReason(e.target.value)}
                      placeholder="Ex: cliente pediu encaixe"
                      className="text-sm bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 w-full placeholder:text-muted-foreground"
                    />
                  </div>
                </>
              )}

              {(iaOpType === "reschedule" || iaOpType === "cancel") && (
                <div>
                  <div className="flex items-end gap-2">
                    <div className="w-28 flex-shrink-0">
                      <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">
                        ID Agend. *
                      </label>
                      <input
                        type="text"
                        value={cancelBookingIdField}
                        onChange={(e) => setCancelBookingIdField(e.target.value)}
                        placeholder="Ex: 483"
                        className="text-sm bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 w-full placeholder:text-muted-foreground"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">
                        Data / Hora
                      </label>
                      <div className="text-sm bg-surface border border-border rounded-lg px-3 py-2 text-foreground/90 truncate">
                        {selectedClientBooking?.scheduled_at
                          ? format(new Date(selectedClientBooking.scheduled_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                          : selectedClientBooking?.chosen_slot?.start_at
                            ? format(new Date(selectedClientBooking.chosen_slot.start_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })
                      </div>
                    </div>
                  </div>
                  {rescheduleSearchError && (iaOpType === "reschedule" || iaOpType === "cancel") && <p className="text-xs text-status-canceled mt-1">{rescheduleSearchError}</p>}
                </div>
              )}



              {(iaOpType === "schedule" || iaOpType === "reschedule" || iaOpType === "cancel") && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">
                        Profissional {iaOpType === "reschedule" || iaOpType === "cancel" ? "*" : ""}
                      </label>
                      <select
                        value={effectiveProfessionalId ?? ""}
                        onChange={(e) => {
                          const id = Number(e.target.value) || null;
                          setSelectedProfessionalId(id);
                          setSelectedProcedureId(null);
                          setSelectedSpecialtyId(null);
                        }}
                        disabled={iaOpType === "cancel"}
                        className="text-sm bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 w-full disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <option value="">{iaOpType === "schedule" ? "Sem preferência" : "Selecionar..."}</option>
                        {manageProfessionalOptions.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">Procedimento *</label>
                      <select
                        value={effectiveProcedureId ?? ""}
                        onChange={(e) => {
                          setSelectedProcedureId(Number(e.target.value) || null);
                          setSelectedSpecialtyId(null);
                        }}
                        disabled={iaOpType === "cancel" || (iaOpType === "reschedule" && !effectiveProfessionalId)}
                        className="text-sm bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 w-full disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <option value="">{(iaOpType === "reschedule" || iaOpType === "cancel") && !effectiveProfessionalId ? "—" : "Selecionar..."}</option>
                        {manageProcedureOptions.map((p) => (
                          <option key={p.id} value={p.id}>{p.name ?? p.slug ?? `#${p.id}`}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {selectedProcedureId && !autoSpecialtyId && (
                    <div>
                      <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">Especialidade</label>
                      <select
                        value={selectedSpecialtyId ?? ""}
                        onChange={(e) => setSelectedSpecialtyId(Number(e.target.value) || null)}
                        className="text-sm bg-background border border-border rounded-lg px-3 py-2 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 w-full"
                      >
                        <option value="">Selecionar especialidade...</option>
                        {allSpecialties.map((s) => (
                          <option key={s.id} value={s.id}>{s.name ?? `#${s.id}`}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </>
              )}
            </div>

            <div className="flex items-center gap-2">
              {iaOpType === "schedule" && (
                <>
                    <button
                      type="button"
                      onClick={() => scheduleSuggestMut.mutate()}
                      disabled={scheduleSuggestMut.isPending || !(assignLeadName || autofillLeadName).trim() || !scheduleReason.trim() || !effectiveProcedureId}
                      className="text-xs font-medium px-3 py-2 rounded-lg gradient-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center gap-1.5"
                    >
                      <Calendar className="h-3.5 w-3.5" />
                      {scheduleSuggestMut.isPending ? "Agendando..." : "Agendar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => checkSlotsMut.mutate()}
                      disabled={checkSlotsMut.isPending || scheduleSuggestMut.isPending || !effectiveProcedureId}
                    className="text-xs font-medium px-3 py-2 rounded-lg border border-border bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center gap-1.5"
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    {checkSlotsMut.isPending ? "Consultando..." : "Checar"}
                  </button>
                </>
              )}

              {iaOpType === "reschedule" && (
                <>
                  <button
                    type="button"
                    onClick={handleSearchClientBookings}
                    disabled={rescheduleSearchLoading}
                    className="text-xs font-medium px-3 py-2 rounded-lg border border-border bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center gap-1.5"
                  >
                    <Search className="h-3.5 w-3.5" />
                    {rescheduleSearchLoading ? "Buscando..." : "Buscar BRs"}
                  </button>
                  <button
                    type="button"
                    onClick={() => rescheduleSuggestMut.mutate()}
                    disabled={rescheduleSuggestMut.isPending || !assignLeadName.trim() || !cancelBookingIdField.trim() || !selectedProfessionalId || !selectedProcedureId}
                    className="text-xs font-medium px-3 py-2 rounded-lg gradient-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center gap-1.5"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {rescheduleSuggestMut.isPending ? "Reagendando..." : "Reagendar"}
                  </button>
                  <button
                    type="button"
                    onClick={() => checkRescheduleSlotsMut.mutate()}
                    disabled={checkRescheduleSlotsMut.isPending || rescheduleSuggestMut.isPending || !selectedProcedureId}
                    className="text-xs font-medium px-3 py-2 rounded-lg border border-border bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center gap-1.5"
                  >
                    <Calendar className="h-3.5 w-3.5" />
                    {checkRescheduleSlotsMut.isPending ? "Consultando..." : "Checar"}
                  </button>
                </>
              )}

              {iaOpType === "cancel" && (
                <>
                  <button
                    type="button"
                    onClick={handleSearchClientBookings}
                    disabled={rescheduleSearchLoading}
                    className="text-xs font-medium px-3 py-2 rounded-lg border border-border bg-background hover:bg-accent hover:text-accent-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center gap-1.5"
                  >
                    <Search className="h-3.5 w-3.5" />
                    {rescheduleSearchLoading ? "Buscando..." : "Buscar BRs"}
                  </button>
                  <button
                    type="button"
                    onClick={() => iaCancelMut.mutate()}
                    disabled={iaCancelMut.isPending || !assignLeadName.trim() || !cancelBookingIdField.trim()}
                    className="text-xs font-medium px-3 py-2 rounded-lg gradient-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center gap-1.5"
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    {iaCancelMut.isPending ? "Cancelando..." : "Cancelar BR"}
                  </button>
                </>
              )}
            </div>

            {(iaOpType === "reschedule" || iaOpType === "cancel") && rescheduleSearchResults && rescheduleSearchResults.length > 0 && (
              <div className="rounded-xl border border-border bg-surface-elevated p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Resultados da busca ({rescheduleSearchResults.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setRescheduleSearchResults(null);
                      setRescheduleSearchError(null);
                    }}
                    className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Limpar
                  </button>
                </div>
                <div className="rounded-lg border border-border bg-background p-2 space-y-1 max-h-40 overflow-y-auto">
                  {rescheduleSearchResults.map((br) => (
                    <button
                      key={br.id}
                      type="button"
                      onClick={() => selectClientBookingForReschedule(br)}
                      className="w-full text-left rounded-md px-2.5 py-2 hover:bg-accent transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm text-foreground font-medium">#{br.id}</span>
                        <span className="text-[10px] text-muted-foreground">{br.status}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">{br.procedure_name} · {br.professional_name || "Sem profissional"}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {activeManageLog.length > 0 && (
              <div className="rounded-xl border border-border bg-surface-elevated p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <span className="text-xs font-semibold uppercase tracking-wider text-primary">Status da operação</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (iaOpType === "schedule") setScheduleLog([]);
                      else if (iaOpType === "reschedule") setRescheduleLog([]);
                    }}
                    className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Limpar
                  </button>
                </div>
                <ul className="space-y-2">
                  {activeManageLog.map((entry, idx) => {
                    const dotClass = entry.status === "success"
                      ? "bg-status-confirmed"
                      : entry.status === "warning"
                        ? "bg-status-pending"
                        : entry.status === "error"
                          ? "bg-status-canceled"
                          : "bg-muted-foreground";

                    return (
                      <li key={`${entry.ts}-${idx}`} className="flex items-start gap-2 text-xs leading-snug">
                        <span className={`mt-1.5 inline-block h-2 w-2 rounded-full shrink-0 ${dotClass}`} />
                        <span className="flex-1 min-w-0">
                          <span className="font-medium text-foreground">{entry.label}</span>
                          {entry.detail && <span className="block text-muted-foreground mt-0.5">{entry.detail}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </aside>
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm" onClick={onClose} />

      <aside
        data-booking-drawer
        className="fixed right-0 top-0 z-50 h-full w-full max-w-[480px] shadow-lg animate-slide-in-right flex flex-col"
        style={{
          background: "hsl(var(--surface-raised))",
          borderLeft: "1px solid hsl(var(--border))",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border" style={{ background: "hsl(var(--appointment-bg, var(--surface-elevated)) / 0.2)" }}>
          <div className="flex items-center gap-3">
            {logoUrl ? (
              <img src={logoUrl} alt={logoAlt || "Logo"} className="h-8 w-8 rounded-lg object-contain" />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: "hsl(var(--appointment-bg, var(--primary)))" }}>
                <Sparkles className="h-4 w-4 text-primary-foreground" />
              </div>
            )}
            <div>
              <h2 className="text-sm font-semibold text-foreground leading-tight">
                Detalhe do Agendamento
              </h2>
              <p className="text-xs text-muted-foreground font-mono">#{booking.id}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {terminal && <TerminalBadge />}
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Lead identity */}
          <div className="rounded-xl p-4 border border-border" style={{ background: "hsl(var(--appointment-bg, var(--surface)) / 0.3)" }}>
            <div className="flex items-start justify-between gap-3 mb-1">
              <div>
                <div className="flex items-center gap-1.5">
                  <BookingModeIcon mode={booking.booking_mode} notes={(bookingDetailForBot as any)?.notes ?? booking.notes} />
                  {isConvo ? (
                    <h3 className="text-base font-semibold text-primary flex items-center gap-1.5">
                      <MessageSquare className="h-4 w-4 text-primary" />
                      Conversa
                    </h3>
                  ) : (
                    <h3 className="text-base font-semibold text-foreground">{booking.lead_name}</h3>
                  )}
                </div>
                {(booking.contact_phone || booking.phone) && (
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {formatPhone(booking.contact_phone || booking.phone || "")}
                  </p>
                )}
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <StatusBadge status={booking.status} size="md" hasSchedule={!!booking.scheduled_at} procedureName={booking.procedure_name} aiTag={detectAiTag(booking.notes)} />
                <div className="pr-[0.35rem]">
                  <ConfirmationIndicator confirmation={booking.confirmation ?? (bookingDetailForBot as any)?.confirmation ?? null} />
                </div>
                
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border ${
                      isBotOn
                        ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/10"
                        : "text-status-pending border-status-pending/30 bg-status-pending-bg/40"
                    }`}
                  >
                    {isBotOn ? (
                      <BotMessageSquare className="h-3 w-3" />
                    ) : (
                      <BotOff className="h-3 w-3" />
                    )}
                    Bot {botLabel}
                  </span>
              </div>
            </div>
          </div>
          {/* Details grid */}
          <div className="grid grid-cols-2 gap-2">
            {(() => {
              // Priority: notes from API (persistent) > cache > field > fallback
              const notesText = (bookingDetailForBot as any)?.notes ?? (booking as any)?.notes ?? "";
              const idFromNotes = extractCancelledIdFromNotes(notesText);
              const cachedId = cachedCancel?.cancelledId;
              const effectiveCancelId = idFromNotes || cachedId || cancelBookingIdField.trim() || lastCancelledIdRef.current;
              const procFromNotes = extractProcedureFromNotes(notesText);
              const displayValue = procFromNotes ?? overrideProcedureName ?? (bookingDetailForBot as any)?.procedure_name ?? booking.procedure_name;
              return <DetailRow icon={Hash} label="Procedimento" tone="primary" value={
                isRescheduleCode ? (
                  <span className="flex items-center gap-1.5">
                    <span title="Reagendamento"><RefreshCw className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" /></span>
                    {displayValue}
                  </span>
                ) : displayValue
              } />;
            })()}
            <DetailRow icon={Building2} label="Unidade" tone="assisted" value={booking.unit_name} />
            <DetailRow
              icon={isCancelCode ? ClipboardList : isRescheduleCode ? CalendarClock : User}
              label={isCancelCode ? "Ações" : isRescheduleCode ? "Reagendamento" : isConvo ? "Atendimento" : "Profissional"}
              tone={isCancelCode ? "canceled" : isRescheduleCode ? "pending" : "primary"}
              className="col-span-2"
              value={hasProfessional ? effectiveProfessionalName : "—"}
            />
            <DetailRow icon={Clock} label="Criado em" tone="default" value={formattedCreated} />
            <DetailRow
              icon={Clock}
              label="Atualizado em"
              tone="default"
              value={(() => {
                try {
                  return format(new Date(booking.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
                } catch {
                  return "—";
                }
              })()}
            />
            {/* Notes / Log */}
            {((bookingDetailForBot as any)?.notes || (booking as any)?.notes) && (
              <DetailRow
                icon={MessageSquare}
                label="Histórico de notas"
                tone="primary"
                className="col-span-2"
                value={
                  <NotesLog notes={(bookingDetailForBot as any)?.notes || (booking as any)?.notes} />
                }
              />
            )}
          </div>

          {/* Awaiting choice state (assisted_slots_dashboard) */}
          {booking.status === "awaiting_choice" && (
            <div className="rounded-xl p-4 border border-status-pending/30 bg-status-pending-bg/30">
              <div className="flex items-center gap-2 mb-3">
                <Hourglass className="h-4 w-4 text-status-pending" />
                <span className="text-xs font-semibold text-status-pending uppercase tracking-wider">
                  Aguardando escolha do cliente
                </span>
              </div>
              {booking.offer_slots && booking.offer_slots.length > 0 && (
                <div className="space-y-1.5">
                  {booking.offer_slots.map((slot, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-foreground">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-elevated text-[10px] font-bold text-muted-foreground">
                        {i + 1}
                      </span>
                      {slot.label}
                    </div>
                  ))}
                </div>
              )}
              {booking.offer_expires_at && (
                <p className="text-[10px] text-muted-foreground mt-2 font-mono">
                  Expira: {booking.offer_expires_at}
                </p>
              )}
            </div>
          )}

          {/* Chosen slot */}
          {hasChosenSlot && chosenSlot && (
            <div className="rounded-xl p-4 border border-primary/30 bg-primary/5">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                  Slot Selecionado
                </span>
              </div>
              <p className="text-sm font-medium text-foreground">
                {booking.chosen_slot_label || chosenSlot.label}
              </p>
              <p className="text-xs text-muted-foreground font-mono mt-1">
                {chosenSlot.start_at}
              </p>
            </div>
          )}

          {/* Scheduled at */}
          {booking.scheduled_at && (
            <div className="rounded-xl p-4 border border-status-confirmed/30 bg-status-confirmed-bg/30">
              <div className="flex items-center gap-2 mb-1">
                <Calendar className="h-4 w-4 text-status-confirmed" />
                <span className="text-xs font-semibold text-status-confirmed uppercase tracking-wider">
                  Agendado para
                </span>
              </div>
              <p className="text-sm font-medium text-foreground">
                {(() => {
                  try {
                    const d = new Date(booking.scheduled_at!);
                    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
                      " às " +
                      d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                  } catch {
                    return booking.scheduled_at;
                  }
                })()}
              </p>
            </div>
          )}

          {/* No slot warning */}
          {!hasChosenSlot && !terminal && booking.status !== "awaiting_choice" && (
            <div className="rounded-xl p-4 border border-status-pending/30 bg-status-pending-bg/30">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-status-pending" />
                <span className="text-xs font-medium text-status-pending">
                  {bookingMode === "assisted_slots_dashboard"
                    ? "Nenhum slot selecionado — clique em 'Sugerir Horários' para enviar opções ao lead."
                    : "Nenhum slot selecionado."}
                </span>
              </div>
            </div>
          )}

          {/* Mensagens */}
          <div
            className="rounded-xl overflow-hidden border border-border flex flex-col"
            style={{ maxHeight: conversationCollapsed ? undefined : (showQuickReplies ? "420px" : "320px") }}
          >
            <button
              type="button"
              onClick={toggleConversationCollapsed}
              className="surface-elevated px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border flex items-center gap-2 hover:text-foreground transition-colors w-full text-left"
              aria-expanded={!conversationCollapsed}
              aria-label={conversationCollapsed ? "Expandir conversa" : "Recolher conversa"}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Conversa
              <span className="ml-auto text-[10px] font-mono opacity-60">{messages.length} msgs</span>
              {conversationCollapsed ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronUp className="h-3.5 w-3.5" />
              )}
            </button>
            {!conversationCollapsed && (
            <>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2 bg-surface" style={{ minHeight: "150px" }}>
              {messagesLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">Nenhuma mensagem encontrada.</p>
              ) : (
                messages.map((msg, idx) => {
                  const role = (msg.role ?? "").toLowerCase();
                  const isBot = role.includes("assistant") || role.includes("system") || role.includes("bot") || role === "out" || role === "outbound";
                  const isUser = role.includes("user") || role.includes("lead") || role.includes("client") || role === "in" || role === "inbound";
                  // If neither matched, log for debugging
                  if (idx === 0) console.log("[BookingDrawer] messages sample roles:", messages.slice(0, 5).map(m => m.role));
                  // Final: if not explicitly user → treat as bot (OUT)
                  const isBotFinal = isBot || !isUser;
                  const content = (msg.content ?? "").toString().trim();

                  return (
                    <div key={msg.id} className={`flex flex-col gap-0.5 ${isBotFinal ? "items-end" : "items-start"}`}>
                      <div
                        className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words ${
                          isBotFinal
                            ? "bg-[hsl(186_72%_48%/0.15)] text-foreground border border-[hsl(186_72%_48%/0.3)]"
                            : "bg-[hsl(262_52%_60%/0.15)] text-foreground border border-[hsl(262_52%_60%/0.3)]"
                        }`}
                      >
                        {content ? content : <span className="italic text-muted-foreground">[sem conteúdo]</span>}
                      </div>
                      <span className="text-[9px] text-muted-foreground px-1 font-mono">
                        {(() => {
                          try {
                            if (!msg.created_at) return "";
                            return format(new Date(msg.created_at), "dd/MM HH:mm", { locale: ptBR });
                          } catch {
                            return "";
                          }
                        })()}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>
            {/* Quick Replies */}
            {!isBotOn && (
              <div className="px-3 pt-2 border-t border-border bg-surface-elevated">
                <button
                  onClick={() => {
                    setShowQuickReplies(!showQuickReplies);
                    if (editingQuickReplies) setEditingQuickReplies(false);
                  }}
                  className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors mb-1"
                >
                  <Zap className="h-3 w-3" />
                  Respostas rápidas
                </button>
                {showQuickReplies && (
                  <div className="mb-2">
                    {editingQuickReplies ? (
                      <div className="space-y-1">
                        {quickReplies.map((reply, idx) => (
                          <div key={idx} className="flex items-center gap-1">
                            <input
                              className="flex-1 bg-surface border border-border rounded px-2 py-1 text-[11px] text-foreground"
                              value={reply}
                              onChange={(e) => {
                                const updated = [...quickReplies];
                                updated[idx] = e.target.value;
                                setQuickReplies(updated);
                              }}
                            />
                            <button
                              onClick={() => {
                                const updated = quickReplies.filter((_, i) => i !== idx);
                                saveQuickReplies(updated);
                              }}
                              className="text-destructive hover:text-destructive/80 p-0.5"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        {quickReplies.length < 5 && (
                          <button
                            onClick={() => setQuickReplies([...quickReplies, ""])}
                            className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80"
                          >
                            <Plus className="h-3 w-3" /> Adicionar
                          </button>
                        )}
                        <button
                          onClick={() => {
                            saveQuickReplies(quickReplies.filter(r => r.trim()));
                            setEditingQuickReplies(false);
                          }}
                          className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 mt-1"
                        >
                          <Check className="h-3 w-3" /> Salvar
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {quickReplies.map((reply, idx) => (
                          <button
                            key={idx}
                            onClick={() => {
                              setMessageText(reply);
                            }}
                            disabled={sendMsgMutation.isPending}
                            className="px-2 py-1 text-[10px] rounded-full border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors truncate max-w-[200px]"
                          >
                            {reply}
                          </button>
                        ))}
                        <button
                          onClick={() => setEditingQuickReplies(true)}
                          className="px-2 py-1 text-[10px] rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                        >
                          <Pencil className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            {/* Input de mensagem */}
            <div className="px-3 py-2 border-t border-border flex items-center gap-2 bg-surface-elevated">
              <input
                type="text"
                className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                placeholder="Digite uma mensagem..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage();
                  }
                }}
                disabled={isBotOn || sendMsgMutation.isPending}
              />
              <button
                onClick={handleSendMessage}
                disabled={isBotOn || !messageText.trim() || sendMsgMutation.isPending}
                className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {sendMsgMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            </>
            )}
          </div>
        </div>

        {/* Footer — Actions */}
        <div className="px-5 py-4 border-t border-border surface-elevated space-y-2">
          {renderActions()}

          {anyError && (
            <p className="text-xs text-center text-status-canceled animate-fade-in">
              {errorDetail}
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
