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
