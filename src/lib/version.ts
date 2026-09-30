import fs from "node:fs";
import path from "node:path";
import versionData from "./version.json";

export type AppRevision = {
  version: string;
  commit: string;
  fullCommit: string;
  commitUrl: string;
};

export function getAppRevision(): AppRevision {
  // 1. Wenn ENV Variable explizit gesetzt ist (z. B. Docker oder CI)
  const envRev = process.env.NEXT_PUBLIC_APP_VERSION || process.env.NEXT_PUBLIC_APP_REVISION;

  // 2. Direkt aus dem .git-Dateisystem lesen (funktioniert sofort nach jedem 'git pull')
  let liveCommit: string | null = null;
  let fullLiveCommit = "";
  try {
    const gitDir = path.join(process.cwd(), ".git");
    const headPath = path.join(gitDir, "HEAD");
    if (fs.existsSync(headPath)) {
      const head = fs.readFileSync(headPath, "utf8").trim();
      if (head.startsWith("ref:")) {
        const refName = head.slice(4).trim();
        const refPath = path.join(gitDir, refName);
        if (fs.existsSync(refPath)) {
          fullLiveCommit = fs.readFileSync(refPath, "utf8").trim();
          liveCommit = fullLiveCommit.slice(0, 7);
        } else {
          const packedPath = path.join(gitDir, "packed-refs");
          if (fs.existsSync(packedPath)) {
            const packed = fs.readFileSync(packedPath, "utf8");
            for (const line of packed.split("\n")) {
              if (line.endsWith(refName)) {
                fullLiveCommit = line.split(" ")[0].trim();
                liveCommit = fullLiveCommit.slice(0, 7);
                break;
              }
            }
          }
        }
      } else if (head.length >= 7) {
        fullLiveCommit = head;
        liveCommit = head.slice(0, 7);
      }
    }
  } catch {
    // Filesystem-Fehler abfangen
  }

  const commit = liveCommit || (envRev ? envRev.slice(0, 7) : versionData.commit);
  const fullCommit = fullLiveCommit || (envRev ? envRev : versionData.fullCommit) || commit;
  const version = commit && commit !== "aktuell" ? commit : versionData.version;
  const commitUrl = fullCommit && fullCommit !== "aktuell"
    ? `https://github.com/Schello805/FitFamily-Dashboard/commit/${fullCommit}`
    : "https://github.com/Schello805/FitFamily-Dashboard";

  return {
    version,
    commit,
    fullCommit,
    commitUrl
  };
}
