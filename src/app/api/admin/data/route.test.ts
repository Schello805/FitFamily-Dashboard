import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST } from "./route";
import { setAdminPin } from "@/lib/security";
import { db } from "@/lib/db";

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
});
