import { createCipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createClient } from "@libsql/client";

const databaseUrl = process.env.DATABASE_URL ?? "file:./data/fitfamily.db";
let target = process.env.NAS_BACKUP_PATH;
let secret = process.env.BACKUP_ENCRYPTION_KEY;

// Fallback: Settings aus der SQLite-Datenbank laden (wenn über die Web-Oberfläche konfiguriert)
if (!target || !secret) {
  try {
    const client = createClient({ url: process.env.DATABASE_URL ?? "file:./data/fitfamily.db" });
    const result = await client.execute("SELECT key, value FROM settings WHERE key IN ('nas_backup_path', 'nas_backup_key')");
    for (const row of result.rows) {
      if (row.key === "nas_backup_path" && !target && row.value) target = String(row.value).trim();
      if (row.key === "nas_backup_key" && !secret && row.value) secret = String(row.value).trim();
    }
  } catch {
    // Datenbank noch nicht initialisiert oder Tabelle fehlt
  }
}

if (!target) {
  console.log("Hinweis: Kein NAS_BACKUP_PATH konfiguriert (weder in .env.local noch in den Einstellungen unter /verwaltung). Überspringe Backup.");
  process.exit(0);
}

if (!secret || secret.length < 16) {
  // Wenn kein Schlüssel existiert, erzeuge einen sicheren Schlüssel und sichere ihn
  secret = randomBytes(24).toString("hex");
  try {
    const client = createClient({ url: process.env.DATABASE_URL ?? "file:./data/fitfamily.db" });
    await client.execute({
      sql: "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
      args: ["nas_backup_key", secret]
    });
  } catch {}
}

await mkdir(target, { recursive: true });
if (!databaseUrl.startsWith("file:")) throw new Error("NAS-Backup unterstützt derzeit nur lokale SQLite-Datenbanken.");
const snapshotDir = await mkdtemp(path.join(tmpdir(), "fitfamily-backup-"));
const snapshotPath = path.join(snapshotDir, "fitfamily.db");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const filename = `fitfamily-${stamp}.db.enc`;
const destination = path.join(target, filename);
const stagingPath = path.join(target, `.${filename}.${randomUUID()}.tmp`);
try {
  const snapshotClient = createClient({ url: databaseUrl });
  try {
    await snapshotClient.execute({ sql: "VACUUM INTO ?", args: [snapshotPath] });
  } finally {
    await snapshotClient.close();
  }

  const verifyClient = createClient({ url: `file:${snapshotPath}` });
  try {
    const check = await verifyClient.execute("PRAGMA integrity_check");
    if (check.rows.length !== 1 || String(check.rows[0].integrity_check) !== "ok") {
      throw new Error("Integritätsprüfung des Datenbank-Snapshots fehlgeschlagen.");
    }
  } finally {
    await verifyClient.close();
  }

  const content = await readFile(snapshotPath);
  const iv = randomBytes(12);
  const key = createHash("sha256").update(secret).digest();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(content), cipher.final()]);
  const tag = cipher.getAuthTag();
  await writeFile(stagingPath, Buffer.concat([Buffer.from("FFDB1"), iv, tag, encrypted]), { mode: 0o600 });
  await rename(stagingPath, destination);
} finally {
  await rm(snapshotDir, { recursive: true, force: true });
  await rm(stagingPath, { force: true });
}

const files = (await readdir(target)).filter((name) => /^fitfamily-.*\.db\.enc$/.test(name)).sort().reverse();
const keep = new Set(files.slice(0, 7));
const weekly = new Set();
const monthly = new Set();
for (const name of files) {
  const match = name.match(/fitfamily-(\d{4})-(\d{2})-(\d{2})/);
  if (!match) continue;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`);
  const weekKey = `${date.getUTCFullYear()}-${Math.floor((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 1)) / 604800000)}`;
  const monthKey = `${match[1]}-${match[2]}`;
  if (weekly.size < 4 && !weekly.has(weekKey)) { weekly.add(weekKey); keep.add(name); }
  if (monthly.size < 12 && !monthly.has(monthKey)) { monthly.add(monthKey); keep.add(name); }
}
for (const name of files) if (!keep.has(name)) await unlink(path.join(target, name));
console.log(`Backup geschrieben: ${path.join(target, filename)}`);
