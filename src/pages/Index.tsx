import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookingRequest, BookingStatus } from "@/types/booking";
import { fetchBookingRequests, createBooking, fetchProfessionalsByUnit } from "@/lib/bookingApi";
import { NewBookingFormData } from "@/components/NewBookingModal";
import { BookingTable } from "@/components/BookingTable";
import { BookingDrawer } from "@/components/BookingDrawer";
import { AgendaView } from "@/components/AgendaView";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import {
  LayoutList,
  CalendarDays,
  RefreshCw,
  Sparkles,
  Search,
  SlidersHorizontal,
  Wifi,
  WifiOff,
  LogOut,
  ChevronDown,
  Building2,
  Shield,
  Settings,
} from "lucide-react";

type View = "table" | "agenda";
type FilterStatus = BookingStatus | "all" | "today";

const STATUS_FILTERS: { value: FilterStatus; label: string }[] = [
  { value: "today" as FilterStatus, label: "Hoje" },
  { value: "all", label: "Todos" },
  { value: "handoff", label: "Handoff" },
  { value: "assisted", label: "Assisted" },
  { value: "awaiting_choice", label: "Aguardando" },
  { value: "pending", label: "Pendente" },
  { value: "confirmed", label: "Confirmado" },
  { value: "canceled", label: "Cancelado" },
];

export default function Index() {
  const { user, company, role, units, activeUnit, setActiveUnit, logout, canManage } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<View>("table");
  const [selectedBooking, setSelectedBooking] = useState<BookingRequest | null>(null);
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [search, setSearch] = useState("");
  const [showUnitMenu, setShowUnitMenu] = useState(false);

  const queryClient = useQueryClient();

  const { data, isLoading, isRefetching, refetch, isError } = useQuery({
    queryKey: ["booking-requests"],
    queryFn: fetchBookingRequests,
    refetchInterval: false,
    refetchOnWindowFocus: false,
    staleTime: 120_000,
    retry: 1,
  });

  const bookings = data?.results ?? [];

  // Fetch professionals by active unit for the agenda view
  const { data: unitProfessionals } = useQuery({
    queryKey: ["professionals-by-unit", activeUnit?.id],
    queryFn: () => fetchProfessionalsByUnit(activeUnit!.id),
    enabled: !!activeUnit && view === "agenda",
    staleTime: 60_000,
  });

  const professionals = (unitProfessionals && unitProfessionals.length > 0)
    ? unitProfessionals
    : (data?.professionals ?? []);

  const getCreatedDate = (b: BookingRequest): string => {
    return b.created_at?.slice(0, 10) || "";
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  // Step 1: Apply search filter first
  const searchedBookings = bookings.filter((b) => {
    const q = search.toLowerCase();
    if (!q) return true;
    return (
      (b.lead_name ?? "").toLowerCase().includes(q) ||
      (b.procedure_name ?? "").toLowerCase().includes(q) ||
      (b.professional_name ?? "").toLowerCase().includes(q) ||
      (b.contact_phone ?? "").toLowerCase().includes(q)
    );
  });

  // Step 2: Apply status filter on searched results
  const matchStatusFn = (b: BookingRequest, filter: FilterStatus): boolean => {
    if (filter === "all") return true;
    if (filter === "today") return getCreatedDate(b) === todayStr;
    const s = (b.status ?? "").toLowerCase();
    const f = filter.toLowerCase();
    return s === f || (f === "canceled" && s === "cancelled") || (f === "cancelled" && s === "canceled");
  };

  const filteredBookings = searchedBookings.filter((b) => matchStatusFn(b, statusFilter));

  const isCanceledStatus = (status: unknown) => {
    const normalized = String(status ?? "").trim().toLowerCase();
    return normalized === "canceled" || normalized === "cancelled" || normalized === "failed";
  };

  const hasAgendaSlot = (booking: BookingRequest) =>
    Boolean(
      booking.scheduled_at ||
      booking.chosen_slot?.start_at ||
      booking.vars_snapshot?.chosen_slot?.start_at ||
      booking.chosen_slot_label ||
      booking.chosen_slot?.label ||
      booking.vars_snapshot?.chosen_slot?.label
    );

  // Agenda shows bookings with a scheduled date, EXCEPT canceled ones
  // This keeps reopened bookings (handoff) visible in the agenda
  const agendaBookings = bookings.filter((b) => !isCanceledStatus(b.status) && hasAgendaSlot(b));

  const agendaProfessionals = useMemo(() => {
    if (agendaBookings.length === 0) return professionals;

    const byId = new Map<string, { id: number; name: string; specialty: string }>();

    for (const booking of agendaBookings) {
      const idKey = String(booking.professional_id).trim();
      if (!idKey || byId.has(idKey)) continue;

      const existing = professionals.find((p) => String(p.id).trim() === idKey);
      byId.set(idKey, {
        id: booking.professional_id as unknown as number,
        name: booking.professional_name || existing?.name || `Profissional #${idKey}`,
        specialty: existing?.specialty || "-",
      });
    }

    return Array.from(byId.values());
  }, [agendaBookings, professionals]);

  const matchStatusHelper = (b: BookingRequest, filter: string) => {
    const s = (b.status ?? "").toLowerCase();
    const f = filter.toLowerCase();
    return s === f || (f === "canceled" && s === "cancelled") || (f === "cancelled" && s === "canceled");
  };

  // Stats based on searched results (respects search but not status filter)
  const stats = {
    total: searchedBookings.length,
    handoff: searchedBookings.filter((b) => matchStatusHelper(b, "handoff")).length,
    assisted: searchedBookings.filter((b) => matchStatusHelper(b, "assisted")).length,
    pending: searchedBookings.filter((b) => matchStatusHelper(b, "pending")).length,
    confirmed: searchedBookings.filter((b) => matchStatusHelper(b, "confirmed")).length,
  };

  const handleSaveBooking = async (formData: NewBookingFormData) => {
    await createBooking(formData);
    queryClient.invalidateQueries({ queryKey: ["booking-requests"] });
  };

  const handleSetView = (v: View) => {
    setView(v);
    refetch();
  };

  const handleLogout = async () => {
    await logout();
  };

  const roleLabel: Record<string, string> = {
    owner: "Owner",
    manager: "Manager",
    agent: "Agente",
  };

  return (
    <div className="min-h-screen" style={{ background: "hsl(var(--background))" }}>
      {/* Top navigation bar */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between px-6 py-3 border-b border-border"
        style={{ background: "hsl(var(--surface))", backdropFilter: "blur(12px)" }}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg gradient-primary">
              <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="text-sm font-bold tracking-tight gradient-text">PrismIA</span>
          </div>
          <span className="text-border text-xs">|</span>

          {/* Company + Unit selector */}
          <div className="flex items-center gap-2">
            {company && (
              <span className="text-xs text-muted-foreground font-medium">{company.name}</span>
            )}
            {units.length > 1 && (
              <div className="relative">
                <button
                  onClick={() => setShowUnitMenu(!showUnitMenu)}
                  className="flex items-center gap-1 text-xs font-medium text-foreground px-2 py-1 rounded-lg border border-border hover:bg-surface-elevated transition-colors"
                >
                  <Building2 className="h-3 w-3 text-muted-foreground" />
                  {activeUnit?.name ?? "Unidade"}
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </button>
                {showUnitMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowUnitMenu(false)} />
                    <div className="absolute top-full left-0 mt-1 z-50 rounded-lg border border-border surface-raised shadow-md py-1 min-w-[160px]">
                      {units.map((u) => (
                        <button
                          key={u.id}
                          onClick={() => {
                            setActiveUnit(u);
                            setShowUnitMenu(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                            activeUnit?.id === u.id
                              ? "text-primary font-semibold bg-primary/5"
                              : "text-foreground hover:bg-surface-elevated"
                          }`}
                        >
                          {u.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            {units.length <= 1 && activeUnit && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Building2 className="h-3 w-3" />
                {activeUnit.name}
              </span>
            )}
          </div>

          {/* Connectivity */}
          {isError ? (
            <span className="flex items-center gap-1 text-[10px] font-medium text-status-canceled bg-status-canceled-bg px-2 py-0.5 rounded-full border border-status-canceled/25">
              <WifiOff className="h-3 w-3" />
              Offline
            </span>
          ) : (
            <span className="flex items-center gap-1 text-[10px] font-medium text-status-confirmed bg-status-confirmed-bg px-2 py-0.5 rounded-full border border-status-confirmed/25">
              <Wifi className="h-3 w-3" />
              Conectado
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Role badge */}
          {role && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-surface-elevated px-2 py-0.5 rounded-full border border-border">
              <Shield className="h-3 w-3" />
              {roleLabel[role] ?? role}
            </span>
          )}

          {/* User */}
          {user && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {user.first_name || user.username}
            </span>
          )}

          <button
            onClick={() => refetch()}
            disabled={isRefetching}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-lg hover:bg-surface-elevated"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            Atualizar
          </button>

          <div className="h-4 w-px bg-border" />

          <div className="flex items-center gap-1 rounded-lg p-0.5 bg-surface-elevated border border-border">
            <button
              onClick={() => handleSetView("table")}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                view === "table"
                  ? "bg-surface-raised text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <LayoutList className="h-3.5 w-3.5" />
              Tabela
            </button>
            <button
              onClick={() => handleSetView("agenda")}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all ${
                view === "agenda"
                  ? "bg-surface-raised text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CalendarDays className="h-3.5 w-3.5" />
              Agenda
            </button>
          </div>

          <div className="h-4 w-px bg-border" />

          <button
            onClick={() => navigate("/settings")}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-surface-elevated"
            title="Configurações"
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Configurações</span>
          </button>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-status-canceled transition-colors px-2 py-1.5 rounded-lg hover:bg-surface-elevated"
            title="Sair"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Sair</span>
          </button>
        </div>
      </header>

      <main className="px-6 py-5 space-y-5 max-w-[1440px] mx-auto">
        {/* KPI row */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Total", value: stats.total, color: "text-foreground" },
            { label: "Handoff", value: stats.handoff, color: "text-status-handoff" },
            { label: "Assisted", value: stats.assisted, color: "text-status-assisted" },
            { label: "Pendentes", value: stats.pending, color: "text-status-pending" },
            { label: "Confirmados", value: stats.confirmed, color: "text-status-confirmed" },
          ].map((kpi) => (
            <div
              key={kpi.label}
              className="rounded-xl px-4 py-3 border border-border surface-raised flex items-center justify-between"
            >
              <span className="text-xs text-muted-foreground font-medium">{kpi.label}</span>
              <span className={`text-xl font-bold tabular-nums ${kpi.color}`}>{kpi.value}</span>
            </div>
          ))}
        </div>

        {/* Error banner */}
        {isError && (
          <div className="flex items-center gap-3 rounded-xl px-4 py-3 bg-status-canceled-bg border border-status-canceled/30 text-status-canceled text-sm animate-fade-in">
            <WifiOff className="h-4 w-4 flex-shrink-0" />
            <div>
              <span className="font-semibold">Backend inacessível.</span> Verifique a conexão com o servidor.
            </div>
          </div>
        )}

        {/* Filters row */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar paciente, procedimento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-border bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 focus:border-primary/60 transition-all"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground mr-1" />
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setStatusFilter(f.value)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all border ${
                  statusFilter === f.value
                    ? "border-primary/60 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-border hover:text-foreground bg-surface hover:bg-surface-elevated"
                }`}
              >
                {f.label}
                {f.value !== "all" && (
                  <span className="ml-1 opacity-60">
                    {f.value === "today"
                      ? searchedBookings.filter((b) => getCreatedDate(b) === todayStr).length
                      : searchedBookings.filter((b) => matchStatusHelper(b, f.value)).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
            {filteredBookings.length} filtrado{filteredBookings.length !== 1 ? "s" : ""} • {bookings.length} carregado{bookings.length !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Main content */}
        <div className="animate-fade-in">
          {view === "table" ? (
            <BookingTable
              bookings={filteredBookings}
              isLoading={isLoading}
              onSelectBooking={setSelectedBooking}
            />
          ) : (
            <AgendaView
              bookings={agendaBookings}
              professionals={agendaProfessionals}
              onSelectBooking={setSelectedBooking}
              onSaveBooking={handleSaveBooking}
            />
          )}
        </div>
      </main>

      <BookingDrawer
        booking={selectedBooking}
        onClose={() => setSelectedBooking(null)}
        onConfirmed={() => queryClient.invalidateQueries({ queryKey: ["booking-requests"] })}
      />
    </div>
  );
}
