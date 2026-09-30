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
