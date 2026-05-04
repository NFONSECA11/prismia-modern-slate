import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { ChevronDown, MapPin, Settings2, Save } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { useAuth } from "@/contexts/AuthContext";

type BookingSettings = {
  id?: number;
  unit?: number;
  default_booking_mode?: "handoff_manual" | "assisted_slots_dashboard" | "auto_slots_bot" | string;
  booking_horizon_days?: number | null;
  wa_choice_ui_mode?: string | null;
  confirmation_enabled?: boolean;
  confirmation_send_before_hours?: number | null;
  confirmation_expiration_minutes?: number | null;
  confirmation_allowed_weekdays?: number[];
  confirmation_allowed_start_time?: string | null;
  confirmation_allowed_end_time?: string | null;
  confirmation_allow_weekends?: boolean;
  router_menu_options?: any[];
  created_at?: string;
  updated_at?: string;
};

const WEEKDAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

const MODE_OPTIONS: { value: string; label: string }[] = [
  { value: "handoff_manual", label: "Handoff Manual" },
  { value: "assisted_slots_dashboard", label: "Assistido (Dashboard)" },
  { value: "auto_slots_bot", label: "Automático (Bot)" },
];

function UnitBookingSettings({ unitId, unitName }: { unitId: number; unitName: string }) {
  const qc = useQueryClient();
  const endpoint = `/api/booking/booking-settings/by-unit/${unitId}/`;

  const { data, isLoading, isError } = useQuery<BookingSettings | null>({
    queryKey: ["booking-settings-by-unit", unitId],
    queryFn: async () => {
      const { data } = await api.get(endpoint);
      console.info(`[BookingSettings] unit=${unitId} raw response:`, data);
      let result: any = data;
      if (Array.isArray(data?.results)) {
        result = data.results.find((s: any) => Number(s?.unit) === Number(unitId)) ?? data.results[0] ?? null;
      } else if (Array.isArray(data)) {
        result = data.find((s: any) => Number(s?.unit) === Number(unitId)) ?? data[0] ?? null;
      } else if (data?.data && typeof data.data === "object") {
        result = data.data;
      }
      console.info(`[BookingSettings] unit=${unitId} normalized:`, result);
      return result ?? null;
    },
  });

  const [form, setForm] = useState<BookingSettings>({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        default_booking_mode: data.default_booking_mode ?? "handoff_manual",
        booking_horizon_days: data.booking_horizon_days ?? 0,
        wa_choice_ui_mode: data.wa_choice_ui_mode ?? "",
        confirmation_enabled: !!data.confirmation_enabled,
        confirmation_send_before_hours: data.confirmation_send_before_hours ?? 0,
        confirmation_expiration_minutes: data.confirmation_expiration_minutes ?? 0,
        confirmation_allowed_weekdays: Array.isArray(data.confirmation_allowed_weekdays) ? data.confirmation_allowed_weekdays : [],
        confirmation_allowed_start_time: data.confirmation_allowed_start_time ?? "",
        confirmation_allowed_end_time: data.confirmation_allowed_end_time ?? "",
        confirmation_allow_weekends: !!data.confirmation_allow_weekends,
      });
      setDirty(false);
    }
  }, [data]);

  const update = <K extends keyof BookingSettings>(key: K, value: BookingSettings[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const toggleWeekday = (d: number) => {
    const cur = new Set(form.confirmation_allowed_weekdays ?? []);
    if (cur.has(d)) cur.delete(d);
    else cur.add(d);
    update("confirmation_allowed_weekdays", Array.from(cur).sort((a, b) => a - b));
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      await fetchCsrf();
      const payload = { ...form };
      try {
        const { data } = await api.patch(endpoint, payload);
        return data;
      } catch (err: any) {
        if (err?.response?.status === 405) {
          const { data } = await api.put(endpoint, payload);
          return data;
        }
        throw err;
      }
    },
    onSuccess: () => {
      toast.success(`Configurações salvas (${unitName})`);
      qc.invalidateQueries({ queryKey: ["booking-settings-by-unit", unitId] });
      qc.invalidateQueries({ queryKey: ["booking-settings", unitId] });
      setDirty(false);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || err?.response?.data?.error || err?.message || "Erro ao salvar";
      toast.error(String(msg));
    },
  });

  return (
    <div className="rounded-lg border border-border/60 p-3 space-y-4" style={{ background: "hsl(var(--surface-elevated))" }}>
      <div className="flex items-center justify-between px-1 pb-2 border-b border-border/60">
        <div className="flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs font-bold text-foreground">{unitName}</span>
        </div>
        <span className="text-[10px] text-muted-foreground font-mono">#{data?.id ?? "—"}</span>
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground px-1">Carregando…</p>
      ) : isError ? (
        <p className="text-xs text-destructive px-1">Erro ao carregar configurações.</p>
      ) : (
        <>
          {/* Geral */}
          <div className="space-y-3 pl-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Geral</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">Horizonte de agendamento (dias)</span>
                <Input
                  type="number"
                  min={0}
                  className="h-8 text-xs"
                  value={form.booking_horizon_days ?? 0}
                  onChange={(e) => update("booking_horizon_days", Number(e.target.value))}
                />
              </label>
            </div>
          </div>

          {/* Confirmação */}
          <div className="space-y-3 pl-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Confirmação</span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground">Ativada</span>
                <Switch
                  checked={!!form.confirmation_enabled}
                  onCheckedChange={(v) => update("confirmation_enabled", v)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">Enviar antes de (horas)</span>
                <Input
                  type="number"
                  min={0}
                  className="h-8 text-xs"
                  value={form.confirmation_send_before_hours ?? 0}
                  onChange={(e) => update("confirmation_send_before_hours", Number(e.target.value))}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">Expira em (minutos)</span>
                <Input
                  type="number"
                  min={0}
                  className="h-8 text-xs"
                  value={form.confirmation_expiration_minutes ?? 0}
                  onChange={(e) => update("confirmation_expiration_minutes", Number(e.target.value))}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">Horário início</span>
                <Input
                  type="time"
                  className="h-8 text-xs"
                  value={(form.confirmation_allowed_start_time ?? "").slice(0, 5)}
                  onChange={(e) => update("confirmation_allowed_start_time", e.target.value)}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground">Horário fim</span>
                <Input
                  type="time"
                  className="h-8 text-xs"
                  value={(form.confirmation_allowed_end_time ?? "").slice(0, 5)}
                  onChange={(e) => update("confirmation_allowed_end_time", e.target.value)}
                />
              </label>
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[11px] text-muted-foreground">Dias permitidos</span>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAY_LABELS.map((label, idx) => {
                  const active = (form.confirmation_allowed_weekdays ?? []).includes(idx);
                  return (
                    <button
                      type="button"
                      key={idx}
                      onClick={() => toggleWeekday(idx)}
                      className={`text-[11px] px-2 py-1 rounded-md border transition-colors ${
                        active
                          ? "border-primary bg-primary/15 text-primary"
                          : "border-border text-muted-foreground hover:bg-surface-elevated"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-muted-foreground">Permitir fins de semana</span>
              <Switch
                checked={!!form.confirmation_allow_weekends}
                onCheckedChange={(v) => update("confirmation_allow_weekends", v)}
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-2 border-t border-border/30">
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-muted-foreground">
                Criado: {data?.created_at ? new Date(data.created_at).toLocaleDateString("pt-BR") : "—"}
              </span>
              <span className="text-[10px] text-muted-foreground">
                Atualizado: {data?.updated_at ? new Date(data.updated_at).toLocaleDateString("pt-BR") : "—"}
              </span>
            </div>
            <Button
              size="sm"
              className="h-8 text-xs gap-1.5"
              disabled={!dirty || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              <Save className="h-3.5 w-3.5" />
              {saveMutation.isPending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

export default function BookingSettingsSection() {
  const { units } = useAuth();
  const unitCount = units?.length ?? 0;

  return (
    <Collapsible defaultOpen id="section-modo-atendimento">
      <CollapsibleTrigger
        className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated"
        style={{ background: "hsl(var(--surface))" }}
      >
        <div className="flex items-center gap-2">
          <Settings2 className="h-4 w-4 text-primary" />
          <div className="text-left">
            <span className="text-sm font-bold text-foreground">Modo de Atendimento por Unidade</span>
            <p className="text-xs text-muted-foreground">{unitCount} {unitCount === 1 ? "unidade" : "unidades"}</p>
          </div>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
      </CollapsibleTrigger>
      <CollapsibleContent
        className="mt-2 rounded-xl border border-border p-4 space-y-4"
        style={{ background: "hsl(var(--surface))" }}
      >
        {!units || units.length === 0 ? (
          <p className="text-xs text-muted-foreground px-1">Nenhuma unidade disponível.</p>
        ) : (
          units.map((u) => (
            <UnitBookingSettings key={u.id} unitId={u.id} unitName={u.name} />
          ))
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
