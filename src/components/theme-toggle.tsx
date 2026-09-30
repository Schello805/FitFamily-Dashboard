"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.attributeName === "data-theme") {
        callback();
      }
    }
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.addEventListener("storage", callback);
  return () => {
    observer.disconnect();
    window.removeEventListener("storage", callback);
  };
}

function getSnapshot(): "light" | "dark" {
  if (typeof document === "undefined") return "light";
  return (document.documentElement.getAttribute("data-theme") as "light" | "dark") || "light";
}

function getServerSnapshot(): "light" | "dark" {
  return "light";
}

export function ThemeToggle({ className }: { className?: string }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggle() {
    const next = theme === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("fitfamily-theme", next);
    } catch {
      // ignore
    }
  }

  return (
    <button
      type="button"
      className={className ?? "theme-toggle"}
      onClick={toggle}
      title={theme === "light" ? "Dunkles Design aktivieren" : "Helles Design aktivieren (Blendfrei)"}
      aria-label={theme === "light" ? "Auf dunkles Design umschalten" : "Auf helles blendfreies Design umschalten"}
    >
      {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
    </button>
  );
}
