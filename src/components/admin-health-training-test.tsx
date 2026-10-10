"use client";
import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { requestJson } from "@/lib/api-client";

type TestStatus = { configured: boolean; profiles: { id: string; name: string; energyGoalKcal?: number; goalSteps?: number; trainingGoalMinutes?: number }[]; latest: { at: string; importId: string; profileName: string; mode?: "test" | "book"; saved: number; alreadyReceived: number; conflicts?: number; workouts: { startedAt: string; durationSeconds: number; sourceName: string; minutes: number; testPoints?: number; points?: number; duplicate: boolean; conflict?: boolean; error?: string }[] } | null };
export function AdminHealthTrainingTest() {
  const [status, setStatus] = useState<(TestStatus & {
    energyDaily?: { profile_id: string; profile_name: string; date: string; active_energy_kcal: number; step_count?: number | null; training_minutes?: number | null; updated_at: string }[];
    energyAttempt?: { level: string; message: string; importId: string; errors?: string[] } | null;
    latestEnergyImport?: { importId: string; profileId: string; sourceName: string; dates: string[] } | null;
    latestError?: { importId: string; message: string; errors: string[] } | null;
  }) | null>(null);
  const [secret, setSecret] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [shortcutProfile, setShortcutProfile] = useState("");
  const [shortcutServer, setShortcutServer] = useState("http://192.168.1.253:3000");
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
  async function revertLatestEnergyImport() {
    const imported = status?.latestEnergyImport;
    if (!imported) return;
    const profileName = status?.profiles.find(profile => profile.id === imported.profileId)?.name ?? imported.profileId;
    if (!window.confirm(`Den letzten Apple-Health-Import bei ${profileName} mit ${imported.dates.length} Tagen löschen? Trainings, Punkte und andere Daten bleiben unverändert.`)) return;
    setBusy(true); setNotice("");
    try {
      const result = await requestJson<{ deleted: number; profileId: string }>("/api/admin/health-training-test", "Health-Import konnte nicht zurückgenommen werden.", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ importId: imported.importId }) });
      await refresh(); setNotice(`${result.deleted} Apple-Health-Tage bei ${profileName} gelöscht.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Health-Import konnte nicht zurückgenommen werden."); }
    finally { setBusy(false); }
  }
  async function deleteEnergyDay(day: { profile_id: string; profile_name: string; date: string }) {
    if (!window.confirm(`Apple-Health-Daten von ${day.profile_name} am ${day.date} löschen? Energie, Schritte und Trainingsminuten dieses Tages werden entfernt; die Wertung passt sich sofort an.`)) return;
    setBusy(true); setNotice("");
    try {
      await requestJson<{ deleted: number }>("/api/admin/health-training-test", "Apple-Health-Tag konnte nicht gelöscht werden.", {
        method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId: day.profile_id, date: day.date })
      });
      await refresh();
      setNotice(`Apple-Health-Daten von ${day.profile_name} am ${day.date} gelöscht.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : "Apple-Health-Tag konnte nicht gelöscht werden."); }
    finally { setBusy(false); }
  }
  return <article className="wide"><div className="admin-title"><div><h2>Health-Daten empfangen</h2><p>Aktive Energie und Schritte bleiben ohne Wertung. Trainingsminuten aus Health zählen rückwirkend mit Faktor 1,5; bereits in FitFamily erfasste Minuten am selben Tag werden abgezogen.</p></div></div>
    <div className="admin-actions"><button type="button" onClick={() => void createKey()} disabled={busy || !status}>{status?.configured ? "Familienschlüssel ersetzen" : "Familienschlüssel erstellen"}</button><button type="button" onClick={() => void refresh()} disabled={busy}>Empfang prüfen</button></div>
    {secret && <label>Familienschlüssel<input readOnly value={secret} aria-label="Familienschlüssel" onFocus={event => event.currentTarget.select()} /><button type="button" onClick={() => void copyKey()}>Schlüssel kopieren</button></label>}
    {status && <p>Profil-IDs: {status.profiles.map(profile => `${profile.name}: ${profile.id}`).join(" · ")}</p>}
    {notice && <p role="status">{notice}</p>}
    <section className="health-energy-settings" aria-label="Aktive Energie aus Apple Health">
      <h3>Apple Health · täglicher 30-Tage-Kurzbefehl</h3>
      <p>Der Kurzbefehl überträgt die letzten 30 Kalendertage: Energie, Schritte und Trainingsminuten. FitFamily gruppiert sie nach Tag und ersetzt pro Tag nur den jeweiligen Wert.</p>
      <h4>Tagesziele · kcal und Schritte</h4>
      <p>Standard: 500 kcal und 10.000 Schritte pro Profil. Ziele werden manuell in FitFamily gepflegt, nicht aus Apple gelesen. Ohne Wertung.</p>
      {status?.profiles.map(profile => <form className="health-goal-form" key={`${profile.id}:${profile.energyGoalKcal}:${profile.goalSteps}:${profile.trainingGoalMinutes}`} onSubmit={async event => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const goalKcal = Number(data.get("goalKcal"));
        const goalSteps = Number(data.get("goalSteps"));
        const trainingGoalMinutes = Number(data.get("trainingGoalMinutes"));
        setBusy(true); setNotice("");
        try {
          await requestJson("/api/admin/health-training-test", "Ziele konnten nicht gespeichert werden.", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId: profile.id, goalKcal, goalSteps, trainingGoalMinutes }) });
          await refresh(); setNotice(`Ziele für ${profile.name} gespeichert.`);
        } catch (error) { setNotice(error instanceof Error ? error.message : "Ziel konnte nicht gespeichert werden."); }
        finally { setBusy(false); }
      }}><strong>{profile.name}</strong><label>kcal-Ziel<input aria-label={`kcal-Ziel für ${profile.name}`} name="goalKcal" type="number" required min="1" max="20000" step="1" defaultValue={profile.energyGoalKcal ?? 500} /></label><label>Schritte-Ziel<input aria-label={`Schritte-Ziel für ${profile.name}`} name="goalSteps" type="number" required min="1" max="100000" step="1" defaultValue={profile.goalSteps ?? 10000} /></label><label>Trainingsziel / Woche<input aria-label={`Trainingsziel pro Woche für ${profile.name}`} name="trainingGoalMinutes" type="number" required min="1" max="10000" step="1" defaultValue={profile.trainingGoalMinutes ?? 150} /></label><button type="submit" disabled={busy}>Ziele speichern</button></form>)}
      <section className="health-shortcut-download" aria-label="Mac-Kurzbefehl herunterladen">
        <h4>Fertigen Kurzbefehl auf dem Mac erstellen</h4>
        <label>Profil<select value={shortcutProfile || status?.profiles[0]?.id || ""} onChange={event => setShortcutProfile(event.target.value)}>{status?.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
        <label>Serveradresse<input value={shortcutServer} onChange={event => setShortcutServer(event.target.value)} placeholder="http://192.168.1.253:3000" /></label>
        {status?.profiles.length ? <a className="health-shortcut-link" href={`/api/admin/health-shortcut?format=app&profileId=${encodeURIComponent(shortcutProfile || status.profiles[0].id)}${shortcutServer ? `&server=${encodeURIComponent(shortcutServer)}` : ""}`} download>Mac-App herunterladen · inklusive Kurzbefehl-Signierung</a> : null}
        <ol>
          <li>Auf dem Mac herunterladen, ZIP entpacken und „FitFamily-Kurzbefehl.app“ per Doppelklick öffnen. Keine Terminaleingabe nötig. Die Mac-App ist nicht notarisiert; macOS kann eine einmalige Freigabe unter Systemeinstellungen → Datenschutz &amp; Sicherheit verlangen. Keine Sicherheitsfunktionen abschalten.</li>
          <li>Das Skript erzeugt die Vorlage, lässt sie von Apple signieren und öffnet sie in Kurzbefehle. „Kurzbefehl hinzufügen“ bestätigen. Die neue Version heißt <strong>„FitFamily Alltag v5“</strong>; bei Energie, Schritten und Trainingsminuten muss jeweils „Startdatum innerhalb der letzten 30 Tage“ stehen.</li>
          <li>Danach den Kurzbefehl bearbeiten und nur die zwei vorbereiteten Textfelder oben ersetzen: bekannter Familienschlüssel und exakter Name einer aktuellen Energie-Datenquelle aus Health. Keine Aktionen selbst anlegen. Der Schlüssel kommt erst nach der Signierung hinein; keinen ausgefüllten Kurzbefehl teilen.</li>
          <li>Mac und iPhone: derselbe Apple-Account, Kurzbefehle → Einstellungen → iCloud-Synchronisierung aktivieren. Bereits importierte ältere Kurzbefehle ändern sich nicht automatisch: nicht mehr ausführen oder löschen. Dann „FitFamily Alltag v5“ auf dem iPhone einmal ausführen und den Empfang hier prüfen.</li>
        </ol>
        <p>Diese Version überträgt Werte, Einheiten, Quellennamen und Datum der letzten 30 Tage als Text. FitFamily gruppiert sie automatisch nach Tag und summiert nur die ausgewählte Quelle. Trainingsminuten werden neutral bewertet, ohne Kraft- oder Ausdauer-Art zu raten.</p>
      </section>
      {status?.energyAttempt && <p role={status.energyAttempt.level === "error" ? "alert" : "status"}>{status.energyAttempt.message} {status.energyAttempt.errors?.join(" · ")} · Import-ID {status.energyAttempt.importId}</p>}
      {status?.latestEnergyImport && <button type="button" onClick={() => void revertLatestEnergyImport()} disabled={busy}>Letzten 30-Tage-Import bei {status.profiles.find(profile => profile.id === status.latestEnergyImport?.profileId)?.name ?? status.latestEnergyImport.profileId} zurücknehmen</button>}
      {status?.energyDaily?.length ? <div className="health-test-table"><table><thead><tr><th>Profil</th><th>Tag</th><th>Aktive kcal</th><th>Schritte</th><th>Trainingsmin.</th><th>Empfangen</th><th><span className="sr-only">Aktion</span></th></tr></thead><tbody>{status.energyDaily.map(day => <tr key={`${day.profile_id}:${day.date}`}><td>{day.profile_name}</td><td>{day.date}</td><td>{day.active_energy_kcal.toLocaleString("de-DE", { maximumFractionDigits: 1 })}</td><td>{day.step_count == null ? "—" : day.step_count.toLocaleString("de-DE")}</td><td>{day.training_minutes == null ? "—" : day.training_minutes.toLocaleString("de-DE", { maximumFractionDigits: 1 })}</td><td>{new Date(day.updated_at.replace(" ", "T") + "Z").toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}</td><td><button type="button" className="icon-button danger" onClick={() => void deleteEnergyDay(day)} disabled={busy} aria-label={`Apple-Health-Daten von ${day.profile_name} am ${day.date} löschen`} title="Apple-Health-Tag löschen"><Trash2 size={16} /></button></td></tr>)}</tbody></table></div> : <p>Noch keine aktive Energie empfangen.</p>}
      <details><summary>Fehleranalyse einer alten Tagesversion</summary>
        <ol>
          <li>„Aktuelles Datum“ → „Datum formatieren“: eigenes Format <code>yyyy-MM-dd</code>. Dieser Tag gehört zum gesuchten Health-Zeitraum (Europe/Berlin).</li>
          <li>„Health-Messungen suchen“: Typ „Aktive Energie“, Startdatum „ist heute“, Einheit „kcal“, Gruppieren nach „Tag“, „Fehlende ausfüllen“ aus. Nur die gewünschte aktuelle Datenquelle verwenden. Ohne Treffer: Kurzbefehl stoppen, keinen 0-Wert senden.</li>
          <li>Den „Wert“ der Tagesmessung als Text übernehmen. Keine Berechnung, kein „mal 1“, kein Runden und kein Punkt-Ersetzen. Bei mehreren Treffern nicht einfach den ersten senden; zuerst die Quelle/Abfrage prüfen.</li>
          <li>„Inhalte von URL abrufen“: <code>/api/sync/health-energy</code> an deiner Serveradresse, Methode POST. Header <code>Authorization</code>: <code>Bearer DEIN_FAMILIENSCHLÜSSEL</code>. Anfragetext JSON: die vier Felder unten. <code>activeEnergyKcal</code> ausdrücklich Typ Text mit dem Messwert; <code>date</code> mit „Formatiertes Datum“ belegen.</li>
        </ol>
        <pre>{'{"profileId":"papa","date":"2026-10-04","activeEnergyKcal":"343.391100000182","unit":"kcal"}'}</pre>
        <p>Das Datum und die Zahl im Beispiel sind keine festen Werte für den Kurzbefehl. Nur diese vier Felder senden, keine Health-Objekte. Zuerst manuell ausführen und mit Health vergleichen; „Empfang prüfen“ zeigt den wirklich gespeicherten Wert.</p>
        <p>Danach iPhone → Kurzbefehle → Automation → Tageszeit → täglich → Sofort ausführen → diesen Kurzbefehl auswählen. Beispielsweise 22 Uhr: bis dahin erfasster Tageswert, kein garantierter Endwert. iPhone muss Health lesen können und der Server erreichbar sein. Health-Zugriff kann bei Gerätesperre scheitern; Automationen nicht als garantiert erfolgreich behandeln.</p>
        <p>Der Schlüssel ist sensibel. Nur im eigenen Kurzbefehl hinterlegen und diesen nicht mit Schlüssel teilen. HTTP im WLAN überträgt Schlüssel und kcal unverschlüsselt; HTTPS bevorzugen.</p>
      </details>
    </section>
    <h3>Aufgezeichnete Trainings · Export-Import</h3>
    {status?.latestError && <p role="alert">Letzter Versuch mit Fehlern: {status.latestError.message} {status.latestError.errors.join(" · ")} · Import-ID {status.latestError.importId}. Die Tabelle zeigt den letzten verarbeiteten Empfang, einschließlich möglicher Konflikte.</p>}
    {status?.latest ? <><p>{status.latest.mode === "book" ? "Echte Buchung" : "Letzter Test"}: {status.latest.profileName} · {status.latest.saved} neu · {status.latest.alreadyReceived} bereits empfangen · {status.latest.conflicts ?? 0} Konflikte · Import-ID {status.latest.importId}</p><div className="health-test-table"><table><thead><tr><th>Beginn</th><th>Quelle</th><th>Minuten</th><th>Punkte</th><th>Status</th></tr></thead><tbody>{status.latest.workouts.map((workout, index) => <tr key={index}><td>{new Date(workout.startedAt).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}</td><td>{workout.sourceName}</td><td>{workout.minutes.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</td><td>{(workout.points ?? workout.testPoints ?? 0).toLocaleString("de-DE", { maximumFractionDigits: 2 })}</td><td>{workout.conflict ? workout.error : workout.duplicate ? "Bereits empfangen · keine zusätzliche Wertung" : status.latest?.mode === "book" ? "Gebucht" : "Neu · nur Vorschau"}</td></tr>)}</tbody></table></div></> : <p>Noch kein Trainingstest empfangen.</p>}
    <p>Mac: <code>npm run health:test -- --file /Pfad/export.zip --profile papa</code>. Erst lokale Vorschau prüfen, anschließend mit <code>--send</code> übertragen.</p>
    <p>Echte Wertung: zusätzlich <code>--book</code>. Den Trainingstag mit <code>--date YYYY-MM-DD</code> auswählen. Bei unbekannten Trainingsarten <code>--type strength</code> oder <code>--type endurance</code> angeben. Noch kein automatischer iPhone-Sync.</p>
    <p>Beim Trainingsstart „Ja“ nur auswählen, wenn du dieses Training später manuell über den Apple-Health-Export importierst. Der App-Timer gibt dann keine Punkte oder Ziel-/Levelminuten. Im Profil „Health-Training importieren“ öffnen, Export auswählen und Buchung bestätigen. Health-Zeiten werden ohne Gerätezuordnung gespeichert; Geräteminuten werden nicht geschätzt.</p>
  </article>;
}
