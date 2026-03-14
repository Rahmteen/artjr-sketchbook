import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const SESSION_HOURS = 24;
const STORAGE_KEY = 'artjr-gate';

function getExpiry(): string {
  const d = new Date();
  d.setHours(d.getHours() + SESSION_HOURS);
  return d.toISOString();
}

interface GateState {
  unlocked: boolean;
  expiresAt: string | null;
  setUnlocked: (value: boolean) => void;
  unlock: () => void;
  lock: () => void;
  checkValid: () => boolean;
}

export const useGateStore = create<GateState>()(
  persist(
    (set, get) => ({
      unlocked: false,
      expiresAt: null,

      setUnlocked: (value) =>
        set({
          unlocked: value,
          expiresAt: value ? getExpiry() : null,
        }),

      unlock: () =>
        set({
          unlocked: true,
          expiresAt: getExpiry(),
        }),

      lock: () =>
        set({
          unlocked: false,
          expiresAt: null,
        }),

      checkValid: () => {
        const { unlocked, expiresAt } = get();
        if (!unlocked || !expiresAt) return false;
        if (new Date(expiresAt) < new Date()) {
          get().lock();
          return false;
        }
        return true;
      },
    }),
    { name: STORAGE_KEY }
  )
);
