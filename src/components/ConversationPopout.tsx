import { useEffect, useRef, useState, useCallback } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchBookingMessages,
  sendBookingMessage,
} from "@/lib/bookingApi";
import {
  Loader2,
  MessageSquare,
  X,
  Send,
  GripHorizontal,
  Phone,
  Hash,
  Zap,
  Pencil,
  Trash2,
  Plus,
  Check,
} from "lucide-react";
import { useConversationPopout } from "@/contexts/ConversationPopoutContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { markConversationRead } from "@/lib/conversationReadState";

const DEFAULT_QUICK_REPLIES = [
  "Olá! Como posso te ajudar?",
  "Vou verificar a disponibilidade para você.",
  "Seu agendamento foi confirmado!",
  "Poderia me informar seu nome completo?",
  "Qual procedimento você deseja agendar?",
];

function getQuickReplies(): string[] {
  try {
    const saved = localStorage.getItem("quick_replies");
    if (saved) return JSON.parse(saved);
  } catch {}
  return DEFAULT_QUICK_REPLIES;
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 13 && digits.startsWith("55"))
    return `(${digits.slice(2, 4)}) ${digits.slice(4, 5)} ${digits.slice(5, 9)}-${digits.slice(9)}`;
  if (digits.length === 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 3)} ${digits.slice(3, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return raw;
}

const POPOUT_W = 380;
const POPOUT_H = 540;

export function ConversationPopout() {
  const { booking, close } = useConversationPopout();
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();

  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [initialized, setInitialized] = useState(false);
  const dragRef = useRef<{ dx: number; dy: number; dragging: boolean }>({ dx: 0, dy: 0, dragging: false });
  const containerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [messageText, setMessageText] = useState("");
  const [quickReplies, setQuickReplies] = useState<string[]>(getQuickReplies);
  const [showQuickReplies, setShowQuickReplies] = useState(false);
  const [editingQuickReplies, setEditingQuickReplies] = useState(false);

  // Initial position: bottom-right
  useEffect(() => {
    if (!booking || initialized) return;
    const padding = 24;
    setPos({
      x: Math.max(padding, window.innerWidth - POPOUT_W - padding),
      y: Math.max(padding, window.innerHeight - POPOUT_H - padding - 20),
    });
    setInitialized(true);
  }, [booking, initialized]);

  // Reset state when booking changes + mark conversation as read
  useEffect(() => {
    setMessageText("");
    setShowQuickReplies(false);
    setEditingQuickReplies(false);
    if (booking?.id != null) markConversationRead(booking.id);
  }, [booking?.id]);

  const { data: messages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["booking-messages", booking?.id],
    queryFn: () => fetchBookingMessages(booking!.id, 30),
    enabled: !!booking,
    refetchInterval: 30_000,
  });

  const sendMsgMutation = useMutation({
    mutationFn: (text: string) => sendBookingMessage(booking!.id, text),
    onSuccess: () => {
      setMessageText("");
      queryClient.invalidateQueries({ queryKey: ["booking-messages", booking?.id] });
    },
  });

  const handleSendMessage = () => {
    const trimmed = messageText.trim();
    if (!trimmed || sendMsgMutation.isPending) return;
    sendMsgMutation.mutate(trimmed);
  };

  const saveQuickReplies = (replies: string[]) => {
    setQuickReplies(replies);
    localStorage.setItem("quick_replies", JSON.stringify(replies));
  };

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, booking?.id]);

  // Drag handlers
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragRef.current = {
      dx: e.clientX - rect.left,
      dy: e.clientY - rect.top,
      dragging: true,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.dragging) return;
    const padding = 8;
    const maxX = window.innerWidth - POPOUT_W - padding;
    const maxY = window.innerHeight - 60 - padding;
    setPos({
      x: Math.min(Math.max(padding, e.clientX - dragRef.current.dx), Math.max(padding, maxX)),
      y: Math.min(Math.max(padding, e.clientY - dragRef.current.dy), Math.max(padding, maxY)),
    });
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current.dragging = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
  }, []);

  // Don't render in mobile (conversation lives inside Drawer there)
  if (!booking || isMobile) return null;

  const phoneRaw = booking.contact_phone || booking.phone || "";
  const phoneFormatted = phoneRaw ? formatPhone(phoneRaw) : "";

  return (
    <div
      ref={containerRef}
      className="fixed z-50 rounded-xl border border-border shadow-2xl flex flex-col overflow-hidden animate-fade-in"
      style={{
        left: pos.x,
        top: pos.y,
        width: POPOUT_W,
        height: POPOUT_H,
        background: "hsl(var(--surface))",
      }}
    >
      {/* Drag header */}
      <div
        className="flex items-center gap-2 px-3 py-2 border-b border-border cursor-move select-none"
        style={{ background: "hsl(var(--topbar-bg))" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <MessageSquare className="h-4 w-4 text-primary flex-shrink-0" />
        <div className="flex flex-col min-w-0 flex-1 leading-tight">
          <span className="text-xs font-semibold text-foreground truncate">
            {booking.lead_name || "Conversa"}
          </span>
          <span className="text-[10px] text-muted-foreground flex items-center gap-2 truncate">
            <span className="inline-flex items-center gap-0.5">
              <Hash className="h-2.5 w-2.5" />
              {booking.id}
            </span>
            {phoneFormatted && (
              <span className="inline-flex items-center gap-0.5 truncate">
                <Phone className="h-2.5 w-2.5" />
                {phoneFormatted}
              </span>
            )}
          </span>
        </div>
        <button
          onClick={close}
          aria-label="Fechar conversa"
          className="flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-surface-elevated transition-colors flex-shrink-0"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto px-3 py-2 space-y-2"
        style={{ background: "hsl(var(--surface))" }}
      >
        {messagesLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : messages.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Nenhuma mensagem encontrada.
          </p>
        ) : (
          messages.map((msg) => {
            const role = (msg.role ?? "").toLowerCase();
            const isBot =
              role.includes("assistant") ||
              role.includes("system") ||
              role.includes("bot") ||
              role === "out" ||
              role === "outbound";
            const isUser =
              role.includes("user") ||
              role.includes("lead") ||
              role.includes("client") ||
              role === "in" ||
              role === "inbound";
            const isBotFinal = isBot || !isUser;
            const content = (msg.content ?? "").toString().trim();

            return (
              <div
                key={msg.id}
                className={`flex flex-col gap-0.5 ${isBotFinal ? "items-end" : "items-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap break-words ${
                    isBotFinal
                      ? "bg-[hsl(186_72%_48%/0.15)] text-foreground border border-[hsl(186_72%_48%/0.3)]"
                      : "bg-[hsl(262_52%_60%/0.15)] text-foreground border border-[hsl(262_52%_60%/0.3)]"
                  }`}
                >
                  {content ? content : <span className="italic text-muted-foreground">[sem conteúdo]</span>}
                </div>
                <span className="text-[9px] text-muted-foreground px-1 font-mono">
                  {(() => {
                    try {
                      if (!msg.created_at) return "";
                      return format(new Date(msg.created_at), "dd/MM HH:mm", { locale: ptBR });
                    } catch {
                      return "";
                    }
                  })()}
                </span>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Replies */}
      <div
        className="px-3 pt-2 border-t border-border"
        style={{ background: "hsl(var(--surface-elevated))" }}
      >
        <button
          onClick={() => {
            setShowQuickReplies(!showQuickReplies);
            if (editingQuickReplies) setEditingQuickReplies(false);
          }}
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors mb-1"
        >
          <Zap className="h-3 w-3" />
          Respostas rápidas
        </button>
        {showQuickReplies && (
          <div className="mb-2">
            {editingQuickReplies ? (
              <div className="space-y-1">
                {quickReplies.map((reply, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    <input
                      className="flex-1 bg-surface border border-border rounded px-2 py-1 text-[11px] text-foreground"
                      value={reply}
                      onChange={(e) => {
                        const updated = [...quickReplies];
                        updated[idx] = e.target.value;
                        setQuickReplies(updated);
                      }}
                    />
                    <button
                      onClick={() => {
                        const updated = quickReplies.filter((_, i) => i !== idx);
                        saveQuickReplies(updated);
                      }}
                      className="text-destructive hover:text-destructive/80 p-0.5"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {quickReplies.length < 5 && (
                  <button
                    onClick={() => setQuickReplies([...quickReplies, ""])}
                    className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80"
                  >
                    <Plus className="h-3 w-3" /> Adicionar
                  </button>
                )}
                <button
                  onClick={() => {
                    saveQuickReplies(quickReplies.filter((r) => r.trim()));
                    setEditingQuickReplies(false);
                  }}
                  className="flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 mt-1"
                >
                  <Check className="h-3 w-3" /> Salvar
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-1">
                {quickReplies.map((reply, idx) => (
                  <button
                    key={idx}
                    onClick={() => setMessageText(reply)}
                    disabled={sendMsgMutation.isPending}
                    className="px-2 py-1 text-[10px] rounded-full border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors truncate max-w-[180px]"
                  >
                    {reply}
                  </button>
                ))}
                <button
                  onClick={() => setEditingQuickReplies(true)}
                  className="px-2 py-1 text-[10px] rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                >
                  <Pencil className="h-2.5 w-2.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input */}
      <div
        className="px-3 py-2 border-t border-border flex items-center gap-2"
        style={{ background: "hsl(var(--surface-elevated))" }}
      >
        <input
          type="text"
          className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Digite uma mensagem..."
          value={messageText}
          onChange={(e) => setMessageText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
          disabled={sendMsgMutation.isPending}
        />
        <button
          onClick={handleSendMessage}
          disabled={!messageText.trim() || sendMsgMutation.isPending}
          className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {sendMsgMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}
