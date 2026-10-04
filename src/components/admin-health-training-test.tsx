"use client";
import { useEffect, useState } from "react";
import { requestJson } from "@/lib/api-client";

type TestStatus = { configured: boolean; profiles: { id: string; name: string }[]; latest: { at: string; importId: string; profileName: string; saved: number; alreadyReceived: number; workouts: { startedAt: string; durationSeconds: number; sourceName: string; minutes: number; testPoints: number; duplicate: boolean }[] } | null };
export function AdminHealthTrainingTest() {
  const [status, setStatus] = useState<(TestStatus & { latestError?: { importId: string; message: string; errors: string[] } | null }) | null>(null);
  const [secret, setSecret] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let disposed = false;
    requestJson<TestStatus>("/api/admin/health-training-test", "Trainingstest nicht erreichbar.", { cache: "no-store" })
      .then(value => { if (!disposed) setStatus(value); })
      .catch(error => { if (!disposed) setNotice(error.message); });
    return () => { disposed = true; };
  }, []);
  async function refresh() {
    setBusy(true); setNotice("");
    try { setStatus(await requestJson<TestStatus>("/api/admin/health-training-test", "Teststatus nicht erreichbar.", { cache: "no-store" })); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Teststatus nicht erreichbar."); }
    finally { setBusy(false); }
  }
  async function createKey() {
    if (status?.configured && !window.confirm("Familienschlüssel ersetzen? Der bisherige Schlüssel funktioniert danach für niemanden mehr.")) return;
    setBusy(true); setNotice("");
    try {
      const result = await requestJson<{ secret: string }>("/api/admin/health-training-test", "Schlüssel konnte nicht erstellt werden.", { method: "POST" });
      setSecret(result.secret);
      setStatus(value => value ? { ...value, configured: true } : value);
      setNotice("Ein Schlüssel für die ganze Familie. Jetzt kopieren; er wird nur einmal angezeigt.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Schlüssel konnte nicht erstellt werden."); }
    finally { setBusy(false); }
  }
  async function copyKey() {
    try {
      await navigator.clipboard.writeText(secret);
      setNotice("Schlüssel kopiert.");
    } catch { setNotice("Bitte den Schlüssel im Feld auswählen und kopieren."); }
  }
  return <article className="wide"><div className="admin-title"><div><h2>Apple Health / Gymondo · Trainingstest</h2><p>Nur einzelne Trainingszeiten · 1,5 Punkte/Minute als Vorschau. Noch keine Buchung auf dem Dashboard.</p></div></div>
    <div className="admin-actions"><button type="button" onClick={() => void createKey()} disabled={busy || !status}>{status?.configured ? "Familienschlüssel ersetzen" : "Familienschlüssel erstellen"}</button><button type="button" onClick={() => void refresh()} disabled={busy}>Testempfang prüfen</button></div>
    {secret && <label>Familienschlüssel<input readOnly value={secret} aria-label="Familienschlüssel" onFocus={event => event.currentTarget.select()} /><button type="button" onClick={() => void copyKey()}>Schlüssel kopieren</button></label>}
    {status && <p>Profil-IDs: {status.profiles.map(profile => `${profile.name}: ${profile.id}`).join(" · ")}</p>}
    {notice && <p role="status">{notice}</p>}
    {status?.latestError && <p role="alert">Letzter Versuch fehlgeschlagen: {status.latestError.message} {status.latestError.errors.join(" · ")} · Import-ID {status.latestError.importId}. Die folgende Tabelle zeigt den letzten erfolgreichen Empfang.</p>}
    {status?.latest ? <><p>Letzter Test: {status.latest.profileName} · {status.latest.saved} neu · {status.latest.alreadyReceived} bereits empfangen · Import-ID {status.latest.importId}</p><div className="health-test-table"><table><thead><tr><th>Beginn</th><th>Quelle</th><th>Minuten</th><th>Testpunkte</th><th>Status</th></tr></thead><tbody>{status.latest.workouts.map((workout, index) => <tr key={index}><td>{new Date(workout.startedAt).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}</td><td>{workout.sourceName}</td><td>{workout.minutes.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</td><td>{workout.testPoints.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</td><td>{workout.duplicate ? "Bereits empfangen" : "Neu · nur Vorschau"}</td></tr>)}</tbody></table></div></> : <p>Noch kein Trainingstest empfangen.</p>}
    <p>Mac: <code>npm run health:test -- --file /Pfad/export.zip --profile papa</code>. Erst lokale Vorschau prüfen, anschließend mit <code>--send</code> übertragen.</p>
  </article>;
}
