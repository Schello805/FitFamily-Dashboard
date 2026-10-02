import { exec, execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminPin } from "@/lib/security";

import { getAppRevision } from "@/lib/version";
import { writeAdminLog } from "@/lib/admin-log";

export const dynamic = "force-dynamic";

function getGitCommit(cmd: string): string | null {
  try {
    const cwd = process.cwd();
    return execSync(`git -c safe.directory='*' ${cmd}`, { cwd, encoding: "utf-8", timeout: 4000 }).trim();
  } catch {
    return null;
  }
}

function getPackageVersion(): string {
  try {
    const pkgPath = path.join(process.cwd(), "package.json");
    const content = JSON.parse(readFileSync(pkgPath, "utf-8"));
    return content.version ?? "0.2.17";
  } catch {
    return "0.2.17";
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const pin = searchParams.get("pin");

  if (!pin || !(await verifyAdminPin(pin))) {
    return NextResponse.json({ error: "Eltern-PIN ist nicht richtig" }, { status: 401 });
  }

  const cwd = process.cwd();
  let currentCommit = getGitCommit("rev-parse --short HEAD");
  if (!currentCommit) {
    const rev = getAppRevision();
    currentCommit = rev.commit || "unbekannt";
  }
  
  // Der Update-Check darf keinen veralteten origin/main-Stand als aktuell ausgeben.
  // Auf einem Raspberry Pi kann der GitHub-Fetch bei langsamem WLAN länger dauern.
  let remoteFetchSucceeded = false;
  try {
    execSync("git -c safe.directory='*' fetch --no-tags origin main", {
      cwd,
      timeout: 30000,
      stdio: "ignore"
    });
    remoteFetchSucceeded = true;
  } catch {
    // Ohne erfolgreichen Fetch ist origin/main möglicherweise veraltet.
  }

  if (!remoteFetchSucceeded) {
    await writeAdminLog("admin.update.check.error", "error", "GitHub konnte beim Update-Check nicht erreicht werden.").catch(() => undefined);
    return NextResponse.json(
      {
        ok: false,
        error: "GitHub konnte nicht zuverlässig abgefragt werden. Bitte Netzwerk prüfen und erneut versuchen; es wurde kein veralteter Stand als aktuell angezeigt.",
        currentCommit,
        version: getPackageVersion()
      },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }

  const latestCommit = getGitCommit("rev-parse --short origin/main");
  const latestMessage = getGitCommit("log -1 --format=%s origin/main");
  const version = getPackageVersion();
  let latestVersion = version;
  try {
    const remotePkgJson = execSync("git -c safe.directory='*' show origin/main:package.json", { cwd, encoding: "utf-8", timeout: 3000 });
    const parsed = JSON.parse(remotePkgJson);
    if (parsed.version) latestVersion = parsed.version;
  } catch {}

  const hasUpdate = Boolean(
    (latestCommit && currentCommit !== "unbekannt" && currentCommit !== latestCommit) ||
    (latestVersion && latestVersion !== version)
  );

  await writeAdminLog("admin.update.check", "info", hasUpdate ? "Neues Update auf GitHub gefunden." : "Dashboard ist auf dem aktuellen Stand.", {
    currentVersion: version,
    latestVersion,
    currentCommit,
    latestCommit,
    hasUpdate
  }).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    currentCommit,
    latestCommit: latestCommit ?? currentCommit,
    latestMessage: latestMessage ?? "Keine Information verfügbar",
    hasUpdate,
    version,
    latestVersion
  }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

const postSchema = z.object({ pin: z.string().regex(/^\d{4}$/) });

export async function POST(request: Request) {
  const body = postSchema.safeParse(await request.json());
  if (!body.success || !(await verifyAdminPin(body.data.pin))) {
    return NextResponse.json({ error: "Eltern-PIN ist nicht richtig" }, { status: 401 });
  }

  await writeAdminLog("admin.update.started", "info", "Updateinstallation gestartet.").catch(() => undefined);

  const cwd = process.cwd();

  // 1. Sicherheits-Backup der Datenbank
  try {
    const dbFile = path.join(cwd, "data", "fitfamily.db");
    const backupDir = path.join(cwd, "backups");
    if (existsSync(dbFile)) {
      mkdirSync(backupDir, { recursive: true });
      const backupPath = path.join(backupDir, `fitfamily-pre-update-${Date.now()}.db`);
      copyFileSync(dbFile, backupPath);
    }
  } catch (err) {
    await writeAdminLog("admin.update.error", "error", `Update-Backup fehlgeschlagen: ${(err as Error).message}`).catch(() => undefined);
    return NextResponse.json(
      { error: `Backup vor dem Update fehlgeschlagen: ${(err as Error).message}` },
      { status: 500 }
    );
  }

  // 2. Git Fetch & Reset --hard, npm install und Build ausführen
  try {
    let updatedViaScript = false;
    const scriptPath = path.join(cwd, "scripts", "update.sh");
    if (existsSync(scriptPath)) {
      try {
        execSync(
          `sudo -n "${scriptPath}" --no-restart 2>&1 || sudo -n /bin/bash "${scriptPath}" --no-restart 2>&1 || sudo -n /opt/fitfamily/scripts/update.sh --no-restart 2>&1 || sudo -n /bin/bash /opt/fitfamily/scripts/update.sh --no-restart 2>&1`,
          {
            cwd,
            timeout: 240000,
            encoding: "utf-8"
          }
        );
        updatedViaScript = true;
      } catch {
        updatedViaScript = false;
      }
    }

    if (!updatedViaScript) {
      // 1. Versuche Dateirechte via sudo zu korrigieren, falls sudoers vorhanden
      try {
        execSync(
          "sudo -n /bin/chown -R fitfamily:fitfamily /opt/fitfamily 2>/dev/null || sudo -n /usr/bin/chown -R fitfamily:fitfamily /opt/fitfamily 2>/dev/null || true",
          { cwd, timeout: 5000 }
        );
      } catch {}

      // 2. WICHTIG: .next niemals in-place unlinken (scheitert bei Root-Artefakten mit EACCES)!
      // In Linux benötigt das Verschieben/Umbenennen eines Verzeichnisses nur Schreibrecht auf dem Elternordner (/opt/fitfamily).
      // Damit kann der fitfamily-User den alten .next-Ordner IMMER wegbewegen, selbst wenn Dateien darin root gehören!
      try {
        const trashDir = path.join(cwd, `.next_trash_${Date.now()}`);
        if (existsSync(path.join(cwd, ".next"))) {
          execSync(`sudo -n /bin/rm -rf .next 2>/dev/null || mv .next "${trashDir}" 2>/dev/null || true`, { cwd });
          execSync(`sudo -n /bin/rm -rf .next_trash_* 2>/dev/null || rm -rf .next_trash_* 2>/dev/null || true`, { cwd });
        }
      } catch {}

      // 3. Git Fetch & Reset --hard
      execSync(
        "git config --global --add safe.directory '*' 2>/dev/null || true; git config --system --add safe.directory '*' 2>/dev/null || true; git -c safe.directory='*' fetch origin main && git -c safe.directory='*' checkout -f main && git -c safe.directory='*' reset --hard origin/main",
        { cwd, timeout: 45000, encoding: "utf-8" }
      );

      // 4. npm install
      execSync("npm install --prefer-offline --no-audit --no-fund", { cwd, timeout: 120000, encoding: "utf-8" });

      // 5. Build mit automatischer Selbstreparatur bei EACCES
      try {
        execSync("npm run build", { cwd, timeout: 180000, encoding: "utf-8" });
      } catch (buildErr) {
        const errMsg = (buildErr as Error)?.message || String(buildErr);
        // Falls trotz allem ein EACCES oder unlink-Problem aufgetreten ist:
        if (errMsg.includes("EACCES") || errMsg.includes("permission denied") || errMsg.includes("unlink")) {
          const emergencyTrash = path.join(cwd, `.next_emergency_${Date.now()}`);
          execSync(`sudo -n /bin/rm -rf .next 2>/dev/null || mv .next "${emergencyTrash}" 2>/dev/null || true`, { cwd });
          // Zweiter Versuch mit komplett jungfräulichem Verzeichnis
          execSync("npm run build", { cwd, timeout: 180000, encoding: "utf-8" });
        } else {
          throw buildErr;
        }
      }
    }
  } catch (err) {
    const errorMsg = (err as Error)?.message || String(err);
    const userMessage = `Update fehlgeschlagen: ${errorMsg}. Der bisherige Dienst bleibt unverändert aktiv.`;
    await writeAdminLog("admin.update.error", "error", userMessage).catch(() => undefined);

    return NextResponse.json(
      {
        error: userMessage
      },
      { status: 500 }
    );
  }

  const newCommit = getGitCommit("rev-parse --short HEAD") ?? getAppRevision().commit ?? "aktuell";
  const newVersion = getPackageVersion();
  await writeAdminLog("admin.update.success", "info", "Update installiert; Dienst wird neu gestartet.", { version: newVersion, commit: newCommit }).catch(() => undefined);

  // 3. Dienst nach kurzer Verzögerung neu starten, damit die HTTP-Antwort noch sauber ankommt
  setTimeout(() => {
    exec("sudo -n /bin/systemctl restart fitfamily || sudo -n systemctl restart fitfamily || systemctl restart fitfamily", { cwd }, (err) => {
      if (err) {
        // Fallback: Falls systemctl ohne Sudo-Passwort blockiert, beende Node.js kontrolliert mit Exit 1.
        // systemd (Restart=on-failure) startet den Dienst sofort mit dem neuen Build neu!
        setTimeout(() => {
          process.exit(1);
        }, 500);
      }
    });
    // Zusätzlicher Sicherheits-Timeout: Falls sudo/systemctl auf Eingabe wartet
    setTimeout(() => {
      process.exit(1);
    }, 3500);
  }, 1500);

  return NextResponse.json({
    ok: true,
    message: "Update wurde erfolgreich installiert! Das Dashboard startet in wenigen Sekunden neu...",
    newCommit,
    newVersion
  });
}
