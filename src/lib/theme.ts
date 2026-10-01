export type ThemeSetting = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "fitfamily-theme";

export function getSystemPreference(): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
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

  let mediaQuery: MediaQueryList | null = null;
  const handleMedia = () => {
    if (getStoredThemeSetting() === "system") {
      applyTheme("system");
      callback();
    }
  };

  if (window.matchMedia) {
    try {
      mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      if (typeof mediaQuery.addEventListener === "function") {
        mediaQuery.addEventListener("change", handleMedia);
      } else if (typeof (mediaQuery as { addListener?: (fn: () => void) => void }).addListener === "function") {
        (mediaQuery as { addListener: (fn: () => void) => void }).addListener(handleMedia);
      }
    } catch {
      // ignore
    }
  }

  return () => {
    window.removeEventListener("fitfamily-theme-change", handleCustom);
    window.removeEventListener("storage", handleStorage);
    if (mediaQuery) {
      try {
        if (typeof mediaQuery.removeEventListener === "function") {
          mediaQuery.removeEventListener("change", handleMedia);
        } else if (typeof (mediaQuery as { removeListener?: (fn: () => void) => void }).removeListener === "function") {
          (mediaQuery as { removeListener: (fn: () => void) => void }).removeListener(handleMedia);
        }
      } catch {
        // ignore
      }
    }
  };
}
