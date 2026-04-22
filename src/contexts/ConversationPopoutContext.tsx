import { createContext, useCallback, useContext, useState, ReactNode } from "react";
import { BookingRequest } from "@/types/booking";

interface ConversationPopoutContextValue {
  booking: BookingRequest | null;
  open: (booking: BookingRequest) => void;
  close: () => void;
}

const ConversationPopoutContext = createContext<ConversationPopoutContextValue | undefined>(undefined);

export function ConversationPopoutProvider({ children }: { children: ReactNode }) {
  const [booking, setBooking] = useState<BookingRequest | null>(null);

  const open = useCallback((b: BookingRequest) => {
    setBooking(b);
  }, []);

  const close = useCallback(() => {
    setBooking(null);
  }, []);

  return (
    <ConversationPopoutContext.Provider value={{ booking, open, close }}>
      {children}
    </ConversationPopoutContext.Provider>
  );
}

export function useConversationPopout() {
  const ctx = useContext(ConversationPopoutContext);
  if (!ctx) {
    throw new Error("useConversationPopout must be used within ConversationPopoutProvider");
  }
  return ctx;
}
