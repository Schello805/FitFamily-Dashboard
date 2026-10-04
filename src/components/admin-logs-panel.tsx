"use client";

import { CheckCircle2, ClipboardList, Copy, RefreshCw } from "lucide-react";

export type AdminLogFilter = "all" | "errors" | "updates" | "backups" | "health";
export type AdminLogEntry = { id: string; action: string; createdAt: string; details: Record<string, unknown> };

type AdminLogsPanelProps = {
  entries: AdminLogEntry[];
  filter: AdminLogFilter;
  loading: boolean;
  copying: boolean;
  onFilterChange: (filter: AdminLogFilter) => void;
  onRefresh: () => void;
  onCopy: () => void;
};

export function summarizeAdminLog(entry: AdminLogEntry) {
  return typeof entry.details.message === "string" ? entry.details.message : entry.action;
}

const LOG_FILTERS: { id: AdminLogFilter; label: string }[] = [
  { id: "all", label: "Alle" },
  { id: "errors", label: "Fehler" },
  { id: "updates", label: "Updates" },
  { id: "backups", label: "Backups & Daten" },
  { id: "health", label: "Health · Übertragungen" }
];

export function AdminLogsPanel({ entries, filter, loading, copying, onFilterChange, onRefresh, onCopy }: AdminLogsPanelProps) {
  return (
    <article className="wide admin-logs-card">
      <div className="admin-title"><ClipboardList /><div><h2>Betriebsprotokoll</h2><p>App-Fehler, Updates, Daten- und Backup-Ereignisse.</p></div></div>
      <div className="admin-log-toolbar">
        <div className="admin-log-filters" role="group" aria-label="Protokoll filtern">
          {LOG_FILTERS.map(({ id, label }) => <button key={id} type="button" className={filter === id ? "active" : ""} onClick={() => onFilterChange(id)}>{label}</button>)}
        </div>
        <div>
          <button type="button" className="update-secondary-btn" disabled={loading} onClick={onRefresh}><RefreshCw className={loading ? "spin" : ""} /> Aktualisieren</button>
          <button type="button" className="update-secondary-btn" disabled={!entries.length || copying} onClick={onCopy}><Copy /> {copying ? "Kopiere …" : "Einträge kopieren"}</button>
        </div>
      </div>
      <p className="data-text admin-log-privacy">Bis zu 500 Einträge. Zugangsschlüssel werden nicht protokolliert. Laden nur nach PIN-Freigabe.</p>
      {loading ? <p className="data-text">Protokolle werden geladen …</p> : entries.length ? <ol className="admin-log-list">
        {entries.map((entry) => {
          const isError = entry.details.level === "error" || entry.action.endsWith(".error") || entry.action.endsWith(".failed");
          const timestamp = new Date(entry.createdAt.replace(" ", "T") + (entry.createdAt.endsWith("Z") ? "" : "Z"));
          return <li key={entry.id} className={isError ? "error" : ""}><div><span className="admin-log-level">{isError ? "FEHLER" : entry.details.level === "warning" ? "WARNUNG" : "INFO"}</span><time>{timestamp.toLocaleString("de-DE")}</time></div><b>{summarizeAdminLog(entry)}</b><small>{entry.action}</small>
            {entry.action.startsWith("health.") && <details><summary>Übertragungsprotokoll · Empfang und Ergebnis</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 360, overflow: "auto" }}>{JSON.stringify(entry.details, null, 2)}</pre></details>}
          </li>;
        })}
      </ol> : <div className="admin-log-empty"><CheckCircle2 /><span>{filter === "errors" ? "Keine protokollierten Fehler gefunden." : "Für diesen Filter gibt es noch keine Einträge."}</span></div>}
    </article>
  );
}
