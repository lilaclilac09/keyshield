import type { UserPreferences } from '../types';
export declare function getPreferences(): UserPreferences;
export declare function setPreferences(prefs: Partial<UserPreferences>): {
    reveal_duration_sec: number;
    default_expiry_days: number;
    notify_on_expiry: boolean;
    notify_on_anomaly: boolean;
    theme: "light" | "dark" | "system";
    sidebar_collapsed: boolean;
};
export declare function resetPreferences(): {
    reveal_duration_sec: number;
    default_expiry_days: number;
    notify_on_expiry: boolean;
    notify_on_anomaly: boolean;
    theme: "light" | "dark" | "system";
    sidebar_collapsed: boolean;
};
//# sourceMappingURL=preferences.d.ts.map