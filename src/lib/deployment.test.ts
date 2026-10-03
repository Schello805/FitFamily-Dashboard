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
});
