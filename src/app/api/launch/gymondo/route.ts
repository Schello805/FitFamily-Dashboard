import { execFile } from "node:child_process";
import { lstat } from "node:fs/promises";
import { NextResponse } from "next/server";
import { writeAdminLog } from "@/lib/admin-log";
import { isSameOriginRequest } from "@/lib/security";

export const dynamic = "force-dynamic";

const HELPER = "/usr/local/libexec/fitfamily-gymondo-request";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Diese Anfrage muss aus der FitFamily-App kommen." }, { status: 403 });
  }

  try {
    const metadata = await lstat(HELPER);
    if (!metadata.isFile() || metadata.uid !== 0 || metadata.mode & 0o022) throw new Error("Unsicherer Starter.");
  } catch {
    return NextResponse.json({ error: "Der Gymondo-Starter muss auf diesem PC einmalig eingerichtet werden. Danach funktioniert der Header-Button ohne Terminal und ohne PIN." }, { status: 503 });
  }

  try {
    await new Promise<void>((resolve, reject) => {
      execFile("sudo", ["-n", HELPER], { timeout: 10000, encoding: "utf8" }, (error, _stdout, stderr) => {
        if (!error) return resolve();
        const detail = stderr.trim().replace(/\s+/g, " ").slice(0, 220);
        reject(new Error(detail || error.message));
      });
    });
    await writeAdminLog("dashboard.gymondo.started", "info", "Gymondo wurde in einem eigenen Fenster gestartet.").catch(() => undefined);
    return NextResponse.json({ ok: true, message: "Gymondo wird geöffnet." }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (caught) {
    const detail = caught instanceof Error ? caught.message : "";
    const missingPermission = /not allowed|password is required|a password is required/i.test(detail);
    return NextResponse.json({ error: missingPermission ? "Der Gymondo-Systemhelfer ist noch nicht freigegeben. Bitte die einmalige Einrichtung auf dem Lenovo abschließen." : `Gymondo konnte nicht gestartet werden: ${detail || "Unbekannter Systemfehler."}` }, { status: 503 });
  }
}
