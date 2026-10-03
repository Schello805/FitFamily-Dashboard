import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "./route";
import { POST as readAdminLogs } from "@/app/api/admin/logs/route";
import { DELETE as deleteTrainingEntry } from "@/app/api/manual-training/route";
import { db } from "@/lib/db";
import { hashToken, setAdminPin } from "@/lib/security";
import { localIsoDate } from "@/lib/apple-health-activity";

const profileId = "papa";
const secret = "fitfamily-test-sync-token-which-is-long-enough";
const workoutId = "fitfamily-apple-health-test-workout";
let previousTokenHash: string | null = null;
let previousAdminPinHash: string | null = null;
let validationLogId: string | null = null;

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
    if (validationLogId) await client.execute({ sql: "DELETE FROM audit_log WHERE id = ?", args: [validationLogId] });
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

  it("records sync attempts and protects the log with the parent PIN", async () => {
    const loggedCheck = await POST(new Request("http://localhost/api/sync/apple-health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, secret, dryRun: true })
    }));
    expect(loggedCheck.status).toBe(200);

    const unauthorized = await readAdminLogs(new Request("http://localhost/api/admin/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "0000", filter: "health" })
    }));
    expect(unauthorized.status).toBe(401);

    const response = await readAdminLogs(new Request("http://localhost/api/admin/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "2468", filter: "health" })
    }));
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.logs.some((entry: { action: string; details: { status?: string } }) => entry.action === "health.apple_sync.checked" && entry.details.status === "checked")).toBe(true);
  });

  it("records authenticated payload validation errors without logging health values", async () => {
    const invalid = await POST(new Request("http://localhost/api/sync/apple-health", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId, secret, stepCount: 200_001 })
    }));
    expect(invalid.status).toBe(400);

    const response = await readAdminLogs(new Request("http://localhost/api/admin/logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "2468", filter: "health" })
    }));
    const result = await response.json();
    const validationLog = result.logs.find((entry: { id: string; action: string; details: { reason?: string; message?: string } }) =>
      entry.action === "health.apple_sync.failed" && entry.details.reason === "validation" && entry.details.message?.includes("stepCount")
    );
    expect(validationLog).toBeTruthy();
    validationLogId = validationLog?.id ?? null;
  });

  it("finds Health logs even behind more than 500 unrelated events", async () => {
    const client = await db();
    const prefix = randomUUID();
    const healthId = `${prefix}-health`;
    try {
      await client.execute({ sql: "INSERT INTO audit_log (id, action, profile_id, details, created_at) VALUES (?, 'health.apple_sync.completed', ?, '{}', '2000-01-01 00:00:00')", args: [healthId, profileId] });
      await client.batch(Array.from({ length: 501 }, (_, index) => ({ sql: "INSERT INTO audit_log (id, action, details) VALUES (?, 'admin.update.check', '{}')", args: [`${prefix}-${index}`] })), "write");
      const response = await readAdminLogs(new Request("http://localhost/api/admin/logs", { method: "POST", body: JSON.stringify({ pin: "2468", filter: "health" }) }));
      const body = await response.json();
      expect(body.logs.some((entry: { id: string }) => entry.id === healthId)).toBe(true);
    } finally {
      await client.execute({ sql: "DELETE FROM audit_log WHERE id LIKE ?", args: [`${prefix}%`] });
    }
  });

  it("returns a traceable unconfirmed result when completion logging fails after saving", async () => {
    const client = await db();
    const original = client.execute.bind(client);
    const spy = vi.spyOn(client, "execute").mockImplementation(async (statement) => {
      const candidate = statement as unknown as { sql?: string; args?: unknown[] };
      if (candidate.sql?.startsWith("UPDATE audit_log") && candidate.args?.[0] === "health.apple_sync.completed") throw new Error("Simulated log failure");
      return original(statement);
    });
    try {
      const response = await POST(new Request("http://localhost/api/sync/apple-health", { method: "POST", body: JSON.stringify({ profileId, secret, dailyActivity: { date: localIsoDate(new Date()), stepCount: 42 } }) }));
      const body = await response.json();
      expect(response.status).toBe(500);
      expect(body).toMatchObject({ ok: false, dataSaved: true, activityDaysSynced: 1, importId: expect.any(String) });
      const log = await original({ sql: "SELECT action FROM audit_log WHERE id = ?", args: [body.importId] });
      expect(log.rows[0]?.action).toBe("health.apple_sync.started");
    } finally {
      spy.mockRestore();
    }
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

  it("syncs extra daily activity metrics and preserves ring values omitted from a partial sync", async () => {
    const client = await db();
    const today = new Date();
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const previous = await client.execute({
      sql: "SELECT * FROM apple_health_daily WHERE profile_id = ? AND date = ?",
      args: [profileId, date]
    });

    try {
      await client.execute({
        sql: `INSERT INTO apple_health_daily (profile_id, date, move_calories, exercise_minutes, stand_hours, step_count, walking_running_distance_km, cycling_distance_km, flights_climbed)
          VALUES (?, ?, 432, 18, 5, 1234, 2.5, 6.25, 3)
          ON CONFLICT(profile_id, date) DO UPDATE SET move_calories = 432, exercise_minutes = 18, stand_hours = 5, step_count = 1234, walking_running_distance_km = 2.5, cycling_distance_km = 6.25, flights_climbed = 3`,
        args: [profileId, date]
      });

      const response = await POST(new Request("http://localhost/api/sync/apple-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, secret, date, moveCalories: 510, exerciseMinutes: 24, stepCount: 6789, walkingRunningDistanceKm: 4.75, cyclingDistanceKm: 12.5, flightsClimbed: 8 })
      }));
      expect(response.status).toBe(200);

      const saved = await client.execute({
        sql: "SELECT move_calories, exercise_minutes, stand_hours, step_count, walking_running_distance_km, cycling_distance_km, flights_climbed FROM apple_health_daily WHERE profile_id = ? AND date = ?",
        args: [profileId, date]
      });
      expect(Number(saved.rows[0]?.move_calories)).toBe(510);
      expect(Number(saved.rows[0]?.exercise_minutes)).toBe(24);
      expect(Number(saved.rows[0]?.stand_hours)).toBe(5);
      expect(Number(saved.rows[0]?.step_count)).toBe(6789);
      expect(Number(saved.rows[0]?.walking_running_distance_km)).toBe(4.75);
      expect(Number(saved.rows[0]?.cycling_distance_km)).toBe(12.5);
      expect(Number(saved.rows[0]?.flights_climbed)).toBe(8);

      const readback = await GET(new Request(`http://localhost/api/sync/apple-health?profileId=${profileId}`, {
        headers: { Authorization: `Bearer ${secret}` }
      }));
      const readbackBody = await readback.json();
      expect(readback.status).toBe(200);
      expect(readbackBody.rings).toMatchObject({
        moveCalories: 510,
        exerciseMinutes: 24,
        stepCount: 6789,
        walkingRunningDistanceKm: 4.75,
        cyclingDistanceKm: 12.5,
        flightsClimbed: 8
      });
    } finally {
      await client.execute({ sql: "DELETE FROM apple_health_daily WHERE profile_id = ? AND date = ?", args: [profileId, date] });
      if (previous.rows[0]) {
        const row = previous.rows[0];
        await client.execute({
          sql: `INSERT INTO apple_health_daily (profile_id, date, move_calories, move_goal, exercise_minutes, exercise_goal, stand_hours, stand_goal, step_count, walking_running_distance_km, cycling_distance_km, flights_climbed, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [profileId, date, row.move_calories, row.move_goal, row.exercise_minutes, row.exercise_goal, row.stand_hours, row.stand_goal, row.step_count, row.walking_running_distance_km, row.cycling_distance_km, row.flights_climbed, row.updated_at]
        });
      }
    }
  });

  it("backfills daily activity for up to 30 dates idempotently", async () => {
    const client = await db();
    const todayDate = new Date();
    const yesterdayDate = new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() - 1);
    const toDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const dates = [toDateKey(todayDate), toDateKey(yesterdayDate)];
    const previousRows = await Promise.all(dates.map((date) => client.execute({
      sql: "SELECT * FROM apple_health_daily WHERE profile_id = ? AND date = ?",
      args: [profileId, date]
    })));
    const payload = {
      profileId,
      secret,
      dailyActivity: [
        { date: dates[0], exerciseMinutes: 31, stepCount: 7000, cyclingDistanceKm: 3.2 },
        { date: dates[1], exerciseMinutes: 22, stepCount: 5100, cyclingDistanceKm: 7.65 }
      ]
    };

    try {
      const send = () => POST(new Request("http://localhost/api/sync/apple-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }));
      const first = await send();
      const firstBody = await first.json();
      const second = await send();
      expect(first.status).toBe(200);
      expect(firstBody.importId).toEqual(expect.any(String));
      expect(firstBody.activityDays).toEqual([
        { date: dates[0], fields: ["exerciseMinutes", "stepCount", "cyclingDistanceKm"] },
        { date: dates[1], fields: ["exerciseMinutes", "stepCount", "cyclingDistanceKm"] }
      ]);
      expect(second.status).toBe(200);
      expect((await second.json()).activityDaysSynced).toBe(2);
      const dictionaryResponse = await POST(new Request("http://localhost/api/sync/apple-health", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId, secret, dailyActivity: payload.dailyActivity[0] })
      }));
      expect(dictionaryResponse.status).toBe(200);
      expect((await dictionaryResponse.json()).activityDaysSynced).toBe(1);

      const syncLogResponse = await readAdminLogs(new Request("http://localhost/api/admin/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "2468", filter: "health" })
      }));
      const syncLogBody = await syncLogResponse.json();
      expect(syncLogResponse.status).toBe(200);
      const diagnostic = syncLogBody.logs.find((entry: { id: string }) => entry.id === firstBody.importId);
      expect(diagnostic.details.receivedActivity.dailyActivity).toEqual(payload.dailyActivity);
      expect(diagnostic.details.savedActivity).toEqual(expect.arrayContaining([expect.objectContaining({ date: dates[0], exerciseMinutes: 31, stepCount: 7000, cyclingDistanceKm: 3.2 })]));
      expect(JSON.stringify(diagnostic.details)).not.toContain(secret);
      expect(syncLogBody.logs.some((entry: { details: { activityDays?: { fields?: string[] }[] } }) =>
        entry.details.activityDays?.some((day) => day.fields?.includes("cyclingDistanceKm"))
      )).toBe(true);

      const saved = await client.execute({
        sql: "SELECT date, exercise_minutes, step_count, cycling_distance_km FROM apple_health_daily WHERE profile_id = ? AND date IN (?, ?) ORDER BY date",
        args: [profileId, ...dates]
      });
      expect(saved.rows).toHaveLength(2);
      expect(saved.rows.map((row) => Number(row.step_count)).sort((a, b) => a - b)).toEqual([5100, 7000]);
      expect(saved.rows.map((row) => Number(row.cycling_distance_km)).sort((a, b) => a - b)).toEqual([3.2, 7.65]);

      const duplicateDates = await POST(new Request("http://localhost/api/sync/apple-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId,
          secret,
          dailyActivity: [
            { date: dates[0], exerciseMinutes: 31 },
            { date: dates[0], stepCount: 7000, cyclingDistanceKm: null }
          ]
        })
      }));
      expect(duplicateDates.status).toBe(200);
      expect((await duplicateDates.json()).activityDaysSynced).toBe(1);
      const mergedDay = await client.execute({
          sql: "SELECT COUNT(*) AS total, exercise_minutes, step_count, cycling_distance_km FROM apple_health_daily WHERE profile_id = ? AND date = ?",
        args: [profileId, dates[0]]
      });
      expect(Number(mergedDay.rows[0]?.total)).toBe(1);
      expect(Number(mergedDay.rows[0]?.exercise_minutes)).toBe(31);
      expect(Number(mergedDay.rows[0]?.step_count)).toBe(7000);
      expect(Number(mergedDay.rows[0]?.cycling_distance_km)).toBe(3.2);
    } finally {
      for (const [index, date] of dates.entries()) {
        await client.execute({ sql: "DELETE FROM apple_health_daily WHERE profile_id = ? AND date = ?", args: [profileId, date] });
        const prior = previousRows[index]?.rows[0];
        if (prior) {
          await client.execute({
            sql: `INSERT INTO apple_health_daily (profile_id, date, move_calories, move_goal, exercise_minutes, exercise_goal, stand_hours, stand_goal, step_count, walking_running_distance_km, cycling_distance_km, flights_climbed, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [profileId, date, prior.move_calories, prior.move_goal, prior.exercise_minutes, prior.exercise_goal, prior.stand_hours, prior.stand_goal, prior.step_count, prior.walking_running_distance_km, prior.cycling_distance_km, prior.flights_climbed, prior.updated_at]
          });
        }
      }
    }
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

describe("atomic Apple Health imports", () => {
  const isolatedProfile = `atomic-health-${randomUUID()}`;
  const isolatedSecret = "atomic-health-sync-token-long-enough-for-schema";
  const startedAt = "2026-09-30T10:00:00Z";
  const endedAt = "2026-09-30T10:30:00Z";
  const dateKey = (offset: number) => {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  const send = (data: Record<string, unknown>) => POST(new Request("http://localhost/api/sync/apple-health", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId: isolatedProfile, secret: isolatedSecret, ...data })
  }));

  beforeEach(async () => {
    const client = await db();
    await client.batch([
      { sql: "INSERT INTO profiles (id, name, color, avatar) VALUES (?, 'Atomic Health Test', '#22d3ee', 'papa')", args: [isolatedProfile] },
      { sql: "INSERT INTO apple_health_tokens (profile_id, token_hash) VALUES (?, ?)", args: [isolatedProfile, hashToken(isolatedSecret)] }
    ], "write");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    const client = await db();
    await client.execute("DROP TRIGGER IF EXISTS atomic_health_reject_day");
    await client.batch([
      { sql: "DELETE FROM training_segments WHERE session_id IN (SELECT id FROM training_sessions WHERE profile_id = ?)", args: [isolatedProfile] },
      { sql: "DELETE FROM training_sessions WHERE profile_id = ?", args: [isolatedProfile] },
      { sql: "DELETE FROM apple_health_daily WHERE profile_id = ?", args: [isolatedProfile] },
      { sql: "DELETE FROM apple_health_tokens WHERE profile_id = ?", args: [isolatedProfile] },
      { sql: "DELETE FROM audit_log WHERE profile_id = ?", args: [isolatedProfile] },
      { sql: "DELETE FROM profiles WHERE id = ?", args: [isolatedProfile] }
    ], "write");
  });

  it("rejects invalid later activity before saving any workout or earlier day", async () => {
    const payload = { workouts: [{ id: randomUUID(), startedAt, endedAt }], dailyActivity: [{ date: dateKey(0), exerciseMinutes: 30 }, { date: dateKey(1), stepCount: 1000 }] };
    expect((await send(payload)).status).toBe(400);
    expect((await send({ ...payload, dryRun: true })).status).toBe(400);
    const client = await db();
    const sessions = await client.execute({ sql: "SELECT id FROM training_sessions WHERE profile_id = ?", args: [isolatedProfile] });
    const days = await client.execute({ sql: "SELECT date FROM apple_health_daily WHERE profile_id = ?", args: [isolatedProfile] });
    expect(sessions.rows).toHaveLength(0);
    expect(days.rows).toHaveLength(0);
  });

  it("rolls back workouts and earlier days when a later database write fails", async () => {
    const client = await db();
    await client.execute({ sql: "INSERT INTO apple_health_daily (profile_id, date, exercise_minutes) VALUES (?, ?, 12)", args: [isolatedProfile, dateKey(0)] });
    await client.execute(`CREATE TRIGGER atomic_health_reject_day BEFORE INSERT ON apple_health_daily
      WHEN NEW.profile_id = '${isolatedProfile}' AND NEW.date = '${dateKey(-1)}'
      BEGIN SELECT RAISE(ABORT, 'test rejection'); END`);
    const response = await send({ workouts: [{ id: randomUUID(), startedAt, endedAt }], dailyActivity: [{ date: dateKey(0), exerciseMinutes: 30 }, { date: dateKey(-1), exerciseMinutes: 20 }] });
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ imported: 0, activityDaysSynced: 0 });
    expect((await client.execute({ sql: "SELECT id FROM training_sessions WHERE profile_id = ?", args: [isolatedProfile] })).rows).toHaveLength(0);
    const days = await client.execute({ sql: "SELECT date, exercise_minutes FROM apple_health_daily WHERE profile_id = ?", args: [isolatedProfile] });
    expect(days.rows).toHaveLength(1);
    expect(days.rows[0]).toMatchObject({ date: dateKey(0), exercise_minutes: 12 });
    expect((await client.execute({ sql: "SELECT id FROM audit_log WHERE profile_id = ? AND action = 'health.apple_sync'", args: [isolatedProfile] })).rows).toHaveLength(0);
  });

  it.each([true, false])("serializes concurrent duplicates (workout ID: %s)", async (withId) => {
    const payload = { workouts: [{ ...(withId ? { id: randomUUID() } : {}), startedAt, endedAt }] };
    const responses = await Promise.all([send(payload), send(payload)]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const results = await Promise.all(responses.map((response) => response.json()));
    expect(results.reduce((sum, result) => sum + result.imported, 0)).toBe(1);
    expect(results.reduce((sum, result) => sum + result.skipped, 0)).toBe(1);
  });

  it("rechecks a token revoked between authentication and the atomic write", async () => {
    const client = await db();
    const originalBatch = client.batch.bind(client);
    vi.spyOn(client, "batch").mockImplementationOnce(async (statements, mode) => {
      await client.execute({ sql: "DELETE FROM apple_health_tokens WHERE profile_id = ?", args: [isolatedProfile] });
      return originalBatch(statements, mode);
    });
    const response = await send({ workouts: [{ id: randomUUID(), startedAt, endedAt }], dailyActivity: [{ date: dateKey(0), exerciseMinutes: 30 }] });
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ imported: 0, activityDaysSynced: 0 });
    expect((await client.execute({ sql: "SELECT id FROM training_sessions WHERE profile_id = ?", args: [isolatedProfile] })).rows).toHaveLength(0);
    expect((await client.execute({ sql: "SELECT date FROM apple_health_daily WHERE profile_id = ?", args: [isolatedProfile] })).rows).toHaveLength(0);
  });
});
