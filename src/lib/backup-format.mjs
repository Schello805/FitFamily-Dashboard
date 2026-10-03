import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createClient } from "@libsql/client";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const magic = Buffer.from("FFDB1");

export function encryptDatabase(content, secret) {
  if (!secret || secret.trim().length < 16) throw new Error("Der Backup-Schlüssel muss mindestens 16 Zeichen lang sein.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(secret.trim()).digest(), iv);
  const encrypted = Buffer.concat([cipher.update(content), cipher.final()]);
  return Buffer.concat([magic, iv, cipher.getAuthTag(), encrypted]);
}

export function decryptDatabase(content, secret) {
  if (!Buffer.isBuffer(content)) content = Buffer.from(content);
  if (content.length < 49 || !content.subarray(0, 5).equals(magic)) throw new Error("Die Datei ist kein unterstütztes FitFamily-Backup (FFDB1).");
  if (!secret || secret.trim().length < 16) throw new Error("Bitte den vollständigen Wiederherstellungsschlüssel eingeben.");
  let decrypted;
  try {
    const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(secret.trim()).digest(), content.subarray(5, 17));
    decipher.setAuthTag(content.subarray(17, 33));
    decrypted = Buffer.concat([decipher.update(content.subarray(33)), decipher.final()]);
  } catch {
    throw new Error("Backup-Schlüssel ist falsch oder die Sicherung wurde beschädigt.");
  }
  if (!decrypted.subarray(0, 16).equals(Buffer.from("SQLite format 3\0"))) throw new Error("Das Backup enthält keine SQLite-Datenbank.");
  return decrypted;
}

export async function verifyDatabase(filename, requireFitFamily = false) {
  const client = createClient({ url: `file:${path.resolve(filename)}` });
  try {
    const check = await client.execute("PRAGMA integrity_check");
    if (check.rows.length !== 1 || String(check.rows[0].integrity_check) !== "ok") throw new Error("Integritätsprüfung der SQLite-Datenbank fehlgeschlagen.");
    if (requireFitFamily) {
      const tables = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table'");
      const names = new Set(tables.rows.map((row) => String(row.name)));
      if (!["profiles", "settings", "training_sessions", "training_segments"].every((name) => names.has(name))) throw new Error("Die Sicherung enthält keine vollständige FitFamily-Datenbank.");
      const violations = await client.execute("PRAGMA foreign_key_check");
      if (violations.rows.length) throw new Error("Die Sicherung enthält ungültige Datenbankverknüpfungen.");
    }
  } finally {
    client.close();
  }
}

export async function snapshotDatabase(databaseUrl, destination) {
  if (!databaseUrl.startsWith("file:")) throw new Error("Datei-Snapshots unterstützen nur lokale SQLite-Datenbanken.");
  const filename = path.resolve(destination);
  await mkdir(path.dirname(filename), { recursive: true });
  const client = createClient({ url: databaseUrl });
  try {
    await client.execute("PRAGMA busy_timeout = 10000");
    await client.execute({ sql: "VACUUM INTO ?", args: [filename] });
  } finally {
    client.close();
  }
  await verifyDatabase(filename);
}

export async function sanitizeRecoveredDatabase(filename) {
  await verifyDatabase(filename, true);
  const client = createClient({ url: `file:${path.resolve(filename)}` });
  try {
    const tables = await client.execute("SELECT name FROM sqlite_master WHERE type = 'table'");
    const names = new Set(tables.rows.map((row) => String(row.name)));
    // A restore must not resurrect an old browser session or a revoked device.
    for (const name of ["admin_sessions", "paired_devices", "handoff_tokens"]) {
      if (names.has(name)) await client.execute(`DELETE FROM ${name}`);
    }
    await client.execute("PRAGMA wal_checkpoint(TRUNCATE)");
  } finally { client.close(); }
}

// Never overwrite a live database: the recovered file is a separate artifact.
export async function recoverDatabase(content, secret, destination) {
  const decrypted = decryptDatabase(content, secret);
  await writeFile(destination, decrypted, { flag: "wx", mode: 0o600 });
  try {
    await sanitizeRecoveredDatabase(destination);
  } catch (error) {
    await rm(destination, { force: true });
    throw error;
  }
  return destination;
}

export async function readBackupConfiguration(client, environment = process.env) {
  const settings = new Map();
  try {
    const result = await client.execute("SELECT key, value FROM settings WHERE key IN ('nas_backup_path', 'nas_backup_key')");
    for (const row of result.rows) settings.set(String(row.key), String(row.value).trim());
  } catch {
    // A new database has no settings table yet.
  }
  return {
    target: settings.get("nas_backup_path") || environment.NAS_BACKUP_PATH?.trim() || null,
    secret: settings.get("nas_backup_key") || environment.BACKUP_ENCRYPTION_KEY?.trim() || null
  };
}
