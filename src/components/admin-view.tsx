"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Bot, CheckCircle2, Database, Download, HardDrive, RotateCcw, ShieldCheck } from "lucide-react";

type Status = { openai: boolean; gemini: boolean; nas: boolean };
type ExerciseMedia = { id: string; name: string; equipment: string; videoUrl: string | null };

export function AdminView({ profiles, exercises }: { profiles: { id: string; name: string; score: number }[]; exercises: ExerciseMedia[] }) {
  const [pin, setPin] = useState("");
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>(() => Object.fromEntries(exercises.map((exercise) => [exercise.id, exercise.videoUrl ?? ""])));
  const [savingVideo, setSavingVideo] = useState<string | null>(null);

  async function unlock(event: React.FormEvent) {
    event.preventDefault(); setError("");
    const response = await fetch("/api/admin/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
    const result = await response.json();
    if (!response.ok) return setError(result.error);
    setStatus({ ...result.providers, nas: result.nas });
  }

  async function download() {
    const response = await fetch("/api/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
    if (!response.ok) return setNotice("Export fehlgeschlagen.");
    const blob = await response.blob(); const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `fitfamily-${new Date().toISOString().slice(0,10)}.json`; anchor.click(); URL.revokeObjectURL(url);
    setNotice("Export wurde heruntergeladen.");
  }

  async function reset(profileId: string) {
    if (!window.confirm("Nur den sichtbaren Score auf 0 setzen? Der Verlauf bleibt erhalten.")) return;
    const response = await fetch("/api/admin/reset-score", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin, profileId }) });
    setNotice(response.ok ? "Score wurde zurückgesetzt. Der Verlauf blieb erhalten." : "Zurücksetzen fehlgeschlagen.");
  }

  async function saveVideo(exerciseId: string) {
    setSavingVideo(exerciseId); setNotice("");
    try {
      const response = await fetch(`/api/exercises/${exerciseId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, videoUrl: videoUrls[exerciseId]?.trim() || null })
      });
      const result = await response.json();
      setNotice(response.ok ? "Video-Link gespeichert." : result.error ?? "Video-Link konnte nicht gespeichert werden.");
    } catch {
      setNotice("Keine Verbindung. Bitte Heimnetz prüfen und erneut versuchen.");
    } finally {
      setSavingVideo(null);
    }
  }

  if (!status) return <main className="mobile-page"><form className="admin-login" onSubmit={unlock}><div className="pair-icon"><ShieldCheck /></div><span className="setup-badge">Geschützter Bereich</span><h1>Verwaltung</h1><p>Einstellungen, Exporte und Löschungen sind mit dem Eltern-PIN geschützt.</p><label>Eltern-PIN<input autoFocus type="password" inputMode="numeric" value={pin} onChange={(event) => setPin(event.target.value)} /></label>{error && <p className="form-error">{error}</p>}<button className="primary-submit">Entsperren</button><Link href="/"><ArrowLeft /> Dashboard</Link></form></main>;

  return <main className="admin-page"><header><Link href="/"><ArrowLeft /> Dashboard</Link><div><span>Elternbereich</span><h1>Verwaltung</h1></div></header>{notice && <p className="notice">{notice}</p>}
    <section className="admin-grid"><article><div className="admin-title"><Database /><div><h2>Meine Daten</h2><p>Vollständiger lokaler Datenbestand</p></div></div><ul><li><CheckCircle2 /> Profildaten und Geburtsdaten</li><li><CheckCircle2 /> Trainings- und Punkteverlauf</li><li><CheckCircle2 /> Pläne und Änderungsprotokoll</li></ul><button onClick={download}><Download /> JSON herunterladen</button></article>
      <article><div className="admin-title"><Bot /><div><h2>Integrationen</h2><p>Schlüssel bleiben auf diesem Gerät</p></div></div><div className="status-row"><span>OpenAI</span><b className={status.openai ? "ok" : "off"}>{status.openai ? "Bereit" : "Nicht eingerichtet"}</b></div><div className="status-row"><span>Google Gemini</span><b className={status.gemini ? "ok" : "off"}>{status.gemini ? "Bereit" : "Nicht eingerichtet"}</b></div><div className="status-row"><span>NAS-Backup</span><b className={status.nas ? "ok" : "off"}>{status.nas ? "Bereit" : "Nicht eingerichtet"}</b></div></article>
      <article className="wide"><div className="admin-title"><RotateCcw /><div><h2>Scores zurücksetzen</h2><p>Der vollständige Trainingsverlauf bleibt erhalten.</p></div></div><div className="reset-list">{profiles.map((profile) => <div key={profile.id}><span>{profile.name}<small>{profile.score} Punkte</small></span><button onClick={() => reset(profile.id)}>Auf 0 setzen</button></div>)}</div></article>
      <article className="wide"><div className="admin-title"><HardDrive /><div><h2>Speicherorte</h2><p>Transparenz über vorhandene Daten</p></div></div><p className="data-text">Stammdaten, Training und Pläne: lokale SQLite-Datenbank · Backups: {status.nas ? "verschlüsselt auf NAS" : "noch nicht eingerichtet"} · Wetter: Open-Meteo · KI: nur bei bewusster Planerstellung.</p></article>
      <article className="wide"><div className="admin-title"><CheckCircle2 /><div><h2>Übungsvideos</h2><p>Eigene YouTube-Anleitungen pro Übung hinterlegen; leere Felder zeigen eine YouTube-Suche.</p></div></div><div className="exercise-media-list">{exercises.map((exercise) => <div key={exercise.id}><label><span>{exercise.name}<small>{exercise.equipment}</small></span><input type="url" inputMode="url" placeholder="https://youtube.com/..." value={videoUrls[exercise.id] ?? ""} onChange={(event) => setVideoUrls((values) => ({ ...values, [exercise.id]: event.target.value }))} /></label><button disabled={savingVideo === exercise.id} onClick={() => saveVideo(exercise.id)}>{savingVideo === exercise.id ? "Speichert …" : "Speichern"}</button></div>)}</div></article>
    </section>
  </main>;
}
