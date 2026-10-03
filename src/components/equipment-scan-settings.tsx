"use client";
import { useEffect, useState } from "react";
import { requestJson } from "@/lib/api-client";
type Config = { type: "strength" | "endurance"; exerciseId: string | null; exercises: { id: string; name: string }[]; baseUrl: string };
export function EquipmentScanSettings({ equipment, pin }: { equipment: { id: string; name: string; active: boolean }[]; pin: string }) {
  const [id, setId] = useState(equipment.find(e => e.active)?.id ?? "");
  const [config, setConfig] = useState<Config | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    requestJson<Config>(`/api/equipment/${encodeURIComponent(id)}/scan`, "Zuordnung konnte nicht geladen werden.").then(value => { if (alive) { setConfig(value); setNotice(""); } }).catch(error => { if (alive) setNotice(error.message); });
    return () => { alive = false; };
  }, [id]);
  const url = config ? `${config.baseUrl.replace(/\/$/, "")}/scan/geraet/${encodeURIComponent(id)}` : "";
  async function save() {
    if (!config) return;
    setBusy(true);
    try { await requestJson(`/api/equipment/${encodeURIComponent(id)}/scan`, "Speichern fehlgeschlagen.", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin, type: config.type, exerciseId: config.exerciseId }) }); setNotice("Scan-Zuordnung gespeichert."); }
    catch (e) { setNotice(e instanceof Error ? e.message : "Speichern fehlgeschlagen."); }
    finally { setBusy(false); }
  }
  return <article className="wide scan-settings"><h2>NFC &amp; QR · Training am Gerät</h2><p>Trainingsart und Standardübung speichern. Den Link auf einen NFC-Tag schreiben oder das QR-Etikett am Gerät befestigen.</p><div className="scan-fields"><label>Gerät<select value={id} onChange={e => { setId(e.target.value); setConfig(null); }}>{equipment.filter(e => e.active).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label>{config && <><label>Trainingsart<select value={config.type} onChange={e => setConfig({ ...config, type: e.target.value as Config["type"] })}><option value="strength">Kraft</option><option value="endurance">Ausdauer</option></select></label><label>Standardübung<select value={config.exerciseId ?? ""} onChange={e => setConfig({ ...config, exerciseId: e.target.value })}><option value="" disabled>Bitte auswählen</option>{config.exercises.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></label></>}</div>
  {config && <><div className="scan-actions"><button type="button" disabled={busy || !config.exerciseId} onClick={() => void save()}>Zuordnung speichern</button><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(url); setNotice("NFC-Link kopiert."); } catch { setNotice("Bitte den Link im Feld markieren und kopieren."); } }}>NFC-Link kopieren</button><a href={`/etikett/geraet/${encodeURIComponent(id)}`} target="_blank" rel="noreferrer">QR-Etikett drucken</a></div><label>Link für den NFC-Tag<input readOnly value={url} onFocus={e => e.target.select()} /></label>{!config.exercises.length && <p role="alert">Zuerst eine Übung für dieses Gerät anlegen.</p>}{!url.startsWith("https:") && <p>Für die dauerhafte Handy-Kopplung eine HTTPS-Adresse als APP_URL einrichten.</p>}<details><summary>Zusätzlicher Tag für eine bestimmte Übung</summary>{config.exercises.map(e => <p key={e.id}>{e.name} · <a href={`/etikett/uebung/${encodeURIComponent(e.id)}`} target="_blank" rel="noreferrer">QR-Etikett</a><input aria-label={`NFC-Link ${e.name}`} readOnly value={`${config.baseUrl.replace(/\/$/, "")}/scan/uebung/${encodeURIComponent(e.id)}`} onFocus={event => event.target.select()} /></p>)}</details></>}{notice && <p role="status">{notice}</p>}</article>;
}
