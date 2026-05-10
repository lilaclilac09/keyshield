// Zustand stores
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getPreferences, setPreferences } from '../lib/preferences';
export const useAuthStore = create()(persist((set) => ({
    token: null,
    walletAddress: null,
    isAuthenticated: false,
    login: (token, walletAddress) => set({ token, walletAddress, isAuthenticated: true }),
    logout: () => set({ token: null, walletAddress: null, isAuthenticated: false }),
}), { name: 'ks_auth_store' }));
const defaults = getPreferences();
export const usePreferencesStore = create()(persist((set) => ({
    ...defaults,
    setPref: (key, value) => set((state) => {
        const updated = { ...state, [key]: value };
        setPreferences({ [key]: value });
        return updated;
    }),
    load: () => set({ ...getPreferences() }),
}), { name: 'ks_prefs_store' }));
export const useUiLayoutStore = create()((set) => ({
    sidebarCollapsed: false,
    searchOverlayOpen: false,
    searchQuery: '',
    toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    setSearchOpen: (open) => set({ searchOverlayOpen: open }),
    setSearchQuery: (query) => set({ searchQuery: query }),
}));
export const useNotificationStore = create()((set) => ({
    items: [],
    add: (item) => set((s) => ({
        items: [...s.items, { ...item, id: crypto.randomUUID() }],
    })),
    remove: (id) => set((s) => ({ items: s.items.filter((n) => n.id !== id) })),
}));
//# sourceMappingURL=index.js.map