"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { showToast } from "@/components/toast";

export function ExerciseStartButton({
  profileId,
  exerciseId,
  exerciseName,
  type = "strength",
  returnUrl
}: {
  profileId?: string;
  exerciseId: string;
  exerciseName: string;
  type?: "strength" | "endurance";
  returnUrl?: string;
}) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);

  if (!profileId) return null;

  async function handleStart() {
    setStarting(true);
    const targetUrl = returnUrl || `/profil/${profileId}`;
    try {
      const response = await fetch("/api/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          profileId,
          type,
          exerciseId,
          source: "touch"
        })
      });
      if (response.ok) {
        showToast({
          type: "success",
          title: `Training gestartet: ${exerciseName}`,
          message: `${type === "strength" ? "Krafttraining (+1 Pkt./Min.)" : "Ausdauertraining (+2 Pkt./Min.)"} läuft.`
        });
        router.push(targetUrl);
      } else {
        const data = await response.json().catch(() => null);
        showToast({
          type: "error",
          title: "Start fehlgeschlagen",
          message: data?.error ?? "Das Training konnte nicht gestartet werden."
        });
      }
    } catch {
      showToast({
        type: "error",
        title: "Verbindungsfehler",
        message: "Das Dashboard konnte nicht erreicht werden."
      });
    } finally {
      setStarting(false);
    }
  }

  return (
    <button
      type="button"
      className="guide-start-btn"
      onClick={handleStart}
      disabled={starting}
      title={`Training für ${exerciseName} jetzt starten`}
    >
      <span className="guide-start-btn-icon">
        <Play size={18} fill="currentColor" />
      </span>
      <span>{starting ? "Startet …" : "Übung jetzt starten"}</span>
    </button>
  );
}
