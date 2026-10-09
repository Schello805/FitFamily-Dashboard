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
      execFile("sudo", ["-n", HELPER], { timeout: 10000, encoding: "utf8" }, (error) => error ? reject(error) : resolve());
    });
    await writeAdminLog("dashboard.gymondo.started", "info", "Gymondo wurde in einem eigenen Fenster gestartet.").catch(() => undefined);
    return NextResponse.json({ ok: true, message: "Gymondo wird geöffnet." }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Gymondo konnte nicht gestartet werden. Prüfe die Desktop-Anmeldung und den FitFamily-Systemhelfer." }, { status: 503 });
  }
}
