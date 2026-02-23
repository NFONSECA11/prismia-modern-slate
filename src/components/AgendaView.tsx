import { useMemo, useRef, useEffect, useState } from "react";
import {
  format,
  addDays,
  addWeeks,
  subWeeks,
  startOfWeek,
  isToday,
  parseISO,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { BookingRequest, Professional, BookingStatus } from "@/types/booking";
import { StatusBadge } from "@/components/StatusBadge";
import { NewBookingModal, NewBookingSlot, NewBookingFormData } from "@/components/NewBookingModal";
import { ChevronLeft, ChevronRight, CalendarDays, Clock, Plus } from "lucide-react";

interface AgendaViewProps {
  bookings: BookingRequest[];
  professionals: Professional[];
  onSelectBooking: (booking: BookingRequest) => void;
  onSaveBooking: (data: NewBookingFormData) => Promise<void>;
}

type AgendaMode = "day" | "week";

const HOURS = Array.from({ length: 13 }, (_, i) => i + 7); // 07:00–19:00
const CELL_HEIGHT = 56; // px per hour

function getSlotDateTime(booking: BookingRequest): { date: string; hour: number; minute: number } | null {
  const slot = booking.vars_snapshot?.chosen_slot;
  if (!slot) return null;
  try {
    const d = parseISO(slot.start_at);
    return { date: format(d, "yyyy-MM-dd"), hour: d.getHours(), minute: d.getMinutes() };
  } catch {
    return null;
  }
}

function getStatusColors(status: string) {
  const map: Record<string, { bg: string; text: string; border: string }> = {
    handoff:          { bg: "hsl(var(--status-handoff-bg))",   text: "hsl(var(--status-handoff))",   border: "hsl(var(--status-handoff))"   },
    assisted:         { bg: "hsl(var(--status-assisted-bg))",  text: "hsl(var(--status-assisted))",  border: "hsl(var(--status-assisted))"  },
    confirmed:        { bg: "hsl(var(--status-confirmed-bg))", text: "hsl(var(--status-confirmed))", border: "hsl(var(--status-confirmed))" },
    pending:          { bg: "hsl(var(--status-pending-bg))",   text: "hsl(var(--status-pending))",   border: "hsl(var(--status-pending))"   },
    canceled:         { bg: "hsl(var(--status-canceled-bg))",  text: "hsl(var(--status-canceled))",  border: "hsl(var(--status-canceled))"  },
    cancelled:        { bg: "hsl(var(--status-canceled-bg))",  text: "hsl(var(--status-canceled))",  border: "hsl(var(--status-canceled))"  },
    failed:           { bg: "hsl(var(--status-canceled-bg))",  text: "hsl(var(--status-canceled))",  border: "hsl(var(--status-canceled))"  },
    awaiting_choice:  { bg: "hsl(var(--status-pending-bg))",   text: "hsl(var(--status-pending))",   border: "hsl(var(--status-pending))"   },
  };
  return map[status] ?? map.pending;
}

function useCurrentTimeTop(startHour: number) {
  const [top, setTop] = useState<number | null>(null);
  useEffect(() => {
    const update = () => {
      const now = new Date();
      const offset = (now.getHours() - startHour + now.getMinutes() / 60) * CELL_HEIGHT;
      setTop(offset);
    };
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [startHour]);
  return top;
}

// ── Shared booking event card ──────────────────────────────────────────────
function BookingCard({
  booking,
  topOffset,
  compact,
  onClick,
}: {
  booking: BookingRequest;
  topOffset: number;
  compact?: boolean;
  onClick: () => void;
}) {
  const dt = getSlotDateTime(booking)!;
  const colors = getStatusColors(booking.status);
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="absolute left-1 right-1 rounded-md px-2 py-1 text-left transition-all hover:brightness-110 hover:z-10 hover:scale-[1.01] z-10"
      style={{
        top: `${topOffset + 2}px`,
        minHeight: compact ? "36px" : "44px",
        background: colors.bg,
        color: colors.text,
        borderLeft: `3px solid ${colors.border}`,
      }}
    >
      <span className="flex items-center gap-1 text-[10px] font-semibold truncate leading-tight">
        <Clock className="h-2.5 w-2.5 flex-shrink-0 opacity-70" />
        {String(dt.hour).padStart(2, "0")}:{String(dt.minute).padStart(2, "0")}
      </span>
      <span className="block text-[11px] font-medium truncate leading-tight mt-0.5">{booking.lead_name}</span>
      {!compact && (
        <span className="block text-[9px] opacity-70 truncate">{booking.procedure_name}</span>
      )}
    </button>
  );
}

// ── Clickable empty cell ───────────────────────────────────────────────────
function EmptyCell({
  onClick,
  className = "",
}: {
  onClick: () => void;
  className?: string;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`absolute inset-0 cursor-pointer flex items-center justify-center transition-colors rounded-sm ${className}`}
      style={{ background: hover ? "hsl(var(--primary) / 0.06)" : "transparent" }}
    >
      {hover && (
        <span className="flex items-center gap-1 text-[9px] font-medium text-primary/70 select-none pointer-events-none">
          <Plus className="h-3 w-3" />
          Agendar
        </span>
      )}
    </div>
  );
}

// ── Day View ────────────────────────────────────────────────────────────────
function DayView({
  day,
  professionals,
  bookings,
  onSelectBooking,
  onCellClick,
}: {
  day: Date;
  professionals: Professional[];
  bookings: BookingRequest[];
  onSelectBooking: (b: BookingRequest) => void;
  onCellClick: (slot: NewBookingSlot) => void;
}) {
  const dateKey = format(day, "yyyy-MM-dd");
  const currentTimeTop = useCurrentTimeTop(HOURS[0]);
  const showNow = isToday(day);

  const byProf = useMemo(() => {
    const map: Record<number, BookingRequest[]> = {};
    for (const p of professionals) map[p.id] = [];
    for (const b of bookings) {
      const dt = getSlotDateTime(b);
      if (dt?.date === dateKey && map[b.professional_id] !== undefined) {
        map[b.professional_id].push(b);
      }
    }
    return map;
  }, [bookings, professionals, dateKey]);

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: `${Math.max(professionals.length * 180, 480) + 60}px` }}>
        {/* Prof headers */}
        <div className="flex border-b border-border surface-elevated sticky top-0 z-10">
          <div className="w-[60px] flex-shrink-0 border-r border-border/40" />
          {professionals.map((prof) => (
            <div key={prof.id} className="flex-1 border-r border-border/40 last:border-r-0 px-3 py-2.5">
              <p className="text-xs font-semibold text-foreground truncate">{prof.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{prof.specialty}</p>
            </div>
          ))}
        </div>

        {/* Time grid */}
        <div className="relative">
          {showNow && currentTimeTop !== null && currentTimeTop >= 0 && (
            <div className="absolute left-0 right-0 z-20 flex items-center pointer-events-none" style={{ top: `${currentTimeTop}px` }}>
              <div className="w-[60px] flex-shrink-0 pr-2 text-right">
                <span className="text-[9px] font-bold text-primary">{format(new Date(), "HH:mm")}</span>
              </div>
              <div className="h-[2px] flex-1 bg-primary/70 relative">
                <div className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-primary" />
              </div>
            </div>
          )}

          {HOURS.map((hour) => (
            <div key={hour} className="flex border-b border-border/20" style={{ height: `${CELL_HEIGHT}px` }}>
              <div className="w-[60px] flex-shrink-0 border-r border-border/20 flex items-start justify-end pr-2 pt-1.5">
                <span className="text-[10px] text-muted-foreground/50 font-mono">{String(hour).padStart(2, "0")}:00</span>
              </div>
              {professionals.map((prof) => {
                const cellBookings = (byProf[prof.id] ?? []).filter((b) => getSlotDateTime(b)?.hour === hour);
                return (
                  <div key={prof.id} className="flex-1 border-r border-border/20 last:border-r-0 relative">
                    <EmptyCell onClick={() => onCellClick({ date: day, hour, minute: 0, professional: prof })} />
                    {cellBookings.map((booking) => {
                      const dt = getSlotDateTime(booking)!;
                      return (
                        <BookingCard
                          key={booking.id}
                          booking={booking}
                          topOffset={(dt.minute / 60) * CELL_HEIGHT}
                          onClick={() => onSelectBooking(booking)}
                        />
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Week View ───────────────────────────────────────────────────────────────
function WeekView({
  weekStart,
  professionals,
  bookings,
  onSelectBooking,
  onCellClick,
}: {
  weekStart: Date;
  professionals: Professional[];
  bookings: BookingRequest[];
  onSelectBooking: (b: BookingRequest) => void;
  onCellClick: (slot: NewBookingSlot) => void;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const currentTimeTop = useCurrentTimeTop(HOURS[0]);

  const byProfDay = useMemo(() => {
    const map: Record<string, BookingRequest[]> = {};
    for (const b of bookings) {
      const dt = getSlotDateTime(b);
      if (!dt) continue;
      const key = `${b.professional_id}_${dt.date}`;
      if (!map[key]) map[key] = [];
      map[key].push(b);
    }
    return map;
  }, [bookings]);

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: `${days.length * professionals.length * 110 + 60}px` }}>
        {/* Day + Prof header */}
        <div className="sticky top-0 z-10 surface-elevated border-b border-border">
          <div className="flex border-b border-border/40">
            <div className="w-[60px] flex-shrink-0 border-r border-border/40" />
            {days.map((day) => {
              const today = isToday(day);
              return (
                <div key={format(day, "yyyy-MM-dd")} className={`flex-1 border-r border-border/40 last:border-r-0 px-2 py-2 text-center ${today ? "bg-primary/10" : ""}`}>
                  <p className={`text-[10px] font-medium uppercase tracking-wider ${today ? "text-primary" : "text-muted-foreground/60"}`}>
                    {format(day, "EEE", { locale: ptBR })}
                  </p>
                  <p className={`text-sm font-bold leading-tight ${today ? "text-primary" : "text-foreground"}`}>
                    {format(day, "dd")}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="flex">
            <div className="w-[60px] flex-shrink-0 border-r border-border/40" />
            {days.map((day) => (
              <div key={format(day, "yyyy-MM-dd")} className="flex-1 border-r border-border/40 last:border-r-0 flex">
                {professionals.map((prof, pi) => (
                  <div key={prof.id} className={`flex-1 px-1 py-1 text-center ${pi > 0 ? "border-l border-border/20" : ""}`} title={prof.name}>
                    <span className="text-[9px] text-muted-foreground/70 truncate block">{prof.name.split(" ")[0]}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Grid */}
        <div className="relative">
          {currentTimeTop !== null && days.some((d) => isToday(d)) && currentTimeTop >= 0 && (
            <div className="absolute left-0 right-0 z-20 flex items-center pointer-events-none" style={{ top: `${currentTimeTop}px` }}>
              <div className="w-[60px] flex-shrink-0 pr-2 text-right">
                <span className="text-[9px] font-bold text-primary">{format(new Date(), "HH:mm")}</span>
              </div>
              <div className="h-[2px] flex-1 bg-primary/70 relative">
                <div className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-primary" />
              </div>
            </div>
          )}

          {HOURS.map((hour) => (
            <div key={hour} className="flex border-b border-border/20" style={{ height: `${CELL_HEIGHT}px` }}>
              <div className="w-[60px] flex-shrink-0 border-r border-border/20 flex items-start justify-end pr-2 pt-1.5">
                <span className="text-[10px] text-muted-foreground/50 font-mono">{String(hour).padStart(2, "0")}:00</span>
              </div>

              {days.map((day) => {
                const dateKey = format(day, "yyyy-MM-dd");
                const today = isToday(day);
                return (
                  <div key={dateKey} className={`flex-1 border-r border-border/20 last:border-r-0 flex ${today ? "bg-primary/[0.03]" : ""}`}>
                    {professionals.map((prof, pi) => {
                      const key = `${prof.id}_${dateKey}`;
                      const cellBookings = (byProfDay[key] ?? []).filter((b) => getSlotDateTime(b)?.hour === hour);
                      return (
                        <div key={prof.id} className={`flex-1 relative ${pi > 0 ? "border-l border-border/10" : ""}`}>
                          <EmptyCell onClick={() => onCellClick({ date: day, hour, minute: 0, professional: prof })} />
                          {cellBookings.map((booking) => {
                            const dt = getSlotDateTime(booking)!;
                            return (
                              <BookingCard
                                key={booking.id}
                                booking={booking}
                                topOffset={(dt.minute / 60) * CELL_HEIGHT}
                                compact
                                onClick={() => onSelectBooking(booking)}
                              />
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main AgendaView ─────────────────────────────────────────────────────────
export function AgendaView({ bookings, professionals, onSelectBooking, onSaveBooking }: AgendaViewProps) {
  const [mode, setMode] = useState<AgendaMode>("day");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [newSlot, setNewSlot] = useState<NewBookingSlot | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = (HOURS[0] - 6) * CELL_HEIGHT;
  }, [mode]);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });

  const navigatePrev = () =>
    mode === "day" ? setCurrentDate((d) => addDays(d, -1)) : setCurrentDate((d) => subWeeks(d, 1));
  const navigateNext = () =>
    mode === "day" ? setCurrentDate((d) => addDays(d, 1)) : setCurrentDate((d) => addWeeks(d, 1));
  const goToday = () => setCurrentDate(new Date());

  const periodLabel =
    mode === "day"
      ? format(currentDate, "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })
      : `${format(weekStart, "dd MMM", { locale: ptBR })} – ${format(addDays(weekStart, 6), "dd MMM yyyy", { locale: ptBR })}`;

  const handleSaveBooking = async (data: NewBookingFormData) => {
    await onSaveBooking(data);
  };

  return (
    <>
      <div
        className="rounded-xl border border-border surface-raised shadow-md flex flex-col overflow-hidden"
        style={{ maxHeight: "calc(100vh - 220px)" }}
      >
        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border surface-elevated flex-shrink-0 flex-wrap gap-y-2">
          <div className="flex items-center gap-1">
            <button onClick={navigatePrev} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={goToday} className="px-2.5 py-1 text-xs font-medium rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors">
              Hoje
            </button>
            <button onClick={navigateNext} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <span className="text-sm font-semibold text-foreground capitalize flex-1 min-w-0 truncate">
            {periodLabel}
          </span>

          <div className="flex items-center gap-0.5 rounded-lg p-0.5 bg-surface border border-border">
            {(["day", "week"] as AgendaMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  mode === m ? "bg-surface-raised text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <CalendarDays className="h-3 w-3" />
                {m === "day" ? "Dia" : "Semana"}
              </button>
            ))}
          </div>
        </div>

        {/* Grid scrollable */}
        <div ref={scrollRef} className="flex-1 overflow-auto">
          {mode === "day" ? (
            <DayView
              day={currentDate}
              professionals={professionals}
              bookings={bookings}
              onSelectBooking={onSelectBooking}
              onCellClick={setNewSlot}
            />
          ) : (
            <WeekView
              weekStart={weekStart}
              professionals={professionals}
              bookings={bookings}
              onSelectBooking={onSelectBooking}
              onCellClick={setNewSlot}
            />
          )}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-border surface-elevated flex-shrink-0 flex-wrap gap-y-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Legenda:</span>
          {(["handoff", "assisted", "confirmed", "pending"] as const).map((s) => (
            <StatusBadge key={s} status={s} size="sm" />
          ))}
          <span className="ml-auto text-[10px] text-muted-foreground/50 flex items-center gap-1">
            <Plus className="h-3 w-3" /> Clique em um horário para agendar
          </span>
        </div>
      </div>

      {/* New Booking Modal — keyed to force re-mount on each new slot */}
      <NewBookingModal
        key={newSlot ? `${newSlot.professional.id}_${newSlot.date.toISOString()}_${newSlot.hour}` : "closed"}
        slot={newSlot}
        professionals={professionals}
        onClose={() => setNewSlot(null)}
        onSave={handleSaveBooking}
      />
    </>
  );
}
