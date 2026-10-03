import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getEquipmentStats } from "./equipment-stats";
import { GET } from "@/app/api/history/[profileId]/route";

const id = `equipment-stats-${randomUUID()}`;
const name = `${id}-Gerät`;
beforeEach(async () => {
  const client = await db();
  await client.batch([
    { sql: "INSERT INTO profiles (id, name, color, avatar) VALUES (?, 'Test', '#22d3ee', 'papa')", args: [id] },
    { sql: "INSERT INTO equipment_inventory (id, name) VALUES (?, ?)", args: [id, name] },
    { sql: "INSERT INTO exercises (id, name, type, equipment) VALUES (?, 'Testübung', 'strength', ?)", args: [id, name] }
  ], "write");
});
afterEach(async () => {
  const client = await db();
  await client.batch([
    { sql: "DELETE FROM training_segments WHERE session_id IN (SELECT id FROM training_sessions WHERE profile_id = ?)", args: [id] },
    { sql: "DELETE FROM training_sessions WHERE profile_id = ?", args: [id] },
    { sql: "DELETE FROM exercises WHERE id = ?", args: [id] },
    { sql: "DELETE FROM equipment_inventory WHERE id = ?", args: [id] },
    { sql: "DELETE FROM profiles WHERE id = ?", args: [id] }
  ], "write");
});
async function session(status = "completed", source = "nfc") {
  const client = await db();
  const sessionId = randomUUID();
  await client.execute({ sql: "INSERT INTO training_sessions (id, profile_id, started_at, status, source) VALUES (?, ?, ?, ?, ?)", args: [sessionId, id, new Date().toISOString(), status, source] });
  return sessionId;
}
async function segment(sessionId: string, type: string, seconds: number, exerciseId: string | null = id) {
  const client = await db();
  await client.execute({ sql: "INSERT INTO training_segments (id, session_id, type, exercise_id, started_at, ended_at) VALUES (?, ?, ?, ?, ?, ?)", args: [randomUUID(), sessionId, type, exerciseId, "2026-10-03T10:00:00Z", new Date(Date.parse("2026-10-03T10:00:00Z") + seconds * 1000).toISOString()] });
}
it("sums seconds before rounding and counts a device only once per session", async () => {
  const first = await session();
  await segment(first, "strength", 40);
  await segment(first, "strength", 40);
  await segment(first, "endurance", 60);
  await segment(await session("paused"), "endurance", 120);
  await segment(await session("active"), "strength", 900);
  await segment(await session("completed", "apple_health"), "strength", 900);
  const result = (await getEquipmentStats(id)).find(item => item.id === id);
  expect(result).toMatchObject({ seconds: 260, strengthSeconds: 80, enduranceSeconds: 180, sessions: 2, lastTrainedAt: "2026-10-03T10:02:00.000Z" });
});
it("keeps archived device history and separates training without a device", async () => {
  const client = await db();
  await segment(await session(), "strength", 60);
  await segment(await session(), "endurance", 30, null);
  await client.execute({ sql: "UPDATE equipment_inventory SET active = 0 WHERE id = ?", args: [id] });
  const result = await getEquipmentStats(id);
  expect(result.find(item => item.id === id)).toMatchObject({ name, seconds: 60 });
  expect(result.find(item => item.name === "Ohne Gerätezuordnung")).toMatchObject({ seconds: 30, sessions: 1 });
});
it("shows unused active devices and does not include another profile's time", async () => {
  expect((await getEquipmentStats(id)).find(item => item.id === id)).toMatchObject({ seconds: 0, sessions: 0, lastTrainedAt: null });
});
it("returns full equipment totals beyond the history list's 500-row limit", async () => {
  const sessionId = await session();
  const client = await db();
  await client.batch(Array.from({ length: 501 }, () => ({ sql: "INSERT INTO training_segments (id, session_id, type, exercise_id, started_at, ended_at) VALUES (?, ?, 'strength', ?, '2026-10-03T10:00:00Z', '2026-10-03T10:00:01Z')", args: [randomUUID(), sessionId, id] })), "write");
  const response = await GET(new Request("http://localhost/api/history/test"), { params: Promise.resolve({ profileId: id }) });
  const body = await response.json();
  expect(body.equipmentStats.find((item: { id: string }) => item.id === id)).toMatchObject({ seconds: 501, sessions: 1 });
  expect(body.sessions[0].segments[0].equipmentName).toBe(name);
});
