"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { showToast } from "@/components/toast";
import { requestJson } from "@/lib/api-client";
import { useRecordingChoice } from "./recording-choice";

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
  const recording = useRecordingChoice();

  if (!profileId) return null;

  async function handleStart() {
    setStarting(true);
    const targetUrl = returnUrl || `/profil/${profileId}`;
    try {
      const recordingMode = await recording.ask();
      if (!recordingMode) return;
      await requestJson("/api/training", "Das Training konnte nicht gestartet werden.", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          profileId,
          type,
          exerciseId,
          recordingMode,
          source: "touch"
        })
      });
      showToast({
          type: "success",
          title: `Training gestartet: ${exerciseName}`,
          message: recordingMode === "health" ? "App-Timer ohne Wertung. Der Health-Import zählt mit 1,5 Punkten/Minute." : `${type === "strength" ? "Krafttraining (+1 Pkt./Min.)" : "Ausdauertraining (+2 Pkt./Min.)"} läuft.`
      });
      router.push(targetUrl);
    } catch (error) {
      showToast({
        type: "error",
        title: "Start fehlgeschlagen",
        message: error instanceof Error ? error.message : "Das Dashboard konnte nicht erreicht werden."
      });
    } finally {
      setStarting(false);
    }
  }

  return (
    <>{recording.dialog}
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
    </button></>
  );
}
