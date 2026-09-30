import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

function getGitInfo() {
  // 1. Aus Umgebungsvariable (z. B. GitHub Actions oder Deployment)
  if (process.env.NEXT_PUBLIC_APP_VERSION) {
    const raw = process.env.NEXT_PUBLIC_APP_VERSION.trim();
    return { commit: raw.slice(0, 7), fullCommit: raw };
  }

  // 2. Direkt aus dem .git-Dateisystem lesen (funktioniert immer, ohne Child-Process / Dubious Ownership)
  try {
    const gitDir = path.join(rootDir, ".git");
    const headPath = path.join(gitDir, "HEAD");
    if (fs.existsSync(headPath)) {
      const head = fs.readFileSync(headPath, "utf8").trim();
      if (head.startsWith("ref:")) {
        const refName = head.slice(4).trim();
        const refPath = path.join(gitDir, refName);
        if (fs.existsSync(refPath)) {
          const fullCommit = fs.readFileSync(refPath, "utf8").trim();
          return { commit: fullCommit.slice(0, 7), fullCommit };
        }
        // Falls gepackt (packed-refs)
        const packedPath = path.join(gitDir, "packed-refs");
        if (fs.existsSync(packedPath)) {
          const packed = fs.readFileSync(packedPath, "utf8");
          for (const line of packed.split("\n")) {
            if (line.endsWith(refName)) {
              const fullCommit = line.split(" ")[0].trim();
              if (fullCommit.length >= 7) {
                return { commit: fullCommit.slice(0, 7), fullCommit };
              }
            }
          }
        }
      } else if (head.length >= 7) {
        return { commit: head.slice(0, 7), fullCommit: head };
      }
    }
  } catch {}

  // 3. Fallback über Git CLI
  try {
    const commit = execSync("git rev-parse --short=7 HEAD", {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000
    }).trim();
    const fullCommit = execSync("git rev-parse HEAD", {
      cwd: rootDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 2000
    }).trim();
    return { commit, fullCommit };
  } catch {}

  return { commit: "aktuell", fullCommit: "" };
}

const pkgPath = path.join(rootDir, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const git = getGitInfo();

const versionData = {
  version: pkg.version || "0.1.0",
  commit: git.commit,
  fullCommit: git.fullCommit,
  displayVersion: git.commit !== "aktuell" ? git.commit : (pkg.version || "0.1.0"),
  builtAt: new Date().toISOString()
};

const targetPath = path.join(rootDir, "src", "lib", "version.json");
fs.writeFileSync(targetPath, JSON.stringify(versionData, null, 2) + "\n");
console.log(`[FitFamily] Revisionsdatei aktualisiert: Rev. ${versionData.displayVersion} (${versionData.builtAt})`);
