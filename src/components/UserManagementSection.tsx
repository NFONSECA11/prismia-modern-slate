import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchUsers, createUser, updateUser, ManagedUser, UserRole } from "@/lib/authApi";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Plus, Users, Pencil, X, Shield } from "lucide-react";
import { toast } from "sonner";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  agent: "Agente",
  admin: "Admin",
};

export default function UserManagementSection() {
  const { role, units, isOwner } = useAuth();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState<UserRole>("agent");
  const [formUnitIds, setFormUnitIds] = useState<number[]>([]);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["managed-users"],
    queryFn: fetchUsers,
  });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["managed-users"] });
      resetForm();
      toast.success("Usuário criado com sucesso");
    },
    onError: (err: any) => {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail ?? err?.response?.data?.error;
      if (status === 403) {
        toast.error("Você não tem permissão para criar este usuário.");
      } else if (status === 400 && detail) {
        toast.error(detail);
      } else {
        toast.error("Erro ao criar usuário");
      }
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...payload }: { id: number } & Parameters<typeof updateUser>[1]) =>
      updateUser(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["managed-users"] });
      resetForm();
      toast.success("Usuário atualizado com sucesso");
    },
    onError: (err: any) => {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail ?? err?.response?.data?.error;
      if (status === 403) {
        toast.error("Você não tem permissão para editar este usuário.");
      } else if (status === 400 && detail) {
        toast.error(detail);
      } else {
        toast.error("Erro ao atualizar usuário");
      }
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      updateUser(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["managed-users"] });
      toast.success("Status atualizado");
    },
    onError: (err: any) => {
      const status = err?.response?.status;
      if (status === 403) {
        toast.error("Você não tem permissão para alterar este usuário.");
      } else {
        toast.error("Erro ao alterar status");
      }
    },
  });

  const resetForm = () => {
    setShowForm(false);
    setEditingUser(null);
    setFormName("");
    setFormEmail("");
    setFormPassword("");
    setFormRole("agent");
    setFormUnitIds([]);
  };

  const openEdit = (u: ManagedUser) => {
    setEditingUser(u);
    setFormName(u.name);
    setFormEmail(u.email);
    setFormPassword("");
    setFormRole(u.role);
    const uIds = u.units
      ? u.units.map((x: any) => (typeof x === "number" ? x : x.id))
      : [];
    setFormUnitIds(uIds);
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!formName.trim() || !formEmail.trim()) return;
    if (editingUser) {
      updateMutation.mutate({
        id: editingUser.id,
        name: formName.trim(),
        email: formEmail.trim(),
        role: formRole,
        unit_ids: formUnitIds,
      });
    } else {
      if (!formPassword.trim()) {
        toast.error("Senha é obrigatória para criar usuário.");
        return;
      }
      createMutation.mutate({
        name: formName.trim(),
        email: formEmail.trim(),
        password: formPassword.trim(),
        role: formRole,
        unit_ids: formUnitIds,
      });
    }
  };

  const toggleUnitId = (id: number) => {
    setFormUnitIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Roles the current user can assign
  const allowedRoles: UserRole[] = isOwner ? ["manager", "agent"] : ["agent"];

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <Collapsible defaultOpen={false} id="section-usuarios">
      <CollapsibleTrigger className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated" style={{ background: "hsl(var(--surface))" }}>
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <span className="text-sm font-bold text-foreground">Gerenciamento de Usuários</span>
        </div>
        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 rounded-xl border border-border p-4 space-y-3" style={{ background: "hsl(var(--surface))" }}>
        {/* Header */}
        <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-2 px-3 py-1 items-center">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Nome</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Email</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Role</span>
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Ativo</span>
          <span />
        </div>

        {isLoading ? (
          <p className="text-xs text-muted-foreground px-3">Carregando…</p>
        ) : users.length === 0 ? (
          <p className="text-xs text-muted-foreground px-3">Nenhum usuário encontrado.</p>
        ) : (
          users.map((u) => (
            <div
              key={u.id}
              className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-2 items-center rounded-lg px-3 py-2 border border-border"
              style={{ background: "hsl(var(--surface-elevated))" }}
            >
              <span className="text-sm font-medium text-foreground truncate">{u.name}</span>
              <span className="text-xs text-muted-foreground truncate">{u.email}</span>
              <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-surface px-2 py-0.5 rounded-full border border-border">
                <Shield className="h-3 w-3" />
                {ROLE_LABELS[u.role] ?? u.role}
              </span>
              <Switch
                checked={u.is_active !== false}
                onCheckedChange={(checked) => toggleActiveMutation.mutate({ id: u.id, is_active: checked })}
                className="scale-75"
              />
              <button
                onClick={() => openEdit(u)}
                className="text-muted-foreground hover:text-primary transition-colors"
                title="Editar usuário"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}

        {/* Create/Edit form */}
        {showForm ? (
          <div className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">
                {editingUser ? "Editar Usuário" : "Novo Usuário"}
              </span>
              <button onClick={resetForm} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input
                placeholder="Nome completo"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="h-8 text-sm"
              />
              <Input
                placeholder="Email"
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                className="h-8 text-sm"
              />
              {!editingUser && (
                <Input
                  placeholder="Senha temporária"
                  type="password"
                  value={formPassword}
                  onChange={(e) => setFormPassword(e.target.value)}
                  className="h-8 text-sm"
                />
              )}
              <div>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as UserRole)}
                  disabled={!isOwner}
                  className="h-8 w-full text-sm rounded-md border border-border px-2 py-1 bg-background text-foreground disabled:opacity-60"
                >
                  {allowedRoles.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
                {!isOwner && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Managers só podem criar Agentes
                  </p>
                )}
              </div>
            </div>

            {/* Units selection */}
            <div className="space-y-1.5">
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Unidades vinculadas
              </span>
              <div className="flex flex-wrap gap-1.5">
                {units.map((u) => {
                  const selected = formUnitIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      onClick={() => toggleUnitId(u.id)}
                      className={`px-2.5 py-1 rounded-md text-xs transition-colors border ${
                        selected
                          ? "border-primary/40 bg-primary/10 text-primary font-semibold"
                          : "border-border text-muted-foreground hover:text-foreground hover:bg-surface-elevated"
                      }`}
                    >
                      {u.name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                className="h-8 text-xs"
                disabled={!formName.trim() || !formEmail.trim() || isPending}
                onClick={handleSubmit}
              >
                {isPending ? "Salvando…" : editingUser ? "Atualizar" : "Criar Usuário"}
              </Button>
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={resetForm}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors pt-2 px-3"
          >
            <Plus className="h-3.5 w-3.5" />
            Novo usuário
          </button>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
