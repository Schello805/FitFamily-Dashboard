import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { pairDevice } from "@/lib/security";
import { equipmentScanConfig } from "@/lib/equipment-scan";
import { POST } from "@/app/api/scan/route";
import { PATCH } from "@/app/api/equipment/[id]/scan/route";
import { getDashboardData } from "@/lib/dashboard";
import { stopTraining } from "@/lib/training";
vi.mock("@/lib/security", async importOriginal => ({ ...await importOriginal<object>(), verifyAdminPinOrReject: vi.fn(async () => null) }));
const profileId = `scan-${randomUUID()}`;
const strengthId = `${profileId}-strength`;
const enduranceId = `${profileId}-endurance`;
const now = new Date("2026-10-03T12:00:00Z");
let token: string;
function scan(id: string, kind = "geraet", authenticated = true) {
  return POST(new NextRequest("http://localhost/api/scan", { method: "POST", headers: { "Content-Type": "application/json", ...(authenticated ? { cookie: `ff_device=${token}` } : {}) }, body: JSON.stringify({ kind, id }) }));
}
describe("paired device scans", () => {
  beforeEach(async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const client = await db();
    await client.execute({ sql: "INSERT INTO profiles (id, name, color, avatar) VALUES (?, 'Scan Test', '#22d3ee', 'papa')", args: [profileId] });
    for (const [id, name, type] of [[strengthId, `${profileId}-Kraftstation`, "strength"], [enduranceId, `${profileId}-Laufband`, "endurance"]]) {
      await client.batch([
        { sql: "INSERT INTO equipment_inventory (id, name) VALUES (?, ?)", args: [id, name] },
        { sql: "INSERT INTO exercises (id, name, type, equipment) VALUES (?, ?, ?, ?)", args: [id, name, type, name] }
      ], "write");
    }
    token = await pairDevice(profileId, "Test phone");
  });
  afterEach(async () => {
    vi.useRealTimers();
    const client = await db();
    await client.batch([
      { sql: "DELETE FROM training_segments WHERE session_id IN (SELECT id FROM training_sessions WHERE profile_id = ?)", args: [profileId] },
      { sql: "DELETE FROM training_sessions WHERE profile_id = ?", args: [profileId] },
      { sql: "DELETE FROM paired_devices WHERE profile_id = ?", args: [profileId] },
      { sql: "DELETE FROM audit_log WHERE profile_id = ?", args: [profileId] },
      { sql: "DELETE FROM profiles WHERE id = ?", args: [profileId] },
      { sql: "DELETE FROM exercises WHERE id IN (?, ?)", args: [strengthId, enduranceId] },
      { sql: "DELETE FROM equipment_inventory WHERE id IN (?, ?)", args: [strengthId, enduranceId] },
      { sql: "DELETE FROM settings WHERE key IN (?, ?)", args: [`equipment_scan:${strengthId}`, `equipment_scan:${enduranceId}`] }
    ], "write");
  });
  it("requires pairing and blocks cross-origin start requests", async () => {
    expect((await scan(strengthId, "geraet", false)).status).toBe(401);
    expect((await POST(new NextRequest("http://localhost/api/scan", { method: "POST", headers: { origin: "https://other.example" } }))).status).toBe(403);
  });
  it("matches whitespace-normalized device names and requires reselection of stale defaults", async () => {
    const client = await db();
    await client.execute({ sql: "UPDATE exercises SET equipment = '  ' || equipment || '  ' WHERE id = ?", args: [strengthId] });
    expect((await equipmentScanConfig(strengthId))?.exercises).toHaveLength(1);
    await client.execute({ sql: "INSERT INTO settings (key, value) VALUES (?, ?)", args: [`equipment_scan:${strengthId}`, JSON.stringify({ exerciseId: "removed-exercise", tagLabel: "Sticker 01" })] });
    expect(await equipmentScanConfig(strengthId)).toMatchObject({ exerciseId: null, tagLabel: "Sticker 01" });
    const request = new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ type: "strength", exerciseId: strengthId, tagLabel: "  Sticker 02  " }) });
    expect((await PATCH(request, { params: Promise.resolve({ id: strengthId }) })).status).toBe(200);
    expect(await equipmentScanConfig(strengthId)).toMatchObject({ exerciseId: strengthId, tagLabel: "Sticker 02" });
  });
  it("handles concurrent repeated scans without duplicate sessions or segments", async () => {
    const responses = await Promise.all([scan(strengthId), scan(strengthId), scan(strengthId)]);
    expect(responses.every(response => response.status === 200)).toBe(true);
    const client = await db();
    expect((await client.execute({ sql: "SELECT id FROM training_sessions WHERE profile_id = ?", args: [profileId] })).rows).toHaveLength(1);
    expect((await client.execute({ sql: "SELECT sg.id FROM training_segments sg JOIN training_sessions ts ON ts.id = sg.session_id WHERE ts.profile_id = ?", args: [profileId] })).rows).toHaveLength(1);
  });
  it("switches device exactly, ignores repeated scans, and stops centrally", async () => {
    expect((await scan(strengthId)).status).toBe(200);
    vi.setSystemTime(new Date(now.getTime() + 10 * 60000));
    expect(await (await scan(strengthId)).json()).toMatchObject({ changed: false });
    expect((await scan(enduranceId)).status).toBe(200);
    vi.setSystemTime(new Date(now.getTime() + 30 * 60000));
    const active = (await getDashboardData()).find(p => p.id === profileId)!;
    expect(active).toMatchObject({ score: 50, totalMinutes: 30, activeTraining: { type: "endurance", exerciseId: enduranceId } });
    expect(active.trainingProgress?.xp).toBe(0);
    await stopTraining(profileId);
    const finished = (await getDashboardData()).find(p => p.id === profileId)!;
    expect(finished).toMatchObject({ activeTraining: null, trainingProgress: { xp: 30, badges: ["Erstes Training"] } });
    const client = await db();
    const segments = await client.execute({ sql: "SELECT sg.started_at, sg.ended_at FROM training_segments sg JOIN training_sessions ts ON ts.id = sg.session_id WHERE ts.profile_id = ? ORDER BY sg.started_at", args: [profileId] });
    expect(segments.rows).toHaveLength(2);
    expect(segments.rows[0].ended_at).toBe(segments.rows[1].started_at);
  });
  it("persists device type and standard exercise, rejects foreign exercises, blocks unavailable devices", async () => {
    expect((await equipmentScanConfig(enduranceId))?.type).toBe("endurance");
    const request = (exerciseId: string) => new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ type: "endurance", exerciseId }) });
    expect((await PATCH(request(enduranceId), { params: Promise.resolve({ id: strengthId }) })).status).toBe(400);
    expect((await PATCH(request(strengthId), { params: Promise.resolve({ id: strengthId }) })).status).toBe(200);
    expect((await equipmentScanConfig(strengthId))?.type).toBe("endurance");
    await scan(strengthId, "uebung");
    expect((await getDashboardData()).find(p => p.id === profileId)?.activeTraining?.type).toBe("endurance");
    const client = await db();
    await client.execute({ sql: "UPDATE equipment_inventory SET available = 0 WHERE id = ?", args: [enduranceId] });
    expect((await scan(enduranceId)).status).toBe(409);
    expect((await getDashboardData()).find(p => p.id === profileId)?.activeTraining?.exerciseId).toBe(strengthId);
  });
});
