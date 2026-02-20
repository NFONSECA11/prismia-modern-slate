import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Professional } from "@/types/booking";
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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/60 focus:border-primary/60 transition-all"
    />
  );
}

function Select({
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
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const defaultTime = slot
    ? `${String(slot.hour).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}`
    : "";

  // Safe ISO date string avoiding timezone offset issues
  const defaultDate = slot
    ? `${slot.date.getFullYear()}-${String(slot.date.getMonth() + 1).padStart(2, "0")}-${String(slot.date.getDate()).padStart(2, "0")}`
    : "";

  const [form, setForm] = useState<NewBookingFormData>({
    lead_name: "",
    phone: "",
    procedure_name: "",
    unit_name: UNITS[0],
    professional_id: slot?.professional.id ?? professionals[0]?.id ?? 0,
    date: defaultDate,
    time: defaultTime,
    notes: "",
    period: PERIODS[0],
  });

  const set = (field: keyof NewBookingFormData) => (value: string | number) =>
    setForm((f) => ({ ...f, [field]: value }));

  const isValid = form.lead_name.trim() && form.procedure_name;

  const handleSave = async () => {
    if (!isValid) return;
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

  if (!slot) return null;

  const profOptions = professionals.map((p) => ({ value: String(p.id), label: p.name }));
  const procedureOptions = PROCEDURES.map((p) => ({ value: p, label: p }));
  const unitOptions = UNITS.map((u) => ({ value: u, label: u }));
  const periodOptions = PERIODS.map((p) => ({ value: p, label: p }));

  const selectedProf = professionals.find((p) => p.id === form.professional_id);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-2xl shadow-lg border border-border animate-fade-in flex flex-col"
        style={{
          background: "hsl(var(--surface-raised))",
          maxHeight: "90vh",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border surface-elevated rounded-t-2xl flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary">
              <Calendar className="h-4 w-4 text-primary-foreground" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Novo Agendamento</h2>
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
          {/* Slot info pill */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
              <Clock className="h-3 w-3" />
              {defaultTime}
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-surface-elevated text-foreground border border-border">
              <User className="h-3 w-3 text-muted-foreground" />
              {slot.professional.name}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {slot.professional.specialty}
            </span>
          </div>

          {/* Paciente */}
          <div>
            <FieldLabel>
              <span className="flex items-center gap-1"><User className="h-3 w-3" /> Paciente</span>
            </FieldLabel>
            <Input
              value={form.lead_name}
              onChange={set("lead_name")}
              placeholder="Nome completo"
            />
          </div>

          {/* Telefone */}
          <div>
            <FieldLabel>
              <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> Telefone</span>
            </FieldLabel>
            <Input
              value={form.phone}
              onChange={set("phone")}
              placeholder="+55 11 99999-9999"
              type="tel"
            />
          </div>

          {/* Procedimento */}
          <div>
            <FieldLabel>
              <span className="flex items-center gap-1"><Stethoscope className="h-3 w-3" /> Procedimento</span>
            </FieldLabel>
            <Select
              value={form.procedure_name}
              onChange={set("procedure_name")}
              options={procedureOptions}
              placeholder="Selecione o procedimento"
            />
          </div>

          {/* Profissional */}
          <div>
            <FieldLabel>
              <span className="flex items-center gap-1"><User className="h-3 w-3" /> Profissional</span>
            </FieldLabel>
            <Select
              value={String(form.professional_id)}
              onChange={(v) => set("professional_id")(Number(v))}
              options={profOptions}
            />
          </div>

          {/* Data e Hora lado a lado */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Data</span>
              </FieldLabel>
              <Input value={form.date} onChange={set("date")} type="date" />
            </div>
            <div>
              <FieldLabel>
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Horário</span>
              </FieldLabel>
              <Input value={form.time} onChange={set("time")} type="time" />
            </div>
          </div>

          {/* Unidade e Período */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>
                <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> Unidade</span>
              </FieldLabel>
              <Select value={form.unit_name} onChange={set("unit_name")} options={unitOptions} />
            </div>
            <div>
              <FieldLabel>Período</FieldLabel>
              <Select value={form.period} onChange={set("period")} options={periodOptions} />
            </div>
          </div>

          {/* Observações */}
          <div>
            <FieldLabel>
              <span className="flex items-center gap-1"><StickyNote className="h-3 w-3" /> Observações</span>
            </FieldLabel>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes")(e.target.value)}
              placeholder="Informações adicionais, preferências do paciente..."
              rows={3}
              className="w-full px-3 py-2 text-sm rounded-lg border border-border bg-surface text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/60 focus:border-primary/60 transition-all resize-none"
            />
          </div>
        </div>

        {/* Footer */}
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
      </div>
    </>
  );
}
