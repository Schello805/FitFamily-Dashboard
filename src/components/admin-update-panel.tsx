"use client";

import { RefreshCw, Sparkles } from "lucide-react";

export type UpdateInfo = { currentCommit: string; latestCommit: string; latestMessage: string; hasUpdate: boolean; version: string; latestVersion?: string };
export type UpdateSuccess = { version?: string; commit?: string };

type AdminUpdatePanelProps = {
  info: UpdateInfo | null;
  installedVersion: string;
  installedCommit?: string;
  success: UpdateSuccess | null;
  checking: boolean;
  running: boolean;
  countdown: number | null;
  onDismissSuccess: () => void;
  onCheck: () => void;
  onInstall: () => void;
};

export function AdminUpdatePanel({ info, installedVersion, installedCommit, success, checking, running, countdown, onDismissSuccess, onCheck, onInstall }: AdminUpdatePanelProps) {
  return (
    <article className="wide update-card">
      <div className="admin-title"><RefreshCw className={checking || running ? "spin" : ""} /><div><h2>Software-Update</h2><p>Dashboard auf den neuesten Stand von GitHub bringen</p></div></div>
      {success && <div className="update-alert-banner" style={{ background: "color-mix(in srgb, var(--brand) 15%, var(--subtle-bg))", borderColor: "var(--brand)", marginBottom: "16px" }}>
        <Sparkles size={24} style={{ color: "var(--brand-bright)", flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <b style={{ color: "var(--text)" }}>Update erfolgreich installiert!</b>
            <span style={{ fontSize: "11px", fontWeight: "800", padding: "2px 8px", borderRadius: "999px", background: "var(--brand)", color: "#06201d" }}>v{success.version}{success.commit ? ` · Build ${success.commit}` : ""}</span>
          </div>
          <p className="update-commit-log" style={{ margin: "4px 0 0" }}>Das Dashboard wurde neu gebaut, neu gestartet und läuft ab sofort auf der aktuellsten Version.</p>
        </div>
        <button type="button" className="modal-close" style={{ position: "static", width: "32px", height: "32px", fontSize: "18px" }} onClick={onDismissSuccess} aria-label="Hinweis schließen">×</button>
      </div>}

      <div className="update-status-grid">
        <div className="update-meta-box"><span>Auf diesem Gerät installiert</span><b>v{installedVersion}</b>{installedCommit && <small>Build {installedCommit}</small>}</div>
        <div className="update-meta-box"><span>Neuer Stand auf GitHub</span><b className={info?.hasUpdate ? "update-tag-new" : "update-tag-current"}>{info ? (info.hasUpdate ? `Update verfügbar · v${info.latestVersion || installedVersion}` : `Auf aktuellem Stand · v${installedVersion}`) : (checking ? "Prüfung läuft …" : "Noch nicht geprüft")}</b>{info?.latestCommit && <small>Build {info.latestCommit}</small>}</div>
      </div>
      {info?.hasUpdate && <div className="update-alert-banner"><Sparkles /><div><b>Ein Update ist bereit.</b><p className="update-commit-log">Vor der Installation wird automatisch eine Sicherung deiner Daten erstellt.</p></div></div>}
      <div className="update-action-row">
        <button type="button" className="update-secondary-btn" disabled={checking || running} onClick={onCheck}><RefreshCw className={checking ? "spin" : ""} />{checking ? "Prüfe …" : "Nach Updates suchen"}</button>
        {info?.hasUpdate && <button type="button" className="primary-update-btn" disabled={running} onClick={onInstall}>{running ? <><RefreshCw className="spin" />Update läuft …</> : <><Sparkles />Update installieren</>}</button>}
      </div>
      {countdown !== null && <div className="update-countdown-alert">Dienst wurde neu gestartet. Das Dashboard lädt neu in <b>{countdown}</b> Sekunden …</div>}
    </article>
  );
}
