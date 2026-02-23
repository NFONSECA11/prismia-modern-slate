import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BookingRequest } from "@/types/booking";
import { StatusBadge } from "@/components/StatusBadge";
import { BookingModeIcon } from "@/components/BookingModeIcon";
import { Phone, Calendar, Clock, User, ChevronRight, Loader2 } from "lucide-react";

interface BookingTableProps {
  bookings: BookingRequest[];
  isLoading: boolean;
  onSelectBooking: (booking: BookingRequest) => void;
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

export function BookingTable({ bookings, isLoading, onSelectBooking }: BookingTableProps) {
  return (
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
              bookings.map((booking) => (
                <tr
                  key={booking.id}
                  onClick={() => onSelectBooking(booking)}
                  className="border-b border-border/40 hover:bg-surface-elevated/60 cursor-pointer transition-colors group"
                >
                  {/* Contato */}
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-foreground leading-tight">{booking.lead_name}</span>
                        <BookingModeIcon mode={booking.booking_mode} />
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

                  {/* Criado há */}
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatCreatedAgo(booking.created_at)}
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-primary transition-colors" />
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
