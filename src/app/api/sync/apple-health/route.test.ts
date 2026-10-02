import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DELETE, POST } from "./route";
import { DELETE as deleteTrainingEntry } from "@/app/api/manual-training/route";
import { db } from "@/lib/db";
import { hashToken, setAdminPin } from "@/lib/security";

const profileId = "papa";
const secret = "fitfamily-test-sync-token-which-is-long-enough";
const workoutId = "fitfamily-apple-health-test-workout";
let previousTokenHash: string | null = null;
let previousAdminPinHash: string | null = null;

describe("Apple Health sync endpoint", () => {
  beforeAll(async () => {
    const client = await db();
    const previous = await client.execute({ sql: "SELECT token_hash FROM apple_health_tokens WHERE profile_id = ?", args: [profileId] });
    previousTokenHash = previous.rows[0] ? String(previous.rows[0].token_hash) : null;
    const previousPin = await client.execute({ sql: "SELECT value FROM settings WHERE key = 'admin_pin_hash'" });
    previousAdminPinHash = previousPin.rows[0] ? String(previousPin.rows[0].value) : null;
    await setAdminPin("2468");
    await client.execute({
      sql: `INSERT INTO apple_health_tokens (profile_id, token_hash) VALUES (?, ?)
        ON CONFLICT(profile_id) DO UPDATE SET token_hash = excluded.token_hash`,
      args: [profileId, hashToken(secret)]
    });
  });

  afterAll(async () => {
    const client = await db();
    await client.execute({ sql: "DELETE FROM apple_health_ignored_workouts WHERE profile_id = ? AND external_id = ?", args: [profileId, workoutId] });
    const sessions = await client.execute({ sql: "SELECT id FROM training_sessions WHERE external_id = ?", args: [workoutId] });
    for (const row of sessions.rows) {
      await client.execute({ sql: "DELETE FROM training_segments WHERE session_id = ?", args: [String(row.id)] });
      await client.execute({ sql: "DELETE FROM training_sessions WHERE id = ?", args: [String(row.id)] });
    }
    if (previousTokenHash) {
      await client.execute({ sql: "UPDATE apple_health_tokens SET token_hash = ? WHERE profile_id = ?", args: [previousTokenHash, profileId] });
    } else {
      await client.execute({ sql: "DELETE FROM apple_health_tokens WHERE profile_id = ?", args: [profileId] });
    }
    if (previousAdminPinHash) {
      await client.execute({
        sql: "INSERT INTO settings (key, value, updated_at) VALUES ('admin_pin_hash', ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
        args: [previousAdminPinHash]
      });
    } else {
      await client.execute({ sql: "DELETE FROM settings WHERE key = 'admin_pin_hash'" });
    }
  });

  it("rejects missing and incorrect sync tokens", async () => {
    const request = (token?: string) => new Request("http://localhost/api/sync/apple-health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, ...(token ? { secret: token } : {}), dryRun: true })
    });

    expect((await POST(request())).status).toBe(400);
    expect((await POST(request("wrong-token-that-is-long-enough-for-schema"))).status).toBe(401);
  });

  it("accepts the profile token for a dry run without writing workout data", async () => {
    const client = await db();
    const before = await client.execute({
      sql: "SELECT COUNT(*) total FROM training_sessions WHERE profile_id = ? AND source = 'apple_health'",
      args: [profileId]
    });
    const response = await POST(new Request("http://localhost/api/sync/apple-health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId,
        secret,
        dryRun: true,
        workouts: [{ title: "Laufen", startedAt: "2026-09-30T10:00:00Z", endedAt: "2026-09-30T10:30:00Z" }]
      })
    }));
    const result = await response.json();
    const after = await client.execute({
      sql: "SELECT COUNT(*) total FROM training_sessions WHERE profile_id = ? AND source = 'apple_health'",
      args: [profileId]
    });

    expect(response.status).toBe(200);
    expect(result.validToken).toBe(true);
    expect(result.received).toBe(1);
    expect(String(after.rows[0]?.total)).toBe(String(before.rows[0]?.total));
  });

  it("rejects reversed or malformed workout times before importing", async () => {
    const response = await POST(new Request("http://localhost/api/sync/apple-health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId,
        secret,
        workouts: [{ title: "Laufen", startedAt: "not-a-date", endedAt: "2026-09-30T10:30:00Z" }]
      })
    }));
    expect(response.status).toBe(400);
  });

  it("imports a workout once and skips a retried HealthKit workout ID", async () => {
    const send = () => POST(new Request("http://localhost/api/sync/apple-health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId,
        secret,
        workouts: [{
          id: workoutId,
          title: "Laufen",
          type: "endurance",
          startedAt: "2026-09-30T10:00:00Z",
          endedAt: "2026-09-30T10:30:00Z",
          calories: 214,
          distanceKm: 5.4
        }]
      })
    }));

    const first = await send();
    const firstResult = await first.json();
    const retry = await send();
    const retryResult = await retry.json();

    expect(first.status).toBe(200);
    expect(firstResult.imported).toBe(1);
    expect(retry.status).toBe(200);
    expect(retryResult.imported).toBe(0);
    expect(retryResult.skipped).toBe(1);

    const client = await db();
    const saved = await client.execute({
      sql: "SELECT started_at, ended_at, health_title, health_calories, health_distance_km FROM training_sessions WHERE profile_id = ? AND external_id = ?",
      args: [profileId, workoutId]
    });
    expect(String(saved.rows[0]?.started_at)).toBe("2026-09-30T10:00:00.000Z");
    expect(String(saved.rows[0]?.ended_at)).toBe("2026-09-30T10:30:00.000Z");
    expect(Number(saved.rows[0]?.health_calories)).toBe(214);
    expect(Number(saved.rows[0]?.health_distance_km)).toBe(5.4);
  });

  it("rejects duration-only data rather than inventing workout timestamps", async () => {
    const response = await POST(new Request("http://localhost/api/sync/apple-health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, secret, workouts: [{ title: "Laufen", durationMinutes: 30 }] })
    }));
    expect(response.status).toBe(400);
  });

  it("keeps a manually deleted Apple Health workout from returning on the next sync", async () => {
    const client = await db();
    const imported = await client.execute({
      sql: "SELECT id FROM training_sessions WHERE profile_id = ? AND source = 'apple_health' AND external_id = ? LIMIT 1",
      args: [profileId, workoutId]
    });
    expect(imported.rows).toHaveLength(1);

    const deleteResponse = await deleteTrainingEntry(new Request("http://localhost/api/manual-training", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "2468", profileId, sessionId: String(imported.rows[0].id) })
    }));
    expect(deleteResponse.status).toBe(200);

    const resync = await POST(new Request("http://localhost/api/sync/apple-health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profileId,
        secret,
        workouts: [{ id: workoutId, title: "Laufen", type: "endurance", startedAt: "2026-09-30T10:00:00Z", endedAt: "2026-09-30T10:30:00Z" }]
      })
    }));
    const result = await resync.json();
    expect(resync.status).toBe(200);
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("removes imported data and revokes the key when Health is disconnected", async () => {
    const client = await db();
    await client.execute({
      sql: `INSERT INTO apple_health_daily (profile_id, date, move_calories, exercise_minutes, stand_hours)
        VALUES (?, '2026-09-30', 420, 35, 8)
        ON CONFLICT(profile_id, date) DO UPDATE SET move_calories = 420, exercise_minutes = 35, stand_hours = 8`,
      args: [profileId]
    });

    const response = await DELETE(new Request(`http://localhost/api/sync/apple-health?profileId=${profileId}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "2468" })
    }));
    expect(response.status).toBe(200);

    const [token, session, ring] = await Promise.all([
      client.execute({ sql: "SELECT profile_id FROM apple_health_tokens WHERE profile_id = ?", args: [profileId] }),
      client.execute({ sql: "SELECT id FROM training_sessions WHERE profile_id = ? AND source = 'apple_health'", args: [profileId] }),
      client.execute({ sql: "SELECT profile_id FROM apple_health_daily WHERE profile_id = ?", args: [profileId] })
    ]);
    expect(token.rows).toHaveLength(0);
    expect(session.rows).toHaveLength(0);
    expect(ring.rows).toHaveLength(0);

    const staleKeyResponse = await POST(new Request("http://localhost/api/sync/apple-health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, secret, dryRun: true })
    }));
    expect(staleKeyResponse.status).toBe(401);
  });
});
