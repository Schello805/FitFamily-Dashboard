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

const HEALTH_ACTIVITY_FIELD_LABELS: Record<string, string> = {
  moveCalories: "Aktivitätsenergie",
  moveGoal: "Bewegen-Ziel",
  exerciseMinutes: "Trainingsminuten",
  exerciseGoal: "Trainingsziel",
  standHours: "Stehstunden",
  standGoal: "Stehziel",
  stepCount: "Schritte",
  walkingRunningDistanceKm: "Geh-/Laufstrecke",
  cyclingDistanceKm: "Radstrecke",
  flightsClimbed: "Etagen"
};

export function summarizeAdminLog(entry: AdminLogEntry) {
  if (!entry.action.startsWith("health.apple_sync.")) {
    return typeof entry.details.message === "string" ? entry.details.message : entry.action;
  }

  const parts: string[] = [];
  if (entry.details.received !== undefined) parts.push(`${entry.details.received} Trainingseinheiten empfangen`);
  if (entry.details.imported !== undefined) parts.push(`${entry.details.imported} Trainingseinheiten importiert`);
  if (entry.details.skipped !== undefined) parts.push(`${entry.details.skipped} Trainingseinheiten übersprungen`);
  if (entry.details.activityDaysSynced !== undefined) {
    const count = Number(entry.details.activityDaysSynced);
    parts.push(`${count} ${count === 1 ? "Tagesdatensatz gespeichert" : "Tagesdatensätze gespeichert"}`);
  }

  const activityDays = Array.isArray(entry.details.activityDays)
    ? entry.details.activityDays.flatMap((value) => {
        if (!value || typeof value !== "object") return [];
        const day = value as { date?: unknown; fields?: unknown };
        if (typeof day.date !== "string" || !Array.isArray(day.fields)) return [];
        const fields = day.fields.filter((field): field is string => typeof field === "string")
          .map((field) => HEALTH_ACTIVITY_FIELD_LABELS[field] ?? field);
        return fields.length ? [`${day.date}: ${fields.join(", ")}`] : [];
      })
    : [];
  if (activityDays.length) parts.push(`Tageswerte – ${activityDays.join("; ")}`);
  if (typeof entry.details.message === "string") parts.push(entry.details.message);
  if (!parts.length) parts.push(entry.action.endsWith(".failed") ? "Apple-Health-Sync fehlgeschlagen." : "Apple-Health-Sync eingegangen.");
  return `Apple Health · ${parts.join(" · ")}`;
}

const LOG_FILTERS: { id: AdminLogFilter; label: string }[] = [
  { id: "all", label: "Alle" },
  { id: "errors", label: "Fehler" },
  { id: "updates", label: "Updates" },
  { id: "backups", label: "Backups & Daten" },
  { id: "health", label: "Apple Health" }
];

export function AdminLogsPanel({ entries, filter, loading, copying, onFilterChange, onRefresh, onCopy }: AdminLogsPanelProps) {
  return (
    <article className="wide admin-logs-card">
      <div className="admin-title"><ClipboardList /><div><h2>Betriebsprotokoll</h2><p>App-Fehler, Updates, Daten- und Backup-Ereignisse sowie Apple-Health-Synchronisierungen.</p></div></div>
      <div className="admin-log-toolbar">
        <div className="admin-log-filters" role="group" aria-label="Protokoll filtern">
          {LOG_FILTERS.map(({ id, label }) => <button key={id} type="button" className={filter === id ? "active" : ""} onClick={() => onFilterChange(id)}>{label}</button>)}
        </div>
        <div>
          <button type="button" className="update-secondary-btn" disabled={loading} onClick={onRefresh}><RefreshCw className={loading ? "spin" : ""} /> Aktualisieren</button>
          <button type="button" className="update-secondary-btn" disabled={!entries.length || copying} onClick={onCopy}><Copy /> {copying ? "Kopiere …" : "Einträge kopieren"}</button>
        </div>
      </div>
      <p className="data-text admin-log-privacy">Bis zu 500 Einträge. Neue Apple-Health-Importe zeigen empfangene und gespeicherte Tageswerte. Zugangsschlüssel werden nicht protokolliert. Laden nur nach PIN-Freigabe.</p>
      {loading ? <p className="data-text">Protokolle werden geladen …</p> : entries.length ? <ol className="admin-log-list">
        {entries.map((entry) => {
          const isHealth = entry.action.startsWith("health.apple_sync.");
          const isError = entry.details.level === "error" || entry.action.endsWith(".error") || entry.action.endsWith(".failed");
          const timestamp = new Date(entry.createdAt.replace(" ", "T") + (entry.createdAt.endsWith("Z") ? "" : "Z"));
          return <li key={entry.id} className={isError ? "error" : ""}><div><span className="admin-log-level">{isError ? "FEHLER" : isHealth ? "APPLE HEALTH" : entry.details.level === "warning" ? "WARNUNG" : "INFO"}</span><time>{timestamp.toLocaleString("de-DE")}</time></div><b>{summarizeAdminLog(entry)}</b><small>{entry.action}</small>
            {isHealth && <small>Import-ID: {entry.id}</small>}
            {isHealth && Array.isArray(entry.details.validationErrors) && <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{entry.details.validationErrors.join("\n")}</pre>}
            {isHealth && entry.details.receivedActivity != null && <details><summary>Empfangene und gespeicherte Werte{typeof entry.details.profileName === "string" ? ` · ${entry.details.profileName}` : ""}</summary><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", userSelect: "text" }}>{JSON.stringify({ empfangen: entry.details.receivedActivity, gespeichert: entry.details.savedActivity, hinweise: entry.details.warnings }, null, 2)}</pre></details>}
          </li>;
        })}
      </ol> : <div className="admin-log-empty"><CheckCircle2 /><span>{filter === "errors" ? "Keine protokollierten Fehler gefunden." : "Für diesen Filter gibt es noch keine Einträge."}</span></div>}
    </article>
  );
}
