import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createClient } from "@libsql/client";
import { encryptDatabase, readBackupConfiguration, snapshotDatabase } from "../src/lib/backup-format.mjs";

const databaseUrl = process.env.DATABASE_URL ?? "file:./data/fitfamily.db";
const settingsClient = createClient({ url: databaseUrl });
let { target, secret } = await readBackupConfiguration(settingsClient);

if (!target) {
  settingsClient.close();
  console.log("Hinweis: Kein NAS_BACKUP_PATH konfiguriert (weder in .env.local noch in den Einstellungen unter /verwaltung). Überspringe Backup.");
  process.exit(0);
}

if (!secret || secret.length < 16) {
  // Wenn kein Schlüssel existiert, erzeuge einen sicheren Schlüssel und sichere ihn
  secret = randomBytes(24).toString("hex");
  try {
    await settingsClient.execute({
      sql: "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
      args: ["nas_backup_key", secret]
    });
  } finally {
    settingsClient.close();
  }
} else {
  settingsClient.close();
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
  await snapshotDatabase(databaseUrl, snapshotPath);

  const content = await readFile(snapshotPath);
  await writeFile(stagingPath, encryptDatabase(content, secret), { mode: 0o600 });
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
