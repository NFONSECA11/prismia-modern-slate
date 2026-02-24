import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookingRequest, BookingStatus, BookingMode } from "@/types/booking";
import { StatusBadge } from "@/components/StatusBadge";
import { BookingModeIcon } from "@/components/BookingModeIcon";
import {
  confirmBooking,
  cancelBooking,
  reopenBooking,
  handoffOn,
  handoffOff,
  suggestSlots,
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
}

const TERMINAL_STATUSES: BookingStatus[] = ["confirmed", "canceled", "cancelled", "failed"];
function isTerminal(status: BookingStatus) {
  return TERMINAL_STATUSES.includes(status);
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

function getQuickActions(booking: BookingRequest): Omit<QuickAction, "action">[] {
  const mode = booking.booking_mode as BookingMode;
  const terminal = isTerminal(booking.status);
  const hasChosenSlot = !!(booking.vars_snapshot?.chosen_slot || booking.chosen_slot);
  const actions: Omit<QuickAction, "action">[] = [];

  if (mode === "handoff_manual") {
    if (booking.status === "handoff") {
      actions.push(
        { key: "confirm", icon: CheckCircle2, label: "Confirmar", variant: "primary" },
        { key: "cancel", icon: XCircle, label: "Cancelar", variant: "danger" },
      );
    }
  } else if (mode === "assisted_slots_dashboard") {
    if (booking.status === "handoff" && !hasChosenSlot) {
      actions.push(
        { key: "suggest", icon: CalendarSearch, label: "Sugerir Horários", variant: "primary" },
        { key: "cancel", icon: XCircle, label: "Cancelar", variant: "danger" },
      );
    } else if (booking.status === "awaiting_choice") {
      actions.push(
        { key: "cancel", icon: XCircle, label: "Cancelar", variant: "danger" },
      );
    } else if (hasChosenSlot && (booking.status === "handoff" || booking.status === "pending")) {
      actions.push(
        { key: "confirm", icon: CheckCircle2, label: "Confirmar", variant: "primary" },
        { key: "cancel", icon: XCircle, label: "Cancelar", variant: "danger" },
      );
    }
  } else if (mode === "auto_slots_bot") {
    if (!terminal) {
      if (hasChosenSlot) {
        actions.push({ key: "confirm", icon: CheckCircle2, label: "Confirmar", variant: "primary" });
      }
      actions.push({ key: "cancel", icon: XCircle, label: "Cancelar", variant: "danger" });
    }
  } else {
    if (!terminal) {
      actions.push(
        { key: "suggest", icon: CalendarSearch, label: "Sugerir Horários", variant: "default" },
        { key: "confirm", icon: CheckCircle2, label: "Confirmar", variant: "primary" },
      );
    }
  }

  // Handoff toggle
  if (!terminal && booking.status !== "awaiting_choice") {
    if (booking.status === "handoff") {
      actions.push({ key: "handoff_off", icon: PhoneOff, label: "Handoff Off", variant: "default" });
    } else {
      actions.push({ key: "handoff_on", icon: PhoneForwarded, label: "Handoff On", variant: "default" });
    }
  }

  // Reopen for terminal
  if (terminal) {
    actions.push({ key: "reopen", icon: RotateCcw, label: "Reabrir", variant: "default" });
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

export function BookingTable({ bookings, isLoading, onSelectBooking }: BookingTableProps) {
  const queryClient = useQueryClient();
  const [busyBookingId, setBusyBookingId] = useState<number | null>(null);
  const [busyActionKey, setBusyActionKey] = useState<string | null>(null);

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
      const data = err?.response?.data;
      const raw = typeof data === "string" ? data : (data?.code || data?.detail || data?.error || "");
      const msg = raw === "missing_slots"
        ? "Sem disponibilidades para esse profissional/procedimento."
        : (typeof data === "string" ? data : (data?.detail || data?.error || "Erro ao executar ação."));
      console.error(`[QuickAction] ${key} error:`, msg);
    } finally {
      setBusyBookingId(null);
      setBusyActionKey(null);
    }
  };

  return (
    <TooltipProvider delayDuration={200}>
      <div className="rounded-xl border border-border overflow-hidden surface-raised shadow-md">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 surface-elevated">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Contato
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Procedimento
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider">
                  Janela / Período
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
                bookings.map((booking) => {
                  const actions = getQuickActions(booking);
                  const rawBotMode = booking.conversation_bot_mode ?? booking.vars_snapshot?.conversation_bot_mode;
                  const normalizedBotMode = typeof rawBotMode === "string" ? rawBotMode.trim().toLowerCase() : "off";
                  const isBotOn = normalizedBotMode === "on";
                  const isBusy = busyBookingId === booking.id;

                  return (
                    <tr
                      key={booking.id}
                      onClick={() => onSelectBooking(booking)}
                      className="border-b border-border/40 hover:bg-surface-elevated/60 cursor-pointer transition-colors group relative"
                    >
                      {/* Contato */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <BookingModeIcon mode={booking.booking_mode} />
                            <span className="font-medium text-foreground leading-tight">{booking.lead_name}</span>
                          </div>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            {booking.contact_phone || booking.phone || "Sem telefone"}
                          </span>
                        </div>
                      </td>

                      {/* Procedimento */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-foreground leading-tight">{booking.procedure_name}</span>
                          <span className="text-xs text-muted-foreground">{booking.unit_name}</span>
                        </div>
                      </td>

                      {/* Janela / Período */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="flex items-center gap-1 text-foreground text-xs">
                            <Calendar className="h-3 w-3 text-primary" />
                            {booking.preferred_window}
                          </span>
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            {booking.preferred_period}
                          </span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <StatusBadge status={booking.status} />
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
                          
                          {/* Quick actions - visible on hover */}
                          {(actions.length > 0 || !isBotOn) && (
                            <div className="hidden group-hover:flex items-center gap-1 animate-fade-in">
                              {!isBotOn && (
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
