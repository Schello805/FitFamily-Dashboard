import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { getDashboardData } from "@/lib/dashboard";
import { GET as history } from "@/app/api/history/[profileId]/route";

const profileId = `training-only-${randomUUID()}`;
const now = new Date("2026-10-03T12:00:00Z");

describe("FitFamily training without Health contributions", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const client = await db();
    await client.execute({ sql: "INSERT INTO profiles (id, name, color, avatar, birth_date, score_baseline) VALUES (?, 'Training Test', '#22d3ee', 'papa', '1990-01-01', 0)", args: [profileId] });
    for (const [source, type, minutes] of [["touch", "strength", 10], ["mobile", "endurance", 20], ["manual", "strength", 5], ["apple_health", "endurance", 120]] as const) {
      const id = randomUUID();
      const end = new Date(now.getTime() - 60_000).toISOString();
      const start = new Date(Date.parse(end) - minutes * 60_000).toISOString();
      await client.batch([
        { sql: "INSERT INTO training_sessions (id, profile_id, started_at, ended_at, status, source) VALUES (?, ?, ?, ?, 'completed', ?)", args: [id, profileId, start, end, source] },
        { sql: "INSERT INTO training_segments (id, session_id, type, started_at, ended_at) VALUES (?, ?, ?, ?, ?)", args: [randomUUID(), id, type, start, end] }
      ], "write");
    }
    await client.execute({ sql: "INSERT INTO apple_health_daily (profile_id, date, exercise_minutes, move_calories) VALUES (?, '2026-10-03', 999, 777)", args: [profileId] });
  });
  afterEach(async () => {
    vi.useRealTimers();
    const client = await db();
    await client.batch([
      { sql: "DELETE FROM training_segments WHERE session_id IN (SELECT id FROM training_sessions WHERE profile_id = ?)", args: [profileId] },
      { sql: "DELETE FROM training_sessions WHERE profile_id = ?", args: [profileId] },
      { sql: "DELETE FROM apple_health_daily WHERE profile_id = ?", args: [profileId] },
      { sql: "DELETE FROM profiles WHERE id = ?", args: [profileId] }
    ], "write");
  });
  it("uses only local training for score, minutes, fitness progress, target and trend", async () => {
    const profile = (await getDashboardData()).find(entry => entry.id === profileId)!;
    expect(profile).toMatchObject({ score: 55, totalMinutes: 35, todayMinutes: 35, strengthMinutes: 15, enduranceMinutes: 20, trainingMinutes: 35, targetPercent: 23 });
    expect(profile).not.toHaveProperty("appleHealthRings");
    expect(profile.activityTrend.find(day => day.date === "2026-10-03")?.activityMinutes).toBe(35);
    const client = await db();
    expect((await client.execute({ sql: "SELECT exercise_minutes FROM apple_health_daily WHERE profile_id = ?", args: [profileId] })).rows[0]?.exercise_minutes).toBe(999);
  });
  it("hides archived imported workouts in history without deleting them", async () => {
    const response = await history(new Request("http://localhost"), { params: Promise.resolve({ profileId }) });
    const body = await response.json();
    expect(body.sessions).toHaveLength(3);
    expect(body.sessions.every((session: { source: string }) => session.source !== "apple_health")).toBe(true);
    const client = await db();
    expect((await client.execute({ sql: "SELECT id FROM training_sessions WHERE profile_id = ?", args: [profileId] })).rows).toHaveLength(4);
  });
});
