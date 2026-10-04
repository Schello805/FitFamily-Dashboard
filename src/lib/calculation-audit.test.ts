import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { getDashboardData } from "@/lib/dashboard";

const profileId = `calculation-${randomUUID()}`;
const now = new Date(2026, 9, 5, 12); // Monday, in the server's calendar.
async function addSegment(type: "strength" | "endurance", start: Date, end: Date) {
  const client = await db();
  const id = randomUUID();
  await client.batch([
    { sql: "INSERT INTO training_sessions (id, profile_id, started_at, ended_at, status, source) VALUES (?, ?, ?, ?, 'completed', 'manual')", args: [id, profileId, start.toISOString(), end.toISOString()] },
    { sql: "INSERT INTO training_segments (id, session_id, type, started_at, ended_at) VALUES (?, ?, ?, ?, ?)", args: [randomUUID(), id, type, start.toISOString(), end.toISOString()] }
  ], "write");
}
async function profile() { return (await getDashboardData()).find(p => p.id === profileId)!; }
describe("numeric calculation audit", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    const client = await db();
    await client.execute({ sql: "INSERT INTO profiles (id, name, color, avatar, birth_date, starting_fitness_stage) VALUES (?, 'Calculation', '#22d3ee', 'papa', '1990-01-01', 2)", args: [profileId] });
  });
  afterEach(async () => {
    vi.useRealTimers();
    const client = await db();
    await client.batch([
      { sql: "DELETE FROM training_segments WHERE session_id IN (SELECT id FROM training_sessions WHERE profile_id = ?)", args: [profileId] },
      { sql: "DELETE FROM training_sessions WHERE profile_id = ?", args: [profileId] },
      { sql: "DELETE FROM profiles WHERE id = ?", args: [profileId] }
    ], "write");
  });
  it("adds fractional segments before rounding: 30s strength + 30s endurance = 1 minute and 1 point", async () => {
    await addSegment("strength", new Date(now.getTime() - 60000), new Date(now.getTime() - 30000));
    await addSegment("endurance", new Date(now.getTime() - 30000), now);
    expect(await profile()).toMatchObject({ score: 1, totalMinutes: 1, todayMinutes: 1, trainingMinutes: 1, fitnessStage: 2, targetPercent: 1 });
  });
  it("splits midnight and excludes Sunday from Monday's weekly target", async () => {
    await addSegment("endurance", new Date(2026, 9, 4, 23, 50), new Date(2026, 9, 5, 0, 10));
    const result = await profile();
    expect(result).toMatchObject({ score: 40, totalMinutes: 20, todayMinutes: 10, targetPercent: 7 });
    expect(result.activityTrend.filter(p => p.resolution === "Tag" && p.activityMinutes !== null).map(p => p.activityMinutes)).toEqual([10, 10]);
  });
  it("resets points while keeping all minutes of the period goal", async () => {
    await addSegment("endurance", new Date(now.getTime() - 20 * 60000), now);
    const client = await db();
    await client.execute({ sql: "UPDATE profiles SET score_baseline = 5, score_reset_at = ?, target_reset_at = ? WHERE id = ?", args: [new Date(now.getTime() - 10 * 60000).toISOString(), new Date(now.getTime() - 5 * 60000).toISOString(), profileId] });
    expect(await profile()).toMatchObject({ score: 25, totalMinutes: 20, todayMinutes: 20, targetPercent: 13 });
  });
  it("allows exceeding a target: 180 strength minutes = 180 points and 120% of 150", async () => {
    await addSegment("strength", new Date(now.getTime() - 180 * 60000), now);
    expect(await profile()).toMatchObject({ score: 180, totalMinutes: 180, targetPercent: 120, fitnessStage: 2 });
  });
  it("uses a child's daily goal: 45 endurance minutes = 90 points and 50% of 90", async () => {
    const client = await db();
    await client.execute({ sql: "UPDATE profiles SET birth_date = '2012-01-01' WHERE id = ?", args: [profileId] });
    await addSegment("endurance", new Date(now.getTime() - 45 * 60000), now);
    expect(await profile()).toMatchObject({ score: 90, todayMinutes: 45, targetPercent: 50, targetPeriod: "Tag", targetMinutes: 90 });
    await client.execute({ sql: "UPDATE profiles SET score_reset_at = ?, target_reset_at = ? WHERE id = ?", args: [now.toISOString(), now.toISOString(), profileId] });
    expect(await profile()).toMatchObject({ score: 0, todayMinutes: 45, targetPercent: 50 });
  });
});
