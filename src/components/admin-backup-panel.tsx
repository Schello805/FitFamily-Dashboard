"use client";

import { HardDrive, RefreshCw } from "lucide-react";
import { formatGermanDateTime } from "@/lib/date-format";

export type BackupInfo = { name: string; sizeBytes: number; sizeFormatted: string; date: string };
export type BackupStatus = {
  configured: boolean;
  path: string;
  hasEncryptionKey: boolean;
  accessible: boolean;
  writable: boolean;
  statusMessage: string;
  backupCount: number;
  lastBackup: BackupInfo | null;
};

type AdminBackupPanelProps = {
  status: BackupStatus | null;
  path: string;
  encryptionKey: string;
  server: string;
  share: string;
  username: string;
  password: string;
  showMountForm: boolean;
  showAdvanced: boolean;
  saving: boolean;
  testing: boolean;
  backingUp: boolean;
  mounting: boolean;
  onPathChange: (value: string) => void;
  onKeyChange: (value: string) => void;
  onServerChange: (value: string) => void;
  onShareChange: (value: string) => void;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onToggleMountForm: () => void;
  onToggleAdvanced: () => void;
  onSavePath: () => void;
  onTestConnection: () => void;
  onStartBackup: () => void;
  onMountShare: () => void;
};

export function AdminBackupPanel({
  status, path, encryptionKey, server, share, username, password,
  showMountForm, showAdvanced, saving, testing, backingUp, mounting,
  onPathChange, onKeyChange, onServerChange, onShareChange, onUsernameChange, onPasswordChange,
  onToggleMountForm, onToggleAdvanced, onSavePath, onTestConnection, onStartBackup, onMountShare
}: AdminBackupPanelProps) {
  return (
    <article className="wide backup-card">
      <div className="admin-title">
        <HardDrive className={backingUp || testing ? "spin" : ""} />
        <div><h2>NAS-Datensicherung</h2><p>Verschlüsselter vollständiger Datenbank-Snapshot auf deiner Netzwerkfreigabe</p></div>
      </div>

      <div className="update-status-grid">
        <div className="update-meta-box">
          <span>Status</span>
          <b className={status?.writable ? "backup-status-tag-ok" : status?.configured ? "backup-status-tag-error" : "backup-status-tag-off"}>
            {status?.writable ? "Bereit & Beschreibbar" : status?.configured ? "Pfad nicht beschreibbar" : "Nicht eingerichtet"}
          </b>
          <small style={{ display: "block", marginTop: "4px", fontSize: "11px", color: "var(--muted)" }}>{status?.statusMessage ?? "Kein Pfad hinterlegt."}</small>
        </div>
        <div className="update-meta-box">
          <span>Letztes Backup</span>
          <b>{status?.lastBackup ? status.lastBackup.sizeFormatted : "Noch keins vorhanden"}</b>
          <small style={{ display: "block", marginTop: "4px", fontSize: "11px", color: "var(--muted)" }}>
            {status?.lastBackup ? `${status.lastBackup.name} (${formatGermanDateTime(status.lastBackup.date)})` : `${status?.backupCount ?? 0} Sicherungen`}
          </small>
        </div>
      </div>

      <label className="api-key-field" style={{ marginTop: "16px" }}>
        NAS-Sicherungspfad (lokaler Einhängepfad)
        <input type="text" placeholder="/mnt/nas/fitfamily oder /volume1/backup/fitfamily" value={path} onChange={(event) => onPathChange(event.target.value)} />
      </label>

      <div style={{ marginTop: "6px" }}>
        <button type="button" className="backup-advanced-toggle" style={{ fontSize: "12px", color: "var(--brand)", background: "transparent", border: 0, padding: 0, cursor: "pointer", fontWeight: 700 }} onClick={onToggleMountForm}>
          {showMountForm ? "▾ Netzlaufwerk-Assistent schließen" : "▸ Netzlaufwerk (SMB/CIFS) automatisch einhängen"}
        </button>
        {showMountForm && <div style={{ marginTop: "10px", padding: "14px", border: "1px solid var(--line)", borderRadius: "12px", background: "var(--subtle-bg)", display: "grid", gap: "10px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text)" }}>NAS-Freigabe direkt über das Frontend mounten:</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <label className="api-key-field" style={{ margin: 0 }}>Server / IP<input type="text" placeholder="192.168.1.100 oder diskstation" value={server} onChange={(event) => onServerChange(event.target.value)} /></label>
            <label className="api-key-field" style={{ margin: 0 }}>Freigabe / optionaler Unterordner<input type="text" placeholder="Public/fitfamily" value={share} onChange={(event) => onShareChange(event.target.value)} /><small>Bei „Public/fitfamily“ wird die Freigabe „Public“ und darin der Ordner „fitfamily“ verwendet.</small></label>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <label className="api-key-field" style={{ margin: 0 }}>Benutzername (optional)<input type="text" placeholder="z. B. admin" value={username} onChange={(event) => onUsernameChange(event.target.value)} /></label>
            <label className="api-key-field" style={{ margin: 0 }}>Passwort (optional)<input type="password" placeholder="Passwort" value={password} onChange={(event) => onPasswordChange(event.target.value)} /></label>
          </div>
          <button type="button" className="update-secondary-btn" style={{ justifySelf: "start", marginTop: "4px" }} disabled={mounting || !server.trim() || !share.trim()} onClick={onMountShare}>
            <HardDrive className={mounting ? "spin" : ""} size={16} /><span>{mounting ? "Verbinde Netzlaufwerk …" : "Netzlaufwerk jetzt verbinden & mounten"}</span>
          </button>
        </div>}
      </div>

      <div className="update-action-row">
        <button type="button" className="update-secondary-btn" disabled={saving || testing || backingUp} onClick={onSavePath}>{saving ? "Speichert …" : "Pfad speichern"}</button>
        <button type="button" className="update-secondary-btn" disabled={saving || testing || backingUp || !path.trim()} onClick={onTestConnection}><RefreshCw className={testing ? "spin" : ""} />{testing ? "Prüfe Freigabe …" : "Freigabe-Zugriff prüfen"}</button>
        <button type="button" className="primary-update-btn" disabled={saving || testing || backingUp || !status?.writable} onClick={onStartBackup}><HardDrive className={backingUp ? "spin" : ""} />{backingUp ? "Backup wird erstellt …" : "Jetzt sichern"}</button>
      </div>

      <button type="button" className="backup-advanced-toggle" onClick={onToggleAdvanced}>{showAdvanced ? "▾" : "▸"} Verschlüsselung (AES-256-GCM) anpassen</button>
      {showAdvanced && <div style={{ marginTop: "10px", padding: "12px", border: "1px solid var(--line)", borderRadius: "12px", background: "var(--subtle-bg)" }}>
        <label className="api-key-field" style={{ marginTop: 0 }}>Backup-Passphrase (mindestens 16 Zeichen)<input type="password" autoComplete="new-password" placeholder={status?.hasEncryptionKey ? "Schlüssel aktiv (leer lassen zum Beibehalten)" : "Optionaler eigener Schlüssel"} value={encryptionKey} onChange={(event) => onKeyChange(event.target.value)} /></label>
        <p className="data-text" style={{ fontSize: "11px", marginTop: "6px" }}>Backups werden standardmäßig mit einem sicheren AES-256-GCM-Schlüssel verschlüsselt. Wenn du hier einen eigenen Schlüssel einträgst, wird dieser für künftige Sicherungen genutzt.</p>
      </div>}

      <p className="data-text" style={{ marginTop: "14px" }}>Der NAS-Snapshot enthält den vollständigen Datenbestand. Eine Wiederherstellung aus diesem Snapshot ist derzeit nicht in der App verfügbar. Alte Stände werden automatisch nach 7 Tagen, 4 Wochen und 12 Monaten rotiert.</p>
    </article>
  );
}
