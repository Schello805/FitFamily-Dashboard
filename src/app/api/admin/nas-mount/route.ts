import { execSync } from "node:child_process";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminPin } from "@/lib/security";
import { setBackupSettings } from "@/lib/backup";

export const dynamic = "force-dynamic";

const mountSchema = z.object({
  pin: z.string().min(4),
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
  const cleanShare = share.trim().replace(/^[\\/]+/, "").replace(/[\\/]+$/, "");
  const mountTarget = (customMountPath && customMountPath.trim()) ? customMountPath.trim() : "/mnt/nas/fitfamily";
  const unc = `//${cleanServer}/${cleanShare}`;

  try {
    // 1. Erstelle lokales Mount-Verzeichnis falls nötig
    try {
      execSync(`sudo -n /bin/mkdir -p "${mountTarget}" || mkdir -p "${mountTarget}"`, { timeout: 10000 });
      execSync(`sudo -n /bin/chown -R fitfamily:fitfamily "${mountTarget}" 2>/dev/null || true`, { timeout: 5000 });
    } catch {}

    // 2. Mount-Optionen zusammenstellen
    const opts: string[] = ["rw", "file_mode=0775", "dir_mode=0775"];
    if (username && username.trim()) {
      opts.push(`username=${username.trim()}`);
      if (password && password.trim()) {
        opts.push(`password=${password.trim()}`);
      }
    } else {
      opts.push("guest");
    }

    const optionsStr = opts.join(",");

    // 3. Prüfen, ob bereits gemountet
    let alreadyMounted = false;
    try {
      const currentMounts = execSync("mount", { encoding: "utf-8" });
      if (currentMounts.includes(mountTarget)) {
        alreadyMounted = true;
      }
    } catch {}

    if (!alreadyMounted) {
      execSync(`sudo -n mount -t cifs -o "${optionsStr}" "${unc}" "${mountTarget}"`, {
        timeout: 25000,
        encoding: "utf-8"
      });
    }

    // 4. Schreibtest auf gemountetem Pfad durchführen
    const testFile = path.join(mountTarget, `.fitfamily_test_${Date.now()}`);
    try {
      execSync(`touch "${testFile}" && rm -f "${testFile}"`, { timeout: 5000 });
    } catch {
      execSync(`sudo -n chmod 777 "${mountTarget}" 2>/dev/null || true`);
      execSync(`touch "${testFile}" && rm -f "${testFile}"`, { timeout: 5000 });
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
    const errorMsg = (err as Error)?.message || String(err);
    return NextResponse.json({
      ok: false,
      error: `Einbinden fehlgeschlagen: Konnte ${unc} nicht nach ${mountTarget} mounten. Details: ${errorMsg}`
    }, { status: 500 });
  }
}
