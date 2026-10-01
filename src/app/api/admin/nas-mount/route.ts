import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminPin } from "@/lib/security";
import { setBackupSettings } from "@/lib/backup";

export const dynamic = "force-dynamic";

const mountSchema = z.object({
  pin: z.string().regex(/^\d{4}$/),
  server: z.string().min(1),
  share: z.string().min(1),
  username: z.string().optional(),
  password: z.string().optional(),
  mountPath: z.string().optional()
});

export async function POST(request: Request) {
  const body = mountSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) {
    return NextResponse.json({ error: "Bitte Server-Adresse, Freigabename und PIN ausfüllen." }, { status: 400 });
  }

  const { pin, server, share, username, password, mountPath: customMountPath } = body.data;

  if (!(await verifyAdminPin(pin))) {
    return NextResponse.json({ error: "Eltern-PIN ist nicht richtig." }, { status: 401 });
  }

  const cleanServer = server.trim().replace(/^[\\/]+/, "").replace(/[\\/]+$/, "");
  const shareParts = share.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").split("/");
  if (
    !cleanServer || /[\s/\\,]/.test(cleanServer) ||
    shareParts.some((part) => !part || part === "." || part === ".." || /[,\r\n]/.test(part))
  ) {
    return NextResponse.json({ error: "Bitte eine gültige Serveradresse und Freigabe angeben (z. B. 192.168.1.118 und Public/fitfamily)." }, { status: 400 });
  }
  const cleanShare = shareParts[0];
  const shareSubdirectory = shareParts.slice(1).join("/");
  const mountTarget = (customMountPath && customMountPath.trim()) ? customMountPath.trim() : "/mnt/nas/fitfamily";
  if (!path.isAbsolute(mountTarget) || /[\0\r\n]/.test(mountTarget) || mountTarget === "/") {
    return NextResponse.json({ error: "Der lokale Einhängepfad muss ein gültiger absoluter Pfad sein und darf nicht das Wurzelverzeichnis sein." }, { status: 400 });
  }
  if (/[\r\n]/.test(username ?? "") || /[\r\n]/.test(password ?? "")) {
    return NextResponse.json({ error: "Benutzername und Passwort dürfen keine Zeilenumbrüche enthalten." }, { status: 400 });
  }
  const unc = `//${cleanServer}/${cleanShare}`;
  let credentialsDir: string | null = null;
  let credentialsPath: string | null = null;

  try {
    // 1. Erstelle lokales Mount-Verzeichnis falls nötig
    execFileSync("sudo", ["-n", "/bin/mkdir", "-p", mountTarget], { timeout: 10000, stdio: "pipe" });

    // 2. Mount-Optionen zusammenstellen
    const opts: string[] = ["rw", "file_mode=0775", "dir_mode=0775"];
    if (typeof process.getuid === "function" && typeof process.getgid === "function") {
      opts.push(`uid=${process.getuid()}`, `gid=${process.getgid()}`);
    }
    if (shareSubdirectory) opts.push(`prefixpath=${shareSubdirectory}`);
    if (username && username.trim()) {
      opts.push(`username=${username.trim()}`);
      if (password && password.trim()) {
        // Passwort niemals als Prozessargument übergeben (sichtbar via ps / in Fehlertexten).
        credentialsDir = mkdtempSync(path.join(os.tmpdir(), "fitfamily-cifs-"));
        credentialsPath = path.join(credentialsDir, "credentials");
        writeFileSync(credentialsPath, `username=${username.trim()}\npassword=${password.trim()}\n`, { mode: 0o600 });
        opts.splice(opts.indexOf(`username=${username.trim()}`), 1, `credentials=${credentialsPath}`);
      }
    } else {
      opts.push("guest");
    }

    const optionsStr = opts.join(",");

    // 3. Prüfen, ob bereits gemountet
    let alreadyMounted = false;
    try {
      const currentMounts = execFileSync("/bin/mount", [], { encoding: "utf-8" });
      if (currentMounts.includes(mountTarget)) {
        alreadyMounted = true;
      }
    } catch {}

    if (!alreadyMounted) {
      execFileSync("sudo", ["-n", "/bin/mount", "-t", "cifs", "-o", optionsStr, unc, mountTarget], {
        timeout: 25000,
        encoding: "utf-8",
        stdio: "pipe"
      });
    }

    // 4. Schreibtest auf gemountetem Pfad durchführen
    const testFile = path.join(mountTarget, `.fitfamily_test_${Date.now()}`);
    try {
      writeFileSync(testFile, "ok", { flag: "wx" });
      unlinkSync(testFile);
    } catch (writeError) {
      try { unlinkSync(testFile); } catch {}
      throw new Error(`Verbindung besteht, aber der Einhängepfad ist nicht beschreibbar: ${(writeError as Error).message}`);
    }

    // 5. Automatisch als NAS-Sicherungspfad abspeichern
    const status = await setBackupSettings({ path: mountTarget });

    return NextResponse.json({
      ok: true,
      message: `Netzlaufwerk ${unc} wurde erfolgreich unter ${mountTarget} eingebunden und als Sicherungspfad eingerichtet!`,
      path: mountTarget,
      status
    });
  } catch (err) {
    const commandError = err as NodeJS.ErrnoException & { stderr?: Buffer | string };
    const stderr = commandError.stderr?.toString().trim();
    const errorMsg = (stderr || commandError.message || "Unbekannter Mount-Fehler")
      .replace(/password=[^,\s"']+/gi, "password=[geschützt]");
    return NextResponse.json({
      ok: false,
      error: `Einbinden fehlgeschlagen: Konnte ${unc} nicht nach ${mountTarget} mounten. Details: ${errorMsg}`
    }, { status: 500 });
  } finally {
    if (credentialsDir) rmSync(credentialsDir, { recursive: true, force: true });
  }
}
