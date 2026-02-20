import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BookingRequest, BookingStatus } from "@/types/booking";
import { StatusBadge } from "@/components/StatusBadge";
import { confirmBooking, suggestSlots } from "@/lib/bookingApi";
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
  Ban,
  CalendarSearch,
} from "lucide-react";

interface BookingDrawerProps {
  booking: BookingRequest | null;
  onClose: () => void;
  onConfirmed: () => void;
}

// Estados finais da FSM — botões desabilitados
const TERMINAL_STATUSES: BookingStatus[] = ["confirmed", "canceled"];
function isTerminal(status: BookingStatus) {
  return TERMINAL_STATUSES.includes(status);
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-border/40 last:border-0">
      <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-surface-elevated text-muted-foreground flex-shrink-0 mt-0.5">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex flex-col gap-0.5 min-w-0">
        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">
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

export function BookingDrawer({ booking, onClose, onConfirmed }: BookingDrawerProps) {
  const [actionDone, setActionDone] = useState<"confirmed" | "suggested" | null>(null);

  const confirmMutation = useMutation({
    mutationFn: () =>
      confirmBooking(booking!.id, {
        use_chosen_slot: !!booking?.vars_snapshot?.chosen_slot,
        notes: "Confirmado via Dashboard PrismIA",
      }),
    onSuccess: () => {
      setActionDone("confirmed");
      setTimeout(() => {
        onConfirmed();
        onClose();
        setActionDone(null);
      }, 1800);
    },
  });

  const suggestMutation = useMutation({
    mutationFn: () =>
      suggestSlots(booking!.id, { generate: true, send: true }),
    onSuccess: () => {
      setActionDone("suggested");
      setTimeout(() => {
        onConfirmed(); // revalida cache
        setActionDone(null);
      }, 2000);
    },
  });

  if (!booking) return null;

  const hasChosenSlot = !!booking.vars_snapshot?.chosen_slot;
  const chosenSlot = booking.vars_snapshot?.chosen_slot;
  const terminal = isTerminal(booking.status);
  const busy = confirmMutation.isPending || suggestMutation.isPending;

  const formattedCreated = (() => {
    try {
      return format(new Date(booking.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
    } catch {
      return "—";
    }
  })();

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer Panel */}
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
                <h3 className="text-base font-semibold text-foreground">{booking.lead_name}</h3>
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {booking.phone}
                </p>
              </div>
              <StatusBadge status={booking.status} size="md" />
            </div>
            <p className="text-[10px] font-mono text-muted-foreground/50 mt-2">
              mode: {booking.booking_mode}
            </p>
          </div>

          {/* Details grid */}
          <div className="rounded-xl px-4 py-1 bg-surface border border-border">
            <DetailRow icon={Hash} label="Procedimento" value={booking.procedure_name} />
            <DetailRow icon={Building2} label="Unidade" value={booking.unit_name} />
            <DetailRow icon={User} label="Profissional" value={booking.professional_name} />
            <DetailRow
              icon={Calendar}
              label="Janela Preferida"
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

          {/* Chosen slot */}
          {hasChosenSlot && (
            <div className="rounded-xl p-4 border border-primary/30 bg-primary/5">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold text-primary uppercase tracking-wider">
                  Slot Selecionado pela IA
                </span>
              </div>
              <p className="text-sm font-medium text-foreground">{chosenSlot!.label}</p>
              <p className="text-xs text-muted-foreground font-mono mt-1">
                {chosenSlot!.start_at}
              </p>
            </div>
          )}

          {/* No slot warning */}
          {!hasChosenSlot && !terminal && (
            <div className="rounded-xl p-4 border border-status-pending/30 bg-status-pending-bg/30">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-status-pending" />
                <span className="text-xs font-medium text-status-pending">
                  Nenhum slot selecionado — gere sugestões via IA para enviar ao lead.
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

        {/* Footer — CTA */}
        <div className="px-5 py-4 border-t border-border surface-elevated space-y-2">
          {/* Feedback de ação concluída */}
          {actionDone === "confirmed" && (
            <div className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-status-confirmed bg-status-confirmed-bg border border-status-confirmed/30 animate-fade-in">
              <CheckCircle2 className="h-4 w-4" />
              Agendamento confirmado!
            </div>
          )}
          {actionDone === "suggested" && (
            <div className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold text-primary bg-primary/10 border border-primary/30 animate-fade-in">
              <CalendarSearch className="h-4 w-4" />
              Sugestões enviadas ao lead!
            </div>
          )}

          {/* Botões de ação — desabilitados em status terminal */}
          {!actionDone && (
            <div className="flex gap-2">
              {/* Sugerir Horários */}
              <button
                onClick={() => suggestMutation.mutate()}
                disabled={terminal || busy}
                title={terminal ? "Status terminal — ação indisponível" : ""}
                className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {suggestMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CalendarSearch className="h-4 w-4" />
                )}
                Sugerir Horários
              </button>

              {/* Confirmar */}
              <button
                onClick={() => confirmMutation.mutate()}
                disabled={terminal || busy}
                title={terminal ? "Status terminal — ação indisponível" : ""}
                className={`flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                  hasChosenSlot && !terminal
                    ? "gradient-primary text-primary-foreground hover:opacity-90 animate-pulse-glow"
                    : "bg-surface-elevated text-foreground border border-border hover:border-primary/50"
                }`}
              >
                {confirmMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Confirmar
              </button>
            </div>
          )}

          {/* Erros de rede */}
          {(confirmMutation.isError || suggestMutation.isError) && (
            <p className="text-xs text-center text-status-canceled animate-fade-in">
              Erro ao comunicar com o servidor. Verifique se o backend está acessível em{" "}
              <code className="font-mono">localhost:8000</code>.
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
