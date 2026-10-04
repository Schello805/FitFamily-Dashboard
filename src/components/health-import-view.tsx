"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { readHealthExport, type ExportWorkout } from "@/lib/health-export-browser";
import { requestJson } from "@/lib/api-client";

export function HealthImportView({ profileId, name }: { profileId: string; name: string }) {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date());
  const [from, setFrom] = useState(today), [to, setTo] = useState(today);
  const [file, setFile] = useState<File | null>(null), [rows, setRows] = useState<ExportWorkout[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false), [progress, setProgress] = useState(0), [message, setMessage] = useState("");
  const [reading, setReading] = useState(false);
  const [results, setResults] = useState<{ externalId: string; sourceName: string; startedAt: string; minutes: number; points: number; duplicate: boolean; conflict: boolean; deleted?: boolean; error?: string }[]>([]);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function preview() {
    if (!file || !from || !to || from > to) { setMessage("Datei und gültigen Zeitraum auswählen."); return; }
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setReading(true); setMessage(""); setResults([]); setRows([]); setSelected(new Set()); setProgress(0);
    try {
      const found = await readHealthExport(file, from, to, abort.signal, setProgress);
      setRows(found); setSelected(new Set(found.slice(0, 25).map(row => row.externalId)));
      setMessage(found.length ? `${found.length} Trainings gefunden. Auswahl und Trainingsart prüfen; noch nichts gebucht.` : "Keine aufgezeichneten Trainings im Zeitraum. Trainingsring-Minuten sind keine einzelnen Trainings.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Export konnte nicht gelesen werden."); }
    finally { setBusy(false); setReading(false); controller.current = null; }
  }
  async function book() {
    const chosen = rows.filter(row => selected.has(row.externalId));
    if (!chosen.length || chosen.length > 25 || chosen.some(row => !row.trainingType)) { setMessage("1–25 Trainings auswählen und für jedes Kraft oder Ausdauer festlegen."); return; }
    setBusy(true); setMessage("");
    try {
      const result = await requestJson<{ saved: number; alreadyReceived: number; conflicts: number; workouts: typeof results }>(`/api/profiles/${encodeURIComponent(profileId)}/health-import`, "Import fehlgeschlagen.", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workouts: chosen.map(workout => ({ startedAt: workout.startedAt, endedAt: workout.endedAt, durationSeconds: workout.durationSeconds, sourceName: workout.sourceName, activityType: workout.activityType, trainingType: workout.trainingType })) })
      });
      setResults(result.workouts); setSelected(new Set());
      setMessage(`${result.saved} neu gebucht · ${result.alreadyReceived} bereits vorhanden · ${result.conflicts} Überschneidungen nicht gebucht.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Import fehlgeschlagen. Erneuter Import zählt nicht doppelt."); }
    finally { setBusy(false); }
  }
  const selectedMinutes = rows.filter(row => selected.has(row.externalId)).reduce((sum, row) => sum + row.durationSeconds / 60, 0);
  return <main className="subpage health-import-view">
    <Link href={`/profil/${profileId}`}>← Profil von {name}</Link><h1>Apple-Health-Training importieren</h1>
    <p>Health → Profilbild → „Alle Gesundheitsdaten exportieren“. Export-ZIP über „In Dateien sichern“ speichern und hier auswählen. Die Datei wird lokal auf deinem Gerät gelesen; nur bestätigte Trainingszeiten werden an FitFamily übertragen.</p>
    <p>Profil: <strong>{name}</strong> · 1,5 Punkte pro aktiver Minute. Duplikate und Überschneidungen werden nicht zusätzlich gewertet. Keine kcal, Schritte oder übrigen Gesundheitsdaten werden hier importiert.</p>
    <section className="health-shortcut-download"><label>Health-Export (.zip oder .xml)<input type="file" accept=".zip,.xml,application/zip,text/xml,application/xml" disabled={busy} onChange={event => { setFile(event.target.files?.[0] ?? null); setRows([]); setResults([]); setSelected(new Set()); }} /></label>
      <label>Von<input type="date" value={from} disabled={busy} onChange={event => { setFrom(event.target.value); setRows([]); setSelected(new Set()); }} /></label>
      <label>Bis<input type="date" value={to} disabled={busy} onChange={event => { setTo(event.target.value); setRows([]); setSelected(new Set()); }} /></label>
      <button onClick={() => void preview()} disabled={busy || !file}>Vorschau laden – noch nicht buchen</button>
      {busy && <><p role="status">{reading ? `Export wird gelesen: ${progress} %` : "Buchung wird geprüft …"}</p>{reading && <button onClick={() => controller.current?.abort()}>Abbrechen</button>}</>}
    </section>
    {message && <p role="status">{message}</p>}
    {rows.length > 0 && <section><h2>Trainingsauswahl</h2><p>Maximal 25 pro Buchung. Auswahl: {selectedMinutes.toFixed(2)} aktive Minuten · {(selectedMinutes * 1.5).toFixed(2)} Punkte vor Duplikat-/Konfliktprüfung.</p>
      {rows.map((row, index) => <article className="health-import-workout" key={row.externalId}>
        <label><input type="checkbox" disabled={busy} checked={selected.has(row.externalId)} onChange={event => setSelected(previous => { const next = new Set(previous); if (event.target.checked) next.add(row.externalId); else next.delete(row.externalId); return next; })} />{new Date(row.startedAt).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })} · {row.sourceName} · {(row.durationSeconds / 60).toFixed(2)} Min.</label>
        <small>{row.activityType.replace("HKWorkoutActivityType", "")}</small>
        <label>Trainingsart<select value={row.trainingType} disabled={busy} onChange={event => setRows(previous => previous.map((item, i) => i === index ? { ...item, trainingType: event.target.value as ExportWorkout["trainingType"] } : item))}><option value="">Bitte auswählen</option><option value="strength">Kraft</option><option value="endurance">Ausdauer</option></select></label>
      </article>)}
      <button disabled={busy || selected.size < 1 || selected.size > 25} onClick={() => void book()}>Ausgewählte Trainings für {name} verbindlich buchen</button>
    </section>}
    {results.length > 0 && <section><h2>Import-Ergebnis</h2>{results.map(row => <p key={row.externalId}>{row.sourceName} · {row.minutes.toFixed(2)} Min. · {row.deleted ? "Im Verlauf gelöscht – nicht erneut gebucht" : row.conflict ? row.error : row.duplicate ? "Bereits vorhanden – keine zusätzlichen Punkte" : `${row.points.toFixed(2)} Punkte gebucht`}</p>)}</section>}
  </main>;
}
