import { randomUUID, createHash } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { db } from "./db";
import { POST } from "@/app/api/profiles/[profileId]/health-import/route";
const profileId = `import-${randomUUID()}`;
const workout = { startedAt: "2025-08-31T15:21:55Z", endedAt: "2025-08-31T15:27:57Z", durationSeconds: 316, sourceName: "eBike Connect", activityType: "HKWorkoutActivityTypeCycling", trainingType: "endurance" };
function request(body: unknown, origin = "http://localhost") { return new Request("http://localhost/api/profiles/test/health-import", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
afterEach(async () => { const client = await db(); await client.execute({ sql: "DELETE FROM health_workouts WHERE profile_id=?", args: [profileId] }); await client.execute({ sql: "DELETE FROM profiles WHERE id=?", args: [profileId] }); });
it("books selected timing to the route profile and uses the existing Mac fingerprint", async () => {
  await (await db()).execute({ sql: "INSERT INTO profiles(id,name,color,avatar) VALUES (?,'Import Test','#22d3ee','papa')", args: [profileId] });
  const context = { params: Promise.resolve({ profileId }) };
  const first = await POST(request({ workouts: [workout] }), context);
  const result = await first.json();
  expect(first.status).toBe(200); expect(result.saved).toBe(1); expect(result.workouts[0].points).toBe(7.9);
  expect(result.workouts[0].externalId).toBe(createHash("sha256").update(JSON.stringify([workout.startedAt, workout.endedAt, 316, workout.sourceName, workout.activityType])).digest("hex"));
  expect((await (await POST(request({ workouts: [workout] }), context)).json()).alreadyReceived).toBe(1);
  expect((await POST(request({ workouts: [workout] }, "https://evil.example"), context)).status).toBe(403);
  expect((await POST(request({ profileId: "other", workouts: [workout] }), context)).status).toBe(400);
  expect((await POST(request({ workouts: [{ ...workout, trainingType: "unknown" }] }), context)).status).toBe(400);
});
