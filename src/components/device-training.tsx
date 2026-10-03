"use client";
import Link from "next/link";
import { useState } from "react";
import type { DashboardProfile } from "@/lib/domain";
import { useDashboardConnection } from "@/components/use-dashboard-connection";
import { LiveDuration } from "@/components/live-duration";
import { ConnectionStatus } from "@/components/connection-status";
import { TrainingProgress } from "@/components/training-progress";
import { requestJson } from "@/lib/api-client";
export function DeviceTraining({ initialProfile }: { initialProfile: DashboardProfile }) {
  const [profile, setProfile] = useState(initialProfile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const { refresh, connectionError, lastRefreshedAt } = useDashboardConnection(data => {
    const updated = data.profiles.find(p => p.id === initialProfile.id);
    if (updated) setProfile(updated);
  });
  async function stop() {
    setBusy(true); setError("");
    try {
      await requestJson("/api/training", "Training konnte nicht beendet werden.", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "stop", profileId: profile.id }) });
      setProfile(p => ({ ...p, activeTraining: null }));
      await refresh(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Training konnte nicht beendet werden."); }
    finally { setBusy(false); }
  }
  const active = profile.activeTraining;
  return <main className="device-training" style={{ "--profile": profile.color } as React.CSSProperties}><header><span className="setup-badge">{profile.name} · Geräte-Training</span><Link href={`/profil/${encodeURIComponent(profile.id)}`}>Mein Profil</Link></header><section className="device-training-card"><span>{active ? active.type === "strength" ? "Krafttraining" : "Ausdauertraining" : "Gespeichert"}</span><h1>{active?.equipmentName || (active ? "Training" : "Training beendet")}</h1>{active && <><p>{active.exerciseName}</p><strong className="device-timer"><LiveDuration since={active.segmentStartedAt} /></strong><small>Gesamte Einheit: <LiveDuration since={active.startedAt} /></small><button className="device-stop" onClick={() => void stop()} disabled={busy}>{busy ? "Speichert …" : "■ Training stoppen"}</button></>}{!active && <p>Scanne das nächste Gerät, um eine neue Einheit zu starten.</p>}{error && <p className="form-error" role="alert">{error}</p>}</section><ConnectionStatus connectionError={connectionError} lastRefreshedAt={lastRefreshedAt} /><TrainingProgress progress={profile.trainingProgress} /><p>Beim nächsten Geräte-Scan wechselt die Übung automatisch. Die Zeit läuft auch bei gesperrtem Handy weiter.</p><Link href="/">Zum Dashboard</Link></main>;
}
