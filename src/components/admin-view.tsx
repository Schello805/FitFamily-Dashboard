"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, Bot, CheckCircle2, Database, Download, HardDrive, Plus, RefreshCw, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { TouchPinpad } from "@/components/touch-pinpad";

type AiUsage = { requests: number; inputTokens: number; outputTokens: number; estimateUsd: number; updatedAt: string | null };
type Status = { openai: boolean; gemini: boolean; nas: boolean; models: { openai: string; gemini: string }; usage: { openai: AiUsage; gemini: AiUsage } };
type ExerciseMedia = { id: string; name: string; equipment: string; videoUrl: string | null };
type EquipmentItem = { id: string; name: string; quantity: number; available: boolean };
type UpdateInfo = { currentCommit: string; latestCommit: string; latestMessage: string; hasUpdate: boolean; version: string };

export function AdminView({ profiles, exercises, equipment }: { profiles: { id: string; name: string; score: number }[]; exercises: ExerciseMedia[]; equipment: EquipmentItem[] }) {
  const [pin, setPin] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [videoUrls, setVideoUrls] = useState<Record<string, string>>(() => Object.fromEntries(exercises.map((exercise) => [exercise.id, exercise.videoUrl ?? ""])));
  const [savingVideo, setSavingVideo] = useState<string | null>(null);
  const [equipmentItems, setEquipmentItems] = useState(equipment);
  const [equipmentEdits, setEquipmentEdits] = useState<Record<string, EquipmentItem>>(() => Object.fromEntries(equipment.map((item) => [item.id, item])));
  const [savingEquipment, setSavingEquipment] = useState<string | null>(null);
  const [newEquipmentName, setNewEquipmentName] = useState("");
  const [newEquipmentQuantity, setNewEquipmentQuantity] = useState(1);
  const [apiKeys, setApiKeys] = useState({ openai: "", gemini: "" });
  const [savingApi, setSavingApi] = useState<string | null>(null);

  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [runningUpdate, setRunningUpdate] = useState(false);
  const [updateCountdown, setUpdateCountdown] = useState<number | null>(null);

  async function checkUpdate(effectivePin?: string) {
    const pinToUse = effectivePin || pin;
    if (!pinToUse) return;
    setCheckingUpdate(true);
    try {
      const response = await fetch(`/api/admin/update?pin=${encodeURIComponent(pinToUse)}`);
      const data = await response.json();
      if (response.ok) {
        setUpdateInfo(data);
      } else {
        setNotice(data.error ?? "Update-Prüfung fehlgeschlagen.");
      }
    } catch {
      setNotice("Update-Server konnte nicht erreicht werden.");
    } finally {
      setCheckingUpdate(false);
    }
  }

  async function applyUpdate() {
    if (!window.confirm("Jetzt das Update einspielen? Ein Sicherheits-Backup der Datenbank wird automatisch erstellt, der neueste Stand wird geladen, gebaut und das Dashboard neu gestartet.")) return;
    setRunningUpdate(true);
    setNotice("Update wird ausgeführt: Neueste Version wird geladen und kompiliert. Bitte warten …");
    try {
      const response = await fetch("/api/admin/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin })
      });
      const data = await response.json();
      if (!response.ok) {
        setNotice(data.error ?? "Update fehlgeschlagen.");
        setRunningUpdate(false);
        return;
      }
      setNotice("Update erfolgreich abgeschlossen! Dashboard startet neu …");
      let countdown = 6;
      setUpdateCountdown(countdown);
      const timer = setInterval(() => {
        countdown -= 1;
        setUpdateCountdown(countdown);
        if (countdown <= 0) {
          clearInterval(timer);
          window.location.reload();
        }
      }, 1000);
    } catch {
      setNotice("Verbindung wird neu aufgebaut … Dashboard lädt in Kürze neu.");
      setTimeout(() => window.location.reload(), 4000);
    }
  }

  async function unlock(event?: React.FormEvent) {
    if (event) event.preventDefault();
    if (!pin || pin.length < 4) return;
    setVerifying(true);
    setError("");
    try {
      const response = await fetch("/api/admin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin })
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "Eltern-PIN ist falsch");
        setVerifying(false);
        return;
      }
      setStatus({ ...result.providers, usage: result.usage, models: result.models, nas: result.nas });
      void checkUpdate(pin);
    } catch {
      setError("Verbindungsfehler beim Prüfen der PIN");
    } finally {
      setVerifying(false);
    }
  }

  async function manageApiKey(provider: "openai" | "gemini", action: "save" | "remove" | "test") {
    setSavingApi(`${provider}-${action}`); setNotice("");
    try {
      const response = await fetch("/api/admin/ai-settings", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, provider, action, apiKey: apiKeys[provider] || undefined })
      });
      const result = await response.json();
      if (!response.ok) return setNotice(result.error ?? "API-Einstellung konnte nicht verarbeitet werden.");
      if (action === "test") setNotice(result.message ?? "API-Schlüssel ist gültig.");
      else {
        setStatus((current) => current ? { ...current, ...result.status, nas: current.nas } : current);
        if (action === "save") setApiKeys((current) => ({ ...current, [provider]: "" }));
        setNotice(action === "save" ? "API-Schlüssel wurde lokal gespeichert." : "API-Schlüssel wurde entfernt.");
      }
    } catch {
      setNotice("Keine Verbindung zum Dashboard. Bitte Heimnetz prüfen und erneut versuchen.");
    } finally {
      setSavingApi(null);
    }
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

  async function saveEquipment(id: string) {
    const item = equipmentEdits[id];
    setSavingEquipment(id); setNotice("");
    try {
      const response = await fetch(`/api/equipment/${encodeURIComponent(id)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, name: item.name, quantity: item.quantity, available: item.available })
      });
      const result = await response.json();
      if (!response.ok) return setNotice(result.error ?? "Gerät konnte nicht gespeichert werden.");
      setEquipmentItems((items) => items.map((entry) => entry.id === id ? result.equipment : entry));
      setEquipmentEdits((values) => ({ ...values, [id]: result.equipment }));
      setNotice("Gerätebestand gespeichert.");
    } catch {
      setNotice("Keine Verbindung. Bitte Heimnetz prüfen und erneut versuchen.");
    } finally {
      setSavingEquipment(null);
    }
  }

  async function addEquipment(event: React.FormEvent) {
    event.preventDefault(); setNotice("");
    try {
      const response = await fetch("/api/equipment", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, name: newEquipmentName, quantity: newEquipmentQuantity })
      });
      const result = await response.json();
      if (!response.ok) return setNotice(result.error ?? "Gerät konnte nicht ergänzt werden.");
      setEquipmentItems((items) => [...items, result.equipment].sort((a, b) => a.name.localeCompare(b.name, "de")));
      setEquipmentEdits((values) => ({ ...values, [result.equipment.id]: result.equipment }));
      setNewEquipmentName(""); setNewEquipmentQuantity(1); setNotice("Gerät wurde ergänzt.");
    } catch {
      setNotice("Keine Verbindung. Bitte Heimnetz prüfen und erneut versuchen.");
    }
  }

  if (!status) {
    return (
      <main className="mobile-page">
        <form className="admin-login" onSubmit={unlock}>
          <div className="pair-icon">
            <ShieldCheck />
          </div>
          <span className="setup-badge">Geschützter Bereich</span>
          <h1>Verwaltung</h1>
          <p>Einstellungen, Exporte und Updates sind mit dem Eltern-PIN geschützt.</p>

          <TouchPinpad
            value={pin}
            onChange={(val) => {
              setPin(val);
              if (error) setError("");
            }}
            disabled={verifying}
          />

          <input
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            aria-label="Eltern-PIN"
            style={{ position: "absolute", opacity: 0, pointerEvents: "none", height: 0, width: 0 }}
            value={pin}
            onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 8))}
          />

          {error && <p className="form-error">{error}</p>}
          <button className="primary-submit" disabled={verifying || pin.length < 4}>
            {verifying ? "Wird geprüft …" : "Entsperren"}
          </button>
          <Link href="/">
            <ArrowLeft /> Dashboard
          </Link>
        </form>
      </main>
    );
  }

  return <main className="admin-page"><header><Link href="/"><ArrowLeft /> Dashboard</Link><div><span>Elternbereich</span><h1>Verwaltung</h1></div></header>{notice && <p className="notice">{notice}</p>}
    <section className="admin-grid"><article><div className="admin-title"><Database /><div><h2>Meine Daten</h2><p>Vollständiger lokaler Datenbestand</p></div></div><ul><li><CheckCircle2 /> Profildaten und Geburtsdaten</li><li><CheckCircle2 /> Trainings- und Punkteverlauf</li><li><CheckCircle2 /> Pläne und Änderungsprotokoll</li></ul><button onClick={download}><Download /> JSON herunterladen</button></article>
      <article className="wide update-card">
        <div className="admin-title"><RefreshCw className={checkingUpdate || runningUpdate ? "spin" : ""} /><div><h2>Software-Update</h2><p>Dashboard auf den neuesten Stand von GitHub bringen</p></div></div>
        <div className="update-status-grid">
          <div className="update-meta-box"><span>Installierte Version</span><b>v{updateInfo?.version ?? "0.1.0"} {updateInfo ? `(${updateInfo.currentCommit})` : ""}</b></div>
          <div className="update-meta-box"><span>GitHub Repository</span><b className={updateInfo?.hasUpdate ? "update-tag-new" : "update-tag-current"}>{updateInfo ? (updateInfo.hasUpdate ? `Neues Update verfügbar (${updateInfo.latestCommit})` : `Aktuell (${updateInfo.latestCommit})`) : (checkingUpdate ? "Prüfung läuft …" : "Noch nicht geprüft")}</b></div>
        </div>
        {updateInfo?.hasUpdate && (
          <div className="update-alert-banner"><Sparkles /><div><b>Neues Update bereit zur Installation</b><p className="update-commit-log">&bdquo;{updateInfo.latestMessage}&ldquo;</p></div></div>
        )}
        <div className="update-action-row">
          <button type="button" className="update-secondary-btn" disabled={checkingUpdate || runningUpdate} onClick={() => void checkUpdate()}><RefreshCw className={checkingUpdate ? "spin" : ""} />{checkingUpdate ? "Prüfe …" : "Jetzt prüfen"}</button>
          {updateInfo?.hasUpdate && (
            <button type="button" className="primary-update-btn" disabled={runningUpdate} onClick={() => void applyUpdate()}>{runningUpdate ? (<><RefreshCw className="spin" />Wird aktualisiert & neu gebaut …</>) : (<><Sparkles />1-Click Update einspielen</>)}</button>
          )}
        </div>
        {updateCountdown !== null && (
          <div className="update-countdown-alert">Dienst wurde neu gestartet. Das Dashboard lädt neu in <b>{updateCountdown}</b> Sekunden …</div>
        )}
        <p className="data-text">Vor dem Einspielen wird automatisch ein SQLite-Backup unter <code>backups/</code> angelegt. Alternativ im Terminal per <code>sudo /opt/fitfamily/scripts/update.sh</code> oder <code>npm run update</code>.</p>
      </article>
      <article className="wide"><div className="admin-title"><Bot /><div><h2>KI-Integrationen</h2><p>API-Schlüssel lokal auf diesem Gerät speichern – ohne Code oder Serverdatei.</p></div></div>
        {(["openai", "gemini"] as const).map((provider) => {
          const usage = status.usage[provider];
          const label = provider === "openai" ? "OpenAI" : "Google Gemini";
          return <section className="ai-provider" key={provider}>
            <div className="ai-provider-heading"><div><b>{label}</b><small>{status.models[provider]}</small></div><b className={status[provider] ? "ok" : "off"}>{status[provider] ? "Eingerichtet" : "Nicht eingerichtet"}</b></div>
            <label className="api-key-field">API-Schlüssel<input type="password" autoComplete="new-password" placeholder={status[provider] ? "Gespeichert – leer lassen, um ihn beizubehalten" : "Schlüssel hier einfügen"} value={apiKeys[provider]} onChange={(event) => setApiKeys((current) => ({ ...current, [provider]: event.target.value }))} /></label>
            <div className="api-key-actions"><button disabled={Boolean(savingApi)} onClick={() => manageApiKey(provider, "save")}>Schlüssel speichern</button><button disabled={Boolean(savingApi)} onClick={() => manageApiKey(provider, "test")}>Schlüssel testen</button>{status[provider] && <button className="api-remove" disabled={Boolean(savingApi)} onClick={() => manageApiKey(provider, "remove")}>Entfernen</button>}</div>
            <div className="ai-usage"><b>{usage.estimateUsd.toLocaleString("de-DE", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 4 })}</b><span>geschätzte API-Kosten · {usage.requests} Anfragen · {(usage.inputTokens + usage.outputTokens).toLocaleString("de-DE")} Token</span></div>
          </section>;
        })}
        <p className="data-text">Die Verbrauchserfassung beginnt ab jetzt und umfasst nur KI-Pläne, die über diese App erstellt werden. Die Kostenschätzung nutzt die erfassten Token und aktuelle Standardpreise; sie kann von der Anbieterabrechnung abweichen und zeigt keine frühere Nutzung. <a href="https://developers.openai.com/api/docs/pricing" target="_blank" rel="noreferrer">OpenAI-Preise</a> · <a href="https://ai.google.dev/gemini-api/docs/pricing" target="_blank" rel="noreferrer">Gemini-Preise</a>.</p>
      </article>
      <article><div className="admin-title"><HardDrive /><div><h2>NAS-Backup</h2><p>Speicherort</p></div></div><div className="status-row"><span>Verbindung</span><b className={status.nas ? "ok" : "off"}>{status.nas ? "Bereit" : "Nicht eingerichtet"}</b></div></article>
      <article className="wide"><div className="admin-title"><RotateCcw /><div><h2>Scores zurücksetzen</h2><p>Der vollständige Trainingsverlauf bleibt erhalten.</p></div></div><div className="reset-list">{profiles.map((profile) => <div key={profile.id}><span>{profile.name}<small>{profile.score} Punkte</small></span><button onClick={() => reset(profile.id)}>Auf 0 setzen</button></div>)}</div></article>
      <article className="wide"><div className="admin-title"><HardDrive /><div><h2>Speicherorte</h2><p>Transparenz über vorhandene Daten</p></div></div><p className="data-text">Stammdaten, Training und Pläne: lokale SQLite-Datenbank · Backups: {status.nas ? "verschlüsselt auf NAS" : "noch nicht eingerichtet"} · Wetter: Open-Meteo · KI: nur bei bewusster Planerstellung.</p></article>
      <article className="wide"><div className="admin-title"><Database /><div><h2>Geräte im Sportraum</h2><p>Stückzahl und Verfügbarkeit für Übungsauswahl und neue Trainingspläne</p></div></div><div className="inventory-list">{equipmentItems.map((item) => { const edit = equipmentEdits[item.id] ?? item; return <div className="inventory-row" key={item.id}><label>Gerätename<input value={edit.name} maxLength={60} onChange={(event) => setEquipmentEdits((values) => ({ ...values, [item.id]: { ...edit, name: event.target.value } }))} /></label><label className="quantity-field">Anzahl<input type="number" min={1} max={8} value={edit.quantity} onChange={(event) => setEquipmentEdits((values) => ({ ...values, [item.id]: { ...edit, quantity: Number(event.target.value) } }))} /></label><label className="inventory-toggle"><input type="checkbox" checked={edit.available} onChange={(event) => setEquipmentEdits((values) => ({ ...values, [item.id]: { ...edit, available: event.target.checked } }))} /> Verfügbar</label><button disabled={savingEquipment === item.id} onClick={() => saveEquipment(item.id)}>{savingEquipment === item.id ? "Speichert …" : "Speichern"}</button></div>; })}</div><form className="inventory-add" onSubmit={addEquipment}><label>Weiteres Gerät<input required minLength={2} maxLength={60} placeholder="z. B. Hantelbank" value={newEquipmentName} onChange={(event) => setNewEquipmentName(event.target.value)} /></label><label className="quantity-field">Anzahl<input type="number" min={1} max={8} value={newEquipmentQuantity} onChange={(event) => setNewEquipmentQuantity(Number(event.target.value))} /></label><button><Plus /> Gerät ergänzen</button></form><p className="data-text">Deaktivierte Geräte bleiben im bisherigen Trainingsverlauf erhalten, werden aber künftig nicht zur Auswahl angeboten.</p></article>
      <article className="wide"><div className="admin-title"><CheckCircle2 /><div><h2>Übungsvideos</h2><p>Eigene YouTube-Anleitungen pro Übung hinterlegen; leere Felder zeigen eine YouTube-Suche.</p></div></div><div className="exercise-media-list">{exercises.map((exercise) => <div key={exercise.id}><label><span>{exercise.name}<small>{exercise.equipment}</small></span><input type="url" inputMode="url" placeholder="https://youtube.com/..." value={videoUrls[exercise.id] ?? ""} onChange={(event) => setVideoUrls((values) => ({ ...values, [exercise.id]: event.target.value }))} /></label><button disabled={savingVideo === exercise.id} onClick={() => saveVideo(exercise.id)}>{savingVideo === exercise.id ? "Speichert …" : "Speichern"}</button></div>)}</div></article>
    </section>
  </main>;
}
