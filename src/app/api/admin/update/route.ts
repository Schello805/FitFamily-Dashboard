import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminPinOrReject } from "@/lib/security";
import { getAppRevision } from "@/lib/version";
import { writeAdminLog } from "@/lib/admin-log";
import { matchesUpdate } from "@/lib/update-state";

export const dynamic = "force-dynamic";
const HELPER = "/usr/local/libexec/fitfamily-update-request";
const REPOSITORY = "https://github.com/Schello805/FitFamily-Dashboard.git";
const statusSchema = z.object({
  state: z.enum(["idle", "running", "success", "error"]),
  jobId: z.string().optional(), startedAt: z.string().optional(), message: z.string().optional(),
  newCommit: z.string().optional(), newVersion: z.string().optional()
});

export async function GET(request: Request) {
  const authError = await verifyAdminPinOrReject(undefined, request);
  if (authError) return authError;
  const parameters = new URL(request.url).searchParams;
  if (parameters.get("status") === "1") {
    const jobId = parameters.get("jobId");
    if (jobId && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(jobId)) return NextResponse.json({ error: "Ungültige Update-ID." }, { status: 400 });
    try {
      const filename = jobId ? `/var/lib/fitfamily/update-${jobId}.json` : "/var/lib/fitfamily/update-status.json";
      const status = statusSchema.parse(JSON.parse(await readFile(filename, "utf8")));
      if (jobId && status.jobId !== jobId) throw new Error("Update-ID stimmt nicht überein.");
      if (status.state === "success" && !matchesUpdate(getAppRevision(), { targetCommit: status.newCommit, targetVersion: status.newVersion })) {
        return NextResponse.json({ state: "unknown", jobId: status.jobId, message: "Gespeicherter Update-Erfolg passt nicht zur laufenden Version. Bitte Betriebsprotokoll prüfen." }, { headers: { "Cache-Control": "no-store" } });
      }
      return NextResponse.json(status, { headers: { "Cache-Control": "no-store" } });
    } catch (error) {
      const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
      return NextResponse.json({ state: missing && !jobId ? "idle" : "unknown", jobId: jobId ?? undefined, message: missing ? "Noch keine Statusmeldung des Update-Dienstes vorhanden." : "Update-Status ist unlesbar oder ungültig. Bitte Betriebsprotokoll prüfen." }, { headers: { "Cache-Control": "no-store" } });
    }
  }
  const current = getAppRevision();
  try {
    const remote = await new Promise<string>((resolve, reject) => {
      execFile("git", ["ls-remote", "--heads", REPOSITORY, "main"], { timeout: 30000, encoding: "utf8" }, (error, output) => error ? reject(error) : resolve(output));
    });
    const latestFullCommit = remote.trim().split(/\s+/)[0];
    const latestCommit = latestFullCommit?.slice(0, 7);
    if (!latestCommit || !/^[a-f0-9]{7}$/.test(latestCommit)) throw new Error("GitHub lieferte keine gültige Revision.");
    const response = await fetch(`https://raw.githubusercontent.com/Schello805/FitFamily-Dashboard/${latestFullCommit}/package.json`, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error("Versionsabfrage fehlgeschlagen.");
    const packageInfo = await response.json() as { version?: unknown };
    if (typeof packageInfo.version !== "string") throw new Error("GitHub lieferte keine Versionsnummer.");
    const latestVersion = packageInfo.version;
    return NextResponse.json({ ok: true, currentCommit: current.commit, latestCommit, latestMessage: "Aktueller Stand des Hauptzweigs", hasUpdate: latestCommit !== current.commit || latestVersion !== current.version, version: current.version, latestVersion }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "GitHub konnte nicht zuverlässig abgefragt werden. Bitte Netzwerk prüfen.", currentCommit: current.commit, version: current.version }, { status: 503 });
  }
}

export async function POST(request: Request) {
  // The existing admin session is sufficient; never ask for a second PIN.
  const authError = await verifyAdminPinOrReject(undefined, request);
  if (authError) return authError;
  try {
    const metadata = await lstat(HELPER);
    if (!metadata.isFile() || metadata.uid !== 0 || metadata.mode & 0o022) throw new Error("Unsicherer Update-Helfer.");
  } catch {
    return NextResponse.json({ error: "Sichere Update-Helfer fehlen. Im aktiven Projektverzeichnis auf dem Server einmal sudo ./scripts/install-privileged-helpers.sh ausführen. Die aktive Version bleibt erhalten." }, { status: 503 });
  }
  const jobId = randomUUID();
  try {
    await new Promise<void>((resolve, reject) => {
      const child = execFile("sudo", ["-n", HELPER], { timeout: 10000, encoding: "utf8" }, (error) => error ? reject(error) : resolve());
      child.stdin?.end(`${jobId}\n`);
    });
    await writeAdminLog("admin.update.started", "info", "Update wird in einer getrennten Version vorbereitet.", { jobId }).catch(() => undefined);
    return NextResponse.json({ ok: true, pending: true, jobId }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Update-Dienst konnte nicht gestartet werden. Prüfe Systemhelfer und sudoers-Konfiguration; die aktive Version bleibt erhalten." }, { status: 503 });
  }
}
