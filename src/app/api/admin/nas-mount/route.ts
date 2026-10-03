import { execFile } from "node:child_process";
import { stat } from "node:fs/promises";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminPinOrReject } from "@/lib/security";
import { setBackupSettings } from "@/lib/backup";

export const dynamic = "force-dynamic";
const TARGET = "/mnt/nas/fitfamily";
const HELPER = "/usr/local/libexec/fitfamily-mount";
const schema = z.object({
  pin: z.string().regex(/^\d{4}$/).or(z.literal("")).optional(),
  server: z.string().trim().regex(/^[A-Za-z0-9._:-]{1,253}$/),
  share: z.string().trim().min(1).max(500),
  username: z.string().max(500).optional(),
  password: z.string().max(500).optional(),
  mountPath: z.literal(TARGET).optional()
});

export async function POST(request: Request) {
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Bitte gültige NAS-Daten eingeben. Automatisches Einhängen ist ausschließlich unter /mnt/nas/fitfamily möglich." }, { status: 400 });
  const pinError = await verifyAdminPinOrReject(body.data.pin, request);
  if (pinError) return pinError;
  try {
    const metadata = await stat(HELPER);
    if (metadata.uid !== 0 || metadata.mode & 0o022) throw new Error("Der NAS-Helfer ist nicht sicher installiert. Bitte die Installationsanleitung zur Aktualisierung der Systemhelfer verwenden.");
    await new Promise<void>((resolve, reject) => {
      const child = execFile("sudo", ["-n", HELPER], { timeout: 50000, encoding: "utf8" }, (error) => {
        if (error) reject(new Error("NAS konnte nicht eingehängt werden. Prüfe Freigabe, Zugangsdaten und ob das Laufwerk noch verwendet wird."));
        else resolve();
      });
      const { pin: _pin, ...configuration } = body.data;
      void _pin;
      child.stdin?.end(JSON.stringify({ ...configuration, mountPath: TARGET }));
    });
    const status = await setBackupSettings({ path: TARGET });
    if (!status.writable) throw new Error(status.statusMessage);
    return NextResponse.json({ ok: true, path: TARGET, status, message: "Netzlaufwerk unter /mnt/nas/fitfamily eingehängt. Für automatisches Einhängen nach einem Neustart siehe Installationsanleitung." });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "NAS konnte nicht eingehängt werden." }, { status: 500 });
  }
}
