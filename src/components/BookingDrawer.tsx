import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BookingRequest, BookingStatus, BookingMode, Professional } from "@/types/booking";
import { StatusBadge, detectAiTag } from "@/components/StatusBadge";
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
} from "@/lib/bookingApi";
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
} from "lucide-react";

interface BookingDrawerProps {
  booking: BookingRequest | null;
  onClose: () => void;
  onConfirmed: () => void;
  logoUrl?: string | null;
  logoAlt?: string | null;
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

type NoteEntryKind = "ai_schedule" | "ai_reschedule" | "ai_cancel" | "manual_schedule" | "reschedule" | "cancel" | "generic";

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
  const isAi = /autom[áa]tic[oa] pela ia/.test(lower) || /policy\s*[:=]/i.test(body) || /BR_TAG_AI_DIRECT/i.test(body);

  // Para notas de IA, classificar pelo TIPO DE AÇÃO declarado no início
  // ("CANCELAMENTO/REAGENDAMENTO/AGENDAMENTO AUTOMATICO PELA IA"),
  // não por ocorrências da palavra no motivo.
  if (isAi) {
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

function parseNotes(notes: string): NoteEntry[] {
  // Remove linhas que são apenas tags técnicas (BR_TAG_X = 1234)
  const cleaned = notes
    .split("\n")
    .filter((ln) => !/^\s*BR_TAG_[A-Z_]+\s*=\s*\d+\s*$/i.test(ln))
    .join("\n");

  const entryRegex = /\[(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2})\]\s*([\s\S]*?)(?=\n\[\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}\]|$)/g;
  const entries: NoteEntry[] = [];
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

  if (entries.length === 0 && cleaned.trim()) {
    entries.push({ kind: "generic", title: "Nota", body: cleaned.trim(), meta: [] });
  }

  return entries;
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

export function BookingDrawer({ booking, onClose, onConfirmed, logoUrl, logoAlt }: BookingDrawerProps) {
  const queryClient = useQueryClient();
  const [actionDone, setActionDone] = useState<string | null>(null);
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<number | null>(null);
  const [selectedProcedureId, setSelectedProcedureId] = useState<number | null>(null);
  const [selectedSpecialtyId, setSelectedSpecialtyId] = useState<number | null>(null);
  const [mockAssignedProfessional, setMockAssignedProfessional] = useState<{ id: number; name: string } | null>(null);
  const [assignLeadName, setAssignLeadName] = useState("");
  const [cancelBookingIdField, setCancelBookingIdField] = useState("");
  const [overrideProcedureName, setOverrideProcedureName] = useState<string | null>(null);
  const [forceBotOff, setForceBotOff] = useState(false);
  const lastCancelledIdRef = useRef<string | null>(null);
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

  // Always fetch professionals when drawer opens with a booking missing a professional
  const earlyProcCode = ((booking as any)?.procedure_code ?? booking?.procedure_slug ?? "").trim().toLowerCase();
  const needsProfessional = !!booking && (!hasProfessional || earlyProcCode === "reschedule");

  // Resolve booking's unit id from auth units (booking has unit_name only)
  const { units: authUnits, aiEnabled } = useAuth();

  // IA Enabled: tipo de operação manual selecionada no Drawer (Agendamento / Reagendamento / Cancelamento).
  // Estrutura visual apenas — ações ainda não conectadas.
  type IaOpType = "schedule" | "reschedule" | "cancel";
  const [iaOpType, setIaOpType] = useState<IaOpType>("schedule");
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
    enabled: needsProfessional,
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
    enabled: needsProfessional && !!bookingUnitId,
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
    enabled: needsProfessional,
  });

  // Fetch all procedures
  const { data: allProcedures = [] } = useQuery({
    queryKey: ["procedures-drawer"],
    queryFn: async () => {
      const { data } = await api.get("/api/settings/procedures/");
      const arr = Array.isArray(data) ? data : (data?.results ?? data?.result?.results ?? data?.result ?? []);
      return Array.isArray(arr) ? arr as { id: number; name?: string; slug?: string }[] : [];
    },
    enabled: needsProfessional,
  });

  // Fetch all specialties
  const { data: allSpecialties = [] } = useQuery({
    queryKey: ["specialties-drawer"],
    queryFn: async () => {
      const { data } = await api.get("/api/settings/specialties/");
      const arr = Array.isArray(data) ? data : (data?.results ?? data?.result?.results ?? data?.result ?? []);
      return Array.isArray(arr) ? arr as { id: number; name?: string }[] : [];
    },
    enabled: needsProfessional,
  });

  // Fetch procedure-specialties links (to auto-resolve specialty)
  const { data: procSpecLinks = [] } = useQuery({
    queryKey: ["procedure-specialties-drawer"],
    queryFn: async () => {
      const { data } = await api.get("/api/settings/procedure-specialties/");
      const arr = Array.isArray(data) ? data : (data?.results ?? data?.result?.results ?? data?.result ?? []);
      return Array.isArray(arr) ? arr as { id: number; procedure?: number; specialty?: number }[] : [];
    },
    enabled: needsProfessional,
  });

  // Fetch unit-procedures links (to resolve procedure_code = unit-procedure ID)
  const { data: unitProcLinks = [] } = useQuery({
    queryKey: ["unit-procedures-drawer"],
    queryFn: async () => {
      const { data } = await api.get("/api/settings/unit-procedures/");
      const arr = Array.isArray(data) ? data : (data?.results ?? data?.result?.results ?? data?.result ?? []);
      return Array.isArray(arr) ? arr as { id: number; procedure?: number; unit?: number; unit_name?: string }[] : [];
    },
    enabled: needsProfessional,
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
        const logEntry = `[${timestamp}] Cancelamento do agendamento #${targetId} solicitado por ${assignLeadName.trim() || "N/A"}`;
        const newNotes = existingNotes ? `${existingNotes}\n${logEntry}` : logEntry;
        return await patchBooking(booking!.id, {
          lead_name: assignLeadName.trim() || booking!.lead_name,
          procedure_name: `Cancelar agendamento #${targetId}`,
          notes: newNotes,
          conversation_bot_mode: "off",
          booking_mode: "handoff_manual",
        });
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
      queryClient.invalidateQueries({ queryKey: ["booking-request-detail-bot", booking!.id] });
      
      if (wasCancelFlow) {
        setTimeout(() => {
          refetchBookingDetailForBot();
          setActionDone(null);
        }, 3000);
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
      if (!assignLeadName.trim()) throw new Error("Informe o nome do cliente");
      if (!selectedProcedureId) throw new Error("Selecione o procedimento");

      // 1) PATCH na BR — coloca em "slots enviados pelo dashboard"
      const existingVars = ((booking as any)?.vars_snapshot ?? {}) as Record<string, unknown>;
      // Adiciona/garante a tag BR_TAG_MANUAL_SCHEDULE no notes
      const existingNotesRaw = ((booking as any)?.notes ?? "") as string;
      const hasManualTag = /BR_TAG_MANUAL_SCHEDULE/i.test(existingNotesRaw);
      const now = new Date();
      const ts = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const manualLog = `[${ts}] Agendamento manual via Dashboard por ${assignLeadName.trim() || "atendente"} | BR_TAG_MANUAL_SCHEDULE = ${booking.id}`;
      const updatedNotes = hasManualTag
        ? existingNotesRaw
        : (existingNotesRaw ? `${existingNotesRaw}\n${manualLog}` : manualLog);

      const selectedProc = selectedProcedureId ? allProcedures.find((p) => p.id === selectedProcedureId) : undefined;
      const procedureName = selectedProc?.name ?? booking.procedure_name ?? "";
      const procedureSlug = selectedProc?.slug ?? "";
      const unitName = booking.unit_name ?? "";
      const profName = selectedProfessionalId
        ? (professionals.find((p) => p.id === selectedProfessionalId)?.name ?? "")
        : "";

      const patch1: Record<string, unknown> = {
        lead_name: assignLeadName.trim(),
        procedure: selectedProcedureId,
        procedure_name: procedureName,
        unit_name: unitName,
        booking_mode: "assisted_slots_dashboard",
        vars_snapshot: existingVars,
        notes: updatedNotes,
      };
      if (selectedProfessionalId) {
        patch1.professional = selectedProfessionalId;
        if (profName) patch1.professional_name = profName;
      }
      // procedure_code é SLUG (string), não ID
      if (procedureSlug) patch1.procedure_code = procedureSlug;
      const resolvedSpecialty = selectedSpecialtyId ?? autoSpecialtyId;
      if (resolvedSpecialty) patch1.specialty = resolvedSpecialty;
      console.log("[scheduleSuggestMut] PATCH 1 (assisted) payload:", JSON.stringify(patch1));
      await patchBooking(booking.id, patch1);

      // 2) Solicita slots ao backend (apenas unidade + procedimento via procedure_code SLUG)
      const suggestPayload: Record<string, unknown> = {};
      if (procedureSlug) suggestPayload.procedure_code = procedureSlug;
      if (bookingUnitId) suggestPayload.unit = bookingUnitId;
      console.log("[scheduleSuggestMut] suggest_slots payload:", JSON.stringify(suggestPayload));
      const suggestResponse = await suggestSlots(booking.id, suggestPayload as any);
      console.log("[scheduleSuggestMut] suggest_slots response:", suggestResponse);

      // 3) PATCH na BR — coloca em automático (bot assume) E reforça nomes que o backend pode ter sobrescrito
      const patch2: Record<string, unknown> = {
        booking_mode: "auto_slots_bot",
        conversation_bot_mode: "on",
        procedure_name: procedureName,
        unit_name: unitName,
      };
      if (profName) patch2.professional_name = profName;
      console.log("[scheduleSuggestMut] PATCH 2 (auto) payload:", JSON.stringify(patch2));
      await patchBooking(booking.id, patch2);

      // 4) Refetch detalhes — para mostrar offer_slots/status atualizados
      const detail = await fetchBookingRequestById(booking.id);
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
      } else {
        toast.success(`Bot acionado — ${slots.length} horário(s) serão oferecidos ao cliente.`);
      }
      setActionDone("Bot assumiu a conversa!");
      await refetchBookingDetailForBot();
      queryClient.invalidateQueries({ queryKey: ["booking-requests"] });
      setTimeout(() => {
        onConfirmed();
        onClose();
        setActionDone(null);
      }, 1500);
    },
    onError: (err: any) => {
      console.error("[scheduleSuggestMut] error:", err?.response?.status, err?.response?.data);
      const data = err?.response?.data;
      const detail = typeof data === "object" ? (data?.detail || data?.error) : null;
      toast.error(typeof detail === "string" ? detail : (err?.message || "Não foi possível gerar horários."));
    },
  });

  const scheduleConfirmMut = useMutation({
    mutationFn: async (slot: { start_at: string; label: string }) => {
      if (!booking) throw new Error("Sem agendamento aberto");
      // 1) Grava o slot escolhido em vars_snapshot.chosen_slot
      const existingVars = (booking as any)?.vars_snapshot ?? {};
      await patchBooking(booking.id, {
        vars_snapshot: { ...existingVars, chosen_slot: slot },
      });
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
    suggestMut.isPending;

  const mode = booking.booking_mode as BookingMode;
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

    if (mode === "handoff_manual") {
      if (booking.status === "handoff") {
        if (!isConvo) actions.push(
          <ActionButton key="confirm" onClick={() => confirmMut.mutate()} disabled={busy} loading={confirmMut.isPending} icon={CheckCircle2} label="Confirmar" variant="primary" />,
        );
        actions.push(
          <ActionButton key="cancel" onClick={() => cancelMut.mutate()} disabled={busy} loading={cancelMut.isPending} icon={XCircle} label="Cancelar" variant="danger" />,
        );
      }
    } else if (mode === "assisted_slots_dashboard") {
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
    } else if (mode === "auto_slots_bot") {
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

  return (
    <>
      <div className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm" onClick={onClose} />

      <aside
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
                  <BookingModeIcon mode={booking.booking_mode} />
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
              const displayValue = isCancelCode && effectiveCancelId
                ? `Cancelar agendamento #${effectiveCancelId}`
                : (procFromNotes ?? overrideProcedureName ?? (bookingDetailForBot as any)?.procedure_name ?? booking.procedure_name);
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
              icon={aiEnabled ? Sparkles : (isCancelCode ? ClipboardList : isRescheduleCode ? CalendarClock : User)}
              label={aiEnabled ? "Ação manual (IA ativa)" : (isCancelCode ? "Ações" : isRescheduleCode ? "Reagendamento" : isConvo ? "Atendimento" : "Profissional")}
              tone={aiEnabled ? "primary" : (isCancelCode ? "canceled" : isRescheduleCode ? "pending" : "primary")}
              className="col-span-2"
              value={
                aiEnabled ? (
                  <div className="flex flex-col gap-3 w-full">
                    {/* Seletor de tipo de operação */}
                    <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-surface border border-border w-fit">
                      {([
                        { key: "schedule" as const, label: "Agendamento", Icon: Calendar },
                        { key: "reschedule" as const, label: "Reagendamento", Icon: RotateCcw },
                        { key: "cancel" as const, label: "Cancelamento", Icon: XCircle },
                      ]).map(({ key, label, Icon }) => {
                        const active = iaOpType === key;
                        const activeTone =
                          key === "schedule" ? "bg-status-confirmed/15 text-status-confirmed"
                          : key === "reschedule" ? "bg-status-pending/15 text-status-pending"
                          : "bg-status-canceled/15 text-status-canceled";
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => setIaOpType(key)}
                            className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md transition-all ${
                              active ? activeTone : "text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
                            }`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                            {label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Painéis por tipo (sem ações conectadas) */}
                    {iaOpType === "schedule" && scheduleStep === "form" && (
                      <div className="flex flex-col gap-2">
                        <div>
                          <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">
                            Nome do Cliente <span className="text-status-cancelled">*</span>
                          </label>
                          <input
                            type="text"
                            value={assignLeadName}
                            onChange={(e) => setAssignLeadName(e.target.value)}
                            placeholder="Nome do cliente..."
                            className="text-sm bg-surface border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 w-full placeholder:text-muted-foreground"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">
                            Procedimento <span className="text-status-cancelled">*</span>
                          </label>
                          <select
                            value={selectedProcedureId ?? ""}
                            onChange={(e) => {
                              setSelectedProcedureId(Number(e.target.value) || null);
                              setSelectedSpecialtyId(null);
                            }}
                            className="text-sm bg-surface border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 w-full"
                          >
                            <option value="">Selecionar...</option>
                            {(selectedProfessionalId ? proceduresForProfessional : proceduresForUnit).map((p) => (
                              <option key={p.id} value={p.id}>{p.name ?? p.slug ?? `#${p.id}`}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">
                            Profissional <span className="text-muted-foreground/70 normal-case font-normal">(opcional)</span>
                          </label>
                          <select
                            value={selectedProfessionalId ?? ""}
                            onChange={(e) => {
                              const id = Number(e.target.value) || null;
                              setSelectedProfessionalId(id);
                            }}
                            className="text-sm bg-surface border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 w-full"
                          >
                            <option value="">Sem preferência</option>
                            {professionalsForUnit.map((p) => (
                              <option key={p.id} value={p.id}>{p.name}</option>
                            ))}
                          </select>
                          <p className="text-[10px] text-muted-foreground/80 mt-1 italic">
                            Se o cliente não indicou profissional, deixe em branco.
                          </p>
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => scheduleSuggestMut.mutate()}
                            disabled={
                              scheduleSuggestMut.isPending ||
                              !assignLeadName.trim() ||
                              !selectedProcedureId
                            }
                            className="text-xs font-medium px-3 py-1.5 rounded-lg gradient-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center gap-1.5"
                          >
                            <Calendar className="h-3.5 w-3.5" />
                            {scheduleSuggestMut.isPending ? "Gerando horários…" : "Agendar"}
                          </button>
                        </div>
                      </div>
                    )}

                    {iaOpType === "schedule" && scheduleStep === "choosing-slot" && (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                            Escolha um horário
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setScheduleStep("form");
                              setScheduleSlots([]);
                              setPickingSlotIdx(null);
                            }}
                            disabled={scheduleConfirmMut.isPending}
                            className="text-[10px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline disabled:opacity-40"
                          >
                            ← voltar
                          </button>
                        </div>
                        <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto pr-1">
                          {scheduleSlots.map((slot, idx) => {
                            const isPicking = pickingSlotIdx === idx && scheduleConfirmMut.isPending;
                            const disabled = scheduleConfirmMut.isPending;
                            return (
                              <button
                                key={`${slot.start_at}-${idx}`}
                                type="button"
                                onClick={() => {
                                  setPickingSlotIdx(idx);
                                  scheduleConfirmMut.mutate(slot);
                                }}
                                disabled={disabled}
                                className={`text-left text-sm px-3 py-2 rounded-lg border transition-all inline-flex items-center justify-between gap-2 ${
                                  isPicking
                                    ? "border-primary bg-primary/10 text-foreground"
                                    : "border-border bg-surface text-foreground hover:border-primary/60 hover:bg-surface-elevated"
                                } disabled:opacity-50 disabled:cursor-not-allowed`}
                              >
                                <span className="inline-flex items-center gap-2">
                                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                  {slot.label || slot.start_at}
                                </span>
                                {isPicking && (
                                  <span className="text-[10px] text-muted-foreground italic">confirmando…</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {iaOpType === "reschedule" && (
                      <div className="flex flex-col gap-2">
                        <div>
                          <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">Nome do Cliente</label>
                          <input
                            type="text"
                            value={assignLeadName}
                            onChange={(e) => setAssignLeadName(e.target.value)}
                            placeholder="Nome do cliente..."
                            className="text-sm bg-surface border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 w-full placeholder:text-muted-foreground"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">ID do Agendamento a Reagendar</label>
                          <input
                            type="text"
                            value={cancelBookingIdField}
                            onChange={(e) => setCancelBookingIdField(e.target.value)}
                            placeholder="Ex: 483"
                            className="text-sm bg-surface border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 w-full placeholder:text-muted-foreground"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">Profissional</label>
                            <select
                              value={selectedProfessionalId ?? ""}
                              onChange={(e) => {
                                const id = Number(e.target.value) || null;
                                setSelectedProfessionalId(id);
                                setSelectedProcedureId(null);
                                setSelectedSpecialtyId(null);
                              }}
                              className="text-sm bg-surface border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 w-full"
                            >
                              <option value="">Selecionar...</option>
                              {professionalsForUnit.map((p) => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">Procedimento</label>
                            <select
                              value={selectedProcedureId ?? ""}
                              onChange={(e) => {
                                setSelectedProcedureId(Number(e.target.value) || null);
                                setSelectedSpecialtyId(null);
                              }}
                              disabled={!selectedProfessionalId}
                              className="text-sm bg-surface border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 w-full disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <option value="">{selectedProfessionalId ? "Selecionar..." : "—"}</option>
                              {proceduresForProfessional.map((p) => (
                                <option key={p.id} value={p.id}>{p.name ?? p.slug ?? `#${p.id}`}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            disabled
                            title="Ação ainda não implementada"
                            className="text-xs font-medium px-3 py-1.5 rounded-lg gradient-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center gap-1.5"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            Reagendar
                          </button>
                          <span className="text-[10px] text-muted-foreground italic">Sem ação conectada</span>
                        </div>
                      </div>
                    )}

                    {iaOpType === "cancel" && (
                      <div className="flex flex-col gap-2">
                        <div>
                          <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">Nome do Requisitante</label>
                          <input
                            type="text"
                            value={assignLeadName}
                            onChange={(e) => setAssignLeadName(e.target.value)}
                            placeholder="Nome do cliente..."
                            className="text-sm bg-surface border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 w-full placeholder:text-muted-foreground"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">ID do Agendamento a Cancelar</label>
                          <input
                            type="text"
                            value={cancelBookingIdField}
                            onChange={(e) => setCancelBookingIdField(e.target.value)}
                            placeholder="Ex: 483"
                            className="text-sm bg-surface border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 w-full placeholder:text-muted-foreground"
                          />
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            type="button"
                            disabled
                            title="Ação ainda não implementada"
                            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-status-canceled/15 text-status-canceled border border-status-canceled/30 disabled:opacity-40 disabled:cursor-not-allowed transition-all inline-flex items-center gap-1.5"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Cancelar Agenda
                          </button>
                          <span className="text-[10px] text-muted-foreground italic">Sem ação conectada</span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                hasProfessional && !isRescheduleCode ? (
                  effectiveProfessionalName
                ) : (
              <div className="flex flex-col gap-3 w-full">
                    {isCancelCode ? (
                      (() => {
                        const notesText = (bookingDetailForBot as any)?.notes ?? (booking as any)?.notes ?? "";
                        const alreadyCancelled = !!extractCancelledIdFromNotes(notesText);
                        return alreadyCancelled ? (
                          <div className="text-xs text-muted-foreground italic">Cancelamento já realizado.</div>
                        ) : (
                          <>
                            <div>
                              <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">Nome Requisitante</label>
                              <input
                                type="text"
                                value={assignLeadName}
                                onChange={(e) => setAssignLeadName(e.target.value)}
                                placeholder="Nome do cliente..."
                                className="text-sm bg-surface border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 w-full placeholder:text-muted-foreground"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">ID Agendamento</label>
                              <input
                                type="text"
                                value={cancelBookingIdField}
                                onChange={(e) => setCancelBookingIdField(e.target.value)}
                                placeholder="Ex: 483"
                                className="text-sm bg-surface border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 w-full placeholder:text-muted-foreground"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => assignProfMut.mutate(0)}
                                disabled={!assignLeadName.trim() || !cancelBookingIdField.trim() || assignProfMut.isPending}
                                className="text-xs font-medium px-3 py-1.5 rounded-lg gradient-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                              >
                                {assignProfMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Cancelar Agenda"}
                              </button>
                              {assignProfMut.isError && (
                                <span className="text-[10px] text-status-canceled">Erro ao atribuir</span>
                              )}
                            </div>
                          </>
                        );
                      })()
                    ) : isRescheduleCode ? (
                      (() => {
                        const notesText = (bookingDetailForBot as any)?.notes ?? (booking as any)?.notes ?? "";
                        const alreadyRescheduled = notesText.includes("Reagendamento: cancelamento do agendamento");
                        return alreadyRescheduled ? (
                          <div className="text-xs text-muted-foreground italic">Reagendamento já realizado.</div>
                        ) : (
                          <>
                            <div>
                              <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">Nome do Lead</label>
                              <input
                                type="text"
                                value={assignLeadName}
                                onChange={(e) => setAssignLeadName(e.target.value)}
                                placeholder="Nome do cliente..."
                                className="text-sm bg-surface border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 w-full placeholder:text-muted-foreground"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">ID Agendamento a Cancelar</label>
                              <input
                                type="text"
                                value={cancelBookingIdField}
                                onChange={(e) => setCancelBookingIdField(e.target.value)}
                                placeholder="Ex: 483"
                                className="text-sm bg-surface border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 w-full placeholder:text-muted-foreground"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">Profissional</label>
                                <select
                                  value={selectedProfessionalId ?? ""}
                                  onChange={(e) => {
                                    const id = Number(e.target.value) || null;
                                    setSelectedProfessionalId(id);
                                    setSelectedProcedureId(null);
                                    setSelectedSpecialtyId(null);
                                  }}
                                  className="text-sm bg-surface border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 w-full"
                                >
                                  <option value="">Selecionar...</option>
                                  {professionalsForUnit.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">Procedimento</label>
                                <select
                                  value={selectedProcedureId ?? ""}
                                  onChange={(e) => {
                                    setSelectedProcedureId(Number(e.target.value) || null);
                                    setSelectedSpecialtyId(null);
                                  }}
                                  disabled={!selectedProfessionalId}
                                  className="text-sm bg-surface border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 w-full disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  <option value="">{selectedProfessionalId ? "Selecionar..." : "—"}</option>
                                  {proceduresForProfessional.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name ?? p.slug ?? `#${p.id}`}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                            {selectedProcedureId && (
                              autoSpecialtyId ? (
                                <span className="text-xs text-muted-foreground">
                                  Especialidade: {allSpecialties.find((s) => s.id === autoSpecialtyId)?.name ?? `#${autoSpecialtyId}`}
                                </span>
                              ) : (
                                <div>
                                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">Especialidade</label>
                                  <select
                                    value={selectedSpecialtyId ?? ""}
                                    onChange={(e) => setSelectedSpecialtyId(Number(e.target.value) || null)}
                                    className="text-sm bg-surface border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 w-full"
                                  >
                                    <option value="">Selecionar especialidade...</option>
                                    {allSpecialties.map((s) => (
                                      <option key={s.id} value={s.id}>
                                        {s.name ?? `#${s.id}`}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )
                            )}
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => selectedProfessionalId && assignProfMut.mutate(selectedProfessionalId)}
                                disabled={!selectedProfessionalId || !selectedProcedureId || !assignLeadName.trim() || !cancelBookingIdField.trim() || assignProfMut.isPending}
                                className="text-xs font-medium px-3 py-1.5 rounded-lg gradient-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                              >
                                {assignProfMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Reagendar"}
                              </button>
                              {assignProfMut.isError && (
                                <span className="text-[10px] text-status-canceled">Erro ao atribuir</span>
                              )}
                            </div>
                          </>
                        );
                      })()
                    ) : (
                      <>
                        <div>
                          <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">Nome do Lead</label>
                          <input
                            type="text"
                            value={assignLeadName}
                            onChange={(e) => setAssignLeadName(e.target.value)}
                            placeholder="Nome do cliente..."
                            className="text-sm bg-surface border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 w-full placeholder:text-muted-foreground"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">Profissional</label>
                            <select
                              value={selectedProfessionalId ?? ""}
                              onChange={(e) => {
                                const id = Number(e.target.value) || null;
                                setSelectedProfessionalId(id);
                                setSelectedProcedureId(null);
                                setSelectedSpecialtyId(null);
                              }}
                              className="text-sm bg-surface border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 w-full"
                            >
                              <option value="">Selecionar...</option>
                              {professionalsForUnit.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">Procedimento</label>
                            <select
                              value={selectedProcedureId ?? ""}
                              onChange={(e) => {
                                setSelectedProcedureId(Number(e.target.value) || null);
                                setSelectedSpecialtyId(null);
                              }}
                              disabled={!selectedProfessionalId}
                              className="text-sm bg-surface border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 w-full disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <option value="">{selectedProfessionalId ? "Selecionar..." : "—"}</option>
                              {proceduresForProfessional.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.name ?? p.slug ?? `#${p.id}`}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {selectedProcedureId && (
                          autoSpecialtyId ? (
                            <span className="text-xs text-muted-foreground">
                              Especialidade: {allSpecialties.find((s) => s.id === autoSpecialtyId)?.name ?? `#${autoSpecialtyId}`}
                            </span>
                          ) : (
                            <div>
                              <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1 block">Especialidade</label>
                              <select
                                value={selectedSpecialtyId ?? ""}
                                onChange={(e) => setSelectedSpecialtyId(Number(e.target.value) || null)}
                                className="text-sm bg-surface border border-border rounded-lg px-2 py-1.5 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 w-full"
                              >
                                <option value="">Selecionar especialidade...</option>
                                {allSpecialties.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name ?? `#${s.id}`}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )
                        )}

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => selectedProfessionalId && assignProfMut.mutate(selectedProfessionalId)}
                            disabled={!selectedProfessionalId || !selectedProcedureId || !assignLeadName.trim() || assignProfMut.isPending}
                            className="text-xs font-medium px-3 py-1.5 rounded-lg gradient-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                          >
                            {assignProfMut.isPending ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              isConvo ? "Ligar Bot" : "Atribuir"
                            )}
                          </button>
                          {assignProfMut.isError && (
                            <span className="text-[10px] text-status-canceled">Erro ao atribuir</span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))
              }
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
                  {mode === "assisted_slots_dashboard"
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
