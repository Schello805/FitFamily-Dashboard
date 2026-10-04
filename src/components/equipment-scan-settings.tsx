"use client";
import { useEffect, useState } from "react";
import { requestJson } from "@/lib/api-client";
type Config = { type: "strength" | "endurance"; exerciseId: string | null; tagLabel?: string; exercises: { id: string; name: string }[]; baseUrl: string };
export function EquipmentScanSettings({ equipment, pin }: { equipment: { id: string; name: string; active: boolean }[]; pin: string }) {
  const [selectedId, setId] = useState(equipment.find(item => item.active)?.id ?? "");
  const activeEquipment = equipment.filter(item => item.active);
  const id = activeEquipment.some(item => item.id === selectedId) ? selectedId : activeEquipment[0]?.id ?? "";
  const [loaded, setLoaded] = useState<{ id: string; config: Config } | null>(null);
  const config = loaded?.id === id ? loaded.config : null;
  const [notice, setNotice] = useState("");
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!id) return;
    requestJson<Config>(`/api/equipment/${encodeURIComponent(id)}/scan`, "Zuordnung konnte nicht geladen werden.")
      .then(value => { if (alive) { setLoaded({ id, config: value }); setLoadError(""); } })
      .catch(error => { if (alive) setLoadError(error instanceof Error ? error.message : "Verbindung prüfen."); });
    return () => { alive = false; };
  }, [id, retry]);
  const url = config ? `${config.baseUrl.replace(/\/$/, "")}/scan/geraet/${encodeURIComponent(id)}` : "";
  function change(patch: Partial<Config>) { if (config) setLoaded({ id, config: { ...config, ...patch } }); }
  async function save() {
    if (!config) return;
    setBusy(true); setNotice("");
    try {
      await requestJson(`/api/equipment/${encodeURIComponent(id)}/scan`, "Speichern fehlgeschlagen.", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin, type: config.type, exerciseId: config.exerciseId, tagLabel: config.tagLabel ?? "" }) });
      setNotice("Scan-Zuordnung gespeichert.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Speichern fehlgeschlagen."); }
    finally { setBusy(false); }
  }
  return <article className="wide scan-settings">
    <h2>NFC &amp; QR · Training am Gerät</h2>
    <p>1. Gerät wählen · 2. Zuordnung speichern · 3. Link auf den NFC-Sticker schreiben oder QR-Etikett drucken.</p>
    <p>Der Sticker öffnet den Geräte-Link. Eine Hardware-Tag-ID ist nicht nötig. Das Schreiben erfolgt mit einer NFC-Schreib-App; der Browser beschreibt keinen Sticker.</p>
    {!activeEquipment.length && <p role="alert">Zuerst ein aktives Gerät in der Geräteverwaltung anlegen.</p>}
    <div className="scan-fields">
      <label>Gerät<select disabled={busy || !activeEquipment.length} value={id} onChange={event => { setId(event.target.value); setLoaded(null); setLoadError(""); setNotice(""); }}>
        {activeEquipment.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select></label>
      {config && <>
        <label>Trainingsart<select disabled={busy} value={config.type} onChange={event => change({ type: event.target.value as Config["type"] })}><option value="strength">Kraft</option><option value="endurance">Ausdauer</option></select></label>
        <label>Standardübung<select disabled={busy || !config.exercises.length} value={config.exerciseId ?? ""} onChange={event => change({ exerciseId: event.target.value })}>
          <option value="" disabled>Bitte auswählen</option>{config.exercises.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label>Tag-Bezeichnung (optional)<input maxLength={80} disabled={busy} value={config.tagLabel ?? ""} placeholder="z. B. Laufband · Sticker 01" onChange={event => change({ tagLabel: event.target.value })} /><small>Zur Wiedererkennung, nicht die technische NFC-ID.</small></label>
      </>}
    </div>
    {!config && id && !loadError && <p role="status">Zuordnung wird geladen …</p>}
    {loadError && <div role="alert"><p>{loadError}</p><button type="button" onClick={() => { setLoadError(""); setRetry(value => value + 1); }}>Erneut laden</button></div>}
    {config && <>
      {!config.exercises.length && <p role="alert">Für dieses Gerät fehlt eine aktive Übung. Unter „Übungen“ eine Übung anlegen und genau dieses Gerät zuordnen; anschließend hier erneut laden.</p>}
      <div className="scan-actions">
        <button type="button" disabled={busy || !config.exerciseId} onClick={() => void save()}>Zuordnung speichern</button>
        <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(url); setNotice("NFC-Link kopiert."); } catch { setNotice("Bitte den Link im Feld markieren und kopieren."); } }}>NFC-Link kopieren</button>
        <a href={`/etikett/geraet/${encodeURIComponent(id)}`} target="_blank" rel="noreferrer">QR-Etikett drucken</a>
        <button type="button" disabled={busy} onClick={() => { setLoaded(null); setRetry(value => value + 1); }}>Übungen neu laden</button>
      </div>
      <label>Link zum Schreiben auf den NFC-Sticker<input readOnly value={url} onFocus={event => event.target.select()} /></label>
      {!url.startsWith("https:") && <p>Für die dauerhafte Handy-Kopplung eine HTTPS-Adresse als APP_URL einrichten.</p>}
      <details><summary>Zusätzlicher Tag für eine bestimmte Übung</summary>{config.exercises.map(item => <div className="scan-exercise-link" key={item.id}><strong>{item.name}</strong><a href={`/etikett/uebung/${encodeURIComponent(item.id)}`} target="_blank" rel="noreferrer">QR-Etikett</a><input aria-label={`NFC-Link ${item.name}`} readOnly value={`${config.baseUrl.replace(/\/$/, "")}/scan/uebung/${encodeURIComponent(item.id)}`} onFocus={event => event.target.select()} /></div>)}</details>
    </>}
    {notice && <p role="status">{notice}</p>}
  </article>;
}
