import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "./db";
import { getDashboardData } from "./dashboard";
import { bookHealthTraining, healthTrainingSchema } from "./health-training";
import { storeHealthTrainingTest } from "./health-training-test";
import { startOrSwitchTraining, stopTraining } from "./training";
import { GET as history } from "@/app/api/history/[profileId]/route";
import { POST as importTraining } from "@/app/api/sync/health-training/route";
import { createFamilyHealthKey, FAMILY_HEALTH_KEY } from "./health-training-test";

const profileId="health-book-"+randomUUID();
const now=new Date("2026-10-04T12:00:00Z");
const workout={externalId:"b".repeat(64),startedAt:"2026-10-04T10:00:00Z",endedAt:"2026-10-04T10:30:00Z",durationSeconds:1200,sourceName:"Gymondo",activityType:"HKWorkoutActivityTypeFunctionalStrengthTraining",trainingType:"strength" as const};
const book=(w=workout)=>bookHealthTraining({profileId,workouts:[w]});
const profile=async ()=>(await getDashboardData()).find(p=>p.id===profileId)!;
beforeEach(async()=>{vi.useFakeTimers();vi.setSystemTime(now);const client=await db();await client.execute({sql:"INSERT INTO profiles (id,name,color,avatar) VALUES (?,'Health Book','#22d3ee','papa')",args:[profileId]});});
afterEach(async()=>{vi.useRealTimers();const client=await db();await client.batch([
  {sql:"DELETE FROM training_segments WHERE session_id IN (SELECT id FROM training_sessions WHERE profile_id=?)",args:[profileId]},
  {sql:"DELETE FROM training_sessions WHERE profile_id=?",args:[profileId]},
  {sql:"DELETE FROM audit_log WHERE profile_id=?",args:[profileId]},
  {sql:"DELETE FROM profiles WHERE id=?",args:[profileId]}
],"write");});

it("books active, not elapsed, minutes at 1.5 and never converts test receipts automatically",async()=>{
  const {trainingType: _type,...test}=workout;
  expect(_type).toBe("strength");
  await storeHealthTrainingTest({profileId,workouts:[test]});
  expect((await profile()).score).toBe(0);
  expect(await book()).toMatchObject({mode:"book",saved:1,conflicts:0,workouts:[{minutes:20,points:30}]});
  expect(await profile()).toMatchObject({score:30,totalMinutes:20,todayMinutes:20,strengthMinutes:20,enduranceMinutes:0,trainingProgress:{xp:20}});
  const repeated=await book({...workout,durationSeconds:600});
  expect(repeated).toMatchObject({saved:0,alreadyReceived:1,workouts:[{points:30,minutes:20,duplicate:true}]});
  expect((await profile()).score).toBe(30);
  const receipt=await (await history(new Request("http://localhost"),{params:Promise.resolve({profileId})})).json();
  expect(receipt.sessions[0]).toMatchObject({source:"health_import",segments:[{durationSeconds:1200}]});
});
it("blocks cross-source overlap and simultaneous duplicates",async()=>{
  const results=await Promise.all([book(),book()]);
  expect(results.reduce((sum,r)=>sum+(r?.saved??0),0)).toBe(1);
  expect(await book({...workout,externalId:"c".repeat(64),sourceName:"Apple Watch"})).toMatchObject({saved:0,conflicts:1});
  expect((await profile()).score).toBe(30);
});
it("Health app timers and device switches contribute zero; mode changes start fresh sessions",async()=>{
  vi.setSystemTime(new Date(workout.startedAt));
  const first=await startOrSwitchTraining({profileId,type:"strength",recordingMode:"health"});
  vi.setSystemTime(new Date("2026-10-04T10:15:00Z"));
  const switched=await startOrSwitchTraining({profileId,type:"endurance",recordingMode:"health"});
  expect(switched.sessionId).toBe(first.sessionId);
  expect(await profile()).toMatchObject({score:0,totalMinutes:0,trainingProgress:{xp:0},activeTraining:{recordingMode:"health"}});
  vi.setSystemTime(new Date(workout.endedAt));await stopTraining(profileId);
  expect((await profile()).score).toBe(0);
  expect(await book()).toMatchObject({saved:1});
  expect((await profile()).score).toBe(30);
  vi.setSystemTime(now);
  const health=await startOrSwitchTraining({profileId,type:"strength",recordingMode:"health"});
  vi.setSystemTime(new Date(now.getTime()+60000));
  const app=await startOrSwitchTraining({profileId,type:"strength",recordingMode:"app"});
  expect(app.sessionId).not.toBe(health.sessionId);
  vi.setSystemTime(new Date(now.getTime()+120000));await stopTraining(profileId);
  expect((await profile()).score).toBe(31);
});
it("blocks already counted app time and future manual overlap at the database boundary",async()=>{
  vi.setSystemTime(new Date(workout.startedAt));await startOrSwitchTraining({profileId,type:"strength",recordingMode:"app"});
  vi.setSystemTime(new Date(workout.endedAt));await stopTraining(profileId);
  expect(await book()).toMatchObject({saved:0,conflicts:1});
  expect((await profile()).score).toBe(30);
  const client=await db();await client.execute({sql:"DELETE FROM training_sessions WHERE profile_id=?",args:[profileId]});
  await book();
  const id=randomUUID();await client.execute({sql:"INSERT INTO training_sessions (id,profile_id,started_at,status) VALUES (?, ?, ?, 'active')",args:[id,profileId,workout.startedAt]});
  await expect(client.execute({sql:"INSERT INTO training_segments (id,session_id,type,started_at,ended_at) VALUES (?,?,'strength',?,?)",args:[randomUUID(),id,workout.startedAt,workout.endedAt]})).rejects.toThrow(/überschneidet/);
});
it("clips reset points proportionally but preserves period goals and lifetime level",async()=>{
  await book();const client=await db();
  await client.execute({sql:"UPDATE profiles SET score_reset_at='2026-10-04T10:15:00Z',target_reset_at='2026-10-04T10:15:00Z' WHERE id=?",args:[profileId]});
  expect(await profile()).toMatchObject({score:15,todayMinutes:20,totalMinutes:20,targetPercent:13,trainingProgress:{xp:20}});
});
it("keeps old imports out of today's goals but includes them in lifetime level",async()=>{
  await book({...workout,startedAt:"2025-08-31T10:00:00Z",endedAt:"2025-08-31T10:30:00Z"});
  expect(await profile()).toMatchObject({score:30,totalMinutes:20,todayMinutes:0,targetPercent:0,trainingProgress:{xp:20}});
  expect(healthTrainingSchema.safeParse({profileId,workouts:[{...workout,durationSeconds:2000}]}).success).toBe(false);
});
it("requires the family key, validates booking data and provides an explicit booking receipt",async()=>{
  const client=await db();const old=await client.execute({sql:"SELECT value FROM settings WHERE key=?",args:[FAMILY_HEALTH_KEY]});
  try {
    const secret=await createFamilyHealthKey();
    const request=(body:unknown,key=secret)=>new Request("http://localhost/api/sync/health-training",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${key}`},body:JSON.stringify(body)});
    expect((await importTraining(request({profileId,workouts:[workout]},"invalid"))).status).toBe(401);
    expect((await importTraining(request({profileId,workouts:[{...workout,durationSeconds:999999}]}))).status).toBe(400);
    const result=await (await importTraining(request({profileId,workouts:[workout]}))).json();
    expect(result).toMatchObject({mode:"book",saved:1,workouts:[{points:30,conflict:false}]});
    expect(JSON.stringify(result)).not.toContain(secret);
  } finally {
    if(old.rows.length) await client.execute({sql:"UPDATE settings SET value=? WHERE key=?",args:[String(old.rows[0].value),FAMILY_HEALTH_KEY]});
    else await client.execute({sql:"DELETE FROM settings WHERE key=?",args:[FAMILY_HEALTH_KEY]});
  }
});
it("automatically reaches level 2 at 150 imported active minutes",async()=>{
  await book({...workout,startedAt:"2026-10-04T07:00:00Z",endedAt:"2026-10-04T09:05:00Z",durationSeconds:7500});
  expect((await profile()).trainingProgress).toMatchObject({level:1,xp:125,remaining:25});
  await book({...workout,externalId:"d".repeat(64),startedAt:"2026-10-04T09:05:00Z",endedAt:"2026-10-04T09:30:00Z",durationSeconds:1500});
  expect(await profile()).toMatchObject({score:225,totalMinutes:150,trainingProgress:{level:2,xp:150,nextThreshold:450}});
});
it("splits active duration across local midnight without counting the elapsed pauses",async()=>{
  await book({...workout,startedAt:new Date(2026,9,3,23,50).toISOString(),endedAt:new Date(2026,9,4,0,10).toISOString(),durationSeconds:600});
  const p=await profile();
  expect(p).toMatchObject({score:15,totalMinutes:10,todayMinutes:5,trainingProgress:{xp:10}});
  expect(p.activityTrend?.find(d=>d.date==="2026-10-03")).toMatchObject({activityMinutes:5});
  expect(p.activityTrend?.find(d=>d.date==="2026-10-04")).toMatchObject({activityMinutes:5});
});
it("uses exact active duration for level minutes even with uneven pause windows",async()=>{
  await book({...workout,endedAt:"2026-10-04T10:30:11Z",durationSeconds:1200});
  expect(await profile()).toMatchObject({score:30,totalMinutes:20,todayMinutes:20,trainingProgress:{xp:20}});
});
