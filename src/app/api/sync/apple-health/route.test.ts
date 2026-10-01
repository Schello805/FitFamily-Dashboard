import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST } from "./route";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/security";

const profileId = "papa";
const secret = "fitfamily-test-sync-token-which-is-long-enough";
const workoutId = "fitfamily-apple-health-test-workout";
let previousTokenHash: string | null = null;

describe("Apple Health sync endpoint", () => {
  beforeAll(async () => {
    const client = await db();
    const previous = await client.execute({ sql: "SELECT token_hash FROM apple_health_tokens WHERE profile_id = ?", args: [profileId] });
    previousTokenHash = previous.rows[0] ? String(previous.rows[0].token_hash) : null;
    await client.execute({
      sql: `INSERT INTO apple_health_tokens (profile_id, token_hash) VALUES (?, ?)
        ON CONFLICT(profile_id) DO UPDATE SET token_hash = excluded.token_hash`,
      args: [profileId, hashToken(secret)]
    });
  });

  afterAll(async () => {
    const client = await db();
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
          endedAt: "2026-09-30T10:30:00Z"
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
  });
});
