import { useState } from "react";
import { createPortal } from "react-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Professional, BookingConfirmation } from "@/types/booking";
import { ConfirmationIndicator } from "@/components/ConfirmationIndicator";
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
  onClose: () => void;
  onSave: (data: NewBookingFormData) => Promise<void>;
}

export interface NewBookingFormData {
  lead_name: string;
  phone: string;
  procedure_name: string;
  unit_name: string;
  professional_id: number;
  date: string;
  time: string;
  time_end: string;
  notes: string;
  period: string;
}

const PROCEDURES = [
  "Limpeza de Pele Profunda",
  "Botox Facial",
  "Peeling Químico",
  "Microagulhamento",
  "Preenchimento Labial",
  "Depilação a Laser",
  "Massagem Relaxante",
  "Harmonização Facial",
  "Hidratação Profunda",
  "Outro",
];

const UNITS = ["Unidade Centro", "Unidade Zona Sul", "Unidade Norte"];
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

export function NewBookingModal({ slot, professionals, onClose, onSave }: NewBookingModalProps) {
  if (!slot) return null;

  // Compute defaults from the clicked slot
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
  onClose,
  onSave,
}: {
  slot: NewBookingSlot;
  defaultTime: string;
  defaultTimeEnd: string;
  defaultDate: string;
  professionals: Professional[];
  onClose: () => void;
  onSave: (data: NewBookingFormData) => Promise<void>;
}) {
  const readOnly = !!slot.prefill;
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [form, setForm] = useState<NewBookingFormData>({
    lead_name: slot.prefill?.lead_name ?? "",
    phone: slot.prefill?.phone ?? "",
    procedure_name: slot.prefill?.procedure_name ?? "",
    unit_name: slot.prefill?.unit_name ?? UNITS[0],
    professional_id: slot.professional.id,
    date: defaultDate,
    time: defaultTime,
    time_end: defaultTimeEnd,
    notes: slot.prefill?.notes ?? "",
    period: PERIODS[0],
  });

  const set = (field: keyof NewBookingFormData) => (value: string | number) =>
    setForm((f) => ({ ...f, [field]: value }));

  const isValid = !!form.lead_name.trim() && !!form.procedure_name;

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
  const procedureOptions = PROCEDURES.map((p) => ({ value: p, label: p }));
  const unitOptions = UNITS.map((u) => ({ value: u, label: u }));
  const periodOptions = PERIODS.map((p) => ({ value: p, label: p }));

  const displayDate = format(slot.date, "dd/MM/yyyy", { locale: ptBR });

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-[90] bg-background/70 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div
        className="fixed z-[91] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-2xl shadow-lg border border-border animate-fade-in flex flex-col"
        style={{ background: "hsl(var(--surface-raised))", maxHeight: "90vh" }}
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
                value={form.procedure_name}
                onChange={set("procedure_name")}
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
              {readOnly ? (
                <TextInput value={form.unit_name} onChange={() => {}} placeholder="" disabled />
              ) : (
                <SelectInput value={form.unit_name} onChange={set("unit_name")} options={unitOptions} />
              )}
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

          {/* Observações */}
          {!readOnly && (
            <div>
              <FieldLabel>
                <span className="flex items-center gap-1.5"><StickyNote className="h-3 w-3" /> Observações</span>
              </FieldLabel>
              <textarea
                value={form.notes}
                onChange={(e) => set("notes")(e.target.value)}
                placeholder="Informações adicionais, preferências do cliente..."
                rows={3}
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
      </div>
    </>
  );
}
