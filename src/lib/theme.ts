import { DEFAULT_DISPLAY_SETTINGS, type DisplaySettings } from "./display-settings-shared";
import { isWithinNightWindow } from "./display-time";

export type ThemeSetting = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";
export const THEME_STORAGE_KEY = "fitfamily-theme";

export function automaticTheme(clock: Date, settings = DEFAULT_DISPLAY_SETTINGS): ResolvedTheme {
  return isWithinNightWindow(clock, settings.nightStartTime, settings.nightEndTime, settings.timeZone) ? "dark" : "light";
}

function cachedDisplaySettings(): DisplaySettings {
  try { return { ...DEFAULT_DISPLAY_SETTINGS, ...JSON.parse(localStorage.getItem("fitfamily_display_settings") || "{}") }; }
  catch { return DEFAULT_DISPLAY_SETTINGS; }
}

export function cacheDisplaySettings(settings: DisplaySettings) {
  try { localStorage.setItem("fitfamily_display_settings", JSON.stringify(settings)); } catch {}
  applyTheme(getStoredThemeSetting());
}

export function getSystemPreference(): ResolvedTheme {
  if (typeof window === "undefined") return automaticTheme(new Date());
  try { return automaticTheme(new Date(), cachedDisplaySettings()); } catch { return automaticTheme(new Date()); }
}

export function getStoredThemeSetting(): ThemeSetting {
  if (typeof window === "undefined") return "system";
  try {
    const val = localStorage.getItem(THEME_STORAGE_KEY);
    if (val === "light" || val === "dark" || val === "system") return val;
  } catch {}
  return "system";
}

export function resolveTheme(setting: ThemeSetting): ResolvedTheme {
  if (setting === "system") {
    return getSystemPreference();
  }
  return setting;
}

export function applyTheme(setting: ThemeSetting): ResolvedTheme {
  const resolved = resolveTheme(setting);
  if (typeof document !== "undefined") {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, setting);
    } catch {}

    document.documentElement.setAttribute("data-theme", resolved);
    document.documentElement.setAttribute("data-theme-setting", setting);

    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("fitfamily-theme-change", {
          detail: { setting, resolved }
        })
      );
    }
  }
  return resolved;
}

export function getNextThemeSetting(current: ThemeSetting): ThemeSetting {
  const cycle: ThemeSetting[] = ["system", "light", "dark"];
  const idx = cycle.indexOf(current);
  return cycle[(idx + 1) % cycle.length];
}

export function subscribeTheme(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  const handleCustom = () => callback();
  const handleStorage = (e: StorageEvent) => {
    if (e.key === THEME_STORAGE_KEY) {
      applyTheme(getStoredThemeSetting());
      callback();
    }
  };

  window.addEventListener("fitfamily-theme-change", handleCustom);
  window.addEventListener("storage", handleStorage);

  const refresh = () => {
    if (getStoredThemeSetting() === "system") {
      applyTheme("system");
      callback();
    }
  };

  const timer = window.setInterval(refresh, 30_000);

  return () => {
    window.removeEventListener("fitfamily-theme-change", handleCustom);
    window.removeEventListener("storage", handleStorage);
    window.clearInterval(timer);
  };
}
