import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { getAppRevision } from "./version";

describe("getAppRevision", () => {
  it("returns a valid revision with commit and commitUrl", () => {
    const revision = getAppRevision();
    expect(revision).toBeDefined();
    expect(typeof revision.version).toBe("string");
    expect(revision.version.length).toBeGreaterThan(0);
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
