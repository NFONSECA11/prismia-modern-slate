import { useState } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { fetchCsrf } from "@/lib/authApi";
import { cancelBooking } from "@/lib/bookingApi";
import { Professional, BookingConfirmation } from "@/types/booking";
import { ConfirmationIndicator } from "@/components/ConfirmationIndicator";
import { useToast } from "@/hooks/use-toast";
import {
  X,
  User,
  Phone,
  Stethoscope,
  Calendar,
  Clock,
  Building2,
  StickyNote,
  CheckCircle2,
  Loader2,
  ChevronDown,
  Trash2,
} from "lucide-react";

export interface NewBookingSlot {
  date: Date;
  hour: number;
  minute: number;
  professional: Professional;
  // Pre-fill from existing appointment
  prefill?: {
    booking_id?: number;
    lead_name?: string;
    phone?: string;
    procedure_name?: string;
    unit_name?: string;
    notes?: string;
    confirmation?: BookingConfirmation | null;
  };
}

interface NewBookingModalProps {
  slot: NewBookingSlot | null;
  professionals: Professional[];
  unit?: { id: number; name: string } | null;
  onClose: () => void;
  onSave: (data: NewBookingFormData) => Promise<void>;
}

export interface NewBookingFormData {
  lead_name: string;
  phone: string;
  procedure_name: string;
  procedure_id: number | null;
  unit_name: string;
  unit_id: number | null;
  professional_id: number;
  date: string;
  time: string;
  time_end: string;
  notes: string;
  period: string;
  motivo: string;
}

const PERIODS = ["Manhã", "Tarde", "Noite"];

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  // Remove country code (55) if present
  const local = digits.startsWith("55") && digits.length >= 12 ? digits.slice(2) : digits;
  if (local.length === 11) {
    return `${local.slice(0, 2)} ${local.slice(2, 7)} ${local.slice(7, 9)} ${local.slice(9)}`;
  }
  if (local.length === 10) {
    return `${local.slice(0, 2)} ${local.slice(2, 6)} ${local.slice(6, 8)} ${local.slice(8)}`;
  }
  return raw;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
      {children}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/60 focus:border-primary/60 transition-all disabled:opacity-70 disabled:cursor-default"
    />
  );
}

function SelectInput({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none px-3 py-2 text-sm rounded-lg border border-border bg-surface text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 focus:border-primary/60 transition-all pr-8"
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
    </div>
  );
}

export function NewBookingModal({ slot, professionals, unit, onClose, onSave }: NewBookingModalProps) {
  if (!slot) return null;

  const defaultTime = `${String(slot.hour).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}`;
  const defaultTimeEnd = `${String(slot.hour + 1).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}`;
  const defaultDate = `${slot.date.getFullYear()}-${String(slot.date.getMonth() + 1).padStart(2, "0")}-${String(slot.date.getDate()).padStart(2, "0")}`;

  return (
    <ModalBody
      slot={slot}
      defaultTime={defaultTime}
      defaultTimeEnd={defaultTimeEnd}
      defaultDate={defaultDate}
      professionals={professionals}
      unit={unit ?? null}
      onClose={onClose}
      onSave={onSave}
    />
  );
}

// Inner component — keyed externally so it fully re-mounts per slot
function ModalBody({
  slot,
  defaultTime,
  defaultTimeEnd,
  defaultDate,
  professionals,
  unit,
  onClose,
  onSave,
}: {
  slot: NewBookingSlot;
  defaultTime: string;
  defaultTimeEnd: string;
  defaultDate: string;
  professionals: Professional[];
  unit: { id: number; name: string } | null;
  onClose: () => void;
  onSave: (data: NewBookingFormData) => Promise<void>;
}) {
  const readOnly = !!slot.prefill;
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleCancelBooking = async () => {
    const bookingId = slot.prefill?.booking_id;
    if (!bookingId) return;
    setCancelling(true);
    try {
      await cancelBooking(bookingId);
      toast({ title: "Agendamento cancelado", description: `BR #${bookingId} foi cancelado.` });
      queryClient.invalidateQueries({ queryKey: ["booking-requests"] });
      queryClient.invalidateQueries({ queryKey: ["booking-requests-updated"] });
      queryClient.invalidateQueries({ queryKey: ["agenda-bookings"] });
      onClose();
    } catch (err: any) {
      console.error("[NewBookingModal] cancelBooking falhou:", err);
      toast({
        title: "Erro ao cancelar",
        description: err?.response?.data?.detail ?? err?.message ?? "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setCancelling(false);
      setConfirmCancel(false);
    }
  };


  // Frases prontas de Motivo (editáveis, persistidas em localStorage)
  const PRESETS_KEY = "prismia-booking-motivo-presets-v1";
  const DEFAULT_PRESETS = [
    "Cliente solicitou novo agendamento",
    "Reagendamento por indisponibilidade do profissional",
    "Encaixe solicitado pelo cliente",
    "Agendamento confirmado por telefone",
    "Retorno de procedimento",
  ];
  const [presets, setPresets] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem(PRESETS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) return parsed;
      }
    } catch {}
    return DEFAULT_PRESETS;
  });
  const [editingPresets, setEditingPresets] = useState(false);
  const persistPresets = (next: string[]) => {
    setPresets(next);
    try { localStorage.setItem(PRESETS_KEY, JSON.stringify(next)); } catch {}
  };
  const updatePreset = (idx: number, value: string) =>
    persistPresets(presets.map((p, i) => (i === idx ? value : p)));
  const removePreset = (idx: number) =>
    persistPresets(presets.filter((_, i) => i !== idx));
  const addPreset = () => persistPresets([...presets, "Nova frase"]);

  // Fetch unit-procedures for the active unit (only when creating new)
  const { data: unitProcedures = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ["new-booking-unit-procedures", unit?.id],
    queryFn: async () => {
      await fetchCsrf();
      const { data } = await api.get("/api/settings/unit-procedures/", {
        params: { unit: unit!.id, page_size: 500 },
      });
      const list = Array.isArray(data) ? data : (data?.results ?? data?.data ?? data?.result?.results ?? []);
      const seen = new Map<number, string>();
      for (const item of list) {
        if (item?.is_active === false || item?.enabled === false) continue;
        const name = item?.procedure_name ?? item?.procedure?.name ?? item?.name;
        const procedureId =
          item?.procedure_id ??
          item?.procedure?.id ??
          (typeof item?.procedure === "number" ? item.procedure : null);
        if (name && procedureId && !seen.has(procedureId)) {
          seen.set(procedureId, String(name));
        }
      }
      return Array.from(seen.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    },
    enabled: !!unit && !readOnly,
    staleTime: 60_000,
  });

  const unitName = unit?.name ?? slot.prefill?.unit_name ?? "";

  const [form, setForm] = useState<NewBookingFormData>({
    lead_name: slot.prefill?.lead_name ?? "",
    phone: slot.prefill?.phone ?? "",
    procedure_name: slot.prefill?.procedure_name ?? "",
    procedure_id: null,
    unit_name: slot.prefill?.unit_name ?? unitName,
    unit_id: unit?.id ?? null,
    professional_id: slot.professional.id,
    date: defaultDate,
    time: defaultTime,
    time_end: defaultTimeEnd,
    notes: slot.prefill?.notes ?? "",
    period: PERIODS[0],
    motivo: "",
  });

  const set = (field: keyof NewBookingFormData) => (value: string | number) =>
    setForm((f) => ({ ...f, [field]: value }));

  const isValid = !!form.lead_name.trim() && !!form.procedure_id && !!form.motivo.trim() && !!form.unit_id;

  const handleSave = async () => {
    if (!isValid || readOnly) return;
    setSaving(true);
    try {
      await onSave(form);
      setSaved(true);
      setTimeout(() => {
        onClose();
        setSaved(false);
      }, 1500);
    } finally {
      setSaving(false);
    }
  };

  const profOptions = professionals.map((p) => ({ value: String(p.id), label: p.name }));
  const procedureOptions = unitProcedures.map((p) => ({ value: String(p.id), label: p.name }));

  const handleProcedureChange = (idStr: string) => {
    const id = Number(idStr);
    const found = unitProcedures.find((p) => p.id === id);
    setForm((f) => ({ ...f, procedure_id: id, procedure_name: found?.name ?? "" }));
  };
  const periodOptions = PERIODS.map((p) => ({ value: p, label: p }));

  const displayDate = format(slot.date, "dd/MM/yyyy", { locale: ptBR });

  return createPortal(
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[120] bg-background/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className="gcal-modal fixed z-[121] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-2xl shadow-lg animate-fade-in flex flex-col"
        style={{ background: "#ffffff", border: "1px solid #e0e0e0", maxHeight: "90vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border surface-elevated rounded-t-2xl flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary">
              <Calendar className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Agendamento</h2>
              <p className="text-[11px] text-muted-foreground">
                {format(slot.date, "EEEE, dd 'de' MMMM", { locale: ptBR })}
                {" · "}
                {defaultTime} · {slot.professional.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
          {/* Context pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/25">
              <Clock className="h-3 w-3" />
              {defaultTime} – {defaultTimeEnd}
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-surface-elevated text-foreground border border-border">
              <Calendar className="h-3 w-3 text-muted-foreground" />
              {displayDate}
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-surface-elevated text-foreground border border-border">
              <User className="h-3 w-3 text-muted-foreground" />
              {slot.professional.name}
            </span>
          </div>

          {/* Cliente */}
          <div>
            <FieldLabel>
              <span className="flex items-center gap-1.5"><User className="h-3 w-3" /> Cliente {!readOnly && "*"}</span>
            </FieldLabel>
            {readOnly && slot.prefill?.booking_id && (
              <div className="mb-1 space-y-1">
                <p className="text-[11px] text-muted-foreground">BR #{slot.prefill.booking_id}</p>
                <ConfirmationIndicator confirmation={slot.prefill?.confirmation ?? null} />
              </div>
            )}
            <TextInput value={form.lead_name} onChange={set("lead_name")} placeholder="Nome completo" disabled={readOnly} />
          </div>

          {/* Telefone */}
          <div>
            <FieldLabel>
              <span className="flex items-center gap-1.5"><Phone className="h-3 w-3" /> Telefone</span>
            </FieldLabel>
            <TextInput value={readOnly ? formatPhone(form.phone) : form.phone} onChange={set("phone")} placeholder="+55 11 99999-9999" disabled={readOnly} />
          </div>

          {/* Procedimento */}
          <div>
            <FieldLabel>
              <span className="flex items-center gap-1.5"><Stethoscope className="h-3 w-3" /> Procedimento {!readOnly && "*"}</span>
            </FieldLabel>
            {readOnly ? (
              <TextInput value={form.procedure_name} onChange={() => {}} placeholder="" disabled />
            ) : (
              <SelectInput
                value={form.procedure_id ? String(form.procedure_id) : ""}
                onChange={handleProcedureChange}
                options={procedureOptions}
                placeholder="Selecione o procedimento"
              />
            )}
          </div>

          {/* Profissional */}
          <div>
            <FieldLabel>
              <span className="flex items-center gap-1.5"><User className="h-3 w-3" /> Profissional</span>
            </FieldLabel>
            {readOnly ? (
              <TextInput value={slot.professional.name} onChange={() => {}} placeholder="" disabled />
            ) : (
              <SelectInput
                value={String(form.professional_id)}
                onChange={(v) => set("professional_id")(Number(v))}
                options={profOptions}
              />
            )}
          </div>

          {/* Data */}
          <div>
            <FieldLabel>
              <span className="flex items-center gap-1.5"><Calendar className="h-3 w-3" /> Data</span>
            </FieldLabel>
            <TextInput value={displayDate} onChange={readOnly ? () => {} : set("date")} placeholder="DD/MM/AAAA" disabled={readOnly} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>
                <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> Início</span>
              </FieldLabel>
              <TextInput value={form.time} onChange={set("time")} placeholder="HH:MM" disabled={readOnly} />
            </div>
            <div>
              <FieldLabel>
                <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> Término</span>
              </FieldLabel>
              <TextInput value={form.time_end} onChange={set("time_end")} placeholder="HH:MM" disabled={readOnly} />
            </div>
          </div>

          {/* Unidade e Período */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>
                <span className="flex items-center gap-1.5"><Building2 className="h-3 w-3" /> Unidade</span>
              </FieldLabel>
              <TextInput value={form.unit_name} onChange={() => {}} placeholder="" disabled />

            </div>
            <div>
              <FieldLabel>Período</FieldLabel>
              {readOnly ? (
                <TextInput value={form.period} onChange={() => {}} placeholder="" disabled />
              ) : (
                <SelectInput value={form.period} onChange={set("period")} options={periodOptions} />
              )}
            </div>
          </div>

          {/* Motivo — obrigatório, com frases prontas editáveis */}
          {!readOnly && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <FieldLabel>
                  <span className="flex items-center gap-1.5"><StickyNote className="h-3 w-3" /> Motivo *</span>
                </FieldLabel>
                <button
                  type="button"
                  onClick={() => setEditingPresets((v) => !v)}
                  className="text-[10px] font-semibold uppercase tracking-wider text-primary hover:underline"
                >
                  {editingPresets ? "Concluir" : "Editar frases"}
                </button>
              </div>

              {/* Chips de frases prontas */}
              <div className="flex flex-wrap gap-1.5 mb-2">
                {presets.map((p, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    {editingPresets ? (
                      <>
                        <input
                          value={p}
                          onChange={(e) => updatePreset(idx, e.target.value)}
                          className="px-2 py-1 text-xs rounded-full border border-border bg-surface text-foreground focus:outline-none focus:ring-1 focus:ring-primary/60 min-w-[120px]"
                        />
                        <button
                          type="button"
                          onClick={() => removePreset(idx)}
                          className="text-muted-foreground hover:text-destructive text-xs"
                          title="Remover"
                        >
                          ✕
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => set("motivo")(p)}
                        className="px-2.5 py-1 text-xs rounded-full border border-border bg-surface text-foreground hover:bg-primary/10 hover:border-primary/30 transition-colors"
                      >
                        {p}
                      </button>
                    )}
                  </div>
                ))}
                {editingPresets && (
                  <button
                    type="button"
                    onClick={addPreset}
                    className="px-2.5 py-1 text-xs rounded-full border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/40"
                  >
                    + nova
                  </button>
                )}
              </div>

              <textarea
                value={form.motivo}
                onChange={(e) => set("motivo")(e.target.value)}
                placeholder="Ex.: cliente solicitou novo agendamento"
                rows={2}
                maxLength={300}
                className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/60 focus:border-primary/60 transition-all resize-none"
              />
            </div>
          )}
        </div>

        {/* Footer — only for new bookings */}
        {!readOnly && (
          <div className="px-5 py-4 border-t border-border surface-elevated rounded-b-2xl flex-shrink-0 flex items-center gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-all"
            >
              Cancelar
            </button>

            {saved ? (
              <div className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-status-confirmed-bg text-status-confirmed border border-status-confirmed/30 text-sm font-semibold animate-fade-in">
                <CheckCircle2 className="h-4 w-4" />
                Agendado!
              </div>
            ) : (
              <button
                onClick={handleSave}
                disabled={!isValid || saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl gradient-primary text-primary-foreground text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Confirmar Agendamento
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Footer — read-only (existing booking): cancel button */}
        {readOnly && slot.prefill?.booking_id && (
          <div className="px-5 py-4 border-t border-border surface-elevated rounded-b-2xl flex-shrink-0 flex items-center gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-all"
            >
              Fechar
            </button>
            {confirmCancel ? (
              <button
                onClick={handleCancelBooking}
                disabled={cancelling}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-status-canceled text-white text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {cancelling ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cancelando...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Confirmar cancelamento
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={() => setConfirmCancel(true)}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border border-status-canceled/40 text-status-canceled text-sm font-semibold transition-all hover:bg-status-canceled/10"
              >
                <Trash2 className="h-4 w-4" />
                Cancelar agendamento
              </button>
            )}
          </div>
        )}
      </div>
    </>,
    document.body,
  );
}
