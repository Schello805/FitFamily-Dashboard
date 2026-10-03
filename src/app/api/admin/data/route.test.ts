import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST } from "./route";
import { POST as exportData } from "@/app/api/export/route";
import { setAdminPin } from "@/lib/security";
import { db } from "@/lib/db";
import { randomUUID } from "node:crypto";

let previousAdminPinHash: string | null = null;

describe("admin data validation", () => {
  beforeAll(async () => {
    const client = await db();
    const previousPin = await client.execute({ sql: "SELECT value FROM settings WHERE key = 'admin_pin_hash'" });
    previousAdminPinHash = previousPin.rows[0] ? String(previousPin.rows[0].value) : null;
    await setAdminPin("2468");
  });

  afterAll(async () => {
    const client = await db();
    if (previousAdminPinHash) {
      await client.execute({ sql: "UPDATE settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'admin_pin_hash'", args: [previousAdminPinHash] });
    } else {
      await client.execute({ sql: "DELETE FROM settings WHERE key = 'admin_pin_hash'" });
    }
  });

  it("validates a FitFamily export and reports its dataset size without importing", async () => {
    const response = await POST(new Request("http://localhost/api/admin/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pin: "2468",
        action: "validate",
        backup: {
          format: "fitfamily-export",
          version: 1,
          data: { profiles: [{ id: "papa", name: "Papa", color: "#22d3ee", avatar: "papa" }], training_sessions: [] }
        }
      })
    }));
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.valid).toBe(true);
    expect(result.total).toBe(1);
    expect(result.counts.profiles).toBe(1);
  });

  it("rejects an invalid export without writing data", async () => {
    const response = await POST(new Request("http://localhost/api/admin/data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "2468", action: "validate", backup: { format: "wrong", version: 99, data: {} } })
    }));
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it.each([
    { profiles: [{ id: "papa", name: "Changed", color: "#22d3ee", avatar: "papa", score_baseline: -1 }] },
    { profiles: [{ id: 12, name: "Changed", color: "#22d3ee", avatar: "papa" }] },
    { profiles: [], training_sessions: [{ id: "invalid-time", profile_id: "papa", status: "completed", started_at: "not-a-date", ended_at: "2026-09-30T10:30:00Z" }] },
    { profiles: [], training_segments: [{ id: "invalid-type", session_id: "missing", type: "invalid", started_at: "2026-09-30T10:00:00Z" }] },
    { profiles: [], apple_health_daily: [{ profile_id: "papa", date: "2026-09-30", exercise_minutes: -5 }] },
    { profiles: [], apple_health_daily: [{ profile_id: "papa", date: "2026-02-31", step_count: 5000 }] },
    { profiles: [], equipment_inventory: [{ id: "bad-quantity", name: "Bad Quantity", quantity: 9 }] },
    { profiles: [], equipment_inventory: [{ id: "unsafe-manual", name: "Unsafe Manual", manual_pdf_url: "javascript:alert(1)" }] },
    { profiles: [], exercises: [{ id: "unsafe-video", name: "Unsafe Video", type: "strength", equipment: "Kraftstation", video_url: "javascript:alert(1)" }] },
    { profiles: [], training_plans: [{ id: "bad-plan", profile_id: "papa", title: "Bad Plan", goal: "Fitness", plan_json: "not-json" }] },
    { profiles: [{ id: "papa", name: "A", color: "#22d3ee", avatar: "papa" }, { id: "papa", name: "B", color: "#22d3ee", avatar: "papa" }] }
  ])("rejects malformed field types, values and duplicate keys: %j", async (data) => {
    const client = await db();
    const before = await client.execute("SELECT name, score_baseline FROM profiles WHERE id = 'papa'");
    const request = (action: string) => new Request("http://localhost/api/admin/data", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "2468", action, backup: { format: "fitfamily-export", version: 1, data } })
    });
    const validation = await POST(request("validate"));
    expect((await validation.json()).valid).toBe(false);
    expect((await POST(request("import"))).status).toBe(400);
    expect((await client.execute("SELECT name, score_baseline FROM profiles WHERE id = 'papa'")).rows).toEqual(before.rows);
  });

  it.each(["outside", "overlap", "missing-end", "open-completed", "multiple-active", "too-long"])("rejects inconsistent training relationships: %s", async (kind) => {
    const sessionId = `relation-${randomUUID()}`;
    const session = { id: sessionId, profile_id: "papa", started_at: "2026-09-30T10:00:00Z", ended_at: "2026-09-30T11:00:00Z" as string | null, status: "completed" };
    const segment = { id: randomUUID(), session_id: sessionId, type: "endurance", started_at: "2026-09-30T10:00:00Z", ended_at: "2026-09-30T10:30:00Z" as string | null };
    const sessions = [session];
    const segments = [segment];
    if (kind === "outside") segment.ended_at = "2026-09-30T12:00:00Z";
    if (kind === "overlap") segments.push({ ...segment, id: randomUUID(), started_at: "2026-09-30T10:15:00Z", ended_at: "2026-09-30T11:00:00Z" });
    if (kind === "missing-end") session.ended_at = null;
    if (kind === "too-long") session.ended_at = "2026-10-02T11:00:00Z";
    if (kind === "open-completed") segment.ended_at = null;
    if (kind === "multiple-active") {
      session.status = "active";
      session.ended_at = null;
      segment.ended_at = null;
      const otherId = randomUUID();
      sessions.push({ ...session, id: otherId });
      segments.push({ ...segment, id: randomUUID(), session_id: otherId });
    }
    const response = await POST(new Request("http://localhost/api/admin/data", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin: "2468", action: "validate", backup: { format: "fitfamily-export", version: 1, data: { profiles: [], training_sessions: sessions, training_segments: segments } } })
    }));
    const result = await response.json();
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("imports valid SQLite and offset timestamps as canonical training times", async () => {
    const client = await db();
    const sessionId = randomUUID();
    const segmentId = randomUUID();
    try {
      const response = await POST(new Request("http://localhost/api/admin/data", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "2468", action: "import", backup: { format: "fitfamily-export", version: 1, data: {
          profiles: [],
          training_sessions: [{ id: sessionId, profile_id: "papa", status: "completed", started_at: "2026-09-30 10:00:00", ended_at: "2026-09-30T13:00:00+02:00", created_at: "2026-09-30 12:00:00" }],
          training_segments: [{ id: segmentId, session_id: sessionId, type: "endurance", started_at: "2026-09-30T12:00:00+02:00", ended_at: "2026-09-30 11:00:00" }]
        } } })
      }));
      expect(response.status).toBe(200);
      const saved = await client.execute({ sql: "SELECT started_at, ended_at FROM training_sessions WHERE id = ?", args: [sessionId] });
      expect(saved.rows[0]).toMatchObject({ started_at: "2026-09-30T10:00:00.000Z", ended_at: "2026-09-30T11:00:00.000Z" });
    } finally {
      await client.batch([{ sql: "DELETE FROM training_segments WHERE id = ?", args: [segmentId] }, { sql: "DELETE FROM training_sessions WHERE id = ?", args: [sessionId] }], "write");
    }
  });

  it("validates partial updates against stored session and segment bounds", async () => {
    const client = await db();
    const sessionId = randomUUID();
    const segmentId = randomUUID();
    await client.batch([
      { sql: "INSERT INTO training_sessions (id, profile_id, started_at, ended_at, status) VALUES (?, 'papa', '2026-09-30T10:00:00Z', '2026-09-30T11:00:00Z', 'completed')", args: [sessionId] },
      { sql: "INSERT INTO training_segments (id, session_id, type, started_at, ended_at) VALUES (?, ?, 'endurance', '2026-09-30T10:00:00Z', '2026-09-30T11:00:00Z')", args: [segmentId, sessionId] }
    ], "write");
    try {
      const response = await POST(new Request("http://localhost/api/admin/data", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "2468", action: "validate", backup: { format: "fitfamily-export", version: 1, data: { profiles: [], training_segments: [{ id: segmentId, session_id: sessionId, type: "endurance", started_at: "2026-09-30T10:00:00Z", ended_at: "2026-09-30T12:00:00Z" }] } } })
      }));
      expect((await response.json()).valid).toBe(false);
    } finally {
      await client.batch([{ sql: "DELETE FROM training_segments WHERE id = ?", args: [segmentId] }, { sql: "DELETE FROM training_sessions WHERE id = ?", args: [sessionId] }], "write");
    }
  });

  it("enforces the request size limit without relying on Content-Length", async () => {
    const response = await POST(new Request("http://localhost/api/admin/data", { method: "POST", body: "x".repeat(15 * 1024 * 1024 + 1) }));
    expect(response.status).toBe(413);
  });

  it("rolls back all merged data if the database rejects a later write", async () => {
    const client = await db();
    const equipmentId = randomUUID();
    const previous = await client.execute("SELECT name FROM profiles WHERE id = 'papa'");
    await client.execute(`CREATE TRIGGER reject_import_test BEFORE INSERT ON equipment_inventory
      WHEN NEW.id = '${equipmentId}' BEGIN SELECT RAISE(ABORT, 'test failure'); END`);
    try {
      const response = await POST(new Request("http://localhost/api/admin/data", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "2468", action: "import", backup: { format: "fitfamily-export", version: 1, data: {
          profiles: [{ id: "papa", name: "Should Roll Back", color: "#22d3ee", avatar: "papa" }],
          equipment_inventory: [{ id: equipmentId, name: `Rollback Equipment ${equipmentId}` }]
        } } })
      }));
      expect(response.status).toBe(500);
      expect((await client.execute("SELECT name FROM profiles WHERE id = 'papa'")).rows).toEqual(previous.rows);
      expect((await client.execute({ sql: "SELECT id FROM equipment_inventory WHERE id = ?", args: [equipmentId] })).rows).toHaveLength(0);
    } finally {
      await client.execute("DROP TRIGGER IF EXISTS reject_import_test");
    }
  });

  it("round-trips avatar, profile stage, equipment manual and cycling distance", async () => {
    const client = await db();
    const id = `transfer-test-${randomUUID()}`;
    const equipmentId = `transfer-equipment-${randomUUID()}`;
    const date = "2099-01-01";
    const avatar = JSON.stringify({ image: "avatar-data" });
    const manualUrl = "https://example.test/manual.pdf";
    const cyclingDistance = 12.75;
    await client.batch([
      { sql: "INSERT INTO profiles (id, name, color, avatar, custom_avatar_data, starting_fitness_stage) VALUES (?, ?, ?, ?, ?, ?)", args: [id, "Transfer-Test", "#22d3ee", "papa", avatar, 6] },
      { sql: "INSERT INTO equipment_inventory (id, name, manual_pdf_url) VALUES (?, ?, ?)", args: [equipmentId, `Transfer-Test-${equipmentId}`, manualUrl] },
      { sql: "INSERT INTO apple_health_daily (profile_id, date, cycling_distance_km) VALUES (?, ?, ?)", args: [id, date, cyclingDistance] }
    ], "write");

    try {
      const exported = await exportData(new Request("http://localhost/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: "2468" })
      }));
      expect(exported.status).toBe(200);
      const backup = await exported.json();
      const data = backup.data as Record<string, Record<string, unknown>[]>;
      const profile = data.profiles.find((row) => row.id === id);
      const equipment = data.equipment_inventory.find((row) => row.id === equipmentId);
      const daily = data.apple_health_daily.find((row) => row.profile_id === id && row.date === date);
      expect(profile?.custom_avatar_data).toBe(avatar);
      expect(profile?.starting_fitness_stage).toBe(6);
      expect(equipment?.manual_pdf_url).toBe(manualUrl);
      expect(daily?.cycling_distance_km).toBe(cyclingDistance);

      await client.batch([
        { sql: "UPDATE profiles SET custom_avatar_data = NULL, starting_fitness_stage = 1 WHERE id = ?", args: [id] },
        { sql: "UPDATE equipment_inventory SET manual_pdf_url = NULL WHERE id = ?", args: [equipmentId] },
        { sql: "UPDATE apple_health_daily SET cycling_distance_km = 0 WHERE profile_id = ? AND date = ?", args: [id, date] }
      ], "write");

      const importResponse = await POST(new Request("http://localhost/api/admin/data", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pin: "2468",
          action: "import",
          backup: {
            format: backup.format,
            version: backup.version,
            data: {
              profiles: [profile],
              equipment_inventory: [equipment],
              apple_health_daily: [daily]
            }
          }
        })
      }));
      expect(importResponse.status).toBe(200);
      const restoredProfile = await client.execute({ sql: "SELECT custom_avatar_data, starting_fitness_stage FROM profiles WHERE id = ?", args: [id] });
      const restoredEquipment = await client.execute({ sql: "SELECT manual_pdf_url FROM equipment_inventory WHERE id = ?", args: [equipmentId] });
      const restoredDaily = await client.execute({ sql: "SELECT cycling_distance_km FROM apple_health_daily WHERE profile_id = ? AND date = ?", args: [id, date] });
      expect(String(restoredProfile.rows[0].custom_avatar_data)).toBe(avatar);
      expect(Number(restoredProfile.rows[0].starting_fitness_stage)).toBe(6);
      expect(String(restoredEquipment.rows[0].manual_pdf_url)).toBe(manualUrl);
      expect(Number(restoredDaily.rows[0].cycling_distance_km)).toBe(cyclingDistance);
    } finally {
      await client.batch([
        { sql: "DELETE FROM apple_health_daily WHERE profile_id = ?", args: [id] },
        { sql: "DELETE FROM equipment_inventory WHERE id = ?", args: [equipmentId] },
        { sql: "DELETE FROM profiles WHERE id = ?", args: [id] }
      ], "write");
    }
  });
});
