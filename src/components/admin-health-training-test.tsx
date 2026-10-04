"use client";
import { useEffect, useState } from "react";
import { requestJson } from "@/lib/api-client";

type TestStatus = { configured: boolean; profiles: { id: string; name: string }[]; latest: { at: string; importId: string; profileName: string; mode?: "test" | "book"; saved: number; alreadyReceived: number; conflicts?: number; workouts: { startedAt: string; durationSeconds: number; sourceName: string; minutes: number; testPoints?: number; points?: number; duplicate: boolean; conflict?: boolean; error?: string }[] } | null };
export function AdminHealthTrainingTest() {
  const [status, setStatus] = useState<(TestStatus & {
    energyDaily?: { profile_id: string; profile_name: string; date: string; active_energy_kcal: number; step_count?: number | null; updated_at: string }[];
    energyAttempt?: { level: string; message: string; importId: string; errors?: string[] } | null;
    latestError?: { importId: string; message: string; errors: string[] } | null;
  }) | null>(null);
  const [secret, setSecret] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [shortcutProfile, setShortcutProfile] = useState("");
  const [shortcutServer, setShortcutServer] = useState("");
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
  return <article className="wide"><div className="admin-title"><div><h2>Health-Daten empfangen</h2><p>Aktive Energie: separate kcal-Anzeige, ohne Punkte und Trainingsminuten. Aufgezeichnete Trainings: weiterhin 1,5 Punkte pro aktiver Minute.</p></div></div>
    <div className="admin-actions"><button type="button" onClick={() => void createKey()} disabled={busy || !status}>{status?.configured ? "Familienschlüssel ersetzen" : "Familienschlüssel erstellen"}</button><button type="button" onClick={() => void refresh()} disabled={busy}>Empfang prüfen</button></div>
    {secret && <label>Familienschlüssel<input readOnly value={secret} aria-label="Familienschlüssel" onFocus={event => event.currentTarget.select()} /><button type="button" onClick={() => void copyKey()}>Schlüssel kopieren</button></label>}
    {status && <p>Profil-IDs: {status.profiles.map(profile => `${profile.name}: ${profile.id}`).join(" · ")}</p>}
    {notice && <p role="status">{notice}</p>}
    <section className="health-energy-settings" aria-label="Aktive Energie aus Apple Health">
      <h3>Aktive Energie · täglicher Kurzbefehl</h3>
      <p>Derselbe Familienschlüssel und deine Profil-ID. Wiederholter Empfang ersetzt den Tageswert, auch bei einer Korrektur nach unten. Keine Umrechnung in Training oder Punkte.</p>
      <h4>kcal-Tagesziel · manuell</h4>
      <p>Vorläufig 500 kcal pro Profil. Nicht aus Apple gelesen; Änderungen werden in FitFamily gespeichert.</p>
      {status?.profiles.map(profile => <form key={`${profile.id}:${"energyGoalKcal" in profile ? profile.energyGoalKcal : 500}`} onSubmit={async event => {
        event.preventDefault();
        const goalKcal = Number(new FormData(event.currentTarget).get("goalKcal"));
        setBusy(true); setNotice("");
        try {
          await requestJson("/api/admin/health-training-test", "Ziel konnte nicht gespeichert werden.", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId: profile.id, goalKcal }) });
          await refresh(); setNotice(`kcal-Ziel für ${profile.name} gespeichert.`);
        } catch (error) { setNotice(error instanceof Error ? error.message : "Ziel konnte nicht gespeichert werden."); }
        finally { setBusy(false); }
      }}><label>{profile.name} · kcal-Ziel<input aria-label={`kcal-Ziel für ${profile.name}`} name="goalKcal" type="number" required min="1" max="20000" step="1" defaultValue={"energyGoalKcal" in profile ? Number(profile.energyGoalKcal) : 500} /></label><button type="submit" disabled={busy}>Ziel speichern</button></form>)}
      <section className="health-shortcut-download" aria-label="Mac-Kurzbefehl herunterladen">
        <h4>Fertigen Kurzbefehl auf dem Mac erstellen</h4>
        <label>Profil<select value={shortcutProfile || status?.profiles[0]?.id || ""} onChange={event => setShortcutProfile(event.target.value)}>{status?.profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></label>
        <label>Serveradresse (optional)<input value={shortcutServer} onChange={event => setShortcutServer(event.target.value)} placeholder="Leer = Adresse dieser App; kein localhost auf dem iPhone" /></label>
        {status?.profiles.length ? <a className="health-shortcut-link" href={`/api/admin/health-shortcut?format=app&profileId=${encodeURIComponent(shortcutProfile || status.profiles[0].id)}${shortcutServer ? `&server=${encodeURIComponent(shortcutServer)}` : ""}`} download>Mac-App herunterladen · inklusive Kurzbefehl-Signierung</a> : null}
        <ol>
          <li>Auf dem Mac herunterladen, ZIP entpacken und „FitFamily-Kurzbefehl.app“ per Doppelklick öffnen. Keine Terminaleingabe nötig. Die Mac-App ist nicht notarisiert; macOS kann eine einmalige Freigabe unter Systemeinstellungen → Datenschutz &amp; Sicherheit verlangen. Keine Sicherheitsfunktionen abschalten.</li>
          <li>Das Skript erzeugt die Vorlage, lässt sie von Apple signieren und öffnet sie in Kurzbefehle. „Kurzbefehl hinzufügen“ bestätigen. Es gibt keine Konfigurationsfragen beim Import.</li>
          <li>Danach den Kurzbefehl bearbeiten und nur die zwei vorbereiteten Textfelder oben ersetzen: bekannter Familienschlüssel und exakter Name einer aktuellen Energie-Datenquelle aus Health. Keine Aktionen selbst anlegen. Der Schlüssel kommt erst nach der Signierung hinein; keinen ausgefüllten Kurzbefehl teilen.</li>
          <li>Mac und iPhone: derselbe Apple-Account, Kurzbefehle → Einstellungen → iCloud-Synchronisierung aktivieren. Dann den fertigen Kurzbefehl auf dem iPhone einmal ausführen und den Empfang hier prüfen.</li>
        </ol>
        <p>Diese Version überträgt Werte, Einheiten und Quellennamen als Text. Die App summiert nur die ausgewählte Quelle; kein „mal 1“ und keine lokale Zahlenumwandlung. Der Wert kann von Apples bereinigter Gesamtanzeige abweichen. Import/Health-Lauf noch auf deinem iPhone testen. Die tägliche Automation wird einmal auf dem iPhone eingerichtet.</p>
      </section>
      {status?.energyAttempt && <p role={status.energyAttempt.level === "error" ? "alert" : "status"}>{status.energyAttempt.message} {status.energyAttempt.errors?.join(" · ")} · Import-ID {status.energyAttempt.importId}</p>}
      {status?.energyDaily?.length ? <div className="health-test-table"><table><thead><tr><th>Profil</th><th>Tag</th><th>Aktive kcal</th><th>Schritte</th><th>Empfangen</th></tr></thead><tbody>{status.energyDaily.map(day => <tr key={`${day.profile_id}:${day.date}`}><td>{day.profile_name}</td><td>{day.date}</td><td>{day.active_energy_kcal.toLocaleString("de-DE", { maximumFractionDigits: 1 })}</td><td>{day.step_count == null ? "—" : day.step_count.toLocaleString("de-DE")}</td><td>{new Date(day.updated_at.replace(" ", "T") + "Z").toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}</td></tr>)}</tbody></table></div> : <p>Noch keine aktive Energie empfangen.</p>}
      <details><summary>Alternative: manuell einrichten und täglich ausführen</summary>
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
    <p>Beim Trainingsstart „Ja“ auswählen, wenn Watch oder Gymondo nach Health aufzeichnet. Der App-Timer gibt dann keine Punkte oder Ziel-/Levelminuten. Erst der Import zählt. Health-Zeiten werden ohne Gerätezuordnung gespeichert; Geräteminuten werden nicht geschätzt.</p>
  </article>;
}
