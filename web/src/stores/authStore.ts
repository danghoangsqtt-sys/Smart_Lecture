import { create } from 'zustand';
import type { PublicUser } from '../types';

interface AuthState {
  user: PublicUser | null;
  hydrated: boolean;
  setAuth: (user: PublicUser) => void;
  clearAuth: () => void;
  finishHydration: () => void;
}

if (typeof window !== 'undefined') {
  try {
    window.localStorage.removeItem('smart-lecture-auth');
    window.sessionStorage.removeItem('smart-lecture-auth');
  } catch {
    // Storage can be unavailable in hardened/private browser contexts. Auth is
    // intentionally memory-only, so cleanup failure must not block the app.
  }
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  hydrated: false,
  setAuth: (user) => set({ user, hydrated: true }),
  clearAuth: () => set({ user: null, hydrated: true }),
  finishHydration: () => set({ hydrated: true }),
}));
