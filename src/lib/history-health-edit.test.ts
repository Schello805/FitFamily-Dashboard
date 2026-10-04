import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "./db";
import { bookHealthTraining } from "./health-training";
import { getDashboardData } from "./dashboard";
import { POST, PUT, DELETE } from "@/app/api/manual-training/route";
import { GET } from "@/app/api/history/[profileId]/route";
vi.mock("@/lib/security", () => ({ verifyAdminPinOrReject: vi.fn(async () => null) }));
const profileId = `history-${randomUUID()}`;
const workout = { externalId:"original-export-id", startedAt:"2025-08-31T15:21:55Z", endedAt:"2025-08-31T15:27:57Z", durationSeconds:316, sourceName:"Test Health",activityType:"HKWorkoutActivityTypeCycling",trainingType:"endurance" as const };
const request = (method:string, extra:Record<string,unknown> = {}) => new Request("http://localhost/api/manual-training", { method, body:JSON.stringify({ pin:"1234", profileId, sessionId:`health:${workout.externalId}`, type:"strength", startedAt:workout.startedAt, endedAt:"2025-08-31T15:32:55Z", durationSeconds:600, ...extra }) });
beforeEach(async () => { const client=await db(); await client.execute({sql:"INSERT INTO profiles (id,name,color,avatar) VALUES (?, 'History Test', '#22d3ee', 'papa')",args:[profileId]}); await bookHealthTraining({profileId,workouts:[workout]}); });
afterEach(async () => { const client=await db(); await client.batch([
  {sql:"DELETE FROM training_segments WHERE session_id IN (SELECT id FROM training_sessions WHERE profile_id=?)",args:[profileId]},
  {sql:"DELETE FROM training_sessions WHERE profile_id=?",args:[profileId]},
  {sql:"DELETE FROM audit_log WHERE profile_id=?",args:[profileId]},
  {sql:"DELETE FROM profiles WHERE id=?",args:[profileId]}
],"write"); });
const stats = async () => (await getDashboardData()).find(profile => profile.id===profileId)!;
it("recalculates score, minutes and XP after edit/delete and preserves corrections across reimports", async () => {
  expect(await stats()).toMatchObject({score:7,totalMinutes:5,trainingProgress:{xp:5}});
  expect((await PUT(request("PUT"))).status).toBe(200);
  expect(await stats()).toMatchObject({score:15,totalMinutes:10,trainingProgress:{xp:10}});
  const history=await (await GET(new Request("http://localhost"), {params:Promise.resolve({profileId})})).json();
  expect(history.sessions[0]).toMatchObject({edited:true,segments:[{durationSeconds:600,type:"strength"}]});
  expect(await bookHealthTraining({profileId,workouts:[workout]})).toMatchObject({saved:0,alreadyReceived:1,workouts:[{durationSeconds:600}]});
  expect((await DELETE(request("DELETE"))).status).toBe(200);
  expect(await stats()).toMatchObject({score:0,totalMinutes:0,trainingProgress:{xp:0}});
  expect((await (await GET(new Request("http://localhost"), {params:Promise.resolve({profileId})})).json()).sessions).toHaveLength(0);
  expect(await bookHealthTraining({profileId,workouts:[workout]})).toMatchObject({saved:0,workouts:[{deleted:true,points:0}]});
  expect(await stats()).toMatchObject({score:0,totalMinutes:0});
  const replacement = await POST(request("POST"));
  expect(replacement.status).toBe(200);
  expect(await stats()).toMatchObject({score:11,totalMinutes:11});
});
it("rejects invalid active duration, cross-profile edits and overlapping corrections", async () => {
  expect((await PUT(request("PUT",{durationSeconds:1000}))).status).toBe(400);
  expect((await PUT(request("PUT",{profileId:"other-profile"}))).status).toBe(404);
  await bookHealthTraining({profileId,workouts:[{...workout,externalId:"second",startedAt:"2025-08-31T15:40:00Z",endedAt:"2025-08-31T15:50:00Z",durationSeconds:600}]});
  expect((await PUT(request("PUT",{endedAt:"2025-08-31T15:45:00Z"}))).status).toBe(409);
  expect((await (await db()).execute({sql:"SELECT duration_seconds FROM health_workouts WHERE profile_id=? AND external_id=?",args:[profileId,workout.externalId]})).rows[0].duration_seconds).toBe(316);
});
it("recalculates automatic level thresholds in both directions after a correction", async () => {
  expect((await PUT(request("PUT",{endedAt:"2025-08-31T18:21:55Z",durationSeconds:9000}))).status).toBe(200);
  expect(await stats()).toMatchObject({score:225,totalMinutes:150,trainingProgress:{xp:150,level:2}});
  expect((await PUT(request("PUT"))).status).toBe(200);
  expect(await stats()).toMatchObject({score:15,totalMinutes:10,trainingProgress:{xp:10,level:1}});
});
it("permits corrections of unscored App timers without converting them into points", async () => {
  const client=await db();
  await client.batch([
    {sql:"INSERT INTO training_sessions (id,profile_id,started_at,ended_at,status,recording_mode) VALUES (?, ?, ?, ?, 'completed','health')",args:["timer-test",profileId,workout.startedAt,workout.endedAt]},
    {sql:"INSERT INTO training_segments (id,session_id,type,started_at,ended_at) VALUES ('timer-segment','timer-test','strength',?,?)",args:[workout.startedAt,workout.endedAt]}
  ],"write");
  expect((await PUT(request("PUT",{sessionId:"timer-test"}))).status).toBe(200);
  expect(await stats()).toMatchObject({score:7,totalMinutes:5,trainingProgress:{xp:5}});
});
