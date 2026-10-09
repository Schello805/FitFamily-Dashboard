"use client";

import { Play } from "lucide-react";
import { useState } from "react";

export function GymondoLaunch() {
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startGymondo() {
    if (isStarting) return;
    setIsStarting(true);
    setError(null);
    try {
      const response = await fetch("/api/launch/gymondo", { method: "POST", credentials: "same-origin" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Gymondo konnte nicht geöffnet werden.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gymondo konnte nicht geöffnet werden.");
    } finally {
      window.setTimeout(() => setIsStarting(false), 700);
    }
  }

  return (
    <div className="gymondo-launch-wrap">
      <button
        type="button"
        className="gymondo-launch"
        onClick={startGymondo}
        disabled={isStarting}
        aria-label="Gymondo in einem eigenen Fenster öffnen"
        title="Gymondo in einem eigenen, maximierten Fenster öffnen. Nach dem Schließen ist dieses Dashboard wieder da."
      >
        <Play size={25} fill="currentColor" aria-hidden="true" />
        <span className="tool-label">{isStarting ? "Startet" : "Gymondo"}</span>
      </button>
      {error && <span className="gymondo-launch-error" role="alert">{error}</span>}
    </div>
  );
}
