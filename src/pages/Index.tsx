import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookingRequest, BookingStatus } from "@/types/booking";
import { fetchBookingRequests, createBooking } from "@/lib/bookingApi";
import { NewBookingFormData } from "@/components/NewBookingModal";
import { BookingTable } from "@/components/BookingTable";
import { BookingDrawer } from "@/components/BookingDrawer";
import { AgendaView } from "@/components/AgendaView";
import { StatusBadge } from "@/components/StatusBadge";
import { useAuth } from "@/contexts/AuthContext";
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
} from "lucide-react";

type View = "table" | "agenda";
type FilterStatus = BookingStatus | "all";

const STATUS_FILTERS: { value: FilterStatus; label: string }[] = [
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
  const [view, setView] = useState<View>("table");
  const [selectedBooking, setSelectedBooking] = useState<BookingRequest | null>(null);
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("all");
  const [search, setSearch] = useState("");
  const [showUnitMenu, setShowUnitMenu] = useState(false);

  const queryClient = useQueryClient();

  const { data, isLoading, isRefetching, refetch, isError } = useQuery({
    queryKey: ["booking-requests"],
    queryFn: fetchBookingRequests,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    staleTime: 20_000,
    retry: 2,
  });

  const bookings = data?.results ?? [];
  const professionals = data?.professionals ?? [];

  const filteredBookings = bookings.filter((b) => {
    const matchStatus = statusFilter === "all" || b.status === statusFilter;
    const q = search.toLowerCase();
    const matchSearch =
      !q ||
      b.lead_name.toLowerCase().includes(q) ||
      b.procedure_name.toLowerCase().includes(q) ||
      b.professional_name.toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const stats = {
    total: bookings.length,
    handoff: bookings.filter((b) => b.status === "handoff").length,
    assisted: bookings.filter((b) => b.status === "assisted").length,
    pending: bookings.filter((b) => b.status === "pending").length,
    confirmed: bookings.filter((b) => b.status === "confirmed").length,
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
                    {bookings.filter((b) => b.status === f.value).length}
                  </span>
                )}
              </button>
            ))}
          </div>

          <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
            {filteredBookings.length} registro{filteredBookings.length !== 1 ? "s" : ""}
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
              bookings={filteredBookings}
              professionals={professionals}
              onSelectBooking={setSelectedBooking}
              onSaveBooking={handleSaveBooking}
            />
          )}
        </div>
      </main>

      <BookingDrawer
        booking={selectedBooking}
        professionals={professionals}
        onClose={() => setSelectedBooking(null)}
        onConfirmed={() => queryClient.invalidateQueries({ queryKey: ["booking-requests"] })}
      />
    </div>
  );
}
