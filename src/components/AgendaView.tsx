import { useMemo } from "react";
import { format, addDays, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { BookingRequest, Professional } from "@/types/booking";
import { StatusBadge } from "@/components/StatusBadge";

interface AgendaViewProps {
  bookings: BookingRequest[];
  professionals: Professional[];
  onSelectBooking: (booking: BookingRequest) => void;
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 8); // 08:00–19:00

// Parse the chosen slot time and return hour
function getSlotHour(booking: BookingRequest): number | null {
  const slot = booking.vars_snapshot?.chosen_slot;
  if (!slot) return null;
  try {
    return new Date(slot.start_at).getHours();
  } catch {
    return null;
  }
}

// Get the chosen slot date for column matching
function getSlotDate(booking: BookingRequest): string | null {
  const slot = booking.vars_snapshot?.chosen_slot;
  if (!slot) return null;
  try {
    return format(new Date(slot.start_at), "yyyy-MM-dd");
  } catch {
    return null;
  }
}

export function AgendaView({ bookings, professionals, onSelectBooking }: AgendaViewProps) {
  const weekStart = startOfWeek(new Date("2026-02-21"), { weekStartsOn: 6 }); // Sat
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const bookingsByProfAndDay = useMemo(() => {
    const map: Record<string, Record<string, BookingRequest[]>> = {};
    for (const prof of professionals) {
      map[prof.id] = {};
      for (const day of days) {
        map[prof.id][format(day, "yyyy-MM-dd")] = [];
      }
    }
    for (const b of bookings) {
      const dateKey = getSlotDate(b);
      if (dateKey && map[b.professional_id]?.[dateKey]) {
        map[b.professional_id][dateKey].push(b);
      }
    }
    return map;
  }, [bookings, professionals, days]);

  return (
    <div className="rounded-xl border border-border overflow-hidden surface-raised shadow-md">
      {/* Header: day columns × professional */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: `${professionals.length * 200 + 60}px` }}>
          {/* Column headers: Prof × Day */}
          <div className="flex border-b border-border surface-elevated">
            {/* Time gutter */}
            <div className="w-[60px] flex-shrink-0 px-2 py-3 text-xs text-muted-foreground font-medium uppercase tracking-wider border-r border-border/40">
              Hora
            </div>
            {/* One column per professional */}
            {professionals.map((prof) => (
              <div
                key={prof.id}
                className="flex-1 border-r border-border/40 last:border-r-0 px-3 py-3"
              >
                <p className="text-xs font-semibold text-foreground truncate">{prof.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">{prof.specialty}</p>
              </div>
            ))}
          </div>

          {/* Day sub-headers */}
          <div className="flex border-b border-border/60 bg-surface">
            <div className="w-[60px] flex-shrink-0 border-r border-border/40" />
            {professionals.map((prof) => (
              <div key={prof.id} className="flex-1 border-r border-border/40 last:border-r-0 flex">
                {days.map((day) => (
                  <div
                    key={format(day, "yyyy-MM-dd")}
                    className="flex-1 border-r border-border/20 last:border-r-0 px-1 py-1.5 text-center"
                  >
                    <p className="text-[9px] font-medium text-muted-foreground/70 uppercase">
                      {format(day, "EEE", { locale: ptBR })}
                    </p>
                    <p className="text-[10px] text-foreground font-semibold">{format(day, "dd")}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Grid rows */}
          {HOURS.map((hour) => (
            <div
              key={hour}
              className="flex border-b border-border/20 hover:bg-surface-elevated/20 transition-colors"
              style={{ minHeight: "48px" }}
            >
              {/* Time label */}
              <div className="w-[60px] flex-shrink-0 px-2 py-1 text-[10px] text-muted-foreground/60 font-mono border-r border-border/20 flex items-start pt-1.5">
                {String(hour).padStart(2, "0")}:00
              </div>

              {/* Professional columns */}
              {professionals.map((prof) => (
                <div key={prof.id} className="flex-1 border-r border-border/20 last:border-r-0 flex">
                  {days.map((day) => {
                    const dateKey = format(day, "yyyy-MM-dd");
                    const dayBookings = (bookingsByProfAndDay[prof.id]?.[dateKey] ?? []).filter(
                      (b) => getSlotHour(b) === hour
                    );
                    return (
                      <div
                        key={dateKey}
                        className="flex-1 border-r border-border/[0.08] last:border-r-0 p-0.5 flex flex-col gap-0.5"
                      >
                        {dayBookings.map((booking) => (
                          <button
                            key={booking.id}
                            onClick={() => onSelectBooking(booking)}
                            className="w-full text-left rounded px-1.5 py-1 text-[9px] font-medium leading-tight transition-all hover:scale-[1.02] hover:z-10 relative"
                            style={{
                              background:
                                booking.status === "handoff"
                                  ? "hsl(var(--status-handoff-bg))"
                                  : booking.status === "assisted"
                                  ? "hsl(var(--status-assisted-bg))"
                                  : booking.status === "confirmed"
                                  ? "hsl(var(--status-confirmed-bg))"
                                  : "hsl(var(--status-pending-bg))",
                              color:
                                booking.status === "handoff"
                                  ? "hsl(var(--status-handoff))"
                                  : booking.status === "assisted"
                                  ? "hsl(var(--status-assisted))"
                                  : booking.status === "confirmed"
                                  ? "hsl(var(--status-confirmed))"
                                  : "hsl(var(--status-pending))",
                              borderLeft: `2px solid currentColor`,
                            }}
                          >
                            <span className="block truncate">{booking.lead_name}</span>
                            <span className="block truncate opacity-70">{booking.procedure_name}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-4 py-2 border-t border-border surface-elevated">
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Legenda:</span>
        {(["handoff", "assisted", "confirmed", "pending"] as const).map((s) => (
          <StatusBadge key={s} status={s} size="sm" />
        ))}
      </div>
    </div>
  );
}
