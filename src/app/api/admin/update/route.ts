import { exec, execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminPin } from "@/lib/security";

export const dynamic = "force-dynamic";

function getGitCommit(cmd: string): string | null {
  try {
    return execSync(cmd, { cwd: process.cwd(), encoding: "utf-8", timeout: 4000 }).trim();
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
  const currentCommit = getGitCommit("git rev-parse --short HEAD") ?? "unbekannt";
  
  // Versuche, den Remote-Stand zu prüfen (ohne langes Warten, falls offline)
  try {
    execSync(`git config --global --add safe.directory "${cwd}" || true`, { cwd, timeout: 2000 });
    execSync("git fetch origin main", { cwd, timeout: 6000, stdio: "ignore" });
  } catch {
    // Offline oder Netzwerk nicht erreichbar
  }

  const latestCommit = getGitCommit("git rev-parse --short origin/main");
  const latestMessage = getGitCommit("git log -1 --format=%s origin/main");
  const version = getPackageVersion();

  const hasUpdate = Boolean(latestCommit && currentCommit !== latestCommit);

  return NextResponse.json({
    ok: true,
    currentCommit,
    latestCommit: latestCommit ?? currentCommit,
    latestMessage: latestMessage ?? "Keine Information verfügbar",
    hasUpdate,
    version
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

  // 2. Git Pull, npm ci und Build ausführen
  try {
    execSync(`git config --global --add safe.directory "${cwd}" || true; git fetch origin main && git checkout main && git pull --ff-only origin main`, {
      cwd,
      timeout: 30000,
      encoding: "utf-8"
    });
    execSync("npm ci", { cwd, timeout: 120000, encoding: "utf-8" });
    execSync("npm run build", { cwd, timeout: 180000, encoding: "utf-8" });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Update fehlgeschlagen: ${(err as Error).message}. Der bisherige Dienst bleibt unverändert aktiv.`
      },
      { status: 500 }
    );
  }

  const newCommit = getGitCommit("git rev-parse --short HEAD") ?? "aktuell";

  // 3. Dienst nach kurzer Verzögerung neu starten, damit die HTTP-Antwort noch sauber ankommt
  setTimeout(() => {
    exec("sudo systemctl restart fitfamily || systemctl restart fitfamily", { cwd }, () => undefined);
  }, 1500);

  return NextResponse.json({
    ok: true,
    message: "Update wurde erfolgreich installiert! Das Dashboard startet in wenigen Sekunden neu...",
    newCommit
  });
}
