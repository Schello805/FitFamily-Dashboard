import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const scriptRoot = path.resolve("scripts");
describe("deployment helpers", () => {
  it("keeps the active build through rejected staging and atomically switches and rolls back complete releases", async () => {
    const directory = await realpath(await mkdtemp(path.join(tmpdir(), "fitfamily-release-test-")));
    try {
      const previous = path.join(directory, "releases", "old");
      const next = path.join(directory, "releases", "new");
      const incomplete = path.join(directory, "releases", "failed");
      for (const release of [previous, next, incomplete]) await mkdir(path.join(release, ".next"), { recursive: true });
      await writeFile(path.join(previous, ".next", "BUILD_ID"), "old-build");
      await writeFile(path.join(next, ".next", "BUILD_ID"), "new-build");
      await symlink(previous, path.join(directory, "current"));
      const run = (operation: string, release: string, id: string) => spawnSync("bash", ["-c", 'source "$1"; "$2" "$3" "$4" "$5"', "test", path.join(scriptRoot, "release-state.sh"), operation, directory, release, id]);
      expect(run("activate_release", incomplete, "failed").status).not.toBe(0);
      expect(await realpath(path.join(directory, "current"))).toBe(previous);
      expect(run("activate_release", next, "complete").status).toBe(0);
      expect(await realpath(path.join(directory, "current"))).toBe(next);
      expect(run("restore_release", previous, "rollback").status).toBe(0);
      expect(await realpath(path.join(directory, "current"))).toBe(previous);
      expect(await readFile(path.join(previous, ".next", "BUILD_ID"), "utf8")).toBe("old-build");
    } finally { await rm(directory, { recursive: true, force: true }); }
  });

  it("rejects NAS paths over application code and option injection before privileged execution", () => {
    const parse = (configuration: unknown) => spawnSync("/usr/bin/python3", ["-c", 'import runpy,io,sys; module=runpy.run_path(sys.argv[1]); sys.stdin=io.StringIO(sys.argv[2]); module["configuration"]()', path.join(scriptRoot, "mount-nas.py"), JSON.stringify(configuration)]);
    expect(parse({ server: "192.168.1.100", share: "backup/family" }).status).toBe(0);
    expect(parse({ server: "192.168.1.100", share: "backup", mountPath: "/opt/fitfamily/scripts" }).status).not.toBe(0);
    expect(parse({ server: "192.168.1.100", share: "backup/../scripts" }).status).not.toBe(0);
    expect(parse({ server: "192.168.1.100", share: "backup", username: "user\npassword=injected" }).status).not.toBe(0);
    expect(parse({ server: "192.168.1.100,uid=0", share: "backup" }).status).not.toBe(0);
  }, 15000);

  it("has valid shell syntax and grants only no-argument root-owned request helpers", async () => {
    const scripts = ["update.sh", "request-update.sh", "release-state.sh", "install-privileged-helpers.sh", "restore-db.sh", "install-ubuntu.sh", "install-pi.sh", "repair.sh", "setup-https.sh", "setup-kiosk-autostart.sh"];
    for (const filename of scripts) execFileSync("bash", ["-n", path.join(scriptRoot, filename)]);
    const installer = await readFile(path.join(scriptRoot, "install-privileged-helpers.sh"), "utf8");
    expect(installer).toContain('fitfamily-update-request ""');
    expect(installer).toContain('fitfamily-mount ""');
    expect(installer).not.toMatch(/NOPASSWD:.*(?:\/bin\/systemctl|\/bin\/chown|\/bin\/rm|\/opt\/fitfamily\/scripts)/);
  });

  it("quiesces writes before the rollback snapshot and checks real dashboard data", async () => {
    for (const filename of ["update.sh", "restore-db.sh"]) {
      const source = await readFile(path.join(scriptRoot, filename), "utf8");
      const snapshot = source.indexOf('sqlite-maintenance.mjs" snapshot');
      expect(source.indexOf("systemctl stop fitfamily.service", source.indexOf("trap rollback EXIT"))).toBeLessThan(snapshot);
      expect(source).toContain("http://127.0.0.1:3000/api/dashboard");
    }
  });

  it("checks the exact running revision before refreshing the fixed helper allowlist", async () => {
    const worker = await readFile(path.join(scriptRoot, "update.sh"), "utf8");
    expect(worker).toContain('NEXT_PUBLIC_APP_VERSION="$NEW_COMMIT"');
    expect(worker).toContain("revision==expected");
    expect(worker.indexOf("http://127.0.0.1:3000/api/version")).toBeLessThan(worker.indexOf('refresh_release_helpers "$STAGE" "$NEW_COMMIT"'));
    expect(worker.indexOf('refresh_release_helpers "$STAGE" "$NEW_COMMIT"')).toBeLessThan(worker.indexOf("write_status success"));
    const helpers = await readFile(path.join(scriptRoot, "release-state.sh"), "utf8");
    expect(helpers).toContain("metadata.st_uid != 0");
    expect(helpers).toContain("metadata.st_mode & 0o022");
    expect(helpers).toContain("stat.S_ISREG");
    expect(helpers).toContain("trusted != (release / 'scripts' / source).read_bytes()");
    expect(helpers).toContain("for name in reversed(replaced)");
    expect(helpers).toContain("os.replace(work / (name + '.old'), destination / name)");
    const code = helpers.split("<<'PY'\n")[1].split("\nPY")[0];
    execFileSync("/usr/bin/python3", ["-c", "import sys; compile(sys.argv[1], 'helper-refresh', 'exec')", code]);
  });

  it("restores helper bytes on replacement failure and rejects changed release sources", async () => {
    const directory = await realpath(await mkdtemp(path.join(tmpdir(), "fitfamily-helper-test-")));
    try {
      const release = path.join(directory, "releases", "new");
      const destination = path.join(directory, "helpers");
      await mkdir(path.join(release, "scripts"), { recursive: true });
      await mkdir(destination);
      const names = { "update.sh": "fitfamily-update", "release-state.sh": "fitfamily-release-state", "request-update.sh": "fitfamily-update-request", "mount-nas.py": "fitfamily-mount", "restore-db.sh": "fitfamily-restore" };
      const source = await readFile(path.join(scriptRoot, "release-state.sh"), "utf8");
      // Redirect every privileged destination into the temporary fixture. Simulate
      // root metadata and HTTPS; exercise real file preparation/replacement/undo.
      const code = source.split("<<'PY'\n")[1].split("\nPY")[0]
        .replace("'/usr/local/libexec'", JSON.stringify(destination))
        .replace("'/opt/fitfamily/releases/'", JSON.stringify(path.join(directory, "releases") + "/"));
      const harness = `import io, os, pathlib, stat, sys, types, urllib.request
code, release, scenario = sys.argv[1:]
sys.argv = ['test', release, 'a' * 40]
os.geteuid = lambda: 0
original_stat = pathlib.Path.lstat
def owned(path):
    value = original_stat(path)
    permissions = value.st_mode & ~0o022 if stat.S_ISDIR(value.st_mode) else value.st_mode
    return types.SimpleNamespace(st_uid=0, st_mode=permissions)
pathlib.Path.lstat = owned
def download(url, timeout):
    return io.BytesIO(b'tampered' if scenario == 'tamper' else (pathlib.Path(release) / 'scripts' / url.rsplit('/', 1)[1]).read_bytes())
urllib.request.urlopen = download
original_replace = os.replace
def replace(source, target):
    if scenario == 'failure' and pathlib.Path(source).name == 'fitfamily-release-state':
        raise OSError('Injected replacement failure')
    return original_replace(source, target)
os.replace = replace
exec(compile(code, 'helper-refresh', 'exec'))`;
      for (const mode of ["failure", "tamper", "success"]) {
        for (const [filename, target] of Object.entries(names)) {
          await writeFile(path.join(release, "scripts", filename), `new-${filename}`, { mode: 0o644 });
          await writeFile(path.join(destination, target), `old-${filename}`, { mode: 0o644 });
        }
        const result = spawnSync("/usr/bin/python3", ["-c", harness, code, release, mode]);
        expect(result.status, result.stderr.toString()).toBe(mode === "success" ? 0 : 1);
        for (const [filename, target] of Object.entries(names)) {
          expect(await readFile(path.join(destination, target), "utf8")).toBe(`${mode === "success" ? "new" : "old"}-${filename}`);
        }
      }
    } finally { await rm(directory, { recursive: true, force: true }); }
  });
});
