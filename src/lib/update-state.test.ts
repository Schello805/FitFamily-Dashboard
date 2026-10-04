import { describe, expect, it } from "vitest";
import { matchesUpdate, parseUpdateJob } from "./update-state";

describe("update confirmation", () => {
  const current = { version: "0.3.8", commit: "abcdef0", fullCommit: "abcdef0".padEnd(40, "1") };
  it("requires both running revision and version, including same-version rebuilds", () => {
    expect(matchesUpdate(current, { targetVersion: "0.3.8", targetCommit: "abcdef0" })).toBe(true);
    expect(matchesUpdate(current, { targetVersion: "0.3.8", targetCommit: "1234567" })).toBe(false);
    expect(matchesUpdate(current, { targetVersion: "0.3.7", targetCommit: "abcdef0" })).toBe(false);
    expect(matchesUpdate(current, { targetVersion: "0.3.8", targetCommit: "aktuell" })).toBe(false);
    expect(matchesUpdate(current, { targetVersion: "0.3.8" })).toBe(false);
  });
  it("rejects malformed or future jobs and preserves the original timeout after reload", () => {
    const job = { jobId: "12345678-1234-1234-1234-123456789abc", startedAt: Date.now() - 60000 };
    expect(parseUpdateJob(JSON.stringify(job))).toEqual(job);
    expect(parseUpdateJob(JSON.stringify({ ...job, startedAt: Date.now() + 60000 }))).toBeNull();
    expect(parseUpdateJob(JSON.stringify({ ...job, jobId: "../file" }))).toBeNull();
    expect(parseUpdateJob("broken")).toBeNull();
    expect(parseUpdateJob(null)).toBeNull();
  });
});
