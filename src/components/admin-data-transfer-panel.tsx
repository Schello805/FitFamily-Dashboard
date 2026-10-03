"use client";

import { ChangeEvent } from "react";
import { CheckCircle2, Download, Upload } from "lucide-react";

export type ImportValidation = { valid: boolean; total: number; counts: Record<string, number>; errors: string[] };

type AdminDataTransferPanelProps = {
  file: File | null;
  validation: ImportValidation | null;
  canImport: boolean;
  validating: boolean;
  importing: boolean;
  onFileChange: (file: File | null) => void;
  onDownload: () => void;
  onValidate: () => void;
  onImport: () => void;
};

export function AdminDataTransferPanel({ file, validation, canImport, validating, importing, onFileChange, onDownload, onValidate, onImport }: AdminDataTransferPanelProps) {
  return <>
    <article>
      <div className="admin-title"><Download /><div><h2>Daten exportieren</h2><p>Portable Daten zum Übertragen oder Zusammenführen herunterladen</p></div></div>
      <ul><li><CheckCircle2 /> Profile, Geräte, Übungen und Pläne</li><li><CheckCircle2 /> Trainings- und Apple-Health-Daten</li><li><CheckCircle2 /> Keine PIN-, KI- oder Backup-Schlüssel</li></ul>
      <button type="button" onClick={onDownload}><Download /> JSON herunterladen</button>
    </article>

    <article>
      <div className="admin-title"><Upload /><div><h2>JSON-Daten zusammenführen</h2><p>Datei prüfen und portable Daten ergänzen oder aktualisieren</p></div></div>
      <label className="data-import-file">JSON-Datei auswählen<input type="file" accept=".json,application/json" onChange={(event: ChangeEvent<HTMLInputElement>) => onFileChange(event.target.files?.[0] ?? null)} /></label>
      <div className="data-import-actions">
        <button type="button" className="update-secondary-btn" disabled={!file || validating} onClick={onValidate}>{validating ? "Prüfe Datei …" : "Datei prüfen"}</button>
        <button type="button" className="primary-update-btn" disabled={!validation?.valid || !canImport || importing} onClick={onImport}>{importing ? "Import läuft …" : "Geprüfte Daten übernehmen"}</button>
      </div>
      {validation && <div className={`import-validation ${validation.valid ? "valid" : "invalid"}`} role="status">
        <b>{validation.valid ? `Datei gültig · ${validation.total} Datensätze` : "Datei konnte nicht freigegeben werden"}</b>
        {validation.valid && <p>{Object.entries(validation.counts).filter(([, count]) => count > 0).map(([name, count]) => `${name.replaceAll("_", " ")}: ${count}`).join(" · ")}</p>}
        {validation.errors.map((message, index) => <p key={`${index}-${message}`}>{message}</p>)}
        {validation.valid && <small>Der JSON-Import ist eine Zusammenführung, keine vollständige Wiederherstellung: gleiche IDs werden aktualisiert, nicht enthaltene lokale Datensätze bleiben erhalten. Zugangsschlüssel werden nicht importiert.</small>}
      </div>}
    </article>
  </>;
}
