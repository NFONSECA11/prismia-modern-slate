import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient, useQueries } from "@tanstack/react-query";
import { BookingRequest } from "@/types/booking";
import { fetchFilteredBookings, fetchBookingRequestById, createBooking, patchBooking, BookingFilterParams } from "@/lib/bookingApi";
import api from "@/lib/api";
import { NewBookingFormData } from "@/components/NewBookingModal";
import { BookingTable } from "@/components/BookingTable";
import { BookingDrawer } from "@/components/BookingDrawer";
import { AgendaView } from "@/components/AgendaView";

import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useNavigate } from "react-router-dom";

import bgDarkNavy from "@/assets/bg-dark-navy.jpg";
import bgDarkNavy2 from "@/assets/bg-dark-navy-2.jpg";
import bgDarkNavy3 from "@/assets/bg-dark-navy-3.jpg";
import bgDarkNavy4 from "@/assets/bg-dark-navy-4.jpg";
import bgSoftSlate from "@/assets/bg-soft-slate.jpg";
import bgSoftSlate2 from "@/assets/bg-soft-slate-2.jpg";
import bgSoftSlate3 from "@/assets/bg-soft-slate-3.jpg";
import bgSoftSlate4 from "@/assets/bg-soft-slate-4.jpg";
import bgLightClean from "@/assets/bg-light-clean.jpg";
import bgLightClean2 from "@/assets/bg-light-clean-2.jpg";
import bgLightClean3 from "@/assets/bg-light-clean-3.jpg";
import bgLightClean4 from "@/assets/bg-light-clean-4.jpg";
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
  X,
  Maximize2,
  Minimize2,
} from "lucide-react";

type View = "table" | "agenda";
type QuickFilter = "today" | "7days" | "handoff" | "awaiting_choice";

const QUICK_FILTERS: { value: QuickFilter; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "7days", label: "Últimos 7 dias" },
  { value: "handoff", label: "Handoff" },
  { value: "awaiting_choice", label: "Aguardando Escolha" },
];

export default function Index() {
  const { user, company, role, units, activeUnit, setActiveUnit, logout, canManage } = useAuth();
  const navigate = useNavigate();
  const [view, setView] = useState<View>("table");
  const [selectedBooking, setSelectedBooking] = useState<BookingRequest | null>(null);
  const [statusFilter, setStatusFilter] = useState<QuickFilter>("today");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showUnitMenu, setShowUnitMenu] = useState(false);
  const [zenMode, setZenMode] = useState(false);

  const queryClient = useQueryClient();

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 400);
    return () => clearTimeout(timer);
  }, [search]);

  // Build API params based on active filter
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = `${sevenDaysAgo.getFullYear()}-${String(sevenDaysAgo.getMonth() + 1).padStart(2, "0")}-${String(sevenDaysAgo.getDate()).padStart(2, "0")}`;

  // Detect if searching by ID
  const searchId = useMemo(() => {
    if (!debouncedSearch) return null;
    const q = debouncedSearch;
    const idQuery = q.startsWith("#") ? q.slice(1) : q;
    return /^\d+$/.test(idQuery) ? Number(idQuery) : null;
  }, [debouncedSearch]);

  // For date filters, we need two queries (created_at OR updated_at) merged
  const isDateFilter = statusFilter === "today" || statusFilter === "7days";
  const dateFrom = statusFilter === "today" ? todayStr : sevenDaysAgoStr;
  const dateTo = todayStr;

  const apiParams = useMemo((): BookingFilterParams => {
    if (searchId) return { limit: 0 };
    if (statusFilter === "handoff") return { status: "handoff", limit: 100 };
    if (statusFilter === "awaiting_choice") return { status: "awaiting_choice", limit: 100 };
    if (isDateFilter) return { date_field: "created_at", date_from: dateFrom, date_to: dateTo, limit: 200 };
    return { limit: 100 };
  }, [statusFilter, searchId, isDateFilter, dateFrom, dateTo]);

  const apiParamsUpdated = useMemo((): BookingFilterParams | null => {
    if (searchId || !isDateFilter) return null;
    return { date_field: "updated_at", date_from: dateFrom, date_to: dateTo, limit: 200 };
  }, [searchId, isDateFilter, dateFrom, dateTo]);

  // Main list query (created_at)
  const { data, isLoading: listLoading, isRefetching, refetch, isError } = useQuery({
    queryKey: ["booking-requests", apiParams],
    queryFn: () => fetchFilteredBookings(apiParams),
    enabled: !searchId,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
    staleTime: 120_000,
    retry: 1,
  });

  // Secondary query (updated_at) — only for date filters
  const { data: dataUpdated, refetch: refetchUpdated } = useQuery({
    queryKey: ["booking-requests-updated", apiParamsUpdated],
    queryFn: () => fetchFilteredBookings(apiParamsUpdated!),
    enabled: !!apiParamsUpdated,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
    staleTime: 120_000,
    retry: 1,
  });

  // Direct ID lookup
  const { data: idResult, isLoading: idLoading } = useQuery({
    queryKey: ["booking-by-id", searchId],
    queryFn: () => fetchBookingRequestById(searchId!),
    enabled: !!searchId,
    retry: 1,
    staleTime: 60_000,
  });

  const isLoading = searchId ? idLoading : listLoading;

  // Merge created_at + updated_at results (deduplicate by id)
  const bookings = useMemo(() => {
    if (searchId) return idResult ? [idResult] : [];
    const map = new Map<number, BookingRequest>();
    for (const b of (data?.results ?? [])) map.set(b.id, b);
    for (const b of (dataUpdated?.results ?? [])) map.set(b.id, b);
    return Array.from(map.values());
  }, [searchId, idResult, data, dataUpdated]);

  // ── Auto-patch: awaiting_choice → auto_slots_bot (once per BR) ──────────
  const autoPatchedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!activeUnit || bookings.length === 0) return;

    const awaitingBRs = bookings.filter(
      (b) => b.status === "awaiting_choice" && b.booking_mode !== "auto_slots_bot" && !autoPatchedRef.current.has(b.id)
    );
    if (awaitingBRs.length === 0) return;

    (async () => {
      try {
        const { data: settingsData } = await api.get(`/api/booking/booking-settings/by-unit/${activeUnit.id}/`);
        const settings = settingsData?.result ?? settingsData;
        if (settings?.default_booking_mode !== "auto_slots_bot") return;

        for (const br of awaitingBRs) {
          autoPatchedRef.current.add(br.id);
          try {
            await patchBooking(br.id, { booking_mode: "auto_slots_bot" });
            console.log(`[Index] Auto-patched BR #${br.id} → auto_slots_bot`);
          } catch (err) {
            console.warn(`[Index] Auto-patch BR #${br.id} failed:`, err);
          }
        }
        queryClient.invalidateQueries({ queryKey: ["booking-requests"] });
      } catch (err) {
        console.warn("[Index] Failed to fetch booking-settings for auto-patch:", err);
      }
    })();
  }, [bookings, activeUnit, queryClient]);

  

  const filteredBookings = useMemo(() => {
    let list = bookings;

    // Text search (client-side)
    if (debouncedSearch && !searchId) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter((b) => {
        const name = (b.lead_name || (b as any).patient_name || "").toLowerCase();
        const proc = (b.procedure_name || "").toLowerCase();
        const prof = (b.professional_name || "").toLowerCase();
        const phone = (b.contact_phone || b.phone || "").toLowerCase();
        return name.includes(q) || proc.includes(q) || prof.includes(q) || phone.includes(q);
      });
    }

    return list;
  }, [bookings, debouncedSearch, searchId]);

  const handleSaveBooking = async (formData: NewBookingFormData) => {
    await createBooking(formData);
    queryClient.invalidateQueries({ queryKey: ["booking-requests"] });
    queryClient.invalidateQueries({ queryKey: ["booking-requests-updated"] });
  };

  const handleSetView = (v: View) => {
    setView(v);
    refetch();
    refetchUpdated();
  };

  const handleLogout = async () => {
    await logout();
  };

  const roleLabel: Record<string, string> = {
    owner: "Owner",
    manager: "Manager",
    agent: "Agente",
  };

  const { theme, bgMode, bgVariant } = useTheme();
  const landscapeMap: Record<string, string[]> = {
    "dark-navy": [bgDarkNavy, bgDarkNavy2, bgDarkNavy3, bgDarkNavy4],
    "soft-slate": [bgSoftSlate, bgSoftSlate2, bgSoftSlate3, bgSoftSlate4],
    "light-clean": [bgLightClean, bgLightClean2, bgLightClean3, bgLightClean4],
  };
  const solidColors: Record<string, string[]> = {
    "dark-navy": ["222 47% 7%", "220 15% 10%", "260 30% 8%"],
    "soft-slate": ["220 20% 18%", "30 8% 20%", "210 15% 22%"],
    "light-clean": ["220 20% 97%", "40 30% 95%", "200 30% 95%"],
  };
  const isLandscape = bgMode === "landscape";
  const currentBg = landscapeMap[theme]?.[bgVariant] ?? landscapeMap[theme]?.[0];
  const solidBg = solidColors[theme]?.[bgVariant] ?? solidColors[theme]?.[0];

  return (
    <div className="min-h-screen relative" style={{ background: isLandscape ? "hsl(var(--background))" : `hsl(${solidBg})` }}>
      {/* Background landscape */}
      {isLandscape && (
        <div
          className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${currentBg})` }}
        />
      )}
      {/* Top navigation bar */}
      <header
        className="sticky top-0 z-30 flex items-center justify-between px-6 py-3 border-b border-border/60"
        style={{
          background: isLandscape ? "hsl(var(--surface) / 0.85)" : "hsl(var(--surface))",
          backdropFilter: isLandscape ? "blur(16px)" : undefined,
        }}
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

            {isLandscape && (
              <button
                onClick={() => setZenMode(!zenMode)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-surface-elevated"
                title={zenMode ? "Voltar ao dashboard" : "Modo paisagem"}
              >
                {zenMode ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
              </button>
            )}

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

      {/* Zen mode - fullscreen landscape */}
      {zenMode && isLandscape && (
        <div className="fixed inset-0 z-40 cursor-pointer" onClick={() => setZenMode(false)}>
          <div
            className="absolute inset-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${currentBg})` }}
          />
          <button
            onClick={() => setZenMode(false)}
            className="absolute top-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-xl text-white/80 hover:text-white bg-black/30 backdrop-blur-md hover:bg-black/50 transition-all text-xs font-medium"
          >
            <Minimize2 className="h-4 w-4" />
            Voltar
          </button>
        </div>
      )}

      <main className={`relative z-10 ${zenMode ? "hidden" : ""} ${view === "agenda" ? "px-2 py-2 space-y-2" : "px-6 py-5 space-y-5 max-w-[1440px]"} mx-auto`}>

        {/* Error banner */}
        {isError && (
          <div className="flex items-center gap-3 rounded-xl px-4 py-3 bg-status-canceled-bg border border-status-canceled/30 text-status-canceled text-sm animate-fade-in">
            <WifiOff className="h-4 w-4 flex-shrink-0" />
            <div>
              <span className="font-semibold">Backend inacessível.</span> Verifique a conexão com o servidor.
            </div>
          </div>
        )}

        {/* Filters row — only for table view */}
        {view === "table" && (
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar por ID (#123), nome, procedimento..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-8 pr-8 py-2 text-xs rounded-lg border border-border bg-surface text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 focus:border-primary/60 transition-all"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground mr-1" />
              {QUICK_FILTERS.map((f) => (
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
                </button>
              ))}
            </div>

            <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">
              {filteredBookings.length} resultado{filteredBookings.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}

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
