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

  const hasUpdate = Boolean(latestCommit && currentCommit !== "unbekannt" && currentCommit !== latestCommit);

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
          `sudo -n "${scriptPath}" --no-restart 2>&1 || sudo -n bash "${scriptPath}" --no-restart 2>&1 || sudo -n /opt/fitfamily/scripts/update.sh --no-restart 2>&1 || sudo -n bash scripts/update.sh --no-restart 2>&1 || sudo -n "${scriptPath}" 2>&1 || sudo -n bash "${scriptPath}" 2>&1 || sudo -n /opt/fitfamily/scripts/update.sh 2>&1`,
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
      execSync(
        "git -c safe.directory='*' fetch origin main && git -c safe.directory='*' checkout -f main && git -c safe.directory='*' reset --hard origin/main",
        { cwd, timeout: 35000, encoding: "utf-8" }
      );
      execSync("npm install --prefer-offline --no-audit --no-fund", { cwd, timeout: 120000, encoding: "utf-8" });
      execSync("npm run build", { cwd, timeout: 180000, encoding: "utf-8" });
    }
  } catch (err) {
    return NextResponse.json(
      {
        error: `Update fehlgeschlagen: ${(err as Error).message}. Der bisherige Dienst bleibt unverändert aktiv.`
      },
      { status: 500 }
    );
  }

  const newCommit = getGitCommit("rev-parse --short HEAD") ?? getAppRevision().commit ?? "aktuell";

  // 3. Dienst nach kurzer Verzögerung neu starten, damit die HTTP-Antwort noch sauber ankommt
  setTimeout(() => {
    exec("sudo -n systemctl restart fitfamily || sudo systemctl restart fitfamily || systemctl restart fitfamily", { cwd }, () => undefined);
  }, 1500);

  return NextResponse.json({
    ok: true,
    message: "Update wurde erfolgreich installiert! Das Dashboard startet in wenigen Sekunden neu...",
    newCommit
  });
}
