import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { getDashboardData } from "@/lib/dashboard";
import { db } from "@/lib/db";
import { setAdminPin } from "@/lib/security";

const profileId = "reset-target-test";
const sessionId = "reset-target-test-session";
const segmentId = "reset-target-test-segment";
const pin = "8642";
let previousPinHash: string | null = null;

describe("score reset preserves period target progress", () => {
  beforeAll(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-04T12:00:00Z"));
    const client = await db();
    const existingPin = await client.execute({ sql: "SELECT value FROM settings WHERE key = 'admin_pin_hash'" });
    previousPinHash = existingPin.rows[0] ? String(existingPin.rows[0].value) : null;
    await setAdminPin(pin);

    await client.execute({ sql: "DELETE FROM training_sessions WHERE id = ?", args: [sessionId] });
    await client.execute({ sql: "DELETE FROM profiles WHERE id = ?", args: [profileId] });
    await client.execute({
      sql: `INSERT INTO profiles (id, name, color, avatar, starting_fitness, birth_date, score_baseline, goal)
        VALUES (?, 'Reset Test', '#22d3ee', 'neutral', 3, '1990-01-01', 0, 'Allgemeine Fitness')`,
      args: [profileId]
    });
    const endedAt = new Date(Date.now() - 5 * 60_000).toISOString();
    const startedAt = new Date(Date.now() - 25 * 60_000).toISOString();
    await client.batch([
      { sql: "INSERT INTO training_sessions (id, profile_id, started_at, ended_at, status, source) VALUES (?, ?, ?, ?, 'completed', 'touch')", args: [sessionId, profileId, startedAt, endedAt] },
      { sql: "INSERT INTO training_segments (id, session_id, type, started_at, ended_at) VALUES (?, ?, 'endurance', ?, ?)", args: [segmentId, sessionId, startedAt, endedAt] }
    ], "write");
  });

  afterAll(async () => {
    vi.useRealTimers();
    const client = await db();
    await client.execute({ sql: "DELETE FROM training_segments WHERE session_id = ?", args: [sessionId] });
    await client.execute({ sql: "DELETE FROM training_sessions WHERE id = ?", args: [sessionId] });
    await client.execute({ sql: "DELETE FROM profiles WHERE id = ?", args: [profileId] });
    if (previousPinHash) {
      await client.execute({
        sql: "INSERT INTO settings (key, value, updated_at) VALUES ('admin_pin_hash', ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
        args: [previousPinHash]
      });
    } else {
      await client.execute({ sql: "DELETE FROM settings WHERE key = 'admin_pin_hash'" });
    }
  });

  it("resets only the score while preserving the weekly ring and training history", async () => {
    const before = (await getDashboardData()).find(entry => entry.id === profileId);
    expect(before).toMatchObject({ score: 40, targetPercent: 13, totalMinutes: 20 });
    const response = await POST(new Request("http://localhost/api/admin/reset-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin, profileId })
    }));
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.newScore).toBe(0);
    expect(result).not.toHaveProperty("targetPercent");

    const client = await db();
    const [profile, session] = await Promise.all([
      client.execute({ sql: "SELECT target_reset_at FROM profiles WHERE id = ?", args: [profileId] }),
      client.execute({ sql: "SELECT id FROM training_sessions WHERE id = ?", args: [sessionId] })
    ]);
    expect(profile.rows[0]?.target_reset_at).toBeNull();
    expect(session.rows).toHaveLength(1);
    expect((await getDashboardData()).find((entry) => entry.id === profileId)).toMatchObject({ score: 0, targetPercent: 13, totalMinutes: 20 });
  });
});
