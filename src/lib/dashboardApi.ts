import api from "@/lib/api";

export interface DashboardBootstrap {
  ok: boolean;
  unit_id: number | null;
  ai_settings: {
    ai_enabled: boolean;
    use_ai_before_menu: boolean;
    cancel_recovery_enabled: boolean;
  };
  ai_decision_settings: {
    book_new_execution_mode: "flow" | "direct";
    cancel_execution_mode: "flow" | "direct";
    reschedule_execution_mode: "flow" | "direct";
    confirm_execution_mode: "flow" | "direct";
  };
}

export async function fetchDashboardBootstrap(unitId?: number): Promise<DashboardBootstrap> {
  const { data } = await api.get<DashboardBootstrap>("/api/dashboard/bootstrap/", {
    params: unitId ? { unit_id: unitId } : undefined,
  });
  return data;
}
