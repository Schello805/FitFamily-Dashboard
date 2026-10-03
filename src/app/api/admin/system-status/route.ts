import { stat, statfs } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminPinOrReject } from "@/lib/security";

const schema = z.object({ pin: z.string().regex(/^\d{4}$/) });

async function volumeInfo(targetPath: string) {
  try {
    const fs = await statfs(targetPath);
    return { availableBytes: Number(fs.bavail) * Number(fs.bsize), totalBytes: Number(fs.blocks) * Number(fs.bsize), error: null };
  } catch (error) {
    return { availableBytes: null, totalBytes: null, error: error instanceof Error ? error.message : "Speicher konnte nicht abgefragt werden." };
  }
}

export async function POST(request: Request) {
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const pinError = await verifyAdminPinOrReject(body.data.pin);
  if (pinError) return pinError;

  const databaseUrl = process.env.DATABASE_URL ?? "file:./data/fitfamily.db";
  const isLocalFile = databaseUrl.startsWith("file:");
  let database: { kind: "local" | "remote"; location: string; sizeBytes: number | null; error: string | null };
  let applicationVolume: Awaited<ReturnType<typeof volumeInfo>>;

  if (isLocalFile) {
    const dbLocation = databaseUrl.slice(5).split("?")[0];
    // The database is persistent runtime data and DATABASE_URL may point outside the app tree.
    // Keep Turbopack from tracing or bundling an arbitrary runtime database path.
    const absoluteDatabasePath = path.resolve(/*turbopackIgnore: true*/ process.cwd(), dbLocation);
    try {
      const file = await stat(absoluteDatabasePath);
      const wal = await stat(`${absoluteDatabasePath}-wal`).catch(() => null);
      const journal = await stat(`${absoluteDatabasePath}-journal`).catch(() => null);
      database = { kind: "local", location: path.dirname(absoluteDatabasePath), sizeBytes: file.size + (wal?.size ?? 0) + (journal?.size ?? 0), error: null };
    } catch (error) {
      database = { kind: "local", location: path.dirname(absoluteDatabasePath), sizeBytes: null, error: error instanceof Error ? error.message : "Datenbankdatei nicht gefunden." };
    }
    applicationVolume = await volumeInfo(path.dirname(absoluteDatabasePath));
  } else {
    database = { kind: "remote", location: "Externe Datenbank", sizeBytes: null, error: null };
    applicationVolume = await volumeInfo(process.cwd());
  }

  return NextResponse.json({ database, applicationVolume }, { headers: { "Cache-Control": "no-store" } });
}
