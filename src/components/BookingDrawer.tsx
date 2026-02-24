import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BookingRequest, BookingStatus, BookingMode, Professional } from "@/types/booking";
import { StatusBadge } from "@/components/StatusBadge";
import { BookingModeIcon } from "@/components/BookingModeIcon";

import {
  confirmBooking,
  cancelBooking,
  reopenBooking,
  handoffOn,
  handoffOff,
  suggestSlots,
  patchBooking,
  fetchProfessionalsByUnit,
} from "@/lib/bookingApi";
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
} from "lucide-react";

interface BookingDrawerProps {
  booking: BookingRequest | null;
  onClose: () => void;
  onConfirmed: () => void;
}

const TERMINAL_STATUSES: BookingStatus[] = ["confirmed", "canceled", "cancelled", "failed"];
function isTerminal(status: BookingStatus) {
  return TERMINAL_STATUSES.includes(status);
}

function DetailRow({
  icon: Icon,
  label,
  value,
  className,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg bg-surface-elevated/50 ${className ?? ""}`}>
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface text-muted-foreground flex-shrink-0 mt-0.5">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
          {label}
        </span>
        <span className="text-sm text-foreground leading-snug">{value}</span>
      </div>
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

export function BookingDrawer({ booking, onClose, onConfirmed }: BookingDrawerProps) {
  const [actionDone, setActionDone] = useState<string | null>(null);
  const [selectedProfessionalId, setSelectedProfessionalId] = useState<number | null>(null);

  const hasProfessional = !!(booking?.professional_name && booking.professional_name.trim() && booking.professional_name.trim() !== "None");

  // Always fetch professionals when drawer opens with a booking missing a professional
  const needsProfessional = !!booking && !hasProfessional;

  const { data: professionals = [] } = useQuery({
    queryKey: ["professionals-unit-drawer"],
    queryFn: async () => {
      // Try to find unit from the booking list endpoint (already cached)
      // Fallback: fetch without unit filter or use unit=1
      console.log("[BookingDrawer] fetching professionals...");
      const { data } = await (await import("@/lib/api")).default.get("/api/booking/professionals/");
      const result = Array.isArray(data) ? data : (data?.results ?? []);
      console.log("[BookingDrawer] professionals result:", result);
      return result;
    },
    enabled: needsProfessional,
  });

  const assignProfMut = useMutation({
    mutationFn: async (profId: number) => {
      return await patchBooking(booking!.id, { professional_id: profId });
    },
    onSuccess: (result) => {
      console.log("[BookingDrawer] assign success:", result);
      setActionDone("Profissional atribuído!");
      setSelectedProfessionalId(null);
      setTimeout(() => {
        onConfirmed();
        setActionDone(null);
      }, 1200);
    },
    onError: (err: any) => {
      console.error("[BookingDrawer] assign error:", err?.response?.status, err?.response?.data);
      setActionDone("Erro ao atribuir profissional");
      setTimeout(() => setActionDone(null), 3000);
    },
  });

  const makeMutation = (fn: () => Promise<void>, successMsg: string) => ({
    mutationFn: fn,
    onSuccess: () => {
      setActionDone(successMsg);
      setTimeout(() => {
        onConfirmed();
        if (successMsg === "Confirmado!" || successMsg === "Cancelado!") onClose();
        setActionDone(null);
      }, 1800);
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

  const reopenMut = useMutation(
    makeMutation(() => reopenBooking(booking!.id), "Reaberto!")
  );

  const handoffOnMut = useMutation(
    makeMutation(() => handoffOn(booking!.id), "Handoff ativado!")
  );

  const handoffOffMut = useMutation(
    makeMutation(() => handoffOff(booking!.id), "Handoff desativado!")
  );

  const suggestMut = useMutation(
    makeMutation(
      () => suggestSlots(booking!.id),
      "Sugestões enviadas!"
    )
  );

  if (!booking) return null;

  const hasChosenSlot = !!(booking.vars_snapshot?.chosen_slot || booking.chosen_slot);
  const chosenSlot = booking.chosen_slot || booking.vars_snapshot?.chosen_slot;
  const terminal = isTerminal(booking.status);
  const busy =
    confirmMut.isPending ||
    cancelMut.isPending ||
    reopenMut.isPending ||
    handoffOnMut.isPending ||
    handoffOffMut.isPending ||
    suggestMut.isPending;

  const mode = booking.booking_mode as BookingMode;

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
        actions.push(
          <ActionButton key="confirm" onClick={() => confirmMut.mutate()} disabled={busy} loading={confirmMut.isPending} icon={CheckCircle2} label="Confirmar" variant="primary" />,
          <ActionButton key="cancel" onClick={() => cancelMut.mutate()} disabled={busy} loading={cancelMut.isPending} icon={XCircle} label="Cancelar" variant="danger" />,
        );
      }
    } else if (mode === "assisted_slots_dashboard") {
      if (booking.status === "handoff" && !hasChosenSlot) {
        actions.push(
          <ActionButton key="suggest" onClick={() => suggestMut.mutate()} disabled={busy} loading={suggestMut.isPending} icon={CalendarSearch} label="Sugerir Horários" variant="primary" />,
          <ActionButton key="cancel" onClick={() => cancelMut.mutate()} disabled={busy} loading={cancelMut.isPending} icon={XCircle} label="Cancelar" variant="danger" />,
        );
      } else if (booking.status === "awaiting_choice") {
        // show waiting state + cancel
        actions.push(
          <ActionButton key="cancel" onClick={() => cancelMut.mutate()} disabled={busy} loading={cancelMut.isPending} icon={XCircle} label="Cancelar" variant="danger" />,
        );
      } else if (hasChosenSlot && (booking.status === "handoff" || booking.status === "pending")) {
        actions.push(
          <ActionButton key="confirm" onClick={() => confirmMut.mutate()} disabled={busy} loading={confirmMut.isPending} icon={CheckCircle2} label="Confirmar" variant="primary" />,
          <ActionButton key="cancel" onClick={() => cancelMut.mutate()} disabled={busy} loading={cancelMut.isPending} icon={XCircle} label="Cancelar" variant="danger" />,
        );
      }
    } else if (mode === "auto_slots_bot") {
      if (!terminal) {
        if (hasChosenSlot) {
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
        actions.push(
          <ActionButton key="suggest" onClick={() => suggestMut.mutate()} disabled={busy} loading={suggestMut.isPending} icon={CalendarSearch} label="Sugerir Horários" />,
          <ActionButton key="confirm" onClick={() => confirmMut.mutate()} disabled={busy} loading={confirmMut.isPending} icon={CheckCircle2} label="Confirmar" variant="primary" />,
        );
      }
    }

    // Handoff ON/OFF for non-terminal
    if (!terminal && booking.status !== "awaiting_choice") {
      if (booking.status === "handoff") {
        actions.push(
          <ActionButton key="hoff" onClick={() => handoffOffMut.mutate()} disabled={busy} loading={handoffOffMut.isPending} icon={PhoneOff} label="Handoff Off" />,
        );
      } else {
        actions.push(
          <ActionButton key="hon" onClick={() => handoffOnMut.mutate()} disabled={busy} loading={handoffOnMut.isPending} icon={PhoneForwarded} label="Handoff On" />,
        );
      }
    }

    // Reopen for terminal
    if (terminal) {
      actions.push(
        <ActionButton key="reopen" onClick={() => reopenMut.mutate()} disabled={busy} loading={reopenMut.isPending} icon={RotateCcw} label="Reabrir" />,
      );
    }

    return actions.length > 0 ? <div className="flex gap-2 flex-wrap">{actions}</div> : null;
  }

  const errorMutation = [confirmMut, cancelMut, reopenMut, handoffOnMut, handoffOffMut, suggestMut].find(m => m.isError);
  const anyError = !!errorMutation;
  const errorDetail = (() => {
    if (!errorMutation?.error) return "Erro ao comunicar com o servidor. Tente novamente.";
    const err = errorMutation.error as any;
    const data = err?.response?.data;
    // data pode ser string direta ou objeto
    const raw = typeof data === "string" ? data : (data?.code || data?.detail || data?.error || "");
    if (raw === "missing_slots")
      return "Não há disponibilidades para esse profissional e esse procedimento.";
    if (typeof data === "string") return data;
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
        <div className="flex items-center justify-between px-5 py-4 border-b border-border surface-elevated">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
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
          <div className="rounded-xl p-4 bg-surface border border-border">
            <div className="flex items-start justify-between gap-3 mb-1">
              <div>
                <div className="flex items-center gap-1.5">
                  <BookingModeIcon mode={booking.booking_mode} />
                  <h3 className="text-base font-semibold text-foreground">{booking.lead_name}</h3>
                </div>
                {(booking.contact_phone || booking.phone) && (
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Phone className="h-3 w-3" />
                    {booking.contact_phone || booking.phone}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {booking.conversation_bot_mode && (
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium border ${
                      booking.conversation_bot_mode === "on"
                        ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/10"
                        : "text-muted-foreground border-border bg-surface-elevated"
                    }`}
                  >
                    {booking.conversation_bot_mode === "on" ? (
                      <BotMessageSquare className="h-3 w-3" />
                    ) : (
                      <BotOff className="h-3 w-3" />
                    )}
                    Bot {booking.conversation_bot_mode.toUpperCase()}
                  </span>
                )}
                <StatusBadge status={booking.status} size="md" />
              </div>
            </div>
          </div>
          {/* Details grid */}
          <div className="grid grid-cols-2 gap-2">
            <DetailRow icon={Hash} label="Procedimento" value={booking.procedure_name} />
            <DetailRow icon={Building2} label="Unidade" value={booking.unit_name} />
            <DetailRow
              icon={User}
              label="Profissional"
              className="col-span-2"
              value={
                hasProfessional ? (
                  booking.professional_name
                ) : (
                  <div className="flex items-center gap-2">
                    <select
                      value={selectedProfessionalId ?? ""}
                      onChange={(e) => setSelectedProfessionalId(Number(e.target.value) || null)}
                      className="text-sm bg-surface border border-border rounded-lg px-2 py-1 text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60"
                    >
                      <option value="">Selecionar...</option>
                      {professionals.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => selectedProfessionalId && assignProfMut.mutate(selectedProfessionalId)}
                      disabled={!selectedProfessionalId || assignProfMut.isPending}
                      className="text-xs font-medium px-2.5 py-1 rounded-lg gradient-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      {assignProfMut.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        "Atribuir"
                      )}
                    </button>
                    {assignProfMut.isError && (
                      <span className="text-[10px] text-status-canceled">Erro ao atribuir</span>
                    )}
                  </div>
                )
              }
            />
            <DetailRow
              icon={Calendar}
              label="Janela Preferida"
              className="col-span-2"
              value={
                <span>
                  {booking.preferred_window}
                  <span className="ml-2 text-muted-foreground">— {booking.preferred_period}</span>
                </span>
              }
            />
            <DetailRow icon={Clock} label="Criado em" value={formattedCreated} />
            <DetailRow
              icon={Clock}
              label="Atualizado em"
              value={(() => {
                try {
                  return format(new Date(booking.updated_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
                } catch {
                  return "—";
                }
              })()}
            />
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

          {/* vars_snapshot */}
          <div className="rounded-xl overflow-hidden border border-border">
            <div className="surface-elevated px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border">
              vars_snapshot
            </div>
            <pre className="px-4 py-3 text-xs text-foreground font-mono overflow-x-auto leading-relaxed bg-surface">
              {JSON.stringify(booking.vars_snapshot, null, 2)}
            </pre>
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
