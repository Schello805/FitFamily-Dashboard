import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ADMIN_SESSION_COOKIE, adminPinRejectedResponse, createAdminSession, getAdminSession, hashToken, requestUsesHttps, revokeAdminSession, setAdminPin, verifyAdminPinOrReject } from "@/lib/security";
import { db } from "@/lib/db";

describe("admin PIN response", () => {
  it("uses the standard unauthorized status and message", async () => {
    const response = adminPinRejectedResponse();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Eltern-PIN ist nicht richtig." });
  });
});

describe("server-side admin authorization", () => {
  const pin = "7164";
  let originalHash: string | null = null;
  beforeAll(async () => {
    const client = await db();
    const previous = await client.execute("SELECT value FROM settings WHERE key = 'admin_pin_hash'");
    originalHash = previous.rows[0] ? String(previous.rows[0].value) : null;
    await setAdminPin(pin);
  });
  beforeEach(async () => {
    const client = await db();
    await client.batch([{ sql: "DELETE FROM admin_sessions" }, { sql: "DELETE FROM admin_login_attempts" }], "write");
  });
  afterAll(async () => {
    const client = await db();
    await client.batch([{ sql: "DELETE FROM admin_sessions" }, { sql: "DELETE FROM admin_login_attempts" }], "write");
    if (originalHash) await client.execute({ sql: "UPDATE settings SET value = ? WHERE key = 'admin_pin_hash'", args: [originalHash] });
    else await client.execute("DELETE FROM settings WHERE key = 'admin_pin_hash'");
  });
  function request(token?: string, origin = "http://localhost") {
    return new Request("http://localhost/api/admin/test", {
      method: "POST", headers: { Origin: origin, ...(token ? { Cookie: `${ADMIN_SESSION_COOKIE}=${token}` } : {}) }
    });
  }

  it("accepts a short-lived session without resending or storing the PIN", async () => {
    const session = await createAdminSession();
    expect(await verifyAdminPinOrReject(undefined, request(session.token))).toBeNull();
    const client = await db();
    const stored = await client.execute("SELECT token_hash FROM admin_sessions");
    expect(stored.rows[0].token_hash).toBe(hashToken(session.token));
    expect(stored.rows[0].token_hash).not.toBe(session.token);
    await revokeAdminSession(request(session.token));
    expect(await getAdminSession(request(session.token))).toBeNull();
  });

  it("rejects expired sessions and explicitly wrong confirmation PINs", async () => {
    const session = await createAdminSession();
    expect((await verifyAdminPinOrReject("0000", request(session.token)))?.status).toBe(401);
    const client = await db();
    await client.execute("UPDATE admin_sessions SET expires_at = 0");
    expect((await verifyAdminPinOrReject(undefined, request(session.token)))?.status).toBe(401);
  });

  it("limits PIN guesses on the server even across spoofed caller headers", async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await verifyAdminPinOrReject("0000", request()))?.status).toBe(401);
    }
    const denied = await verifyAdminPinOrReject(pin, request());
    expect(denied?.status).toBe(429);
    expect(Number(denied?.headers.get("Retry-After"))).toBeGreaterThan(0);
    const client = await db();
    await client.execute("UPDATE admin_login_attempts SET window_started_at = 0");
    expect(await verifyAdminPinOrReject(pin, request())).toBeNull();
  });

  it("rejects cross-origin requests before accepting credentials", async () => {
    expect((await verifyAdminPinOrReject(pin, request(undefined, "http://other.local")))?.status).toBe(403);
    const session = await createAdminSession();
    expect((await verifyAdminPinOrReject(undefined, request(session.token, "http://other.local")))?.status).toBe(403);
  });

  it("recognizes HTTPS only directly or behind an explicitly trusted proxy", () => {
    const previous = process.env.TRUST_PROXY;
    try {
      delete process.env.TRUST_PROXY;
      const proxied = new Request("http://localhost", { headers: { "X-Forwarded-Proto": "https" } });
      expect(requestUsesHttps(proxied)).toBe(false);
      expect(requestUsesHttps(new Request("https://localhost"))).toBe(true);
      process.env.TRUST_PROXY = "true";
      expect(requestUsesHttps(proxied)).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.TRUST_PROXY;
      else process.env.TRUST_PROXY = previous;
    }
  });
});
