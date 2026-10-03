"use client";

import { useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import {
  applyTheme,
  getNextThemeSetting,
  getStoredThemeSetting,
  resolveTheme,
  subscribeTheme,
  type ResolvedTheme,
  type ThemeSetting
} from "@/lib/theme";

function getSettingSnapshot(): ThemeSetting {
  if (typeof document === "undefined") return "system";
  const attr = document.documentElement.getAttribute("data-theme-setting");
  if (attr === "system" || attr === "light" || attr === "dark") return attr;
  return getStoredThemeSetting();
}

function getResolvedSnapshot(): ResolvedTheme {
  if (typeof document === "undefined") return "light";
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark" || attr === "light") return attr;
  return resolveTheme(getSettingSnapshot());
}

export function ThemeToggle({ className, showLabel = false }: { className?: string; showLabel?: boolean }) {
  const setting = useSyncExternalStore<ThemeSetting>(subscribeTheme, getSettingSnapshot, () => "system");
  const resolved = useSyncExternalStore<ResolvedTheme>(subscribeTheme, getResolvedSnapshot, () => "light");

  function toggle() {
    const next = getNextThemeSetting(setting);
    applyTheme(next);
  }

  const label = setting === "system" ? "Auto" : setting === "light" ? "Hell" : "Dunkel";
  const title =
    setting === "system"
      ? `Design: Auto Tag/Nacht (${resolved === "dark" ? "Dunkel" : "Hell"}) – Klicken für Hell`
      : setting === "light"
        ? "Design: Hell – Klicken für Dunkel"
        : "Design: Dunkel – Klicken für Auto Tag/Nacht";

  return (
    <button
      type="button"
      className={className ?? "theme-toggle"}
      onClick={toggle}
      title={title}
      aria-label={title}
    >
      {setting === "system" ? (
        <Monitor size={showLabel ? 24 : 20} />
      ) : setting === "light" ? (
        <Sun size={showLabel ? 24 : 20} />
      ) : (
        <Moon size={showLabel ? 24 : 20} />
      )}
      {showLabel && <span className="tool-label">{label}</span>}
    </button>
  );
}
