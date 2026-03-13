import { useState, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchUsers, createUser, deactivateUser, reactivateUser, ManagedUser, UserRole } from "@/lib/authApi";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Plus, Users, X, Shield, Search, Circle, Pencil, UserX, UserCheck } from "lucide-react";
import { toast } from "sonner";
import UserEditDrawer from "@/components/UserEditDrawer";

const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  agent: "Agente",
  admin: "Admin",
};

function UserStatusBadge({ user }: { user: ManagedUser }) {
  const isActive = user.membership_is_active && user.user_is_active;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${
      isActive
        ? "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/30 dark:border-emerald-800"
        : "text-muted-foreground bg-muted/50 border-border"
    }`}>
      <Circle className="h-2 w-2 fill-current" />
      {isActive ? "Ativo" : "Inativo"}
    </span>
  );
}

export default function UserManagementSection() {
  const { role, units, isOwner, isAgent, user: loggedUser } = useAuth();
  const queryClient = useQueryClient();

  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Edit drawer
  const [editUser, setEditUser] = useState<ManagedUser | null>(null);

  // Form state
  const [formUsername, setFormUsername] = useState("");
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState<UserRole>("agent");
  const [formUnitIds, setFormUnitIds] = useState<number[]>([]);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["managed-users"],
    queryFn: fetchUsers,
  });

  const filteredUsers = useMemo(() => {
    let list = users;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (u) =>
          u.name?.toLowerCase().includes(q) ||
          u.username?.toLowerCase().includes(q) ||
          u.email?.toLowerCase().includes(q)
      );
    }
    if (filterRole !== "all") {
      list = list.filter((u) => u.role === filterRole);
    }
    if (filterStatus !== "all") {
      list = list.filter((u) => {
        const isActive = u.membership_is_active && u.user_is_active;
        return filterStatus === "active" ? isActive : !isActive;
      });
    }
    return list;
  }, [users, search, filterRole, filterStatus]);

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
      if (status === 403) toast.error("Você não tem permissão para criar este usuário.");
      else if (status === 400 && detail) toast.error(detail);
      else toast.error("Erro ao criar usuário");
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["managed-users"] });
      toast.success("Usuário desativado");
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail ?? err?.response?.data?.error;
      toast.error(detail || "Erro ao desativar usuário");
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: reactivateUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["managed-users"] });
      toast.success("Usuário reativado");
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail ?? err?.response?.data?.error;
      toast.error(detail || "Erro ao reativar usuário");
    },
  });

  const resetForm = () => {
    setShowForm(false);
    setFormUsername("");
    setFormName("");
    setFormEmail("");
    setFormPassword("");
    setFormRole("agent");
    setFormUnitIds([]);
  };

  const handleSubmit = () => {
    if (!formUsername.trim() || !formEmail.trim() || !formPassword.trim()) {
      toast.error("Preencha username, email e senha.");
      return;
    }
    createMutation.mutate({
      username: formUsername.trim(),
      email: formEmail.trim(),
      password: formPassword.trim(),
      role: formRole,
      unit_ids: formUnitIds,
    });
  };

  const toggleUnitId = (id: number) => {
    setFormUnitIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const canEditUser = (u: ManagedUser) => {
    if (u.role === "owner") return false;
    if (u.user_id === loggedUser?.id) return false;
    if (isOwner) return true;
    if (role === "manager" && u.role === "agent") return true;
    return false;
  };

  const canToggleStatus = (u: ManagedUser) => canEditUser(u);

  const allowedRoles: UserRole[] = isOwner ? ["manager", "agent"] : ["agent"];

  const unitNameMap = useMemo(() => {
    const map: Record<number, string> = {};
    units.forEach((u) => (map[u.id] = u.name));
    return map;
  }, [units]);

  if (isAgent) return null;

  return (
    <>
      <Collapsible defaultOpen={false} id="section-usuarios">
        <CollapsibleTrigger className="w-full rounded-xl border border-border px-4 py-3 flex items-center justify-between transition-colors hover:bg-surface-elevated" style={{ background: "hsl(var(--surface))" }}>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <span className="text-sm font-bold text-foreground">Gerenciamento de Usuários</span>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200" />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-2 rounded-xl border border-border p-4 space-y-3" style={{ background: "hsl(var(--surface))" }}>
          {/* Search + Filters + New */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, username ou email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-sm pl-8"
              />
            </div>
            <select
              value={filterRole}
              onChange={(e) => setFilterRole(e.target.value)}
              className="h-8 text-xs rounded-md border border-border px-2 bg-background text-foreground"
            >
              <option value="all">Todas as roles</option>
              <option value="owner">Owner</option>
              <option value="manager">Manager</option>
              <option value="agent">Agente</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="h-8 text-xs rounded-md border border-border px-2 bg-background text-foreground"
            >
              <option value="all">Todos os status</option>
              <option value="active">Ativo</option>
              <option value="inactive">Inativo</option>
            </select>
            {!isAgent && (
              <Button size="sm" className="h-8 text-xs gap-1" onClick={() => { resetForm(); setShowForm(true); }}>
                <Plus className="h-3.5 w-3.5" />
                Novo usuário
              </Button>
            )}
          </div>

          {/* Table header */}
          <div className="grid grid-cols-[1fr_0.8fr_1fr_auto_0.8fr_auto_auto] gap-2 px-3 py-1 items-center">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Nome</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Username</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Email</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Role</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Units</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Status</span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Ações</span>
          </div>

          {isLoading ? (
            <p className="text-xs text-muted-foreground px-3">Carregando…</p>
          ) : filteredUsers.length === 0 ? (
            <p className="text-xs text-muted-foreground px-3">Nenhum usuário encontrado.</p>
          ) : (
            filteredUsers.map((u) => {
              const isActive = u.membership_is_active && u.user_is_active;
              return (
                <div
                  key={u.membership_id}
                  className="grid grid-cols-[1fr_0.8fr_1fr_auto_0.8fr_auto_auto] gap-2 items-center rounded-lg px-3 py-2 border border-border"
                  style={{ background: "hsl(var(--surface-elevated))" }}
                >
                  <span className="text-sm font-medium text-foreground truncate">{u.name}</span>
                  <span className="text-xs text-muted-foreground truncate">{u.username}</span>
                  <span className="text-xs text-muted-foreground truncate">{u.email || "—"}</span>
                  <span className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted/30 px-2 py-0.5 rounded-full border border-border whitespace-nowrap">
                    <Shield className="h-3 w-3" />
                    {ROLE_LABELS[u.role] ?? u.role}
                  </span>
                  <span className="text-xs text-muted-foreground truncate">
                    {u.all_units
                      ? "Todas"
                      : u.unit_ids.map((id) => unitNameMap[id] ?? `#${id}`).join(", ") || "—"}
                  </span>
                  <UserStatusBadge user={u} />
                  <div className="flex items-center gap-1">
                    {canEditUser(u) && (
                      <button
                        onClick={() => setEditUser(u)}
                        className="text-muted-foreground hover:text-primary transition-colors p-1 rounded hover:bg-accent"
                        title="Editar"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {canToggleStatus(u) && (
                      isActive ? (
                        <button
                          onClick={() => deactivateMutation.mutate(u.membership_id)}
                          className="text-muted-foreground hover:text-destructive transition-colors p-1 rounded hover:bg-destructive/10"
                          title="Desativar"
                          disabled={deactivateMutation.isPending}
                        >
                          <UserX className="h-3.5 w-3.5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => reactivateMutation.mutate(u.membership_id)}
                          className="text-muted-foreground hover:text-emerald-600 transition-colors p-1 rounded hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                          title="Reativar"
                          disabled={reactivateMutation.isPending}
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })
          )}

          {/* Create form */}
          {showForm && (
            <div className="space-y-3 pt-2 border-t border-border">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-foreground">Novo Usuário</span>
                <button onClick={resetForm} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input placeholder="Username" value={formUsername} onChange={(e) => setFormUsername(e.target.value)} className="h-8 text-sm" />
                <Input placeholder="Nome completo" value={formName} onChange={(e) => setFormName(e.target.value)} className="h-8 text-sm" />
                <Input placeholder="Email" type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)} className="h-8 text-sm" />
                <Input placeholder="Senha" type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} className="h-8 text-sm" />
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
                    <p className="text-[10px] text-muted-foreground mt-1">Managers só podem criar Agentes</p>
                  )}
                </div>
              </div>

              {/* Units selection */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Unidades vinculadas</span>
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
                            : "border-border text-muted-foreground hover:text-foreground hover:bg-accent"
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
                  disabled={!formUsername.trim() || !formEmail.trim() || !formPassword.trim() || createMutation.isPending}
                  onClick={handleSubmit}
                >
                  {createMutation.isPending ? "Criando…" : "Criar Usuário"}
                </Button>
                <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={resetForm}>Cancelar</Button>
              </div>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      <UserEditDrawer user={editUser} open={!!editUser} onClose={() => setEditUser(null)} />
    </>
  );
}
