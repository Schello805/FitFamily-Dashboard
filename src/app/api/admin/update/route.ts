import { exec, execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminPin } from "@/lib/security";

import { getAppRevision } from "@/lib/version";

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
    return content.version ?? "0.1.0";
  } catch {
    return "0.1.0";
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
  
  // Versuche, den Remote-Stand zu prüfen (ohne langes Warten, falls offline)
  try {
    execSync("git -c safe.directory='*' fetch origin main", { cwd, timeout: 6000, stdio: "ignore" });
  } catch {
    // Offline oder Netzwerk nicht erreichbar
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

  return NextResponse.json({
    ok: true,
    currentCommit,
    latestCommit: latestCommit ?? currentCommit,
    latestMessage: latestMessage ?? "Keine Information verfügbar",
    hasUpdate,
    version,
    latestVersion
  });
}

const postSchema = z.object({ pin: z.string().min(4) });

export async function POST(request: Request) {
  const body = postSchema.safeParse(await request.json());
  if (!body.success || !(await verifyAdminPin(body.data.pin))) {
    return NextResponse.json({ error: "Eltern-PIN ist nicht richtig" }, { status: 401 });
  }

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

    return NextResponse.json(
      {
        error: userMessage
      },
      { status: 500 }
    );
  }

  const newCommit = getGitCommit("rev-parse --short HEAD") ?? getAppRevision().commit ?? "aktuell";
  const newVersion = getPackageVersion();

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
