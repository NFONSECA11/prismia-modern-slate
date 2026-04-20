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
import { fetchHolidays, buildHolidayMap, type PublicHoliday } from "@/lib/holidaysApi";
import { useAuth } from "@/contexts/AuthContext";
import { BookingRequest, Professional, BookingStatus } from "@/types/booking";
import { StatusBadge } from "@/components/StatusBadge";
import { ConfirmationIndicator } from "@/components/ConfirmationIndicator";
import { NewBookingModal, NewBookingSlot, NewBookingFormData } from "@/components/NewBookingModal";
import { ChevronLeft, ChevronRight, CalendarDays, Clock, Plus, Ban, Printer, User, Building2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AgendaViewProps {
  onSelectBooking: (booking: BookingRequest) => void;
  onSaveBooking: (data: NewBookingFormData) => Promise<void>;
}

interface AgendaUnitViewProps extends AgendaViewProps {
  unit: { id: number; name: string };
  showUnitHeader?: boolean;
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

function formatDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function calculateEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31) - 1;
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month, day);
}

function buildLocalHolidayMap(years: number[]): Map<string, PublicHoliday> {
  const map = new Map<string, PublicHoliday>();

  for (const year of years) {
    if (!Number.isFinite(year)) continue;

    const add = (date: string, local_name: string, english_name: string) => {
      if (!map.has(date)) {
        map.set(date, {
          holiday_date: date,
          local_name,
          english_name,
          scope: "national",
          state_code: null,
        });
      }
    };

    add(`${year}-01-01`, "Confraternização Universal", "New Year's Day");
    add(`${year}-04-21`, "Tiradentes", "Tiradentes Day");
    add(`${year}-05-01`, "Dia do Trabalhador", "Labour Day");
    add(`${year}-09-07`, "Independência do Brasil", "Independence Day");
    add(`${year}-10-12`, "Nossa Senhora Aparecida", "Our Lady of Aparecida");
    add(`${year}-11-02`, "Finados", "All Souls' Day");
    add(`${year}-11-15`, "Proclamação da República", "Republic Proclamation Day");
    add(`${year}-11-20`, "Dia da Consciência Negra", "Black Awareness Day");
    add(`${year}-12-25`, "Natal", "Christmas Day");

    // Feriado estadual SP
    add(`${year}-07-09`, "Revolução Constitucionalista (SP)", "Constitutionalist Revolution");

    // Móveis baseados na Páscoa
    const easter = calculateEasterSunday(year);

    const goodFriday = new Date(easter);
    goodFriday.setDate(easter.getDate() - 2);
    add(formatDateLocal(goodFriday), "Sexta-feira Santa", "Good Friday");

    const carnival = new Date(easter);
    carnival.setDate(easter.getDate() - 47);
    add(formatDateLocal(carnival), "Carnaval", "Carnival");

    const corpusChristi = new Date(easter);
    corpusChristi.setDate(easter.getDate() + 60);
    add(formatDateLocal(corpusChristi), "Corpus Christi", "Corpus Christi");
  }

  return map;
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

  // Check if this appointment is in the past
  const now = new Date();
  const slotDate = new Date(`${dt.date}T${String(dt.hour).padStart(2, "0")}:${String(dt.minute).padStart(2, "0")}:00`);
  const isPast = slotDate < now;

  const hasSentConfirmation = Boolean(
    booking.confirmation &&
      (
        (booking.confirmation.sent_at && booking.confirmation.sent_at.trim()) ||
        (booking.confirmation.responded_at && booking.confirmation.responded_at.trim())
      )
  );

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`absolute left-1 right-1 rounded-lg text-left transition-all hover:brightness-105 hover:z-10 hover:scale-[1.01] z-10 ${isPast ? "opacity-50" : ""}`}
      style={{
        top: `${topOffset + 2}px`,
        minHeight: compact ? "40px" : "48px",
        background: "hsl(var(--appointment-bg))",
        color: "hsl(var(--appointment-text))",
        borderLeft: "3px solid hsl(var(--status-confirmed))",
        padding: "6px 8px",
        boxShadow: "0 1px 3px hsl(var(--background) / 0.15)",
      }}
    >
      <span className="block text-[11px] font-bold truncate leading-tight">
        {booking.lead_name}
      </span>
      <div className="mt-0.5 flex items-center gap-2 text-[10px] leading-tight" style={{ color: "hsl(var(--muted-foreground))" }}>
        <span className="flex items-center gap-0.5">
          <Clock className="h-2.5 w-2.5 flex-shrink-0" />
          {String(dt.hour).padStart(2, "0")}:{String(dt.minute).padStart(2, "0")}
        </span>
        <span className="flex items-center gap-0.5">
          <span className="h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: "hsl(var(--status-confirmed))" }} />
          #{booking.id}
        </span>
        {hasSentConfirmation && booking.confirmation && (
          <ConfirmationIndicator confirmation={booking.confirmation} compact />
        )}
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
        className={`absolute inset-0 z-0 flex items-center justify-center ${className}`}
        style={{ background: "rgba(0,0,0,0.04)" }}
      >
        <Ban className="h-3 w-3" style={{ color: "#ccc" }} />
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
  holidayMap,
  onSelectBooking,
  onCellClick,
}: {
  day: Date;
  professionals: Professional[];
  bookings: BookingRequest[];
  availMap: Record<number, ProfAvailability>;
  holidayMap: Map<string, PublicHoliday>;
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
      const profId = getBookingProfessionalId(b);
      if (!profId) continue;
      if (dt?.date === dateKey && map[profId] !== undefined) {
        map[profId].push(b);
      }
    }
    return map;
  }, [bookings, professionals, dateKey]);

  const holiday = holidayMap.get(dateKey);

  return (
    <div className="overflow-x-auto">
      {holiday && (
        <div className="px-4 py-2 text-xs font-semibold flex items-center gap-2" style={{ background: "hsl(var(--holiday-bg))", color: "hsl(var(--holiday-text))", borderBottom: "1px solid hsl(var(--holiday-border))" }}>
          <span>🎉</span>
          <span>FERIADO: {holiday.local_name}</span>
        </div>
      )}
      <div className="inline-flex flex-col min-w-full">
        {/* Prof headers */}
        <div className="flex border-b sticky top-0 z-10 border-border" style={{ background: "hsl(var(--table-header-bg))" }}>
          <div className="w-[60px] flex-shrink-0 border-r border-border" />
          {professionals.map((prof) => (
            <div key={prof.id} className="w-[200px] border-r last:border-r-0 px-3 py-2.5 border-border">
              <p className="text-xs font-semibold truncate text-foreground">{prof.name}</p>
              <p className="text-[10px] truncate text-muted-foreground">{prof.specialty}</p>
            </div>
          ))}
        </div>

        {/* Time grid */}
        <div className="relative">
          {showNow && currentTimeTop !== null && currentTimeTop >= 0 && (
            <div className="absolute left-0 right-0 z-20 flex -translate-y-1/2 items-center pointer-events-none" style={{ top: `${currentTimeTop}px` }}>
              <div className="w-[60px] flex-shrink-0 pr-2 text-right">
                <span className="text-[9px] font-bold text-primary">{format(new Date(), "HH:mm")}</span>
              </div>
              <div className="h-px flex-1 bg-primary/70 relative">
                <div className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-primary" />
              </div>
            </div>
          )}

          {HOURS.map((hour) => (
            <div key={hour} className="flex border-b border-border" style={{ height: `${CELL_HEIGHT}px` }}>
              <div className="w-[60px] flex-shrink-0 flex items-start justify-end pr-2 pt-1.5 border-r border-border">
                <span className="text-[10px] font-mono text-muted-foreground">{String(hour).padStart(2, "0")}:00</span>
              </div>
              {professionals.map((prof) => {
                const cellBookings = (byProf[prof.id] ?? []).filter((b) => getSlotDateTime(b)?.hour === hour);
                return (
                  <div key={prof.id} className="w-[200px] last:border-r-0 relative border-r border-border">
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
  holidayMap,
  onSelectBooking,
  onCellClick,
}: {
  weekStart: Date;
  professionals: Professional[];
  bookings: BookingRequest[];
  availMap: Record<number, ProfAvailability>;
  holidayMap: Map<string, PublicHoliday>;
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
    <div className="overflow-x-auto">
      <div style={{ minWidth: `${Math.max(professionals.length, 1) * days.length * 110 + 60}px` }}>
        {/* Header grouped by professional */}
        <div className="sticky top-0 z-10 border-b border-border" style={{ background: "hsl(var(--table-header-bg))" }}>
          {professionals.length === 0 ? (
            <div className="flex">
              <div className="w-[60px] flex-shrink-0 border-r border-border" />
              <div className="flex-1 px-3 py-2 text-xs italic text-muted-foreground">Sem profissionais</div>
            </div>
          ) : (
            <>
              <div className="flex border-b border-border">
                <div className="w-[60px] flex-shrink-0 border-r border-border" />
                {professionals.map((prof, pi) => (
                  <div
                    key={prof.id}
                    className={`flex-1 px-2 py-1.5 text-center`}
                    style={{ borderLeft: pi > 0 ? "1px solid hsl(var(--border))" : undefined }}
                    title={`${prof.name} (${prof.specialty})`}
                  >
                    <p className="text-[11px] font-semibold leading-tight truncate text-foreground">{prof.name}</p>
                    <p className="text-[9px] truncate text-muted-foreground">{prof.specialty}</p>
                  </div>
                ))}
              </div>

              <div className="flex">
                <div className="w-[60px] flex-shrink-0 border-r border-border" />
                {professionals.map((prof, pi) => (
                  <div key={`days_${prof.id}`} className="flex-1 flex" style={{ borderLeft: pi > 0 ? "1px solid hsl(var(--border))" : undefined }}>
                    {days.map((day, di) => {
                      const today = isToday(day);
                      const dateKey = format(day, "yyyy-MM-dd");
                      const holiday = holidayMap.get(dateKey);
                      return (
                        <div
                          key={`${prof.id}_${dateKey}`}
                          className={`flex-1 px-2 py-2 text-center ${today && !holiday ? "bg-primary/10" : ""}`}
                          style={{
                            borderLeft: di > 0 ? "1px solid hsl(var(--border-subtle))" : undefined,
                            ...(holiday ? { background: "hsl(var(--holiday-bg))" } : {}),
                          }}
                        >
                          <p className={`text-[10px] font-medium uppercase tracking-wider ${holiday ? "text-[hsl(var(--holiday-text))]" : today ? "text-primary" : "text-muted-foreground"}`}
                             style={holiday ? { color: "hsl(var(--holiday-text))" } : undefined}
                          >
                            {format(day, "EEE", { locale: ptBR })}
                          </p>
                          <p className={`text-sm font-bold leading-tight ${holiday ? "" : today ? "text-primary" : "text-foreground"}`}
                             style={holiday ? { color: "hsl(var(--holiday-text))" } : undefined}
                          >
                            {format(day, "dd")}
                          </p>
                          {holiday && (
                            <div className="mt-1 leading-tight" title={holiday.local_name}>
                              <p className="text-[9px] font-bold uppercase tracking-wide" style={{ color: "hsl(var(--holiday-text))" }}>
                                Feriado
                              </p>
                              <p className="text-[10px] font-medium truncate" style={{ color: "hsl(var(--holiday-text))" }}>
                                {holiday.local_name}
                              </p>
                            </div>
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
            <div className="absolute left-0 right-0 z-20 flex -translate-y-1/2 items-center pointer-events-none" style={{ top: `${currentTimeTop}px` }}>
              <div className="w-[60px] flex-shrink-0 pr-2 text-right">
                <span className="text-[9px] font-bold text-primary">{format(new Date(), "HH:mm")}</span>
              </div>
              <div className="h-px flex-1 bg-primary/70 relative">
                <div className="absolute -left-1 -top-[3px] h-2 w-2 rounded-full bg-primary" />
              </div>
            </div>
          )}

          {HOURS.map((hour) => (
            <div key={hour} className="flex border-b border-border" style={{ height: `${CELL_HEIGHT}px` }}>
              <div className="w-[60px] flex-shrink-0 flex items-start justify-end pr-2 pt-1.5 border-r border-border">
                <span className="text-[10px] font-mono text-muted-foreground">{String(hour).padStart(2, "0")}:00</span>
              </div>

              {professionals.length === 0 ? (
                <div className="flex-1" />
              ) : (
                professionals.map((prof, pi) => (
                  <div key={prof.id} className="flex-1 flex" style={{ borderLeft: pi > 0 ? "1px solid hsl(var(--border))" : undefined }}>
                    {days.map((day, di) => {
                      const dateKey = format(day, "yyyy-MM-dd");
                      const today = isToday(day);
                      const holiday = holidayMap.get(dateKey);
                      const bookingKey = `${prof.id}_${dateKey}`;
                      const cellBookings = (byProfDay[bookingKey] ?? []).filter((b) => getSlotDateTime(b)?.hour === hour);

                      return (
                        <div key={bookingKey} className={`flex-1 relative ${today && !holiday ? "bg-primary/[0.03]" : ""}`} style={{
                          borderLeft: di > 0 ? "1px solid hsl(var(--border-subtle))" : undefined,
                          ...(holiday ? { background: "hsl(var(--holiday-bg) / 0.5)" } : {}),
                        }}>
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

// ── AgendaUnitView (single unit) ────────────────────────────────────────────
function AgendaUnitView({ onSelectBooking, onSaveBooking, unit, showUnitHeader }: AgendaUnitViewProps) {
  const { company } = useAuth();
  const [mode, setMode] = useState<AgendaMode>("week");
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [newSlot, setNewSlot] = useState<NewBookingSlot | null>(null);
  const [weekProfIdx, setWeekProfIdx] = useState<number>(0);

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

  // Fetch holidays (cache-busted query key to avoid stale empty cache)
  const visibleYears = useMemo(() => {
    const startYear = Number(dateRange.from.slice(0, 4));
    const endYear = Number(dateRange.to.slice(0, 4));
    return startYear === endYear ? [startYear] : [startYear, endYear];
  }, [dateRange.from, dateRange.to]);

  const { data: holidays = [] } = useQuery({
    queryKey: ["holidays-v2", dateRange.from, dateRange.to],
    queryFn: async () => {
      const all = await Promise.all(visibleYears.map((y) => fetchHolidays(y)));
      return all.flat();
    },
    staleTime: 5 * 60_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const holidayMap = useMemo(() => {
    const localFallback = buildLocalHolidayMap(visibleYears);
    const apiMap = buildHolidayMap(holidays);

    for (const [date, holiday] of localFallback.entries()) {
      if (!apiMap.has(date)) apiMap.set(date, holiday);
    }

    return apiMap;
  }, [holidays, visibleYears]);

  // Fetch agenda bookings with server-side filters
  const { data: rawAgendaBookings = [], isLoading: loadingBookings } = useQuery({
    queryKey: ["agenda-bookings", unit?.id, dateRange.from, dateRange.to],
    queryFn: () => fetchAgendaBookings(unit!.id, dateRange.from, dateRange.to),
    enabled: !!unit,
    staleTime: 30_000,
  });

  // Client-side safety filter: only show BRs matching the active unit
  const agendaBookings = useMemo(() => {
    if (!unit) return rawAgendaBookings;
    const unitName = unit.name.trim().toLowerCase();
    return rawAgendaBookings.filter((b: any) => {
      const rawUnit = b.unit ?? b.unit_id ?? b.unitId ?? b.booking_unit ?? b.booking_unit_id;
      const unitId = typeof rawUnit === "object" && rawUnit ? Number(rawUnit.id ?? rawUnit.pk) : Number(rawUnit);
      if (Number.isFinite(unitId)) return unitId === unit.id;
      const unitName = String(b.unit_name ?? b.unitName ?? (typeof rawUnit === "object" && rawUnit ? rawUnit.name ?? "" : "")).trim().toLowerCase();
      if (unitName) return unitName === unitName;
      return true; // if no unit info, keep it
    });
  }, [rawAgendaBookings, unit]);

  // Source of truth for professionals visible in Agenda: active professional-unit links
  const { data: profUnitLinks = [] } = useQuery({
    queryKey: ["professional-units-by-unit", unit?.id],
    queryFn: async () => {
      const { data } = await api.get("/api/booking/professional-units/", {
        params: { unit: unit!.id, page_size: 500 },
      });
      const list = Array.isArray(data) ? data : (data?.results ?? data?.data ?? []);
      return list as any[];
    },
    enabled: !!unit,
    staleTime: 60_000,
  });

  const displayProfessionals = useMemo(() => {
    const byId = new Map<number, Professional>();

    for (const link of profUnitLinks) {
      if (link?.is_active === false) continue;

      const rawProfessional = link?.professional ?? link?.professional_id;
      const professionalId =
        typeof rawProfessional === "object"
          ? Number(rawProfessional?.id ?? rawProfessional?.pk)
          : Number(rawProfessional);

      if (!Number.isFinite(professionalId) || professionalId <= 0 || byId.has(professionalId)) {
        continue;
      }

      const bookingMatch = agendaBookings.find((b) => getBookingProfessionalId(b) === professionalId);
      const name =
        link?.professional_name ??
        link?.professional__name ??
        (typeof rawProfessional === "object" ? rawProfessional?.name : undefined) ??
        bookingMatch?.professional_name ??
        getBookingProfessionalName(bookingMatch as any) ??
        `Profissional #${professionalId}`;

      byId.set(professionalId, {
        id: professionalId,
        name,
        specialty: "",
      });
    }

    return Array.from(byId.values());
  }, [profUnitLinks, agendaBookings]);

  // Single professional for week view with index-based navigation
  const safeWeekProfIdx = Math.min(weekProfIdx, Math.max(displayProfessionals.length - 1, 0));
  const weekProfessional = displayProfessionals[safeWeekProfIdx] ?? null;
  const weekProfessionals = weekProfessional ? [weekProfessional] : displayProfessionals;

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
        confirmation: booking.confirmation ?? null,
      },
    });
  };
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch professional availabilities filtered by active unit
  const { data: rawAvailabilities = [] } = useQuery({
    queryKey: ["professional-availabilities", unit?.id],
    queryFn: async () => {
      // Try filtering server-side by unit; fallback to global list and filter client-side
      const tryFetch = async (params: Record<string, any>) => {
        const { data } = await api.get("/api/booking/professional-availabilities/", { params });
        return Array.isArray(data) ? data : (data?.results ?? data?.data ?? []);
      };
      try {
        const list = await tryFetch({ unit: unit!.id, page_size: 500 });
        if (Array.isArray(list) && list.length >= 0) return list;
      } catch (e) {
        console.warn("[availabilities] unit-filtered fetch failed, falling back", e);
      }
      try {
        return await tryFetch({ page_size: 500 });
      } catch {
        const { data } = await api.get("/api/settings/professional-availabilities/");
        return Array.isArray(data) ? data : (data?.results ?? []);
      }
    },
    enabled: !!unit,
    staleTime: 60_000,
  });

  // Resolve: professional_unit_id → professional_id (limited to active unit)
  const profUnitToProf = useMemo(() => {
    const m = new Map<number, number>();
    for (const link of profUnitLinks) {
      const linkId = Number(link?.id);
      const profVal = link?.professional ?? link?.professional_id;
      const profId = typeof profVal === "object" ? Number(profVal?.id) : Number(profVal);
      const unitVal = link?.unit ?? link?.unit_id;
      const unitId = typeof unitVal === "object" ? Number(unitVal?.id) : Number(unitVal);
      if (linkId && profId && (!unit || unitId === unit.id)) {
        m.set(linkId, profId);
      }
    }
    return m;
  }, [profUnitLinks, unit]);

  const availMap = useMemo(() => {
    const map: Record<number, ProfAvailability> = {};
    for (const a of rawAvailabilities) {
      if (a.is_active === false) continue;

      // Resolve professional id, preferring professional_unit when present
      const puVal = a?.professional_unit ?? a?.professional_unit_id;
      const puId = typeof puVal === "object" ? Number(puVal?.id) : Number(puVal);
      const profFromPu = Number.isFinite(puId) && puId > 0 ? profUnitToProf.get(puId) : undefined;

      const profVal = a?.professional ?? a?.professional_id;
      const profDirect = typeof profVal === "object" ? Number(profVal?.id) : Number(profVal);

      // If a professional_unit is present, only keep the row when it belongs to the active unit
      if (Number.isFinite(puId) && puId > 0 && !profFromPu) continue;

      const profId = profFromPu ?? profDirect;
      if (!profId || !Number.isFinite(profId)) continue;

      map[profId] = { ...a, professional: profId };
    }
    return map;
  }, [rawAvailabilities, profUnitToProf]);

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

  const printPeriodLabel = `${format(weekStart, "dd/MM/yyyy", { locale: ptBR })} – ${format(addDays(weekStart, 6), "dd/MM/yyyy", { locale: ptBR })}`;

  if (!unit) {
    return (
      <div
        className="rounded-xl border border-border/60 shadow-md flex flex-col items-center justify-center gap-3 p-12 text-center"
        style={{ background: "hsl(var(--surface))", minHeight: "60vh" }}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Building2 className="h-6 w-6 text-primary" />
        </div>
        <h2 className="text-base font-semibold text-foreground">Selecione uma unidade</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          A visualização em Agenda exibe horários, profissionais e disponibilidades de uma unidade por vez.
          Escolha uma unidade no seletor acima para visualizar a agenda.
        </p>
      </div>
    );
  }

  return (
    <>
      <div
        id="agenda-print-area"
        className="rounded-xl border border-border/60 shadow-md flex flex-col overflow-hidden w-full"
        style={{ maxHeight: "calc(100vh - 80px)", background: "hsl(var(--surface))" }}
      >
        {/* Print-only header */}
        <div className="hidden print:block px-4 pt-4 pb-2 border-b border-border">
          <h1 className="text-base font-bold">{company?.name || "PrismIA"}</h1>
          <p className="text-xs text-muted-foreground">{unit?.name || "Unidade"}</p>
          <p className="text-sm font-semibold mt-1">
            Agenda Semanal — {printPeriodLabel}
            {mode === "week" && weekProfessional && ` — ${weekProfessional.name}`}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Impresso em {format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</p>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border surface-elevated flex-shrink-0 flex-wrap gap-y-2 print:hidden">
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
                onClick={() => { setMode(m); if (m === "day") setCurrentDate(new Date()); }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  mode === m ? "bg-surface-raised text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <CalendarDays className="h-3 w-3" />
                {m === "day" ? "Dia" : "Semana"}
              </button>
            ))}
          </div>

          {mode === "week" && displayProfessionals.length > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setWeekProfIdx((i) => Math.max(0, i - 1))}
                disabled={safeWeekProfIdx === 0}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <Select
                value={String(safeWeekProfIdx)}
                onValueChange={(v) => setWeekProfIdx(Number(v))}
              >
                <SelectTrigger className="h-7 w-[180px] text-xs border-border bg-surface">
                  <User className="h-3 w-3 mr-1.5 flex-shrink-0" />
                  <SelectValue placeholder="Profissional" />
                </SelectTrigger>
                <SelectContent>
                  {displayProfessionals.map((p, idx) => (
                    <SelectItem key={p.id} value={String(idx)}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                onClick={() => setWeekProfIdx((i) => Math.min(displayProfessionals.length - 1, i + 1))}
                disabled={safeWeekProfIdx >= displayProfessionals.length - 1}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors border border-border"
            title="Imprimir agenda"
          >
            <Printer className="h-3.5 w-3.5" />
            Imprimir
          </button>
        </div>

        {/* Grid scrollable */}
        <div ref={scrollRef} className="flex-1 overflow-auto">
          {mode === "day" ? (
            <DayView
              day={currentDate}
              professionals={displayProfessionals}
              bookings={agendaBookings}
              availMap={availMap}
              holidayMap={holidayMap}
              onSelectBooking={handleAppointmentClick}
              onCellClick={setNewSlot}
            />
          ) : (
            <WeekView
              weekStart={weekStart}
              professionals={weekProfessionals}
              bookings={agendaBookings}
              availMap={availMap}
              holidayMap={holidayMap}
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
