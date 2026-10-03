import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { executeBackup, formatBytes, getBackupConfiguredPath, getBackupEncryptionKey, getBackupSettings, recoverBackupFile, setBackupSettings } from "@/lib/backup";
import { decryptDatabase, encryptDatabase, readBackupConfiguration, recoverDatabase, snapshotDatabase } from "@/lib/backup-format.mjs";

const isolated = vi.hoisted(() => ({ client: null as Client | null }));
vi.mock("@/lib/db", () => ({
  db: async () => isolated.client!,
  getSetting: async (key: string) => {
    const result = await isolated.client!.execute({ sql: "SELECT value FROM settings WHERE key = ?", args: [key] });
    return result.rows[0] ? String(result.rows[0].value) : null;
  }
}));

describe("NAS backup and offline recovery", () => {
  let directory: string;
  let backupDirectory: string;
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "fitfamily-backup-test-"));
    backupDirectory = path.join(directory, "nas");
    const databaseUrl = `file:${path.join(directory, "source.db")}`;
    vi.stubEnv("DATABASE_URL", databaseUrl);
    vi.stubEnv("NAS_BACKUP_PATH", "");
    vi.stubEnv("BACKUP_ENCRYPTION_KEY", "");
    isolated.client = createClient({ url: databaseUrl });
    await isolated.client.execute("PRAGMA journal_mode = WAL");
    await isolated.client.batch([
      "CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT)",
      "CREATE TABLE profiles (id TEXT PRIMARY KEY, name TEXT)",
      "CREATE TABLE training_sessions (id TEXT PRIMARY KEY, profile_id TEXT REFERENCES profiles(id))",
      "CREATE TABLE training_segments (id TEXT PRIMARY KEY, session_id TEXT REFERENCES training_sessions(id))",
      "CREATE TABLE equipment_inventory (id TEXT PRIMARY KEY, manual_pdf_url TEXT, manual_pdf_data TEXT, manual_pdf_name TEXT)",
      { sql: "INSERT INTO equipment_inventory VALUES ('manual-test', '/api/equipment/manual-test/manual', ?, 'Anleitung.pdf')", args: [Buffer.from("%PDF-1.4\nBackup-Test\n%%EOF").toString("base64")] },
      "CREATE TABLE admin_sessions (id TEXT PRIMARY KEY)",
      "CREATE TABLE paired_devices (id TEXT PRIMARY KEY)",
      "CREATE TABLE handoff_tokens (id TEXT PRIMARY KEY)",
      "INSERT INTO admin_sessions VALUES ('historical-session')",
      "INSERT INTO paired_devices VALUES ('historical-device')",
      "INSERT INTO handoff_tokens VALUES ('historical-link')",
      "INSERT INTO profiles VALUES ('mama', 'Wal-Test')",
      "INSERT INTO training_sessions VALUES ('recent-workout', 'mama')"
    ], "write");
  });
  afterEach(async () => {
    isolated.client?.close();
    isolated.client = null;
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });

  it("formats bytes and reports an unconfigured NAS", async () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(1500)).toBe("1.5 KB");
    expect(formatBytes(1048576 * 2.5)).toBe("2.5 MB");
    expect((await getBackupSettings()).configured).toBe(false);
  });

  it("uses saved NAS path and key before environment values for web and scheduled backup", async () => {
    vi.stubEnv("NAS_BACKUP_PATH", path.join(directory, "old-nas"));
    vi.stubEnv("BACKUP_ENCRYPTION_KEY", "old-environment-key-123");
    await setBackupSettings({ path: backupDirectory, key: "new-saved-key-123456789" });
    expect(await getBackupConfiguredPath()).toBe(backupDirectory);
    expect(await getBackupEncryptionKey()).toBe("new-saved-key-123456789");
    expect(await readBackupConfiguration(isolated.client!)).toEqual({ target: backupDirectory, secret: "new-saved-key-123456789" });
  });

  it("generates a stable exportable key and recovers committed WAL data from encrypted backup", async () => {
    await setBackupSettings({ path: backupDirectory });
    const secret = await getBackupEncryptionKey();
    expect(secret.length).toBeGreaterThanOrEqual(16);
    expect(await getBackupEncryptionKey()).toBe(secret);
    const result = await executeBackup();
    const content = await readFile(result.fullPath);
    expect(content.subarray(0, 5).toString()).toBe("FFDB1");
    expect((await readdir(backupDirectory)).filter((name) => name.endsWith(".db.enc"))).toHaveLength(1);
    const recovered = await recoverBackupFile(content, secret);
    const recoveredPath = path.join(directory, "recovered.db");
    await writeFile(recoveredPath, recovered);
    const restored = createClient({ url: `file:${recoveredPath}` });
    try {
      expect((await restored.execute("SELECT name FROM profiles WHERE id = 'mama'")).rows[0]?.name).toBe("Wal-Test");
      expect((await restored.execute("SELECT id FROM training_sessions")).rows[0]?.id).toBe("recent-workout");
      const manual = (await restored.execute("SELECT * FROM equipment_inventory WHERE id = 'manual-test'")).rows[0];
      expect(manual?.manual_pdf_name).toBe("Anleitung.pdf");
      expect(Buffer.from(String(manual?.manual_pdf_data), "base64").toString()).toBe("%PDF-1.4\nBackup-Test\n%%EOF");
      expect((await restored.execute("SELECT * FROM admin_sessions")).rows).toHaveLength(0);
      expect((await restored.execute("SELECT * FROM paired_devices")).rows).toHaveLength(0);
      expect((await restored.execute("SELECT * FROM handoff_tokens")).rows).toHaveLength(0);
    } finally { restored.close(); }
  });

  it("keeps one key when initial backups and key exports run concurrently", async () => {
    const keys = await Promise.all(Array.from({ length: 8 }, () => getBackupEncryptionKey()));
    expect(new Set(keys).size).toBe(1);
    expect(await getBackupEncryptionKey()).toBe(keys[0]);
  });

  it("rejects an incorrect key and tampering before creating a recovery artifact", async () => {
    const snapshot = path.join(directory, "snapshot.db");
    await snapshotDatabase(process.env.DATABASE_URL!, snapshot);
    const encrypted = encryptDatabase(await readFile(snapshot), "correct-secret-123456");
    expect(() => decryptDatabase(encrypted, "wrong-secret-123456789")).toThrow("beschädigt");
    encrypted[encrypted.length - 1] ^= 1;
    await expect(recoverDatabase(encrypted, "correct-secret-123456", path.join(directory, "invalid.db"))).rejects.toThrow("beschädigt");
    expect(await readdir(directory)).not.toContain("invalid.db");
  });

  it("refuses to overwrite an existing recovered file", async () => {
    const snapshot = path.join(directory, "snapshot.db");
    await snapshotDatabase(process.env.DATABASE_URL!, snapshot);
    const secret = "correct-secret-123456";
    const encrypted = encryptDatabase(await readFile(snapshot), secret);
    const destination = path.join(directory, "offline.db");
    await recoverDatabase(encrypted, secret, destination);
    await expect(recoverDatabase(encrypted, secret, destination)).rejects.toMatchObject({ code: "EEXIST" });
    expect((await readFile(destination)).subarray(0, 16).toString()).toBe("SQLite format 3\0");
  });
});
