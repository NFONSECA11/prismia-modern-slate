import { BookingStatus } from "@/types/booking";

interface StatusConfig {
  label: string;
  className: string;
  dot: string;
}

const STATUS_MAP: Record<BookingStatus, StatusConfig> = {
  confirmed: {
    label: "Confirmado",
    className: "bg-status-confirmed-bg text-status-confirmed border border-status-confirmed/25",
    dot: "bg-status-confirmed",
  },
  pending: {
    label: "Pendente",
    className: "bg-status-pending-bg text-status-pending border border-status-pending/25",
    dot: "bg-status-pending",
  },
  handoff: {
    label: "Handoff",
    className: "bg-status-handoff-bg text-status-handoff border border-status-handoff/25",
    dot: "bg-status-handoff",
  },
  assisted: {
    label: "Assisted",
    className: "bg-status-assisted-bg text-status-assisted border border-status-assisted/25",
    dot: "bg-status-assisted",
  },
  canceled: {
    label: "Cancelado",
    className: "bg-status-canceled-bg text-status-canceled border border-status-canceled/25",
    dot: "bg-status-canceled",
  },
};

interface StatusBadgeProps {
  status: BookingStatus;
  size?: "sm" | "md";
}

export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  const config = STATUS_MAP[status] ?? STATUS_MAP.pending;
  const sizeClass = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-medium ${sizeClass} ${config.className}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot} flex-shrink-0`} />
      {config.label}
    </span>
  );
}
