import { randomUUID } from "node:crypto";
import { beforeEach, afterEach, expect, it } from "vitest";
import { db } from "./db";
import { getDashboardData } from "./dashboard";
import { createFamilyHealthKey, FAMILY_HEALTH_KEY, healthTrainingTestSchema, verifyFamilyHealthKey } from "./health-training-test";
import { POST } from "@/app/api/sync/health-training-test/route";
import { isPortableSetting } from "./data-transfer-schema";

const profileId = "health-test-" + randomUUID();
let secret: string;
let previousKey: string | null;
const endedAt = new Date(Date.now() - 60000).toISOString();
const startedAt = new Date(Date.parse(endedAt) - 30 * 60000).toISOString();
const workout = { externalId: "a".repeat(64), startedAt, endedAt, durationSeconds: 1200, sourceName: "Gymondo", activityType: "FunctionalStrengthTraining" };
function request(body: unknown, token = secret) {
  return new Request("http://localhost/api/sync/health-training-test", { method: "POST", headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
beforeEach(async () => {
  const client = await db();
  const old = await client.execute({ sql: "SELECT value FROM settings WHERE key = ?", args: [FAMILY_HEALTH_KEY] });
  previousKey = old.rows.length ? String(old.rows[0].value) : null;
  await client.execute({ sql: "INSERT INTO profiles (id, name, color, avatar) VALUES (?, 'Test', '#22d3ee', 'papa')", args: [profileId] });
  secret = await createFamilyHealthKey();
});
afterEach(async () => {
  const client = await db();
  await client.execute({ sql: "DELETE FROM health_training_tests WHERE profile_id = ?", args: [profileId] });
  await client.execute({ sql: "DELETE FROM profiles WHERE id = ?", args: [profileId] });
  if (previousKey) await client.execute({ sql: "UPDATE settings SET value = ? WHERE key = ?", args: [previousKey, FAMILY_HEALTH_KEY] });
  else await client.execute({ sql: "DELETE FROM settings WHERE key = ?", args: [FAMILY_HEALTH_KEY] });
});
it("receives active minutes, computes exactly 30 test points, and never books app minutes or score", async () => {
  const response = await POST(request({ profileId, workouts: [workout] }));
  const body = await response.json();
  expect(response.status).toBe(200);
  expect(body).toMatchObject({ mode: "test", saved: 1, alreadyReceived: 0 });
  expect(body.workouts[0]).toMatchObject({ minutes: 20, testPoints: 30, sourceName: "Gymondo" });
  const again = await (await POST(request({ profileId, workouts: [workout] }))).json();
  expect(again).toMatchObject({ saved: 0, alreadyReceived: 1 });
  const changed = await (await POST(request({ profileId, workouts: [{ ...workout, durationSeconds: 600 }] }))).json();
  expect(changed.workouts[0]).toMatchObject({ minutes: 20, testPoints: 30, duplicate: true });
  const profile = (await getDashboardData()).find(row => row.id === profileId)!;
  expect(profile).toMatchObject({ score: 0, todayMinutes: 0, targetPercent: 0 });
  expect(profile.trainingProgress?.xp).toBe(0);
  expect(JSON.stringify(body)).not.toContain(secret);
});
it("rejects missing credentials, unknown profiles and invalid durations", async () => {
  expect((await POST(request({ profileId, workouts: [workout] }, "invalid"))).status).toBe(401);
  expect((await POST(request({ profileId: "missing", workouts: [workout] }))).status).toBe(404);
  const response = await POST(request({ profileId, workouts: [{ ...workout, durationSeconds: 999999999 }] }));
  expect(response.status).toBe(400);
  expect((await response.json()).errors.join(" ")).toContain("durationSeconds");
  expect(healthTrainingTestSchema.safeParse({ profileId, workouts: [{ ...workout, durationSeconds: 2000 }] }).success).toBe(false);
});
it("has one rotatable, hashed family key excluded from portable exports", async () => {
  expect(await verifyFamilyHealthKey(secret)).toBe(true);
  const replacement = await createFamilyHealthKey();
  expect(await verifyFamilyHealthKey(secret)).toBe(false);
  expect(await verifyFamilyHealthKey(replacement)).toBe(true);
  expect(isPortableSetting(FAMILY_HEALTH_KEY)).toBe(false);
});
