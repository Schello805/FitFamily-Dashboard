import { describe, expect, it, beforeEach } from "vitest";
import { executeBackup, formatBytes, getBackupConfiguredPath, getBackupEncryptionKey, getBackupSettings, setBackupSettings } from "@/lib/backup";
import { db } from "@/lib/db";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDecipheriv, createHash } from "node:crypto";
import { createClient } from "@libsql/client";

describe("NAS Backup Service", () => {
  let tempBackupDir: string;

  beforeEach(async () => {
    tempBackupDir = await mkdtemp(path.join(tmpdir(), "fitfamily-test-backup-"));
    const client = await db();
    await client.execute({ sql: "DELETE FROM settings WHERE key IN ('nas_backup_path', 'nas_backup_key')", args: [] });
    delete process.env.NAS_BACKUP_PATH;
    delete process.env.BACKUP_ENCRYPTION_KEY;
  });

  it("formats bytes accurately", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(1500)).toBe("1.5 KB");
    expect(formatBytes(1048576 * 2.5)).toBe("2.5 MB");
  });

  it("returns unconfigured status when no path is set", async () => {
    const settings = await getBackupSettings();
    expect(settings.configured).toBe(false);
    expect(settings.path).toBe("");
    expect(settings.accessible).toBe(false);
  });

  it("saves NAS backup path to settings and detects accessible directory", async () => {
    const updated = await setBackupSettings({ path: tempBackupDir });
    expect(updated.configured).toBe(true);
    expect(updated.path).toBe(tempBackupDir);
    expect(updated.accessible).toBe(true);
    expect(updated.writable).toBe(true);

    const pathFromDb = await getBackupConfiguredPath();
    expect(pathFromDb).toBe(tempBackupDir);
  });

  it("generates an encryption key if none is provided", async () => {
    const key = await getBackupEncryptionKey();
    expect(key).toBeDefined();
    expect(key.length).toBeGreaterThanOrEqual(16);

    // Subsequent call returns the same stored key
    const key2 = await getBackupEncryptionKey();
    expect(key2).toBe(key);
  });

  it("executes encrypted backup and creates .db.enc file", async () => {
    await setBackupSettings({ path: tempBackupDir });

    const result = await executeBackup();
    expect(result.filename).toMatch(/^fitfamily-.*\.db\.enc$/);
    expect(result.sizeBytes).toBeGreaterThan(0);

    const files = await readdir(tempBackupDir);
    const backupFiles = files.filter((f) => f.endsWith(".db.enc"));
    expect(backupFiles.length).toBe(1);

    // Verify magic bytes "FFDB1"
    const content = await readFile(path.join(tempBackupDir, backupFiles[0]));
    const magic = content.subarray(0, 5).toString("utf8");
    expect(magic).toBe("FFDB1");

    // Restore the encrypted payload to a temporary SQLite file and run the
    // same integrity check used after snapshot creation.
    const secret = await getBackupEncryptionKey();
    const iv = content.subarray(5, 17);
    const tag = content.subarray(17, 33);
    const decipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), iv);
    decipher.setAuthTag(tag);
    const restored = Buffer.concat([decipher.update(content.subarray(33)), decipher.final()]);
    expect(restored.subarray(0, 16).toString("utf8")).toBe("SQLite format 3\0");
    const restoredPath = path.join(tempBackupDir, "restored.db");
    await writeFile(restoredPath, restored);
    const restoredClient = createClient({ url: `file:${restoredPath}` });
    try {
      const integrity = await restoredClient.execute("PRAGMA integrity_check");
      expect(integrity.rows.map((row) => String(row.integrity_check))).toEqual(["ok"]);
    } finally {
      await restoredClient.close();
    }

    // Clean up
    await rm(tempBackupDir, { recursive: true, force: true });
  });
});
