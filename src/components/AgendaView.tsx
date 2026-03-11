import { useMemo, useRef, useEffect, useState } from "react";
import {
  format,
  addDays,
  addWeeks,
  subWeeks,
  startOfWeek,
  endOfWeek,
  isToday,
  parseISO,
  getDay,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { fetchAgendaBookings, fetchProfessionalsByUnit } from "@/lib/bookingApi";
import { useAuth } from "@/contexts/AuthContext";
import { BookingRequest, Professional } from "@/types/booking";
import { NewBookingModal, NewBookingSlot, NewBookingFormData } from "@/components/NewBookingModal";
import { ChevronLeft, ChevronRight, CalendarDays, Clock, Plus } from "lucide-react";

interface AgendaViewProps {
  onSelectBooking: (booking: BookingRequest) => void;
  onSaveBooking: (data: NewBookingFormData) => Promise<void>;
  selectedBookingId?: number | null;
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

function extractRawDateTime(raw: string): { date: string; hour: number; minute: number } | null {
  const m = raw.match(/(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})/);
  if (!m) return null;
  return {
    date: `${m[1]}-${m[2]}-${m[3]}`,
    hour: Number(m[4]),
    minute: Number(m[5]),
  };
}

function getSlotDateTime(booking: BookingRequest): { date: string; hour: number; minute: number } | null {
  // Prefer sources that usually include explicit time, keeping scheduled_at as fallback
  const candidates = [
    booking.chosen_slot?.start_at,
    booking.vars_snapshot?.chosen_slot?.start_at,
    booking.scheduled_at,
  ];

  let dateOnlyFallback: { date: string; hour: number; minute: number } | null = null;

  for (const raw of candidates) {
    if (!raw) continue;

    // Prefer raw wall-time parsing to avoid timezone shifts in agenda grid
    const extracted = extractRawDateTime(raw);
    if (extracted) return extracted;

    const rawHasExplicitTime = /[T\s]\d{2}:\d{2}/.test(raw);
    const normalized = raw.includes(" ") && !raw.includes("T") ? raw.replace(" ", "T") : raw;

    for (const value of [normalized, raw]) {
      try {
        const d = parseISO(value);
        if (!isNaN(d.getTime())) {
          const parsed = {
            date: format(d, "yyyy-MM-dd"),
            hour: rawHasExplicitTime ? d.getHours() : 9,
            minute: rawHasExplicitTime ? d.getMinutes() : 0,
          };
          if (rawHasExplicitTime) return parsed;
          if (!dateOnlyFallback) dateOnlyFallback = parsed;
        }
      } catch {
        // continue to native parsing fallback
      }

      const native = new Date(value);
      if (!isNaN(native.getTime())) {
        const parsed = {
          date: format(native, "yyyy-MM-dd"),
          hour: rawHasExplicitTime ? native.getHours() : 9,
          minute: rawHasExplicitTime ? native.getMinutes() : 0,
        };
        if (rawHasExplicitTime) return parsed;
        if (!dateOnlyFallback) dateOnlyFallback = parsed;
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

  return dateOnlyFallback;
}

function getBookingProfessionalId(booking: BookingRequest): number | null {
  const candidates = [
    booking.professional_id,
    (booking as any)?.professional,
    (booking as any)?.professional?.id,
    (booking as any)?.professionalId,
  ];

  for (const candidate of candidates) {
    const n = Number(candidate);
    if (Number.isFinite(n) && n > 0) return n;
  }

  return null;
}

function getBookingProfessionalName(booking: BookingRequest): string {
  return (
    booking.professional_name ||
    (booking as any)?.professional?.name ||
    `Profissional #${getBookingProfessionalId(booking) ?? "-"}`
  );
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
function getStatusBorderColor(status: string): string {
  const map: Record<string, string> = {
    confirmed: "hsl(var(--status-confirmed))",
    pending: "hsl(var(--status-pending))",
    handoff: "hsl(var(--status-handoff))",
    assisted: "hsl(var(--status-assisted))",
    canceled: "hsl(var(--status-canceled))",
    cancelled: "hsl(var(--status-canceled))",
    failed: "hsl(var(--status-canceled))",
    awaiting_choice: "hsl(var(--status-pending))",
  };
  return map[status] ?? "hsl(var(--calendar-event-border))";
}

function AppointmentCard({
  booking,
  topOffset,
  compact,
  selected,
  onClick,
}: {
  booking: BookingRequest;
  topOffset: number;
  compact?: boolean;
  selected?: boolean;
  onClick: () => void;
}) {
  const dt = getSlotDateTime(booking)!;

  const now = new Date();
  const slotDate = new Date(`${dt.date}T${String(dt.hour).padStart(2, "0")}:${String(dt.minute).padStart(2, "0")}:00`);
  const isPast = slotDate < now;
  const borderColor = getStatusBorderColor(booking.status);

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`absolute left-2 right-2 rounded-lg text-left transition-all hover:brightness-110 hover:z-20 hover:scale-[1.02] z-10 ${isPast && !selected ? "opacity-45" : ""}`}
      style={{
        top: `${topOffset + 3}px`,
        minHeight: compact ? "38px" : "50px",
        background: selected ? "hsl(var(--calendar-event-bg) / 1)" : "hsl(var(--calendar-event-bg))",
        color: "hsl(var(--calendar-event-title))",
        borderLeft: `3px solid ${borderColor}`,
        boxShadow: selected
          ? `var(--calendar-event-shadow), 0 0 0 1.5px ${borderColor}, 0 0 12px ${borderColor.replace(")", " / 0.2)")}`
          : "var(--calendar-event-shadow)",
        padding: compact ? "3px 8px 4px" : "5px 10px 6px",
      }}
    >
      {/* Client name — primary info */}
      <div className="text-[11px] font-bold leading-tight truncate" style={{ color: "hsl(var(--calendar-event-title))" }}>
        {booking.lead_name}
      </div>
      {/* Time + Status dot + ID — secondary */}
      <div className="mt-0.5 flex items-center gap-1.5" style={{ color: "hsl(var(--calendar-event-meta))" }}>
        <span className="flex items-center gap-0.5 text-[9px] font-medium">
          <Clock className="h-2 w-2 flex-shrink-0 opacity-60" />
          {String(dt.hour).padStart(2, "0")}:{String(dt.minute).padStart(2, "0")}
        </span>
        <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: borderColor }} />
        <span className="text-[9px] font-mono opacity-50">#{booking.id}</span>
      </div>
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
        className={`absolute inset-0 z-0 ${className}`}
        style={{ background: "hsl(var(--calendar-empty) / 0.35)" }}
      />
    );
  }
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`absolute inset-0 cursor-pointer flex items-center justify-center transition-colors rounded-sm ${className}`}
      style={{ background: hover ? "hsl(var(--calendar-column-today-bg) / 0.08)" : "transparent" }}
    >
      {hover && (
        <span className="flex items-center gap-1 text-[9px] font-medium select-none pointer-events-none" style={{ color: "hsl(var(--calendar-column-today-bg) / 0.6)" }}>
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
  selectedBookingId?: number | null;
}) {
  const dateKey = format(day, "yyyy-MM-dd");
  const currentTimeTop = useCurrentTimeTop(HOURS[0]);
  const showNow = isToday(day);

  const byProf = useMemo(() => {
    const map: Record<number, BookingRequest[]> = {};
    for (const p of professionals) map[p.id] = [];
    for (const b of bookings) {
      const dt = getSlotDateTime(b);
      const profId = getBookingProfessionalId(b);
      if (!profId) continue;
      if (dt?.date === dateKey && map[profId] !== undefined) {
        map[profId].push(b);
      }
    }
    return map;
  }, [bookings, professionals, dateKey]);

  return (
    <div className="overflow-x-auto" style={{ background: "hsl(var(--calendar-bg))" }}>
      <div className="inline-flex flex-col min-w-full">
        {/* Prof headers */}
        <div className="flex sticky top-0 z-10" style={{ borderBottom: "2px solid hsl(var(--calendar-grid-strong))", background: "hsl(var(--calendar-header-bg))" }}>
          <div className="w-[60px] flex-shrink-0" style={{ borderRight: "1px solid hsl(var(--calendar-grid-strong))" }} />
          {professionals.map((prof) => (
            <div key={prof.id} className="w-[200px] last:border-r-0 px-3 py-2.5" style={{ borderRight: "1px solid hsl(var(--calendar-grid))" }}>
              <p className="text-xs font-semibold truncate text-foreground">{prof.name}</p>
              <p className="text-[10px] truncate" style={{ color: "hsl(var(--calendar-time-text))" }}>{prof.specialty}</p>
            </div>
          ))}
        </div>

        {/* Time grid */}
        <div className="relative">
          {showNow && currentTimeTop !== null && currentTimeTop >= 0 && (
            <div className="absolute left-0 right-0 z-30 flex -translate-y-1/2 items-center pointer-events-none" style={{ top: `${currentTimeTop}px` }}>
              <div className="w-[60px] flex-shrink-0 pr-1.5 text-right">
                <span className="text-[10px] font-bold px-1 py-0.5 rounded" style={{ color: "hsl(var(--calendar-header-active-text))", background: "hsl(var(--calendar-now-line))" }}>{format(new Date(), "HH:mm")}</span>
              </div>
              <div className="flex-1 relative" style={{ height: "2px", background: "hsl(var(--calendar-now-line))" }}>
                <div className="absolute -left-1.5 -top-[4px] h-[10px] w-[10px] rounded-full" style={{ background: "hsl(var(--calendar-now-dot))", boxShadow: "0 0 8px hsl(var(--calendar-now-dot) / 0.5)" }} />
              </div>
            </div>
          )}

          {HOURS.map((hour) => (
            <div key={hour} className="flex" style={{ height: `${CELL_HEIGHT}px`, borderBottom: "1px solid hsl(var(--calendar-grid))" }}>
              <div className="w-[60px] flex-shrink-0 flex items-start justify-end pr-2 pt-1.5" style={{ borderRight: "1px solid hsl(var(--calendar-grid-strong))" }}>
                <span className="text-[10px] font-mono font-medium" style={{ color: "hsl(var(--calendar-time-text))" }}>{String(hour).padStart(2, "0")}:00</span>
              </div>
              {professionals.map((prof) => {
                const cellBookings = (byProf[prof.id] ?? []).filter((b) => getSlotDateTime(b)?.hour === hour);
                return (
                  <div key={prof.id} className="w-[200px] last:border-r-0 relative" style={{ borderRight: "1px solid hsl(var(--calendar-grid))" }}>
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
      const profId = getBookingProfessionalId(b);
      if (!dt || !profId) continue;
      const key = `${profId}_${dt.date}`;
      if (!map[key]) map[key] = [];
      map[key].push(b);
    }
    return map;
  }, [bookings]);

  return (
    <div className="overflow-x-auto" style={{ background: "hsl(var(--calendar-bg))" }}>
      <div style={{ minWidth: `${Math.max(professionals.length, 1) * days.length * 110 + 60}px` }}>
        {/* Header grouped by professional */}
        <div className="sticky top-0 z-10" style={{ borderBottom: "2px solid hsl(var(--calendar-grid-strong))", background: "hsl(var(--calendar-header-bg))" }}>
          {professionals.length === 0 ? (
            <div className="flex">
              <div className="w-[60px] flex-shrink-0" style={{ borderRight: "1px solid hsl(var(--calendar-grid-strong))" }} />
              <div className="flex-1 px-3 py-2 text-xs italic text-muted-foreground">Sem profissionais</div>
            </div>
          ) : (
            <>
              <div className="flex" style={{ borderBottom: "1px solid hsl(var(--calendar-grid))" }}>
                <div className="w-[60px] flex-shrink-0" style={{ borderRight: "1px solid hsl(var(--calendar-grid-strong))" }} />
                {professionals.map((prof, pi) => (
                  <div
                    key={prof.id}
                    className="flex-1 px-2 py-1.5 text-center"
                    style={{ borderLeft: pi > 0 ? "1px solid hsl(var(--calendar-grid-strong))" : undefined }}
                    title={`${prof.name} (${prof.specialty})`}
                  >
                    <p className="text-[11px] font-semibold leading-tight truncate text-foreground">{prof.name}</p>
                    <p className="text-[9px] truncate" style={{ color: "hsl(var(--calendar-time-text))" }}>{prof.specialty}</p>
                  </div>
                ))}
              </div>

              <div className="flex">
                <div className="w-[60px] flex-shrink-0" style={{ borderRight: "1px solid hsl(var(--calendar-grid-strong))" }} />
                {professionals.map((prof, pi) => (
                  <div key={`days_${prof.id}`} className="flex-1 flex" style={{ borderLeft: pi > 0 ? "1px solid hsl(var(--calendar-grid-strong))" : undefined }}>
                    {days.map((day, di) => {
                      const today = isToday(day);
                      const isWeekend = getDay(day) === 0 || getDay(day) === 6;
                      return (
                        <div
                          key={`${prof.id}_${format(day, "yyyy-MM-dd")}`}
                          className="flex-1 px-2 py-2 text-center"
                          style={{
                            borderLeft: di > 0 ? "1px solid hsl(var(--calendar-grid))" : undefined,
                            background: today ? "hsl(var(--calendar-column-today-bg) / 0.12)" : undefined,
                          }}
                        >
                          <p className={`text-[10px] font-medium uppercase tracking-wider ${today ? "font-bold" : ""} ${isWeekend && !today ? "opacity-50" : ""}`}
                            style={{ color: today ? "hsl(var(--calendar-column-today-bg))" : "hsl(var(--calendar-time-text))" }}
                          >
                            {format(day, "EEE", { locale: ptBR })}
                          </p>
                          {today ? (
                            <span
                              className="inline-flex items-center justify-center text-sm font-bold leading-tight rounded-full w-7 h-7"
                              style={{ background: "hsl(var(--calendar-header-active-bg))", color: "hsl(var(--calendar-header-active-text))" }}
                            >
                              {format(day, "dd")}
                            </span>
                          ) : (
                            <p className={`text-sm font-bold leading-tight text-foreground ${isWeekend ? "opacity-50" : ""}`}>
                              {format(day, "dd")}
                            </p>
                          )}
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
            <div className="absolute left-0 right-0 z-30 flex -translate-y-1/2 items-center pointer-events-none" style={{ top: `${currentTimeTop}px` }}>
              <div className="w-[60px] flex-shrink-0 pr-1.5 text-right">
                <span className="text-[10px] font-bold px-1 py-0.5 rounded" style={{ color: "hsl(var(--calendar-header-active-text))", background: "hsl(var(--calendar-now-line))" }}>{format(new Date(), "HH:mm")}</span>
              </div>
              <div className="flex-1 relative" style={{ height: "2px", background: "hsl(var(--calendar-now-line))" }}>
                <div className="absolute -left-1.5 -top-[4px] h-[10px] w-[10px] rounded-full" style={{ background: "hsl(var(--calendar-now-dot))", boxShadow: "0 0 8px hsl(var(--calendar-now-dot) / 0.5)" }} />
              </div>
            </div>
          )}

          {HOURS.map((hour) => (
            <div key={hour} className="flex" style={{ height: `${CELL_HEIGHT}px`, borderBottom: "1px solid hsl(var(--calendar-grid))" }}>
              <div className="w-[60px] flex-shrink-0 flex items-start justify-end pr-2 pt-1.5" style={{ borderRight: "1px solid hsl(var(--calendar-grid-strong))" }}>
                <span className="text-[10px] font-mono font-medium" style={{ color: "hsl(var(--calendar-time-text))" }}>{String(hour).padStart(2, "0")}:00</span>
              </div>

              {professionals.length === 0 ? (
                <div className="flex-1" />
              ) : (
                professionals.map((prof, pi) => (
                  <div key={prof.id} className="flex-1 flex" style={{ borderLeft: pi > 0 ? "1px solid hsl(var(--calendar-grid-strong))" : undefined }}>
                    {days.map((day, di) => {
                      const dateKey = format(day, "yyyy-MM-dd");
                      const today = isToday(day);
                      const bookingKey = `${prof.id}_${dateKey}`;
                      const cellBookings = (byProfDay[bookingKey] ?? []).filter((b) => getSlotDateTime(b)?.hour === hour);

                      return (
                        <div
                          key={bookingKey}
                          className="flex-1 relative"
                          style={{
                            borderLeft: di > 0 ? "1px solid hsl(var(--calendar-grid))" : undefined,
                            background: today ? "hsl(var(--calendar-column-today-bg) / 0.06)" : undefined,
                          }}
                        >
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
export function AgendaView({ onSelectBooking, onSaveBooking }: AgendaViewProps) {
  const { activeUnit } = useAuth();
  const [mode, setMode] = useState<AgendaMode>("week");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [newSlot, setNewSlot] = useState<NewBookingSlot | null>(null);

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });

  // Compute visible date range based on mode
  const dateRange = useMemo(() => {
    if (mode === "day") {
      const d = format(currentDate, "yyyy-MM-dd");
      return { from: d, to: d };
    }
    return {
      from: format(weekStart, "yyyy-MM-dd"),
      to: format(endOfWeek(currentDate, { weekStartsOn: 0 }), "yyyy-MM-dd"),
    };
  }, [mode, currentDate, weekStart]);

  // Fetch agenda bookings with server-side filters
  const { data: agendaBookings = [], isLoading: loadingBookings } = useQuery({
    queryKey: ["agenda-bookings", activeUnit?.id, dateRange.from, dateRange.to],
    queryFn: () => fetchAgendaBookings(activeUnit!.id, dateRange.from, dateRange.to),
    enabled: !!activeUnit,
    staleTime: 30_000,
  });

  // Fetch professionals for active unit
  const { data: professionals = [] } = useQuery({
    queryKey: ["professionals-by-unit", activeUnit?.id],
    queryFn: () => fetchProfessionalsByUnit(activeUnit!.id),
    enabled: !!activeUnit,
    staleTime: 60_000,
  });

  const displayProfessionals = useMemo(() => {
    const byId = new Map<number, Professional>();

    for (const p of professionals) {
      const id = Number((p as any)?.id);
      if (Number.isFinite(id) && id > 0) byId.set(id, { ...p, id });
    }

    for (const b of agendaBookings) {
      const id = getBookingProfessionalId(b);
      if (!id || byId.has(id)) continue;
      byId.set(id, {
        id,
        name: getBookingProfessionalName(b),
        specialty: (b as any)?.professional_specialty || "",
      });
    }

    return Array.from(byId.values());
  }, [professionals, agendaBookings]);

  // When clicking an existing appointment, open the creation modal pre-filled
  const handleAppointmentClick = (booking: BookingRequest) => {
    const dt = getSlotDateTime(booking);
    if (!dt) return;
    const bookingProfId = getBookingProfessionalId(booking);
    const prof = displayProfessionals.find((p) => String(p.id) === String(bookingProfId ?? booking.professional_id));
    const slotDate = parseISO(dt.date);
    setNewSlot({
      date: slotDate,
      hour: dt.hour,
      minute: dt.minute,
      professional: prof ?? { id: bookingProfId ?? 0, name: getBookingProfessionalName(booking), specialty: "" },
      prefill: {
        booking_id: booking.id,
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

  const availMap = useMemo(() => {
    const map: Record<number, ProfAvailability> = {};
    for (const a of rawAvailabilities) {
      if (a.is_active !== false) {
        map[a.professional] = a;
      }
    }
    return map;
  }, [rawAvailabilities]);

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
        style={{ maxHeight: "calc(100vh - 80px)", background: "hsl(var(--surface-raised))" }}
      >
        {/* Toolbar */}
        <div
          className="flex items-center gap-3 px-4 py-3 flex-shrink-0 flex-wrap gap-y-2"
          style={{
            background: "hsl(var(--calendar-header-bg))",
            borderBottom: "2px solid hsl(var(--calendar-grid-strong))",
          }}
        >
          <div className="flex items-center gap-1">
            <button onClick={navigatePrev} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors" style={{ background: "transparent" }}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={goToday}
              className="px-3 py-1 text-xs font-semibold rounded-lg transition-colors"
              style={{
                background: "hsl(var(--calendar-column-today-bg) / 0.12)",
                color: "hsl(var(--calendar-column-today-bg))",
                border: "1px solid hsl(var(--calendar-column-today-bg) / 0.25)",
              }}
            >
              Hoje
            </button>
            <button onClick={navigateNext} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors" style={{ background: "transparent" }}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <span className="text-sm font-bold text-foreground capitalize flex-1 min-w-0 truncate">
            {periodLabel}
          </span>

          <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ background: "hsl(var(--calendar-bg))", border: "1px solid hsl(var(--calendar-grid))" }}>
            {(["day", "week"] as AgendaMode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); if (m === "day") setCurrentDate(new Date()); }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  mode === m ? "text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
                style={mode === m ? { background: "hsl(var(--calendar-header-bg))" } : undefined}
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
              professionals={displayProfessionals}
              bookings={agendaBookings}
              availMap={availMap}
              onSelectBooking={handleAppointmentClick}
              onCellClick={setNewSlot}
            />
          ) : (
            <WeekView
              weekStart={weekStart}
              professionals={displayProfessionals}
              bookings={agendaBookings}
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
        professionals={displayProfessionals}
        onClose={() => setNewSlot(null)}
        onSave={handleSaveBooking}
      />
    </>
  );
}
