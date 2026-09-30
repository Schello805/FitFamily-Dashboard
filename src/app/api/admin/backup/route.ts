import { NextResponse } from "next/server";
import { z } from "zod";
import { executeBackup, getBackupSettings, setBackupSettings } from "@/lib/backup";
import { verifyAdminPin } from "@/lib/security";

const postSchema = z.object({
  pin: z.string().min(4).max(8),
  action: z.enum(["save", "test", "backup"]),
  path: z.string().max(500).optional(),
  key: z.string().max(500).optional()
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pin = searchParams.get("pin");
  if (!pin || !(await verifyAdminPin(pin))) {
    return NextResponse.json({ error: "Eltern-PIN ist nicht richtig." }, { status: 401 });
  }

  const settings = await getBackupSettings();
  return NextResponse.json({ ok: true, status: settings });
}

export async function POST(request: Request) {
  const body = postSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Ungültige Anfrage. Bitte PIN und Eingaben prüfen." }, { status: 400 });
  }

  if (!(await verifyAdminPin(body.data.pin))) {
    return NextResponse.json({ error: "Eltern-PIN ist nicht richtig." }, { status: 401 });
  }

  const { action, path: inputPath, key: inputKey } = body.data;

  try {
    if (action === "save") {
      const status = await setBackupSettings({ path: inputPath, key: inputKey });
      return NextResponse.json({
        ok: true,
        message: status.configured ? "NAS-Pfad erfolgreich gespeichert." : "NAS-Pfad entfernt.",
        status
      });
    }

    if (action === "test") {
      if (inputPath !== undefined) {
        // Save first if user submitted a new path
        await setBackupSettings({ path: inputPath, key: inputKey });
      }
      const status = await getBackupSettings();
      if (!status.configured) {
        return NextResponse.json({ ok: false, error: "Kein NAS-Pfad angegeben.", status }, { status: 400 });
      }
      if (!status.accessible) {
        return NextResponse.json({ ok: false, error: status.statusMessage, status }, { status: 400 });
      }
      if (!status.writable) {
        return NextResponse.json({ ok: false, error: status.statusMessage, status }, { status: 400 });
      }
      return NextResponse.json({ ok: true, message: "Verbindung erfolgreich! Der Ordner existiert und ist beschreibbar.", status });
    }

    if (action === "backup") {
      if (inputPath !== undefined && inputPath.trim()) {
        await setBackupSettings({ path: inputPath, key: inputKey });
      }
      const backupResult = await executeBackup();
      const status = await getBackupSettings();
      return NextResponse.json({
        ok: true,
        message: `Backup erfolgreich erstellt (${backupResult.filename}, ${backupResult.sizeFormatted}).`,
        backup: backupResult,
        status
      });
    }

    return NextResponse.json({ error: "Unbekannte Aktion." }, { status: 400 });
  } catch (err) {
    const errorText = err instanceof Error ? err.message : "Backup-Vorgang fehlgeschlagen.";
    return NextResponse.json({ error: errorText, status: await getBackupSettings() }, { status: 500 });
  }
}
