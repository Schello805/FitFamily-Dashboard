"use client";

import { HardDrive, RefreshCw } from "lucide-react";

export type SystemStatus = {
  database: { kind: "local" | "remote"; location: string; sizeBytes: number | null; error: string | null };
  applicationVolume: { availableBytes: number | null; totalBytes: number | null; error: string | null };
};

type AdminSystemStatusPanelProps = {
  status: SystemStatus | null;
  loading: boolean;
  onRefresh: () => void;
};

function formatStorage(bytes: number | null | undefined) {
  if (bytes == null || !Number.isFinite(bytes)) return "Nicht ermittelbar";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toLocaleString("de-DE", { maximumFractionDigits: 1 })} KiB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MiB`;
  if (bytes < 1024 ** 4) return `${(bytes / 1024 ** 3).toLocaleString("de-DE", { maximumFractionDigits: 2 })} GiB`;
  return `${(bytes / 1024 ** 4).toLocaleString("de-DE", { maximumFractionDigits: 2 })} TiB`;
}

export function AdminSystemStatusPanel({ status, loading, onRefresh }: AdminSystemStatusPanelProps) {
  return (
    <article className="wide">
      <div className="admin-title"><HardDrive /><div><h2>Speicherstatus</h2><p>Datenbankdatei und freier Speicher auf dem App-Server</p></div></div>
      <div className="update-status-grid data-status-grid">
        <div className="update-meta-box"><span>Datenbank</span><b>{status ? (status.database.sizeBytes == null ? "Größe nicht ermittelbar" : formatStorage(status.database.sizeBytes)) : "Noch nicht geladen"}</b><small>{status?.database.kind === "remote" ? "Externe Datenbank" : status?.database.location ?? ""}{status?.database.error ? ` · ${status.database.error}` : ""}</small></div>
        <div className="update-meta-box"><span>Freier Speicher · App-Server</span><b>{status ? formatStorage(status.applicationVolume.availableBytes) : "Noch nicht geladen"}</b><small>{status?.applicationVolume.totalBytes != null ? `von ${formatStorage(status.applicationVolume.totalBytes)} gesamt` : status?.applicationVolume.error ?? ""}</small></div>
      </div>
      <div className="data-tools-row">
        <span>{status ? "NAS-Kapazität wird nicht angezeigt, da ein nicht eingebundener Backup-Pfad sonst die Serverwerte liefern kann. Erreichbarkeit und Schreibrechte prüfst du unter Datensicherung." : "Speicherwerte werden nach dem Laden angezeigt."}</span>
        <button type="button" className="update-secondary-btn" disabled={loading} onClick={onRefresh}><RefreshCw className={loading ? "spin" : ""} /> {loading ? "Wird aktualisiert …" : "Speicherstatus aktualisieren"}</button>
      </div>
    </article>
  );
}
