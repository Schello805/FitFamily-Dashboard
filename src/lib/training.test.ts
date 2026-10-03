import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { getDashboardData } from "@/lib/dashboard";
import { enforceSafetyPauses, startOrSwitchTraining, stopTraining } from "@/lib/training";

const profileId = `safety-test-${randomUUID()}`;
const now = new Date("2026-10-03T12:00:00Z");
let sessionId: string;

describe("training safety limit", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const client = await db();
    sessionId = randomUUID();
    await client.batch([
      { sql: "INSERT INTO profiles (id, name, color, avatar) VALUES (?, 'Safety Test', '#22d3ee', 'papa')", args: [profileId] },
      { sql: "INSERT INTO training_sessions (id, profile_id, started_at, status) VALUES (?, ?, '2026-10-03T02:00:00.000Z', 'active')", args: [sessionId, profileId] },
      { sql: "INSERT INTO training_segments (id, session_id, type, started_at, ended_at) VALUES (?, ?, 'endurance', '2026-10-03T02:00:00.000Z', '2026-10-03T07:00:00.000Z')", args: [randomUUID(), sessionId] },
      { sql: "INSERT INTO training_segments (id, session_id, type, started_at) VALUES (?, ?, 'strength', '2026-10-03T07:00:00.000Z')", args: [randomUUID(), sessionId] }
    ], "write");
  });

  afterEach(async () => {
    vi.useRealTimers();
    const client = await db();
    await client.batch([
      { sql: "DELETE FROM training_segments WHERE session_id IN (SELECT id FROM training_sessions WHERE profile_id = ?)", args: [profileId] },
      { sql: "DELETE FROM training_sessions WHERE profile_id = ?", args: [profileId] },
      { sql: "DELETE FROM audit_log WHERE profile_id = ?", args: [profileId] },
      { sql: "DELETE FROM profiles WHERE id = ?", args: [profileId] }
    ], "write");
  });

  it("caps delayed reads and switched segments at four hours without removing history", async () => {
    await Promise.all([enforceSafetyPauses(), enforceSafetyPauses()]);
    const client = await db();
    const session = await client.execute({ sql: "SELECT status, ended_at FROM training_sessions WHERE id = ?", args: [sessionId] });
    expect(session.rows[0]).toMatchObject({ status: "paused", ended_at: "2026-10-03T06:00:00.000Z" });
    const segments = await client.execute({ sql: "SELECT started_at, ended_at FROM training_segments WHERE session_id = ? ORDER BY started_at", args: [sessionId] });
    expect(segments.rows).toHaveLength(2);
    expect(segments.rows[1]).toMatchObject({ started_at: "2026-10-03T06:00:00.000Z", ended_at: "2026-10-03T06:00:00.000Z" });
    const profile = (await getDashboardData()).find((row) => row.id === profileId);
    expect(profile?.totalMinutes).toBe(240);
    expect(profile?.score).toBe(480);
    const logs = await client.execute({ sql: "SELECT id FROM audit_log WHERE profile_id = ? AND action = 'training.safety_pause'", args: [profileId] });
    expect(logs.rows).toHaveLength(1);
  });

  it("enforces the same cap when stopping or starting without dashboard polling", async () => {
    await stopTraining(profileId);
    const client = await db();
    const oldSession = await client.execute({ sql: "SELECT ended_at FROM training_sessions WHERE id = ?", args: [sessionId] });
    expect(oldSession.rows[0]?.ended_at).toBe("2026-10-03T06:00:00.000Z");
    const newSession = await startOrSwitchTraining({ profileId, type: "strength" });
    expect(newSession.sessionId).not.toBe(sessionId);
    const profile = (await getDashboardData()).find((row) => row.id === profileId);
    expect(profile?.totalMinutes).toBe(240);
    expect(profile?.activeTraining?.sessionId).toBe(newSession.sessionId);
  });
});
