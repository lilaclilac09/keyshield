import type { UserPreferences } from '../types';
interface AuthState {
    token: string | null;
    walletAddress: string | null;
    isAuthenticated: boolean;
    login: (token: string, walletAddress?: string) => void;
    logout: () => void;
}
export declare const useAuthStore: import("zustand").UseBoundStore<Omit<import("zustand").StoreApi<AuthState>, "setState" | "persist"> & {
    setState(partial: AuthState | Partial<AuthState> | ((state: AuthState) => AuthState | Partial<AuthState>), replace?: false | undefined): unknown;
    setState(state: AuthState | ((state: AuthState) => AuthState), replace: true): unknown;
    persist: {
        setOptions: (options: Partial<import("zustand/middleware").PersistOptions<AuthState, AuthState, unknown>>) => void;
        clearStorage: () => void;
        rehydrate: () => Promise<void> | void;
        hasHydrated: () => boolean;
        onHydrate: (fn: (state: AuthState) => void) => () => void;
        onFinishHydration: (fn: (state: AuthState) => void) => () => void;
        getOptions: () => Partial<import("zustand/middleware").PersistOptions<AuthState, AuthState, unknown>>;
    };
}>;
interface PrefsState extends UserPreferences {
    setPref: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
    load: () => void;
}
export declare const usePreferencesStore: import("zustand").UseBoundStore<Omit<import("zustand").StoreApi<PrefsState>, "setState" | "persist"> & {
    setState(partial: PrefsState | Partial<PrefsState> | ((state: PrefsState) => PrefsState | Partial<PrefsState>), replace?: false | undefined): unknown;
    setState(state: PrefsState | ((state: PrefsState) => PrefsState), replace: true): unknown;
    persist: {
        setOptions: (options: Partial<import("zustand/middleware").PersistOptions<PrefsState, PrefsState, unknown>>) => void;
        clearStorage: () => void;
        rehydrate: () => Promise<void> | void;
        hasHydrated: () => boolean;
        onHydrate: (fn: (state: PrefsState) => void) => () => void;
        onFinishHydration: (fn: (state: PrefsState) => void) => () => void;
        getOptions: () => Partial<import("zustand/middleware").PersistOptions<PrefsState, PrefsState, unknown>>;
    };
}>;
interface UiLayoutState {
    sidebarCollapsed: boolean;
    searchOverlayOpen: boolean;
    searchQuery: string;
    toggleSidebar: () => void;
    setSearchOpen: (open: boolean) => void;
    setSearchQuery: (query: string) => void;
}
export declare const useUiLayoutStore: import("zustand").UseBoundStore<import("zustand").StoreApi<UiLayoutState>>;
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
export declare const useNotificationStore: import("zustand").UseBoundStore<import("zustand").StoreApi<NotificationState>>;
export {};
//# sourceMappingURL=index.d.ts.map