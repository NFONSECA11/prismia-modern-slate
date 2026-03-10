// Module-level cache for cancelled booking data
// Survives re-renders, remounts, and refetches
export const cancelledBookingCache = new Map<number, { cancelledId: string; botOff: boolean }>();
