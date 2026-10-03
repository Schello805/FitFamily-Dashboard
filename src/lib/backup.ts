import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { db, getSetting } from "@/lib/db";
import { createVerifiedDatabaseSnapshot } from "@/lib/sqlite-snapshot";
import { encryptDatabase, recoverDatabase } from "@/lib/backup-format.mjs";

export type BackupInfo = {
  name: string;
  sizeBytes: number;
  sizeFormatted: string;
  date: string;
};

export type BackupSettings = {
  configured: boolean;
  path: string;
  hasEncryptionKey: boolean;
  accessible: boolean;
  writable: boolean;
  statusMessage: string;
  backupCount: number;
  lastBackup: BackupInfo | null;
};

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function getBackupConfiguredPath(): Promise<string | null> {
  const stored = await getSetting("nas_backup_path");
  if (stored && stored.trim()) return stored.trim();
  const envPath = process.env.NAS_BACKUP_PATH?.trim();
  return envPath || null;
}

export async function getBackupEncryptionKey(): Promise<string> {
  const stored = await getSetting("nas_backup_key");
  if (stored && stored.trim().length >= 16) return stored.trim();
  const envSecret = process.env.BACKUP_ENCRYPTION_KEY?.trim();
  if (envSecret && envSecret.length >= 16) return envSecret;

  // Concurrent first backups must use the same winning key, never overwrite it.
  const newKey = randomBytes(24).toString("hex");
  const client = await db();
  await client.execute({
    sql: "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP WHERE length(trim(settings.value)) < 16",
    args: ["nas_backup_key", newKey]
  });
  const key = await getSetting("nas_backup_key");
  if (!key || key.trim().length < 16) throw new Error("Sicherungsschlüssel konnte nicht gespeichert werden.");
  return key.trim();
}

export async function getBackupSettings(): Promise<BackupSettings> {
  const targetPath = await getBackupConfiguredPath();
  const storedKey = await getSetting("nas_backup_key");
  const envKey = process.env.BACKUP_ENCRYPTION_KEY?.trim();
  const hasEncryptionKey = Boolean((storedKey && storedKey.trim().length >= 16) || (envKey && envKey.length >= 16));

  if (!targetPath) {
    return {
      configured: false,
      path: "",
      hasEncryptionKey,
      accessible: false,
      writable: false,
      statusMessage: "Noch kein NAS-Pfad hinterlegt.",
      backupCount: 0,
      lastBackup: null
    };
  }

  let accessible = false;
  let writable = false;
  let statusMessage = "Pfad konfiguriert.";
  let backupCount = 0;
  let lastBackup: BackupInfo | null = null;

  try {
    await mkdir(targetPath, { recursive: true });
    accessible = true;

    // Test write permission with a hidden probe file
    const probePath = path.join(targetPath, `.probe-${randomUUID()}`);
    await writeFile(probePath, "fitfamily-probe-test", { encoding: "utf8", flag: "wx", mode: 0o600 });
    await unlink(probePath);
    writable = true;
    statusMessage = "NAS-Ordner ist erreichbar und beschreibbar.";
  } catch (err) {
    const errorText = err instanceof Error ? err.message : String(err);
    const errorCode = (err as NodeJS.ErrnoException).code;
    if (!accessible) {
      statusMessage = `Ordner konnte nicht geöffnet werden: ${errorText}`;
    } else if (errorCode === "EACCES" || errorCode === "EPERM") {
      statusMessage = `NAS-Ordner erreichbar, aber FitFamily hat dort keine Schreibrechte (${errorCode}). Prüfe Schreibrechte des verwendeten SMB-Kontos auf der NAS-Freigabe. Falls das Laufwerk schon vorher eingebunden war, muss es mit der FitFamily-Dienst-ID und -Gruppe neu eingebunden werden.`;
    } else {
      statusMessage = `Keine Schreibrechte im Zielordner: ${errorText}`;
    }
  }

  if (accessible) {
    try {
      const files = (await readdir(/*turbopackIgnore: true*/ targetPath))
        .filter((name) => /^fitfamily-.*\.db\.enc$/.test(name))
        .sort()
        .reverse();

      backupCount = files.length;
      if (files.length > 0) {
        const latestFile = files[0];
        const fileStat = await stat(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ targetPath, latestFile));
        lastBackup = {
          name: latestFile,
          sizeBytes: fileStat.size,
          sizeFormatted: formatBytes(fileStat.size),
          date: fileStat.mtime.toISOString()
        };
      }
    } catch {
      // Ignore file reading errors
    }
  }

  return {
    configured: true,
    path: targetPath,
    hasEncryptionKey,
    accessible,
    writable,
    statusMessage,
    backupCount,
    lastBackup
  };
}

export async function setBackupSettings(params: { path?: string | null; key?: string | null }): Promise<BackupSettings> {
  const client = await db();

  if (params.path !== undefined) {
    const trimmedPath = params.path?.trim();
    if (trimmedPath) {
      await client.execute({
        sql: "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
        args: ["nas_backup_path", trimmedPath]
      });
    } else {
      await client.execute({ sql: "DELETE FROM settings WHERE key = ?", args: ["nas_backup_path"] });
    }
  }

  if (params.key !== undefined) {
    const trimmedKey = params.key?.trim();
    if (trimmedKey && trimmedKey.length >= 16) {
      await client.execute({
        sql: "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
        args: ["nas_backup_key", trimmedKey]
      });
    }
  }

  return getBackupSettings();
}

export async function executeBackup(): Promise<{
  filename: string;
  fullPath: string;
  sizeBytes: number;
  sizeFormatted: string;
  createdAt: string;
}> {
  const targetPath = await getBackupConfiguredPath();
  if (!targetPath) {
    throw new Error("NAS-Backup-Pfad ist nicht konfiguriert. Bitte Pfad in den Einstellungen angeben.");
  }

  const secret = await getBackupEncryptionKey();
  if (!secret || secret.length < 16) {
    throw new Error("Verschlüsselungsschlüssel muss mindestens 16 Zeichen lang sein.");
  }

  await mkdir(/*turbopackIgnore: true*/ targetPath, { recursive: true });
  const tempDir = await mkdtemp(path.join(tmpdir(), "fitfamily-backup-"));
  const snapshotPath = path.join(tempDir, "fitfamily.db");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `fitfamily-${stamp}.db.enc`;
  const fullPath = path.join(targetPath, filename);
  const stagingPath = path.join(targetPath, `.${filename}.${randomUUID()}.tmp`);

  try {
    await createVerifiedDatabaseSnapshot(snapshotPath);
    const content = await readFile(snapshotPath);
    const payload = encryptDatabase(content, secret);
    await writeFile(stagingPath, payload, { mode: 0o600 });
    await rename(stagingPath, fullPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    await rm(stagingPath, { force: true });
  }

  // Rotate old backups
  try {
    const files = (await readdir(/*turbopackIgnore: true*/ targetPath)).filter((name) => /^fitfamily-.*\.db\.enc$/.test(name)).sort().reverse();
    const keep = new Set(files.slice(0, 7));
    const weekly = new Set<string>();
    const monthly = new Set<string>();

    for (const name of files) {
      const match = name.match(/fitfamily-(\d{4})-(\d{2})-(\d{2})/);
      if (!match) continue;
      const date = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`);
      const weekKey = `${date.getUTCFullYear()}-${Math.floor((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 1)) / 604800000)}`;
      const monthKey = `${match[1]}-${match[2]}`;
      if (weekly.size < 4 && !weekly.has(weekKey)) {
        weekly.add(weekKey);
        keep.add(name);
      }
      if (monthly.size < 12 && !monthly.has(monthKey)) {
        monthly.add(monthKey);
        keep.add(name);
      }
    }

    for (const name of files) {
      if (!keep.has(name)) {
        await unlink(/*turbopackIgnore: true*/ path.join(/*turbopackIgnore: true*/ targetPath, name));
      }
    }
  } catch {
    // Non-fatal error in rotation
  }

  const fileStat = await stat(fullPath);

  return {
    filename,
    fullPath,
    sizeBytes: fileStat.size,
    sizeFormatted: formatBytes(fileStat.size),
    createdAt: new Date().toISOString()
  };
}

export async function recoverBackupFile(content: Uint8Array, secret: string): Promise<Buffer> {
  const tempDir = await mkdtemp(path.join(tmpdir(), "fitfamily-recovery-"));
  try {
    const restoredPath = path.join(tempDir, "recovered.db");
    await recoverDatabase(content, secret, restoredPath);
    return await readFile(restoredPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}
