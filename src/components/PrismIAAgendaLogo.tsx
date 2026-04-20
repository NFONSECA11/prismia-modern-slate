// PrismIAAgendaLogo.tsx
// Uso: <PrismIAAgendaLogo /> ou <PrismIAAgendaLogo size="sm" />
// Tamanhos: "sm" | "md" | "lg"

type Size = "sm" | "md" | "lg";

interface PrismIAAgendaLogoProps {
  size?: Size;
  /** When true, renders without the dark rounded background (for use inside existing bars). */
  bare?: boolean;
}

export default function PrismIAAgendaLogo({ size = "md", bare = false }: PrismIAAgendaLogoProps) {
  const scales: Record<Size, number> = {
    sm: 0.5,
    md: 0.75,
    lg: 1,
  };

  const s = scales[size] ?? scales.md;
  const iconSize = Math.round(54 * s);
  const fontSize = Math.round(40 * s);
  const gap = Math.round(16 * s);
  const padX = Math.round(28 * s);
  const padY = Math.round(20 * s);
  const radius = Math.round(10 * s);

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap,
        background: bare ? "transparent" : "#1a2436",
        borderRadius: bare ? 0 : radius,
        padding: bare ? 0 : `${padY}px ${padX}px`,
      }}
    >
      {/* Ícone calendário */}
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 54 54"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <rect x="3" y="9" width="48" height="42" rx="6" stroke="white" strokeWidth="2.2" />
        <line x1="3" y1="21" x2="51" y2="21" stroke="white" strokeWidth="2.2" />
        <line x1="16" y1="3" x2="16" y2="14" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
        <line x1="38" y1="3" x2="38" y2="14" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
        <rect x="9" y="27" width="7" height="5" rx="1.5" fill="white" opacity="0.75" />
        <rect x="20" y="27" width="7" height="5" rx="1.5" fill="white" opacity="0.75" />
        <rect x="31" y="27" width="7" height="5" rx="1.5" fill="white" opacity="0.75" />
        <rect x="42" y="27" width="7" height="5" rx="1.5" fill="white" opacity="0.75" />
        <rect x="9" y="36" width="7" height="5" rx="1.5" fill="white" opacity="0.75" />
        <rect x="20" y="36" width="7" height="5" rx="1.5" fill="white" opacity="0.75" />
        <rect x="31" y="36" width="7" height="5" rx="1.5" fill="white" opacity="0.75" />
        <rect x="42" y="36" width="7" height="5" rx="1.5" fill="white" opacity="0.5" />
        <rect x="9" y="45" width="7" height="5" rx="1.5" fill="white" opacity="0.5" />
        <rect x="20" y="45" width="7" height="5" rx="1.5" fill="white" opacity="0.5" />
      </svg>

      {/* Texto */}
      <div style={{ display: "flex", alignItems: "baseline", lineHeight: 1 }}>
        <span
          style={{
            fontFamily: "'Nunito', 'Segoe UI', sans-serif",
            fontSize,
            fontWeight: 700,
            color: "#9ca3af",
            letterSpacing: "-0.5px",
          }}
        >
          Prism
        </span>
        <span
          style={{
            fontFamily: "'Nunito', 'Segoe UI', sans-serif",
            fontSize,
            fontWeight: 800,
            color: "#60a5fa",
            letterSpacing: "-0.5px",
          }}
        >
          IA
        </span>
        <span
          style={{
            fontFamily: "'Nunito', 'Segoe UI', sans-serif",
            fontSize,
            fontWeight: 700,
            color: "#38bdf8",
            letterSpacing: "-0.5px",
            marginLeft: Math.round(6 * s),
          }}
        >
          Agenda
        </span>
      </div>
    </div>
  );
}
