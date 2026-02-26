import { useMemo, useRef, useEffect, useState } from "react";
import {
  format,
  addDays,
  addWeeks,
  subWeeks,
  startOfWeek,
  isToday,
  parseISO,
  getDay,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { BookingRequest, Professional, BookingStatus } from "@/types/booking";
import { StatusBadge } from "@/components/StatusBadge";
import { NewBookingModal, NewBookingSlot, NewBookingFormData } from "@/components/NewBookingModal";
import { ChevronLeft, ChevronRight, CalendarDays, Clock, Plus, Ban } from "lucide-react";

interface AgendaViewProps {
  bookings: BookingRequest[];
  professionals: Professional[];
  onSelectBooking: (booking: BookingRequest) => void;
  onSaveBooking: (data: NewBookingFormData) => Promise<void>;
}

type AgendaMode = "day" | "week";

const HOURS = Array.from({ length: 13 }, (_, i) => i + 7); // 07:00–19:00
const CELL_HEIGHT = 56; // px per hour

// Day-of-week index (JS getDay: 0=Sun) → availability key
const DOW_TO_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

interface AvailabilitySlot { start: string; end: string; }
interface ProfAvailability {
  professional: number;
  weekly: Record<string, AvailabilitySlot[]>;
  is_active: boolean;
}

/** Check if a professional is available at a given date+hour */
function isProfAvailable(
  availMap: Record<number, ProfAvailability>,
  profId: number,
  date: Date,
  hour: number,
): boolean {
  const avail = availMap[profId];
  if (!avail || !avail.is_active) return false; // no availability configured → unavailable
  const dayKey = DOW_TO_KEY[getDay(date)];
  const slots = avail.weekly?.[dayKey];
  if (!slots || slots.length === 0) return false;
  // Check if the hour falls within any slot
  for (const slot of slots) {
    const [startH, startM] = slot.start.split(":").map(Number);
    const [endH, endM] = slot.end.split(":").map(Number);
    const startMinutes = startH * 60 + (startM || 0);
    const endMinutes = endH * 60 + (endM || 0);
    const hourMinutes = hour * 60;
    if (hourMinutes >= startMinutes && hourMinutes < endMinutes) return true;
  }
  return false;
}

function getSlotDateTime(booking: BookingRequest): { date: string; hour: number; minute: number } | null {
  // Primary date sources from booking list payload
  const candidates = [
    booking.scheduled_at,
    booking.chosen_slot?.start_at,
    booking.vars_snapshot?.chosen_slot?.start_at,
  ];

  for (const raw of candidates) {
    if (!raw) continue;

    const normalized = raw.includes(" ") && !raw.includes("T") ? raw.replace(" ", "T") : raw;
    for (const value of [normalized, raw]) {
      try {
        const d = parseISO(value);
        if (!isNaN(d.getTime())) {
          return { date: format(d, "yyyy-MM-dd"), hour: d.getHours(), minute: d.getMinutes() };
        }
      } catch {
        // continue to native parsing fallback
      }

      const native = new Date(value);
      if (!isNaN(native.getTime())) {
        return { date: format(native, "yyyy-MM-dd"), hour: native.getHours(), minute: native.getMinutes() };
      }
    }
  }

  // Fallback for label-only formats like "27/02/2026 às 15:00" or "27/02 15:00"
  const labelCandidate = booking.chosen_slot_label || booking.chosen_slot?.label || booking.vars_snapshot?.chosen_slot?.label;
  if (labelCandidate) {
    const m = labelCandidate.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?.*?(\d{1,2}):(\d{2})/);
    if (m) {
      const day = Number(m[1]);
      const month = Number(m[2]);
      const yearFromLabel = m[3] ? Number(m[3]) : undefined;
      const yearFromWindow = booking.preferred_window?.match(/(\d{4})[-/]/)?.[1];
      const year = yearFromLabel ?? (yearFromWindow ? Number(yearFromWindow) : new Date().getFullYear());
      const hour = Number(m[4]);
      const minute = Number(m[5]);

      const d = new Date(year, month - 1, day, hour, minute);
      if (!isNaN(d.getTime())) {
        return { date: format(d, "yyyy-MM-dd"), hour: d.getHours(), minute: d.getMinutes() };
      }
    }
  }

  return null;
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
function AppointmentCard({
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
  const phone = booking.contact_phone || booking.phone || "";

  // Check if this appointment is in the past
  const now = new Date();
  const slotDate = new Date(`${dt.date}T${String(dt.hour).padStart(2, "0")}:${String(dt.minute).padStart(2, "0")}:00`);
  const isPast = slotDate < now;

  const bgColor = isPast ? "hsl(var(--muted))" : "hsl(var(--status-confirmed-bg))";
  const textColor = isPast ? "hsl(var(--muted-foreground))" : "hsl(var(--status-confirmed))";
  const borderColor = isPast ? "hsl(var(--muted-foreground) / 0.4)" : "hsl(var(--status-confirmed))";

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`absolute left-1 right-1 rounded-md px-2 py-1 text-left transition-all hover:brightness-110 hover:z-10 hover:scale-[1.01] z-10 ${isPast ? "opacity-60" : ""}`}
      style={{
        top: `${topOffset + 2}px`,
        minHeight: compact ? "36px" : "48px",
        background: bgColor,
        color: textColor,
        borderLeft: `3px solid ${borderColor}`,
      }}
    >
      <span className="flex items-center gap-1 text-[10px] font-semibold truncate leading-tight">
        <Clock className="h-2.5 w-2.5 flex-shrink-0 opacity-70" />
        {String(dt.hour).padStart(2, "0")}:{String(dt.minute).padStart(2, "0")}
      </span>
      <span className="block text-[11px] font-medium truncate leading-tight mt-0.5">{booking.lead_name}</span>
      {!compact && phone && (
        <span className="block text-[9px] opacity-70 truncate">{phone}</span>
      )}
    </button>
  );
}

// ── Clickable empty cell ───────────────────────────────────────────────────
function EmptyCell({
  onClick,
  available,
  className = "",
}: {
  onClick: () => void;
  available: boolean;
  className?: string;
}) {
  const [hover, setHover] = useState(false);
  if (!available) {
    return (
      <div
        className={`absolute inset-0 flex items-center justify-center ${className}`}
        style={{ background: "hsl(var(--muted) / 0.15)" }}
      >
        <Ban className="h-3 w-3 text-muted-foreground/20" />
      </div>
    );
  }
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
  availMap,
  onSelectBooking,
  onCellClick,
}: {
  day: Date;
  professionals: Professional[];
  bookings: BookingRequest[];
  availMap: Record<number, ProfAvailability>;
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
      <div className="inline-flex flex-col min-w-full">
        {/* Prof headers */}
        <div className="flex border-b sticky top-0 z-10" style={{ borderColor: "#e0e0e0", background: "#f5f5f5" }}>
          <div className="w-[60px] flex-shrink-0 border-r" style={{ borderColor: "#e0e0e0" }} />
          {professionals.map((prof) => (
            <div key={prof.id} className="w-[200px] border-r last:border-r-0 px-3 py-2.5" style={{ borderColor: "#e0e0e0" }}>
              <p className="text-xs font-semibold truncate" style={{ color: "#222" }}>{prof.name}</p>
              <p className="text-[10px] truncate" style={{ color: "#888" }}>{prof.specialty}</p>
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
            <div key={hour} className="flex" style={{ height: `${CELL_HEIGHT}px`, borderBottom: "1px solid #e0e0e0" }}>
              <div className="w-[60px] flex-shrink-0 flex items-start justify-end pr-2 pt-1.5" style={{ borderRight: "1px solid #e0e0e0" }}>
                <span className="text-[10px] font-mono" style={{ color: "#999" }}>{String(hour).padStart(2, "0")}:00</span>
              </div>
              {professionals.map((prof) => {
                const cellBookings = (byProf[prof.id] ?? []).filter((b) => getSlotDateTime(b)?.hour === hour);
                return (
                  <div key={prof.id} className="w-[200px] last:border-r-0 relative" style={{ borderRight: "1px solid #e0e0e0" }}>
                    <EmptyCell onClick={() => onCellClick({ date: day, hour, minute: 0, professional: prof })} available={isProfAvailable(availMap, prof.id, day, hour)} />
                    {cellBookings.map((booking) => {
                      const dt = getSlotDateTime(booking)!;
                      return (
                        <AppointmentCard
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
  availMap,
  onSelectBooking,
  onCellClick,
}: {
  weekStart: Date;
  professionals: Professional[];
  bookings: BookingRequest[];
  availMap: Record<number, ProfAvailability>;
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
      <div style={{ minWidth: `${Math.max(professionals.length, 1) * days.length * 110 + 60}px` }}>
        {/* Header grouped by professional */}
        <div className="sticky top-0 z-10" style={{ background: "#f5f5f5", borderBottom: "1px solid #e0e0e0" }}>
          {professionals.length === 0 ? (
            <div className="flex">
              <div className="w-[60px] flex-shrink-0" style={{ borderRight: "1px solid #e0e0e0" }} />
              <div className="flex-1 px-3 py-2 text-xs italic" style={{ color: "#888" }}>Sem profissionais</div>
            </div>
          ) : (
            <>
              <div className="flex" style={{ borderBottom: "1px solid #e0e0e0" }}>
                <div className="w-[60px] flex-shrink-0" style={{ borderRight: "1px solid #e0e0e0" }} />
                {professionals.map((prof, pi) => (
                  <div
                    key={prof.id}
                    className={`flex-1 px-2 py-1.5 text-center`}
                    style={{ borderLeft: pi > 0 ? "1px solid #e0e0e0" : undefined }}
                    title={`${prof.name} (${prof.specialty})`}
                  >
                    <p className="text-[11px] font-semibold leading-tight truncate" style={{ color: "#222" }}>{prof.name}</p>
                    <p className="text-[9px] truncate" style={{ color: "#888" }}>{prof.specialty}</p>
                  </div>
                ))}
              </div>

              <div className="flex">
                <div className="w-[60px] flex-shrink-0" style={{ borderRight: "1px solid #e0e0e0" }} />
                {professionals.map((prof, pi) => (
                  <div key={`days_${prof.id}`} className="flex-1 flex" style={{ borderLeft: pi > 0 ? "1px solid #e0e0e0" : undefined }}>
                    {days.map((day, di) => {
                      const today = isToday(day);
                      return (
                        <div
                          key={`${prof.id}_${format(day, "yyyy-MM-dd")}`}
                          className={`flex-1 px-2 py-2 text-center ${today ? "bg-primary/10" : ""}`}
                          style={{ borderLeft: di > 0 ? "1px solid #d0d0d0" : undefined }}
                        >
                          <p className={`text-[10px] font-medium uppercase tracking-wider ${today ? "text-primary" : ""}`} style={{ color: today ? undefined : "#999" }}>
                            {format(day, "EEE", { locale: ptBR })}
                          </p>
                          <p className={`text-sm font-bold leading-tight ${today ? "text-primary" : ""}`} style={{ color: today ? undefined : "#222" }}>
                            {format(day, "dd")}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </>
          )}
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
            <div key={hour} className="flex" style={{ height: `${CELL_HEIGHT}px`, borderBottom: "1px solid #e0e0e0" }}>
              <div className="w-[60px] flex-shrink-0 flex items-start justify-end pr-2 pt-1.5" style={{ borderRight: "1px solid #e0e0e0" }}>
                <span className="text-[10px] font-mono" style={{ color: "#999" }}>{String(hour).padStart(2, "0")}:00</span>
              </div>

              {professionals.length === 0 ? (
                <div className="flex-1" />
              ) : (
                professionals.map((prof, pi) => (
                  <div key={prof.id} className="flex-1 flex" style={{ borderLeft: pi > 0 ? "1px solid #e0e0e0" : undefined }}>
                    {days.map((day, di) => {
                      const dateKey = format(day, "yyyy-MM-dd");
                      const today = isToday(day);
                      const bookingKey = `${prof.id}_${dateKey}`;
                      const cellBookings = (byProfDay[bookingKey] ?? []).filter((b) => getSlotDateTime(b)?.hour === hour);

                      return (
                        <div key={bookingKey} className={`flex-1 relative ${today ? "bg-primary/[0.03]" : ""}`} style={{ borderLeft: di > 0 ? "1px solid #d0d0d0" : undefined }}>
                          <EmptyCell onClick={() => onCellClick({ date: day, hour, minute: 0, professional: prof })} available={isProfAvailable(availMap, prof.id, day, hour)} />
                          {cellBookings.map((booking) => {
                            const dt = getSlotDateTime(booking)!;
                            return (
                              <AppointmentCard
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
                ))
              )}
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

  // When clicking an existing appointment, open the creation modal pre-filled
  const handleAppointmentClick = (booking: BookingRequest) => {
    const dt = getSlotDateTime(booking);
    if (!dt) return;
    const prof = professionals.find((p) => String(p.id) === String(booking.professional_id));
    const slotDate = parseISO(dt.date);
    setNewSlot({
      date: slotDate,
      hour: dt.hour,
      minute: dt.minute,
      professional: prof ?? { id: booking.professional_id as unknown as number, name: booking.professional_name, specialty: "" },
      prefill: {
        lead_name: booking.lead_name,
        phone: booking.contact_phone || booking.phone || "",
        procedure_name: booking.procedure_name,
        unit_name: booking.unit_name,
      },
    });
  };
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch professional availabilities
  const { data: rawAvailabilities = [] } = useQuery({
    queryKey: ["professional-availabilities"],
    queryFn: async () => {
      const { data } = await api.get("/api/settings/professional-availabilities/");
      return Array.isArray(data) ? data : (data?.results ?? []);
    },
    staleTime: 60_000,
  });

  // Build lookup: profId → availability
  const availMap = useMemo(() => {
    const map: Record<number, ProfAvailability> = {};
    for (const a of rawAvailabilities) {
      if (a.is_active !== false) {
        map[a.professional] = a;
      }
    }
    return map;
  }, [rawAvailabilities]);

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
        className="rounded-xl border border-border shadow-md flex flex-col overflow-hidden"
        style={{ maxHeight: "calc(100vh - 220px)", background: "#ffffff" }}
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
              availMap={availMap}
              onSelectBooking={handleAppointmentClick}
              onCellClick={setNewSlot}
            />
          ) : (
            <WeekView
              weekStart={weekStart}
              professionals={professionals}
              bookings={bookings}
              availMap={availMap}
              onSelectBooking={handleAppointmentClick}
              onCellClick={setNewSlot}
            />
          )}
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
