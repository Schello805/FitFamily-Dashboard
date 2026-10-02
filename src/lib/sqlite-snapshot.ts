import { createClient, type Client } from "@libsql/client";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";

/**
 * Creates a transactionally consistent SQLite snapshot. Reading the live .db
 * file directly is unsafe while WAL mode is active because committed pages may
 * still reside in the -wal file.
 */
export async function createVerifiedDatabaseSnapshot(destination: string): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL ?? "file:./data/fitfamily.db";
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("Konsistente Datei-Snapshots werden derzeit nur für lokale SQLite-Datenbanken unterstützt.");
  }

  const absoluteDestination = path.resolve(destination);
  await mkdir(path.dirname(absoluteDestination), { recursive: true });

  const source: Client = await db();
  await source.execute({ sql: "VACUUM INTO ?", args: [absoluteDestination] });

  const snapshotClient = createClient({ url: `file:${absoluteDestination}` });
  try {
    const result = await snapshotClient.execute("PRAGMA integrity_check");
    const messages = result.rows.map((row) => String(row.integrity_check ?? ""));
    if (messages.length !== 1 || messages[0] !== "ok") {
      throw new Error(`Datenbank-Snapshot ist nicht konsistent: ${messages.join("; ") || "keine Prüfdaten"}`);
    }
  } finally {
    await snapshotClient.close();
  }
}
