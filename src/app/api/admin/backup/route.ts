import { NextResponse } from "next/server";
import { z } from "zod";
import { executeBackup, getBackupEncryptionKey, getBackupSettings, recoverBackupFile, setBackupSettings } from "@/lib/backup";
import { verifyAdminPinOrReject } from "@/lib/security";
import { writeAdminLog } from "@/lib/admin-log";

const postSchema = z.object({
  pin: z.string().regex(/^\d{4}$/).or(z.literal("")).optional(),
  action: z.enum(["save", "test", "backup", "recovery-key"]),
  path: z.string().max(500).optional(),
  key: z.string().max(500).optional()
});

export async function GET(request: Request) {
  const pinError = await verifyAdminPinOrReject(undefined, request);
  if (pinError) return pinError;

  const settings = await getBackupSettings();
  return NextResponse.json({ ok: true, status: settings }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (request.headers.get("content-type")?.includes("multipart/form-data")) {
    // Authenticate before parsing a potentially large uploaded backup.
    const sessionError = await verifyAdminPinOrReject(undefined, request);
    if (sessionError) return sessionError;
    const length = Number(request.headers.get("content-length") || 0);
    if (length > 50 * 1024 * 1024) return NextResponse.json({ error: "Sicherungen dürfen höchstens 50 MB groß sein." }, { status: 413 });
    const form = await request.formData().catch(() => null);
    const pinValue = form?.get("pin");
    const pinError = await verifyAdminPinOrReject(typeof pinValue === "string" ? pinValue : undefined, request);
    if (pinError) return pinError;
    const file = form?.get("backup");
    const key = form?.get("key");
    if (!(file instanceof File) || file.size > 50 * 1024 * 1024 || typeof key !== "string" || key.length > 500) return NextResponse.json({ error: "Bitte eine .db.enc-Sicherung und den Wiederherstellungsschlüssel auswählen." }, { status: 400 });
    try {
      const restored = await recoverBackupFile(new Uint8Array(await file.arrayBuffer()), key);
      await writeAdminLog("admin.backup.recovered", "info", "Verschlüsselte Sicherung geprüft und als SQLite-Datei wiederhergestellt.");
      return new Response(new Uint8Array(restored), { headers: { "Content-Type": "application/vnd.sqlite3", "Content-Disposition": 'attachment; filename="fitfamily-recovered.db"', "Cache-Control": "no-store" } });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Wiederherstellung fehlgeschlagen." }, { status: 400 });
    }
  }
  const body = postSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Ungültige Anfrage. Bitte PIN und Eingaben prüfen." }, { status: 400 });
  }

  const pinError = await verifyAdminPinOrReject(body.data.pin, request);
  if (pinError) return pinError;

  const { action, path: inputPath, key: inputKey } = body.data;

  try {
    if (action === "recovery-key") {
      const key = await getBackupEncryptionKey();
      await writeAdminLog("admin.backup.key-export", "info", "Wiederherstellungsschlüssel exportiert; getrennt von NAS-Sicherungen aufbewahren.");
      return new Response(`${key}\n`, { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": 'attachment; filename="fitfamily-recovery-key.txt"', "Cache-Control": "no-store" } });
    }
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
        await writeAdminLog("admin.backup.check", "warning", status.statusMessage);
        return NextResponse.json({ ok: false, error: status.statusMessage, status }, { status: 400 });
      }
      await writeAdminLog("admin.backup.check", "info", "NAS-Ziel ist erreichbar und beschreibbar.");
      return NextResponse.json({ ok: true, message: "Verbindung erfolgreich! Der Ordner existiert und ist beschreibbar.", status });
    }

    if (action === "backup") {
      if (inputPath !== undefined && inputPath.trim()) {
        await setBackupSettings({ path: inputPath, key: inputKey });
      }
      const backupResult = await executeBackup();
      const status = await getBackupSettings();
      await writeAdminLog("admin.backup.success", "info", "Verschlüsseltes NAS-Backup erstellt.", { filename: backupResult.filename, sizeBytes: backupResult.sizeBytes });
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
    await writeAdminLog("admin.backup.error", "error", errorText).catch(() => undefined);
    return NextResponse.json({ error: errorText, status: await getBackupSettings() }, { status: 500 });
  }
}
