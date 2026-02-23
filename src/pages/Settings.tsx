import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { BookingModeIcon } from "@/components/BookingModeIcon";
import { toast } from "sonner";

const BOOKING_MODES = [
  { value: "handoff_manual", label: "Handoff Manual", description: "Atendente agenda manualmente via WhatsApp" },
  { value: "assisted_slots_dashboard", label: "Assistido (Dashboard)", description: "Dashboard sugere horários, atendente confirma" },
  { value: "auto_slots_bot", label: "Automático (Bot)", description: "Bot agenda automaticamente sem intervenção" },
];

function getStoredMode(unitId: number): string {
  return localStorage.getItem(`booking_mode_unit_${unitId}`) ?? "handoff_manual";
}

function storeMode(unitId: number, mode: string) {
  localStorage.setItem(`booking_mode_unit_${unitId}`, mode);
}

export default function Settings() {
  const { company, activeUnit } = useAuth();
  const navigate = useNavigate();

  const [selectedMode, setSelectedMode] = useState<string>("handoff_manual");

  useEffect(() => {
    if (activeUnit) {
      setSelectedMode(getStoredMode(activeUnit.id));
    }
  }, [activeUnit]);

  const handleModeChange = (mode: string) => {
    if (!activeUnit) return;
    setSelectedMode(mode);
    storeMode(activeUnit.id, mode);
    const label = BOOKING_MODES.find((m) => m.value === mode)?.label ?? mode;
    toast.success(`Modo alterado para "${label}"`);
  };

  return (
    <div className="min-h-screen" style={{ background: "hsl(var(--background))" }}>
      <header
        className="sticky top-0 z-30 flex items-center gap-3 px-6 py-3 border-b border-border"
        style={{ background: "hsl(var(--surface))" }}
      >
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-surface-elevated"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
        <div className="h-4 w-px bg-border" />
        <h1 className="text-sm font-bold text-foreground">Configurações</h1>
        {company && (
          <span className="text-xs text-muted-foreground">— {company.name}</span>
        )}
      </header>

      <main className="px-6 py-6 max-w-3xl mx-auto space-y-6">
        {/* Booking Mode — functional */}
        <section className="space-y-3">
          <div>
            <h2 className="text-sm font-bold text-foreground">Booking Mode</h2>
            <p className="text-xs text-muted-foreground">
              Modo de agendamento ativo para{" "}
              <span className="font-medium text-foreground">{activeUnit?.name ?? "esta unidade"}</span>
            </p>
          </div>

          <div className="grid gap-2">
            {BOOKING_MODES.map((mode) => {
              const isActive = selectedMode === mode.value;
              return (
                <button
                  key={mode.value}
                  onClick={() => handleModeChange(mode.value)}
                  className={`flex items-center gap-3 rounded-xl px-4 py-3 border text-left transition-all ${
                    isActive
                      ? "border-primary/60 bg-primary/5 ring-1 ring-primary/30"
                      : "border-border surface-raised hover:border-border hover:bg-surface-elevated"
                  }`}
                >
                  <BookingModeIcon mode={mode.value} size="md" showLabel={false} />
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm font-medium ${isActive ? "text-primary" : "text-foreground"}`}>
                      {mode.label}
                    </span>
                    <p className="text-xs text-muted-foreground">{mode.description}</p>
                  </div>
                  <div
                    className={`h-4 w-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      isActive ? "border-primary bg-primary" : "border-muted-foreground/40"
                    }`}
                  >
                    {isActive && <div className="h-1.5 w-1.5 rounded-full bg-primary-foreground" />}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Other settings — coming soon */}
        <section className="space-y-3">
          <h2 className="text-sm font-bold text-foreground">Outras configurações</h2>
          <div className="grid gap-3">
            {[
              { label: "Logo da Empresa", description: "Upload e exibição do logo no dashboard" },
              { label: "Profissionais", description: "Gerenciar profissionais e disponibilidade" },
              { label: "Especialidades", description: "Cadastrar e editar especialidades" },
              { label: "Agendamento", description: "Regras de horário, bloqueios e janelas" },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between rounded-xl px-4 py-3 border border-border surface-raised"
              >
                <div>
                  <span className="text-sm font-medium text-foreground">{item.label}</span>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
                <span className="text-[10px] text-muted-foreground bg-surface-elevated px-2 py-0.5 rounded-full border border-border">
                  Em breve
                </span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
