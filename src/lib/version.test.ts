import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { getAppRevision } from "./version";
import versionData from "./version.json";

describe("getAppRevision", () => {
  it("reports the compiled production revision even if Git or environment changed", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "1234567".padEnd(40, "0"));
    try {
      expect(getAppRevision().commit).toBe(versionData.commit);
      expect(getAppRevision().fullCommit).toBe(versionData.fullCommit);
    } finally { vi.unstubAllEnvs(); }
  });
  it("returns a valid revision with commit and commitUrl", () => {
    const revision = getAppRevision();
    expect(revision).toBeDefined();
    expect(typeof revision.version).toBe("string");
    expect(revision.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(typeof revision.commit).toBe("string");
    expect(revision.commitUrl).toContain("https://github.com/Schello805/FitFamily-Dashboard");
  });
});

describe("scripts verification", () => {
  it("scripts/update.sh and scripts/repair.sh exist and have valid bash syntax", () => {
    const rootDir = path.resolve(__dirname, "../..");
    const updateSh = path.join(rootDir, "scripts", "update.sh");
    const repairSh = path.join(rootDir, "scripts", "repair.sh");

    expect(fs.existsSync(updateSh)).toBe(true);
    expect(fs.existsSync(repairSh)).toBe(true);

    // Bash syntax check (-n flag checks syntax without running)
    expect(() => execSync(`bash -n "${updateSh}"`)).not.toThrow();
    expect(() => execSync(`bash -n "${repairSh}"`)).not.toThrow();
  });
});
