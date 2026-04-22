import { useState, useEffect, useCallback } from "react";
import { useConversationPopout } from "@/contexts/ConversationPopoutContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { cancelledBookingCache, extractCancelledIdFromNotes, isRescheduleFromNotes, extractProcedureFromNotes } from "@/lib/cancelledBookingCache";
import { useTheme } from "@/contexts/ThemeContext";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookingRequest, BookingStatus, BookingMode } from "@/types/booking";
import { StatusBadge, detectAiTag, type AiTag } from "@/components/StatusBadge";
import { ConfirmationIndicator } from "@/components/ConfirmationIndicator";
import { BookingModeIcon } from "@/components/BookingModeIcon";
import {
  confirmBooking,
  cancelBooking,
  reopenBooking,
  handoffOn,
  handoffOff,
  suggestSlots,
  fetchBookingPhoneById,
  fetchBookingRequestById,
} from "@/lib/bookingApi";
import {
  Phone,
  Calendar,
  Clock,
  User,
  ChevronRight,
  CheckCircle2,
  XCircle,
  RotateCcw,
  CalendarSearch,
  PhoneForwarded,
  PhoneOff,
  Loader2,
  MessageCircle,
  RefreshCw,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface BookingTableProps {
  bookings: BookingRequest[];
  isLoading: boolean;
  onSelectBooking: (booking: BookingRequest) => void;
  aiEnabled: boolean;
}

const TERMINAL_STATUSES: BookingStatus[] = ["confirmed", "canceled", "cancelled", "failed"];
function isTerminal(status: BookingStatus) {
  return TERMINAL_STATUSES.includes(status);
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  // +55 11 9 2273-4820
  if (digits.length === 13 && digits.startsWith("55")) {
    return `(${digits.slice(2, 4)}) ${digits.slice(4, 5)} ${digits.slice(5, 9)}-${digits.slice(9)}`;
  }
  // 11 9 2273-4820
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  // 10 digits
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

function formatCreatedAgo(dateStr: string) {
  try {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: ptBR });
  } catch {
    return "—";
  }
}

function SkeletonRow() {
  return (
    <tr className="border-b border-border/40">
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 rounded-full bg-surface-elevated animate-pulse" style={{ width: `${60 + i * 10}%` }} />
        </td>
      ))}
    </tr>
  );
}

interface QuickAction {
  key: string;
  icon: React.ElementType;
  label: string;
  variant: "primary" | "danger" | "default";
  action: () => Promise<void>;
}

function isConversationBooking(booking: BookingRequest): boolean {
  const code = ((booking as any).procedure_code ?? booking.procedure_slug ?? booking.procedure_name ?? "").trim().toLowerCase();
  return code === "human" || code === "prices";
}

function getQuickActions(booking: BookingRequest): Omit<QuickAction, "action">[] {
  const mode = booking.booking_mode as BookingMode;
  const terminal = isTerminal(booking.status);
  const hasChosenSlot = !!(booking.vars_snapshot?.chosen_slot || booking.chosen_slot);
  const actions: Omit<QuickAction, "action">[] = [];
  const isConvo = isConversationBooking(booking);

  if (mode === "handoff_manual") {
    if (booking.status === "handoff") {
      if (!isConvo) actions.push({ key: "confirm", icon: CheckCircle2, label: "Confirmar", variant: "primary" });
      actions.push({ key: "cancel", icon: XCircle, label: "Cancelar", variant: "danger" });
    }
  } else if (mode === "assisted_slots_dashboard") {
    if (booking.status === "handoff" && !hasChosenSlot) {
      if (!isConvo) actions.push({ key: "suggest", icon: CalendarSearch, label: "Sugerir Horários", variant: "primary" });
      actions.push({ key: "cancel", icon: XCircle, label: "Cancelar", variant: "danger" });
    } else if (booking.status === "awaiting_choice") {
      actions.push({ key: "cancel", icon: XCircle, label: "Cancelar", variant: "danger" });
    } else if (hasChosenSlot && (booking.status === "handoff" || booking.status === "pending")) {
      if (!isConvo) actions.push({ key: "confirm", icon: CheckCircle2, label: "Confirmar", variant: "primary" });
      actions.push({ key: "cancel", icon: XCircle, label: "Cancelar", variant: "danger" });
    }
  } else if (mode === "auto_slots_bot") {
    if (!terminal) {
      if (hasChosenSlot && !isConvo) {
        actions.push({ key: "confirm", icon: CheckCircle2, label: "Confirmar", variant: "primary" });
      }
      actions.push({ key: "cancel", icon: XCircle, label: "Cancelar", variant: "danger" });
    }
  } else {
    if (!terminal) {
      if (!isConvo) {
        actions.push(
          { key: "suggest", icon: CalendarSearch, label: "Sugerir Horários", variant: "default" },
          { key: "confirm", icon: CheckCircle2, label: "Confirmar", variant: "primary" },
        );
      }
    }
  }



  // Reopen for terminal
  if (terminal) {
    actions.push({ key: "reopen", icon: RotateCcw, label: "Reabrir", variant: "default" });
    if (booking.status === "confirmed") {
      const pCode = ((booking as any).procedure_code ?? booking.procedure_slug ?? booking.procedure_name ?? "").trim().toLowerCase();
      if (pCode !== "cancel") {
        actions.push({ key: "cancel", icon: XCircle, label: "Cancelar Agendamento", variant: "danger" });
      }
    } else {
      const pCode = ((booking as any).procedure_code ?? booking.procedure_slug ?? booking.procedure_name ?? "").trim().toLowerCase();
      if (pCode === "cancel" || pCode === "reschedule") {
        actions.push({ key: "cancel", icon: XCircle, label: "Cancelar Agendamento", variant: "danger" });
      }
    }
  }

  return actions;
}

function QuickActionButton({
  booking,
  actionDef,
  busyKey,
  onAction,
}: {
  booking: BookingRequest;
  actionDef: Omit<QuickAction, "action">;
  busyKey: string | null;
  onAction: (booking: BookingRequest, key: string) => void;
}) {
  const isBusy = busyKey !== null;
  const isMe = busyKey === actionDef.key;
  const Icon = actionDef.icon;

  const variantClasses = {
    primary: "text-primary-foreground gradient-primary hover:opacity-90",
    danger: "text-status-canceled bg-status-canceled/15 hover:bg-status-canceled/25 border border-status-canceled/30",
    default: "text-muted-foreground bg-surface-elevated hover:text-foreground border border-border",
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAction(booking, actionDef.key);
          }}
          disabled={isBusy}
          className={`flex items-center justify-center h-7 w-7 rounded-lg text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed ${variantClasses[actionDef.variant]}`}
        >
          {isMe ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {actionDef.label}
      </TooltipContent>
    </Tooltip>
  );
}

export function BookingTable({ bookings, isLoading, onSelectBooking, aiEnabled }: BookingTableProps) {
  console.log("[BookingTable] aiEnabled:", aiEnabled);
  const queryClient = useQueryClient();
  const { bgMode } = useTheme();
  const { open: openConversationPopout } = useConversationPopout();
  const isMobile = useIsMobile();
  const isGlass = bgMode === "landscape" || bgMode === "gradient";
  const [busyBookingId, setBusyBookingId] = useState<number | null>(null);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);
  const [phoneMap, setPhoneMap] = useState<Record<number, string>>({});
  const [rescheduleSet, setRescheduleSet] = useState<Set<number>>(new Set());
  const [rescheduleProcNameMap, setRescheduleProcNameMap] = useState<Record<number, string>>({});
  const [aiTagMap, setAiTagMap] = useState<Record<number, AiTag>>({});

  // Fetch phones for bookings that don't have one (API listing omits phone)
  useEffect(() => {
    if (!aiEnabled) return;
    const missing = bookings.filter(
      (b) => !b.contact_phone && !b.phone && !phoneMap[b.id]
    );
    if (missing.length === 0) return;

    let cancelled = false;
    const batch = missing.slice(0, 20);

    (async () => {
      const results: Record<number, string> = {};
      for (const b of batch) {
        if (cancelled) break;
        const phone = await fetchBookingPhoneById(b.id);
        if (phone) results[b.id] = phone;
      }
      if (!cancelled && Object.keys(results).length > 0) {
        setPhoneMap((prev) => ({ ...prev, ...results }));
      }
    })();

    return () => { cancelled = true; };
  }, [bookings, aiEnabled]);

  // Fetch notes for confirmed bookings to detect reschedule via BR_TAG_IN + real procedure name
  useEffect(() => {
    if (!aiEnabled) return;
    const confirmed = bookings.filter(
      (b) => b.status === "confirmed" && !rescheduleSet.has(b.id)
    );
    if (confirmed.length === 0) return;

    let cancelled = false;
    const batch = confirmed.slice(0, 20);

    (async () => {
      const newIds: number[] = [];
      const newProcNames: Record<number, string> = {};
      for (const b of batch) {
        if (cancelled) break;
        try {
          const detail = await fetchBookingRequestById(b.id);
          const detailNotes = (detail as any).notes ?? "";
          const isResch = isRescheduleFromNotes(detailNotes);
          if (isResch) {
            newIds.push(b.id);
            // Extract real procedure name from notes log
            const realProc = extractProcedureFromNotes(detailNotes);
            if (realProc) {
              newProcNames[b.id] = realProc;
            }
          }
        } catch { /* ignore */ }
      }
      if (!cancelled && newIds.length > 0) {
        setRescheduleSet((prev) => {
          const next = new Set(prev);
          newIds.forEach((id) => next.add(id));
          return next;
        });
      }
      if (!cancelled && Object.keys(newProcNames).length > 0) {
        setRescheduleProcNameMap((prev) => ({ ...prev, ...newProcNames }));
      }
    })();

    return () => { cancelled = true; };
  }, [bookings, aiEnabled]);

  // Fetch notes for all bookings to detect AI tags
  useEffect(() => {
    if (!aiEnabled) return;
    if (bookings.length === 0) return;

    const visibleIds = new Set(bookings.map((b) => b.id));
    setAiTagMap((prev) => {
      const next: Record<number, AiTag> = {};
      for (const [id, tag] of Object.entries(prev)) {
        const numericId = Number(id);
        if (visibleIds.has(numericId)) next[numericId] = tag as AiTag;
      }
      return next;
    });

    const immediateResults: Record<number, AiTag> = {};
    const needsFetch: BookingRequest[] = [];

    for (const b of bookings) {
      const listNotes = typeof b.notes === "string" ? b.notes : "";
      const listTag = detectAiTag(listNotes);
      if (listTag) {
        immediateResults[b.id] = listTag;
      }

      // Sempre busca detalhe em background para garantir a ÚLTIMA tag temporal
      // (a listagem pode vir truncada/defasada em relação ao detalhe).
      needsFetch.push(b);
    }

    if (Object.keys(immediateResults).length > 0) {
      setAiTagMap((prev) => ({ ...prev, ...immediateResults }));
    }

    if (needsFetch.length === 0) return;

    let cancelled = false;

    (async () => {
      const CHUNK_SIZE = 20;

      for (let i = 0; i < needsFetch.length; i += CHUNK_SIZE) {
        if (cancelled) break;

        const chunk = needsFetch.slice(i, i + CHUNK_SIZE);
        const entries = await Promise.all(
          chunk.map(async (b) => {
            try {
              const detail = await fetchBookingRequestById(b.id);
              const detailNotes = (detail as any).notes ?? "";
              const tag = detectAiTag(detailNotes);
              return [b.id, tag] as const;
            } catch {
              return [b.id, null] as const;
            }
          })
        );

        if (cancelled || entries.length === 0) continue;

        const foundEntries = entries.filter((entry): entry is readonly [number, AiTag] => Boolean(entry[1]));
        if (foundEntries.length === 0) continue;

        const newTags = Object.fromEntries(foundEntries) as Record<number, AiTag>;
        setAiTagMap((prev) => ({ ...prev, ...newTags }));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bookings, aiEnabled]);

  const executeAction = async (booking: BookingRequest, key: string) => {
    setBusyBookingId(booking.id);
    setBusyActionKey(key);
    try {
      const hasChosenSlot = !!(booking.vars_snapshot?.chosen_slot || booking.chosen_slot);
      switch (key) {
        case "confirm":
          await confirmBooking(booking.id, {
            use_chosen_slot: hasChosenSlot,
            notes: "Confirmado via Dashboard PrismIA",
          });
          break;
        case "cancel":
          if (booking.status === "confirmed") {
            try {
              await reopenBooking(booking.id);
              await new Promise(r => setTimeout(r, 500));
            } catch (reopenErr: any) {
              console.warn("[QuickAction] reopen failed, attempting cancel directly:", reopenErr?.response?.status);
            }
          }
          await cancelBooking(booking.id);
          break;
        case "reopen":
          await reopenBooking(booking.id);
          break;
        case "suggest":
          await suggestSlots(booking.id);
          break;
        case "handoff_on":
          await handoffOn(booking.id);
          break;
        case "handoff_off":
          await handoffOff(booking.id);
          break;
      }
      queryClient.invalidateQueries({ queryKey: ["booking-requests"] });
    } catch (err: any) {
      const status = err?.response?.status;
      const url = err?.config?.url || "unknown";
      const data = err?.response?.data;
      const raw = typeof data === "string" ? data : (data?.code || data?.detail || data?.error || "");
      const rawStr = raw?.toString() || "";
      const isDuplicate = (status === 409 || rawStr.includes("duplicate key") || rawStr.includes("uniq_confirmed") || rawStr.includes("already exists")) && key !== "cancel";
      const isHtmlOrLong = (typeof data === "string" && data.length > 200) || rawStr.includes("<!");
      const msg = isDuplicate
        ? "Esse horário já está confirmado para este profissional. Escolha outro horário."
        : raw === "missing_slots"
          ? "Sem disponibilidades para esse profissional/procedimento."
          : isHtmlOrLong
            ? `Erro ${status || ""} do servidor ao processar "${key}". Verifique os logs do backend.`
            : (data?.detail || data?.error || `Erro ${status || ""} ao executar ação.`);
      toast.error(msg);
      console.error(`[QuickAction] ${key} error:`, { status, url, detail: typeof data === "string" ? data.substring(0, 500) : data });
    } finally {
      setBusyBookingId(null);
      setBusyActionKey(null);
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className={`rounded-xl border border-border/60 overflow-hidden shadow-md ${isGlass ? "backdrop-blur-xl" : ""}`} style={{ background: isGlass ? "hsl(var(--surface) / 0.85)" : "hsl(var(--surface))" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60" style={{ background: "hsl(var(--table-header-bg))" }}>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Contato
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Procedimento
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Agendamento
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Profissional
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Criado
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
              ) : bookings.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground text-sm">
                    Nenhum agendamento encontrado
                  </td>
                </tr>
              ) : (
                bookings.map((booking, index) => {
                  const actions = getQuickActions(booking);
                  const rawBotMode = booking.conversation_bot_mode ?? booking.vars_snapshot?.conversation_bot_mode;
                  const normalizedBotMode = typeof rawBotMode === "string" ? rawBotMode.trim().toLowerCase() : "off";
                  const isBotOn = normalizedBotMode === "on";
                  const isBotOff = booking.status === "handoff" || booking.status === "awaiting_choice" || booking.status === "pending";
                  const isBusy = busyBookingId === booking.id;
                  const normalizedProcedureCode = (
                    (booking as BookingRequest & { procedure_code?: string }).procedure_code ??
                    booking.procedure_slug ??
                    booking.procedure_name ??
                    ""
                  ).trim().toLowerCase();
                  const isConversationRequest = normalizedProcedureCode === "human" || normalizedProcedureCode === "prices";

                  return (
                    <tr
                      key={`${booking.id}-${booking.updated_at ?? booking.created_at ?? ""}-${booking.status}-${index}`}
                      onClick={() => onSelectBooking(booking)}
                      className="border-b border-white/10 cursor-pointer transition-colors group relative"
                      style={{ backgroundColor: undefined }}
                      onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'hsl(var(--row-hover) / 0.6)'}
                      onMouseLeave={(e) => e.currentTarget.style.backgroundColor = ''}
                    >
                      {/* Contato */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            {aiEnabled && <BookingModeIcon mode={booking.booking_mode} />}
                            <span className="inline-flex items-center rounded-md border border-border bg-surface-elevated px-1.5 py-0.5 text-[10px] font-semibold text-foreground">
                              #{booking.id}
                            </span>
                            {aiEnabled ? (
                              isConversationRequest ? (
                                <span className="inline-flex items-center gap-1.5 font-medium text-primary leading-tight">
                                  <MessageCircle className="h-4 w-4 text-primary" />
                                  Conversa
                                </span>
                              ) : (
                                <span className="font-medium text-foreground leading-tight">{booking.lead_name}</span>
                              )
                            ) : (
                              <span className="font-medium text-foreground leading-tight">{booking.lead_name}</span>
                            )}
                          </div>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {aiEnabled
                              ? (() => { const p = booking.contact_phone || booking.phone || phoneMap[booking.id]; return p ? formatPhone(p) : "Sem telefone"; })()
                              : (() => { const p = booking.contact_phone || booking.phone; return p ? formatPhone(p) : "Sem telefone"; })()}
                          </span>
                        </div>
                      </td>

                      {/* Procedimento */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          {aiEnabled ? (
                            (() => {
                              const idFromNotes = extractCancelledIdFromNotes(booking.notes);
                              const cachedId = cancelledBookingCache.get(booking.id)?.cancelledId;
                              const effectiveId = idFromNotes || cachedId;
                              const isReschedule = normalizedProcedureCode === "reschedule" || rescheduleSet.has(booking.id);
                              return (
                                <>
                                  <span className="text-foreground leading-tight flex items-center gap-1.5">
                                    {isReschedule && (
                                      <span title="Reagendamento"><RefreshCw className="h-3.5 w-3.5 text-amber-400 flex-shrink-0" /></span>
                                    )}
                                    {effectiveId && !isReschedule
                                      ? `Cancelar agendamento #${effectiveId}`
                                      : isReschedule && rescheduleProcNameMap[booking.id]
                                        ? rescheduleProcNameMap[booking.id]
                                        : booking.procedure_name}
                                  </span>
                                  <span className="text-xs text-muted-foreground">{booking.unit_name}</span>
                                </>
                              );
                            })()
                          ) : (
                            <>
                              <span className="text-foreground leading-tight">{booking.procedure_name}</span>
                              <span className="text-xs text-muted-foreground">{booking.unit_name}</span>
                            </>
                          )}
                        </div>
                      </td>

                      {/* Agendamento */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          {booking.scheduled_at ? (() => {
                            const dt = new Date(booking.scheduled_at);
                            const day = dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
                            const time = dt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                            return (
                              <>
                                <span className="flex items-center gap-1 text-foreground text-xs">
                                  <Calendar className="h-3 w-3 text-primary" />
                                  {day}
                                </span>
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  {time}
                                </span>
                              </>
                            );
                          })() : (
                            <span className="text-xs text-muted-foreground">Não agendado</span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1 items-start">
                          <StatusBadge
                            status={booking.status}
                            hasSchedule={!!booking.scheduled_at}
                            procedureName={booking.procedure_name}
                            aiTag={aiEnabled ? (aiTagMap[booking.id] ?? detectAiTag(typeof booking.notes === "string" ? booking.notes : "") ?? null) : null}
                          />
                          {aiEnabled && booking.confirmation && (
                            <div className="pl-[0.35rem]">
                              <ConfirmationIndicator confirmation={booking.confirmation} />
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Profissional */}
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-1.5 text-foreground text-xs">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          {booking.professional_name}
                        </span>
                      </td>

                      {/* Criado há + Quick Actions */}
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {formatCreatedAgo(booking.created_at)}
                          </span>

                          {/* Conversa (popout) — somente status handoff */}
                          {booking.status === "handoff" && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isMobile) {
                                      onSelectBooking(booking);
                                    } else {
                                      openConversationPopout(booking);
                                    }
                                  }}
                                  aria-label="Abrir conversa"
                                  className="flex items-center justify-center h-7 w-7 rounded-lg text-xs transition-all text-primary bg-primary/10 hover:bg-primary/20 border border-primary/30"
                                >
                                  <MessageCircle className="h-3.5 w-3.5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="top" className="text-xs">
                                Abrir conversa
                              </TooltipContent>
                            </Tooltip>
                          )}

                          {/* Quick actions - visible on hover */}
                          {(actions.length > 0 || isBotOff) && (
                            <div className="hidden group-hover:flex items-center gap-1 animate-fade-in">
                              {isBotOff && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onSelectBooking(booking);
                                      }}
                                      className="flex items-center justify-center h-7 w-7 rounded-lg text-xs transition-all text-primary bg-primary/15 hover:bg-primary/25 border border-primary/30"
                                    >
                                      <MessageCircle className="h-3.5 w-3.5" />
                                    </button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">
                                    Enviar mensagem
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              {actions.map((a) => (
                                <QuickActionButton
                                  key={a.key}
                                  booking={booking}
                                  actionDef={a}
                                  busyKey={isBusy ? busyActionKey : null}
                                  onAction={executeAction}
                                />
                              ))}
                            </div>
                          )}

                          {/* Chevron - hidden on hover when actions show */}
                          <ChevronRight className={`h-4 w-4 text-muted-foreground/40 group-hover:hidden transition-colors ${actions.length === 0 ? '!block group-hover:!block group-hover:text-primary' : ''}`} />
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </TooltipProvider>
  );
}
