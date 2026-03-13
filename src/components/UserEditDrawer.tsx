import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { ManagedUser, UserRole, updateUser } from "@/lib/authApi";
import { Unit } from "@/lib/authApi";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { useMutation, useQueryClient } from "@tanstack/react-query";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  agent: "Agente",
};

interface Props {
  user: ManagedUser | null;
  open: boolean;
  onClose: () => void;
}

export default function UserEditDrawer({ user, open, onClose }: Props) {
  const { isOwner, units } = useAuth();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("agent");
  const [unitIds, setUnitIds] = useState<number[]>([]);

  useEffect(() => {
    if (user) {
      setEmail(user.email || "");
      setUsername(user.username || "");
      setRole(user.role);
      setUnitIds(user.unit_ids ?? []);
      setPassword("");
    }
  }, [user]);

  const mutation = useMutation({
    mutationFn: (payload: Parameters<typeof updateUser>[1]) =>
      updateUser(user!.membership_id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["managed-users"] });
      toast.success("Usuário atualizado com sucesso");
      onClose();
    },
    onError: (err: any) => {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail ?? err?.response?.data?.error;
      if (status === 403) toast.error("Sem permissão para editar este usuário.");
      else if (status === 404) toast.error("Usuário não encontrado ou fora do escopo.");
      else if (status === 400 && detail) toast.error(detail);
      else toast.error("Erro ao atualizar usuário");
    },
  });

  const handleSave = () => {
    if (!user) return;
    const payload: Record<string, any> = {};
    if (username.trim() !== user.username) payload.username = username.trim();
    if (email.trim() !== (user.email || "")) payload.email = email.trim();
    if (password.trim()) payload.password = password.trim();
    if (role !== user.role) payload.role = role;
    const sortedNew = [...unitIds].sort().join(",");
    const sortedOld = [...(user.unit_ids ?? [])].sort().join(",");
    if (sortedNew !== sortedOld) payload.unit_ids = unitIds;

    if (Object.keys(payload).length === 0) {
      toast.info("Nenhuma alteração detectada.");
      return;
    }
    mutation.mutate(payload);
  };

  const toggleUnit = (id: number) => {
    setUnitIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const canEditRole = isOwner && user?.role !== "owner";
  const allowedRoles: UserRole[] = isOwner ? ["manager", "agent"] : ["agent"];

  if (!user) return null;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-md space-y-4 overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">Editar Usuário</SheetTitle>
        </SheetHeader>

        <div className="space-y-3">
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Username</label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} className="h-8 text-sm mt-1" />
          </div>
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Email</label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className="h-8 text-sm mt-1" />
          </div>
          <div>
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Nova Senha (opcional)</label>
            <Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Deixe vazio para manter" className="h-8 text-sm mt-1" />
          </div>

          {canEditRole && (
            <div>
              <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="mt-1 h-8 w-full text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground"
              >
                {allowedRoles.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Unidades vinculadas</label>
            <div className="flex flex-wrap gap-1.5">
              {units.map((u) => {
                const selected = unitIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    onClick={() => toggleUnit(u.id)}
                    className={`px-2.5 py-1 rounded-md text-xs transition-colors border ${
                      selected
                        ? "border-primary/40 bg-primary/10 text-primary font-semibold"
                        : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                    }`}
                  >
                    {u.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button size="sm" className="h-8 text-xs" onClick={handleSave} disabled={mutation.isPending}>
            {mutation.isPending ? "Salvando…" : "Salvar"}
          </Button>
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onClose}>Cancelar</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
