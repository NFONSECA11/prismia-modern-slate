import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { isRescheduleFromNotes } from "@/lib/cancelledBookingCache";
import { savePreference } from "@/lib/preferencesApi";
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
import bgSoftSlate5 from "@/assets/bg-soft-slate-5.jpg";
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
  Menu,
  BarChart3,
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
  const { user, company, role, units, activeUnit, setActiveUnit, logout, canManage, isAgent } = useAuth();
  const { data: branding } = useQuery({
    queryKey: ["company-branding"],
    queryFn: async () => {
      const { data } = await api.get("/api/settings/company-branding/");
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
  const navigate = useNavigate();
  const [view, setViewState] = useState<View>(() => {
    const saved = sessionStorage.getItem("prefs:last_view");
    return saved === "agenda" ? "agenda" : "table";
  });
  const setView = useCallback((v: View) => {
    setViewState(v);
    savePreference({ last_view: v });
  }, []);
  const [selectedBooking, setSelectedBooking] = useState<BookingRequest | null>(null);
  const [statusFilter, setStatusFilter] = useState<QuickFilter>("today");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showUnitMenu, setShowUnitMenu] = useState(false);
  const [zenMode, setZenMode] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [hideCancelled, setHideCancelled] = useState(() => {
    const saved = localStorage.getItem("prismia-hide-cancelled");
    return saved === "true";
  });

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
    const base: BookingFilterParams = activeUnit ? { unit: activeUnit.id } : {};
    if (searchId) return { ...base, limit: 0 };
    if (statusFilter === "handoff") return { ...base, status: "handoff", limit: 100 };
    if (statusFilter === "awaiting_choice") return { ...base, status: "awaiting_choice", limit: 100 };
    if (isDateFilter) return { ...base, date_field: "created_at", date_from: dateFrom, date_to: dateTo, limit: 200 };
    return { ...base, limit: 100 };
  }, [statusFilter, searchId, isDateFilter, dateFrom, dateTo, activeUnit]);

  const apiParamsUpdated = useMemo((): BookingFilterParams | null => {
    if (searchId || !isDateFilter) return null;
    const base: BookingFilterParams = activeUnit ? { unit: activeUnit.id } : {};
    return { ...base, date_field: "updated_at", date_from: dateFrom, date_to: dateTo, limit: 200 };
  }, [searchId, isDateFilter, dateFrom, dateTo, activeUnit]);

  // Main list query (created_at)
  const { data, isLoading: listLoading, isRefetching, refetch, isError } = useQuery({
    queryKey: ["booking-requests", apiParams],
    queryFn: () => fetchFilteredBookings(apiParams),
    enabled: !searchId,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
    staleTime: 0,
    retry: 1,
  });

  // Secondary query (updated_at) — only for date filters
  const { data: dataUpdated, refetch: refetchUpdated } = useQuery({
    queryKey: ["booking-requests-updated", apiParamsUpdated],
    queryFn: () => fetchFilteredBookings(apiParamsUpdated!),
    enabled: !!apiParamsUpdated,
    refetchInterval: 30_000,
    refetchOnWindowFocus: false,
    staleTime: 0,
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
      (b) => {
        const pCode = ((b as any).procedure_code ?? b.procedure_slug ?? "").trim().toLowerCase();
        return b.status === "awaiting_choice" && b.booking_mode !== "auto_slots_bot" && !autoPatchedRef.current.has(b.id) && pCode !== "cancel";
      }
    );
    if (awaitingBRs.length === 0) return;

    (async () => {
      try {
        // Detect reschedules: by procedure_code or by notes (need fetch for notes)
        const rescheduleIds = new Set<number>();
        for (const b of awaitingBRs) {
          const pCode = ((b as any).procedure_code ?? b.procedure_slug ?? "").trim().toLowerCase();
          if (pCode === "reschedule") {
            rescheduleIds.add(b.id);
          } else {
            try {
              const detail = await fetchBookingRequestById(b.id);
              if (isRescheduleFromNotes((detail as any).notes)) {
                rescheduleIds.add(b.id);
              }
            } catch { /* ignore */ }
          }
        }
        const rescheduleBRs = awaitingBRs.filter((b) => rescheduleIds.has(b.id));
        const otherBRs = awaitingBRs.filter((b) => !rescheduleIds.has(b.id));

        let unitIsAuto = false;
        if (otherBRs.length > 0) {
          const { data: settingsData } = await api.get(`/api/booking/booking-settings/by-unit/${activeUnit.id}/`);
          const settings = settingsData?.result ?? settingsData;
          unitIsAuto = settings?.default_booking_mode === "auto_slots_bot";
        }

        const toPatch = [...rescheduleBRs, ...(unitIsAuto ? otherBRs : [])];

        if (toPatch.length === 0) return;

        for (const br of toPatch) {
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

  

  const toggleHideCancelled = useCallback((val: boolean) => {
    setHideCancelled(val);
    localStorage.setItem("prismia-hide-cancelled", String(val));
  }, []);

  const filteredBookings = useMemo(() => {
    let list = bookings;

    // Safety net: enforce active unit client-side if backend ignores filter
    if (activeUnit) {
      const activeUnitName = activeUnit.name.trim().toLowerCase();
      list = list.filter((b) => {
        const rawUnit =
          (b as any).unit ??
          (b as any).unit_id ??
          (b as any).unitId ??
          (b as any).booking_unit ??
          (b as any).booking_unit_id;

        const unitId =
          typeof rawUnit === "object" && rawUnit
            ? Number(rawUnit.id ?? rawUnit.pk)
            : Number(rawUnit);

        if (Number.isFinite(unitId)) {
          return unitId === activeUnit.id;
        }

        const unitName = String(
          (b as any).unit_name ??
          (b as any).unitName ??
          (typeof rawUnit === "object" && rawUnit ? rawUnit.name ?? "" : "")
        )
          .trim()
          .toLowerCase();

        if (unitName) {
          return unitName === activeUnitName;
        }

        return true;
      });
    }

    // Hide cancelled if toggled on
    if (hideCancelled) {
      list = list.filter((b) => b.status !== "canceled" && b.status !== "cancelled");
    }

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
  }, [bookings, activeUnit, debouncedSearch, searchId, hideCancelled]);

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
    "night": [bgDarkNavy, bgDarkNavy2, bgDarkNavy3, bgDarkNavy4],
    "slate": [bgSoftSlate, bgSoftSlate2, bgSoftSlate3, bgSoftSlate4, bgSoftSlate5],
    "frost": [bgLightClean, bgLightClean2, bgLightClean3, bgLightClean4],
  };
  const solidColors: Record<string, string[]> = {
    "night": ["216 65% 7%", "218 28% 9%", "258 32% 8%"],
    "slate": ["216 50% 12%", "215 22% 15%", "200 30% 14%"],
    "frost": ["212 54% 96%", "214 20% 94%", "208 35% 95%"],
  };
  const gradientMap: Record<string, string[]> = {
    "night": [
      "linear-gradient(145deg, hsl(210 58% 6%), hsl(205 55% 12%), hsl(200 45% 18%))",
      "linear-gradient(150deg, hsl(220 30% 7%), hsl(218 25% 11%), hsl(215 20% 16%))",
      "linear-gradient(140deg, hsl(215 50% 7%), hsl(248 28% 12%), hsl(260 22% 16%))",
    ],
    "slate": [
      "linear-gradient(145deg, hsl(216 48% 11%), hsl(212 42% 17%), hsl(208 38% 23%))",
      "linear-gradient(150deg, hsl(215 22% 12%), hsl(214 18% 18%), hsl(212 15% 24%))",
      "linear-gradient(140deg, hsl(200 32% 12%), hsl(198 28% 18%), hsl(205 24% 24%))",
    ],
    "frost": [
      "linear-gradient(145deg, hsl(210 40% 97%), hsl(208 35% 94%), hsl(205 45% 90%))",
      "linear-gradient(150deg, hsl(214 18% 96%), hsl(212 15% 93%), hsl(210 20% 90%))",
      "linear-gradient(140deg, hsl(208 30% 96%), hsl(206 35% 92%), hsl(210 25% 95%))",
    ],
  };
  const isLandscape = bgMode === "landscape";
  const isGradient = bgMode === "gradient";
  const currentBg = landscapeMap[theme]?.[bgVariant] ?? landscapeMap[theme]?.[0];
  const solidBg = solidColors[theme]?.[bgVariant] ?? solidColors[theme]?.[0];
  const gradientBg = gradientMap[theme]?.[bgVariant] ?? gradientMap[theme]?.[0];

  const mainBg = isLandscape ? "hsl(var(--background))" : isGradient ? "hsl(var(--background))" : `hsl(${solidBg})`;

  return (
    <div className="min-h-screen relative" style={{ background: mainBg }}>
      {/* Background landscape */}
      {isLandscape && (
        <div
          className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${currentBg})` }}
        />
      )}
      {/* Background gradient */}
      {isGradient && (
        <div
          className="fixed inset-0 z-0"
          style={{ background: gradientBg }}
        />
      )}
      {/* Top navigation bar */}
      <header
        className="sticky top-0 z-30 border-b border-border/60 print:hidden"
        style={{
          background: isLandscape ? "hsl(var(--topbar-bg) / 0.92)" : "hsl(var(--topbar-bg))",
          backdropFilter: isLandscape ? "blur(16px)" : undefined,
        }}
      >
        {/* Main bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="flex items-center gap-2 flex-shrink-0">
              {branding?.logo_url ? (
                <img src={branding.logo_url} alt={branding.logo_alt || "Logo"} className="h-11 max-w-[180px] object-contain" />
              ) : (
                <>
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg gradient-primary">
                    <Sparkles className="h-3.5 w-3.5 text-primary-foreground" />
                  </div>
                  <span className="text-sm font-bold tracking-tight gradient-text">PrismIA</span>
                </>
              )}
            </div>
            <span className="text-border text-xs hidden sm:inline">|</span>

            {/* Company + Unit selector */}
            <div className="flex items-center gap-2 min-w-0 hidden sm:flex">
              {company && (
                <span className="text-xs text-muted-foreground font-medium truncate">{company.name}</span>
              )}
              {units.length > 1 && (
                <div className="relative">
                  <button
                    onClick={() => setShowUnitMenu(!showUnitMenu)}
                    className="flex items-center gap-1 text-xs font-medium text-foreground px-2 py-1 rounded-lg border border-border hover:bg-surface-elevated transition-colors"
                  >
                    <Building2 className="h-3 w-3 text-muted-foreground" />
                    {activeUnit?.name ?? "Todas as unidades"}
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </button>
                  {showUnitMenu && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setShowUnitMenu(false)} />
                      <div className="absolute top-full left-0 mt-1 z-50 rounded-lg border border-border surface-raised shadow-md py-1 min-w-[160px]">
                        <button
                          onClick={() => {
                            setActiveUnit(null);
                            savePreference({ last_unit_id: null });
                            setShowUnitMenu(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                            !activeUnit
                              ? "text-primary font-semibold bg-primary/5"
                              : "text-foreground hover:bg-surface-elevated"
                          }`}
                        >
                          Todas as unidades
                        </button>
                        <div className="my-1 h-px bg-border" />
                        {units.map((u) => (
                          <button
                            key={u.id}
                            onClick={() => {
                              setActiveUnit(u);
                              savePreference({ last_unit_id: u.id });
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
            <div className="hidden sm:flex">
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
          </div>

          {/* Desktop actions */}
          <div className="hidden sm:flex items-center gap-2">
            {/* Role badge */}
            {role && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-surface-elevated px-2 py-0.5 rounded-full border border-border">
                <Shield className="h-3 w-3" />
                {roleLabel[role] ?? role}
              </span>
            )}

            {/* User */}
            {user && (
              <span className="text-xs text-muted-foreground">
                {user.first_name || user.username}
              </span>
            )}

            <button
              onClick={() => { refetch(); refetchUpdated(); }}
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
              {canManage && (
                <button
                  onClick={() => navigate("/reports")}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all text-muted-foreground hover:text-foreground"
                  title="Relatórios"
                >
                  <BarChart3 className="h-3.5 w-3.5" />
                  Relatórios
                </button>
              )}
            </div>

            {(
              <button
                onClick={() => navigate("/settings")}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-surface-elevated"
                title="Configurações"
              >
                <Settings className="h-3.5 w-3.5" />
                Configurações
              </button>
            )}

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
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-status-canceled transition-colors px-2 py-1.5 rounded-lg hover:bg-surface-elevated"
              title="Sair"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sair
            </button>
          </div>

          {/* Mobile: view toggle + hamburger */}
          <div className="flex sm:hidden items-center gap-2">
            {/* Compact view toggle */}
            <div className="flex items-center gap-1 rounded-lg p-0.5 bg-surface-elevated border border-border">
              <button
                onClick={() => handleSetView("table")}
                className={`flex items-center justify-center p-1.5 rounded-md transition-all ${
                  view === "table"
                    ? "bg-surface-raised text-foreground shadow-sm"
                    : "text-muted-foreground"
                }`}
              >
                <LayoutList className="h-4 w-4" />
              </button>
              <button
                onClick={() => handleSetView("agenda")}
                className={`flex items-center justify-center p-1.5 rounded-md transition-all ${
                  view === "agenda"
                    ? "bg-surface-raised text-foreground shadow-sm"
                    : "text-muted-foreground"
                }`}
              >
                <CalendarDays className="h-4 w-4" />
              </button>
            </div>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex items-center justify-center p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile dropdown menu */}
        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-border/60 px-4 py-3 space-y-2 animate-fade-in">
            {/* Company & Unit */}
            {company && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground pb-2 border-b border-border/40">
                <Building2 className="h-3 w-3" />
                <span className="font-medium">{company.name}</span>
                {activeUnit && <span className="text-border">·</span>}
                {activeUnit && <span>{activeUnit.name}</span>}
              </div>
            )}

            {/* Unit selector (mobile) */}
            {units.length > 1 && (
              <div className="flex flex-wrap gap-1.5 pb-2 border-b border-border/40">
                <button
                  onClick={() => {
                    setActiveUnit(null);
                    savePreference({ last_unit_id: null });
                  }}
                  className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                    !activeUnit
                      ? "text-primary font-semibold bg-primary/10 border border-primary/20"
                      : "text-foreground bg-surface-elevated border border-border"
                  }`}
                >
                  Todas
                </button>
                {units.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => {
                      setActiveUnit(u);
                      savePreference({ last_unit_id: u.id });
                    }}
                    className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                      activeUnit?.id === u.id
                        ? "text-primary font-semibold bg-primary/10 border border-primary/20"
                        : "text-foreground bg-surface-elevated border border-border"
                    }`}
                  >
                    {u.name}
                  </button>
                ))}
              </div>
            )}

            {/* User info & status */}
            <div className="flex items-center justify-between pb-2 border-b border-border/40">
              <div className="flex items-center gap-2">
                {user && (
                  <span className="text-xs text-foreground font-medium">
                    {user.first_name || user.username}
                  </span>
                )}
                {role && (
                  <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-surface-elevated px-2 py-0.5 rounded-full border border-border">
                    <Shield className="h-3 w-3" />
                    {roleLabel[role] ?? role}
                  </span>
                )}
              </div>
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

            {/* Actions */}
            <div className="flex flex-col gap-1">
              <button
                onClick={() => { refetch(); refetchUpdated(); setMobileMenuOpen(false); }}
                disabled={isRefetching}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs text-foreground hover:bg-surface-elevated transition-colors"
              >
                <RefreshCw className={`h-4 w-4 text-muted-foreground ${isRefetching ? "animate-spin" : ""}`} />
                Atualizar dados
              </button>

              {canManage && (
                <button
                  onClick={() => { navigate("/reports"); setMobileMenuOpen(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs text-foreground hover:bg-surface-elevated transition-colors"
                >
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                  Relatórios
                </button>
              )}

              {(
                <button
                  onClick={() => { navigate("/settings"); setMobileMenuOpen(false); }}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs text-foreground hover:bg-surface-elevated transition-colors"
                >
                  <Settings className="h-4 w-4 text-muted-foreground" />
                  Configurações
                </button>
              )}

              <button
                onClick={() => { handleLogout(); setMobileMenuOpen(false); }}
                className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs text-status-canceled hover:bg-surface-elevated transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sair
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Module banner — barra dupla full-width */}
      <div
        className="print:hidden relative w-full flex items-center px-4 md:px-6 py-1 border-b border-border/60"
        style={{
          background: isLandscape ? "hsl(var(--topbar-bg) / 0.92)" : "hsl(var(--topbar-bg))",
          backdropFilter: isLandscape ? "blur(16px)" : undefined,
        }}
      >
        <div className="flex items-center gap-1.5 text-xs md:text-sm font-semibold tracking-tight max-w-[1440px] mx-auto w-full">
          <CalendarDays className="h-3.5 w-3.5 md:h-4 md:w-4 mr-0.5" style={{ color: "hsl(var(--primary))" }} aria-hidden="true" />
          <span className="font-light opacity-90" style={{ color: "hsl(0 0% 85%)" }}>Prism</span>
          <span className="gradient-text font-bold -ml-1.5">IA</span>
          <span className="ml-1.5 font-semibold tracking-tight" style={{ color: "hsl(var(--primary))" }}>
            Agenda
          </span>
        </div>
      </div>

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

      <main className={`relative z-10 ${zenMode ? "hidden" : ""} ${view === "agenda" ? "px-6 pt-5 pb-2 space-y-2" : "px-6 py-5 space-y-5"} max-w-[1440px] mx-auto`}>

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
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl px-3 py-2" style={{ background: isLandscape || isGradient ? "hsl(var(--surface) / 0.80)" : "hsl(var(--surface))", backdropFilter: isLandscape || isGradient ? "blur(12px)" : undefined }}>
            {/* Search + result count */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-64 sm:flex-none">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Buscar por ID (#123), nom..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-8 py-2 text-xs rounded-lg border border-border text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 focus:border-primary/60 transition-all"
                  style={{ background: "hsl(var(--input-bg))" }}
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
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {filteredBookings.length} resultado{filteredBookings.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Filters — horizontal scroll on mobile, inline on desktop */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <SlidersHorizontal className="h-3.5 w-3.5 text-muted-foreground mr-0.5 flex-shrink-0 hidden sm:block" />
              {QUICK_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all border whitespace-nowrap flex-shrink-0 ${
                    statusFilter === f.value
                      ? "border-primary/60 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-border hover:text-foreground bg-surface hover:bg-surface-elevated"
                  }`}
                >
                  {f.label}
                </button>
              ))}

              <div className="h-4 w-px bg-border mx-1 flex-shrink-0" />

              <label className="flex items-center gap-1.5 cursor-pointer select-none flex-shrink-0">
                <button
                  role="switch"
                  aria-checked={hideCancelled}
                  onClick={() => toggleHideCancelled(!hideCancelled)}
                  className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border border-border transition-colors ${
                    hideCancelled ? "bg-primary" : "bg-surface-elevated"
                  }`}
                >
                  <span
                    className={`block h-3 w-3 rounded-full bg-background shadow-sm transition-transform ${
                      hideCancelled ? "translate-x-3.5" : "translate-x-0.5"
                    }`}
                  />
                </button>
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">Ocultar cancelados</span>
              </label>
            </div>
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
        logoUrl={branding?.logo_url}
        logoAlt={branding?.logo_alt}
      />
    </div>
  );
}
