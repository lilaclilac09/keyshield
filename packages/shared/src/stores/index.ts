
// Zustand stores

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { UserPreferences } from '../types';
import { getPreferences, setPreferences } from '../lib/preferences';

// Auth Store
interface AuthState {
  token: string | null;
  walletAddress: string | null;
  isAuthenticated: boolean;
  login: (token: string, walletAddress?: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      walletAddress: null,
      isAuthenticated: false,
      login: (token, walletAddress) =>
        set({ token, walletAddress, isAuthenticated: true }),
      logout: () => set({ token: null, walletAddress: null, isAuthenticated: false }),
    }),
    { name: 'ks_auth_store' }
  )
);

// Preferences Store
interface PrefsState extends UserPreferences {
  setPref: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
  load: () => void;
}

const defaults = getPreferences();

export const usePreferencesStore = create<PrefsState>()(
  persist(
    (set) => ({
      ...defaults,
      setPref: (key, value) =>
        set((state) => {
          const updated = { ...state, [key]: value };
          setPreferences({ [key]: value });
          return updated;
        }),
      load: () => set({ ...getPreferences() }),
    }),
    { name: 'ks_prefs_store' }
  )
);

// UI Layout Store
interface UiLayoutState {
  sidebarCollapsed: boolean;
  searchOverlayOpen: boolean;
  searchQuery: string;
  toggleSidebar: () => void;
  setSearchOpen: (open: boolean) => void;
  setSearchQuery: (query: string) => void;
}

export const useUiLayoutStore = create<UiLayoutState>()((set) => ({
  sidebarCollapsed: false,
  searchOverlayOpen: false,
  searchQuery: '',
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSearchOpen: (open) => set({ searchOverlayOpen: open }),
  setSearchQuery: (query) => set({ searchQuery: query }),
}));

// Notification Store
interface NotificationItem {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

interface NotificationState {
  items: NotificationItem[];
  add: (item: Omit<NotificationItem, 'id'>) => void;
  remove: (id: string) => void;
}

export const useNotificationStore = create<NotificationState>()((set) => ({
  items: [],
  add: (item) =>
    set((s) => ({
      items: [...s.items, { ...item, id: crypto.randomUUID() }],
    })),
  remove: (id) =>
    set((s) => ({ items: s.items.filter((n) => n.id !== id) })),
}));
