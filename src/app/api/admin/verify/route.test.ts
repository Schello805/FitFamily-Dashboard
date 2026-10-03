import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET, POST, DELETE } from "./route";
import { POST as logs } from "../logs/route";
import { db } from "@/lib/db";
import { setAdminPin } from "@/lib/security";

describe("admin session API", () => {
  let previousPinHash: string | null = null;
  beforeAll(async () => {
    const client = await db();
    const stored = await client.execute("SELECT value FROM settings WHERE key = 'admin_pin_hash'");
    previousPinHash = stored.rows[0] ? String(stored.rows[0].value) : null;
    await setAdminPin("7349");
  });
  afterAll(async () => {
    const client = await db();
    await client.batch([{ sql: "DELETE FROM admin_sessions" }, { sql: "DELETE FROM admin_login_attempts" }], "write");
    if (previousPinHash) await client.execute({ sql: "UPDATE settings SET value = ? WHERE key = 'admin_pin_hash'", args: [previousPinHash] });
    else await client.execute("DELETE FROM settings WHERE key = 'admin_pin_hash'");
  });

  it("logs in, restores on reload, authorizes a blank-PIN request, and revokes on lock", async () => {
    const response = await POST(new Request("https://fitfamily.local/api/admin/verify", {
      method: "POST", headers: { "Content-Type": "application/json", Origin: "https://fitfamily.local" },
      body: JSON.stringify({ pin: "7349" })
    }));
    expect(response.status).toBe(200);
    const cookie = response.headers.get("Set-Cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=strict");
    const payload = await response.json();
    expect(payload.expiresAt).toBeGreaterThan(Date.now());
    expect(payload).not.toHaveProperty("pin");
    const headers = { Cookie: cookie.split(";")[0], Origin: "https://fitfamily.local", "Content-Type": "application/json" };
    expect((await GET(new Request("https://fitfamily.local/api/admin/verify", { headers }))).status).toBe(200);
    expect((await logs(new Request("https://fitfamily.local/api/admin/logs", {
      method: "POST", headers, body: JSON.stringify({ pin: "", filter: "all" })
    }))).status).toBe(200);
    expect((await DELETE(new Request("https://fitfamily.local/api/admin/verify", { method: "DELETE", headers }))).status).toBe(200);
    expect((await GET(new Request("https://fitfamily.local/api/admin/verify", { headers }))).status).toBe(401);
  });

  it("does not disclose admin data through an unprotected session restore", async () => {
    const response = await GET(new Request("http://localhost/api/admin/verify"));
    expect(response.status).toBe(401);
    expect(await response.json()).not.toHaveProperty("providers");
  });
});
