import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";

export const ADMIN_SESSION_COOKIE = "ff_admin";
export const ADMIN_SESSION_DURATION_MS = 60 * 60 * 1000;
export const adminPinSchema = z.string().regex(/^\d{4}$/).or(z.literal("")).optional();
const PIN_ATTEMPT_WINDOW_MS = 60_000;
const MAX_PIN_ATTEMPTS = 5;

export function requestUsesHttps(request: Request): boolean {
  if (new URL(request.url).protocol === "https:") return true;
  return process.env.TRUST_PROXY === "true" && request.headers.get("x-forwarded-proto") === "https";
}

export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return request.headers.get("sec-fetch-site") !== "cross-site";
  try {
    const expected = new URL(request.url);
    const incoming = new URL(origin);
    const host = request.headers.get("host") ?? expected.host;
    return incoming.host === host && incoming.protocol === (requestUsesHttps(request) ? "https:" : "http:");
  } catch {
    return false;
  }
}

function adminSessionToken(request: Request): string | undefined {
  const cookie = request.headers.get("cookie")?.split(";").map((value) => value.trim())
    .find((value) => value.startsWith(`${ADMIN_SESSION_COOKIE}=`));
  const token = cookie?.slice(ADMIN_SESSION_COOKIE.length + 1);
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined;
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export async function hasAdminPin() {
  const client = await db();
  const result = await client.execute({ sql: "SELECT value FROM settings WHERE key = 'admin_pin_hash'" });
  return Boolean(result.rows[0]?.value);
}

export async function setAdminPin(pin: string) {
  if (!/^\d{4}$/.test(pin)) throw new Error("Die Eltern-PIN muss aus genau vier Ziffern bestehen.");
  const client = await db();
  const hash = await bcrypt.hash(pin, 12);
  await client.batch([{
    sql: `INSERT INTO settings (key, value, updated_at) VALUES ('admin_pin_hash', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    args: [hash]
  }, { sql: "DELETE FROM admin_sessions" }, { sql: "DELETE FROM admin_login_attempts" }], "write");
}

export async function verifyAdminPin(pin: string) {
  if (!/^\d{4}$/.test(pin)) return false;
  const client = await db();
  const result = await client.execute({ sql: "SELECT value FROM settings WHERE key = 'admin_pin_hash'" });
  const hash = result.rows[0]?.value;
  return typeof hash === "string" && await bcrypt.compare(pin, hash);
}

export function adminPinRejectedResponse() {
  return Response.json({ error: "Eltern-PIN ist nicht richtig." }, { status: 401 });
}

export async function verifyAdminPinOrReject(pin: string | undefined, request?: Request): Promise<Response | null> {
  if (request && !isSameOriginRequest(request)) {
    return Response.json({ error: "Diese Anfrage muss aus der FitFamily-App kommen." }, { status: 403 });
  }
  if (!pin) {
    return request && await getAdminSession(request) ? null : adminPinRejectedResponse();
  }
  if (!/^\d{4}$/.test(pin)) return adminPinRejectedResponse();
  const client = await db();
  const now = Date.now();
  // One server-side bucket cannot be bypassed by spoofing client/proxy headers.
  const attempt = await client.execute({
    sql: `INSERT INTO admin_login_attempts (scope, attempts, window_started_at) VALUES ('pin', 1, ?)
      ON CONFLICT(scope) DO UPDATE SET
        attempts = CASE WHEN window_started_at <= ? THEN 1 ELSE attempts + 1 END,
        window_started_at = CASE WHEN window_started_at <= ? THEN excluded.window_started_at ELSE window_started_at END
      RETURNING attempts, window_started_at`,
    args: [now, now - PIN_ATTEMPT_WINDOW_MS, now - PIN_ATTEMPT_WINDOW_MS]
  });
  const row = attempt.rows[0];
  if (Number(row.attempts) > MAX_PIN_ATTEMPTS) {
    const retryAfter = Math.max(1, Math.ceil((Number(row.window_started_at) + PIN_ATTEMPT_WINDOW_MS - now) / 1000));
    return Response.json({ error: "Zu viele PIN-Versuche. Bitte in einer Minute erneut versuchen." }, {
      status: 429, headers: { "Retry-After": String(retryAfter) }
    });
  }
  if (!await verifyAdminPin(pin)) return adminPinRejectedResponse();
  await client.execute("DELETE FROM admin_login_attempts WHERE scope = 'pin'");
  return null;
}

export async function getAdminSession(request: Request): Promise<{ expiresAt: number } | null> {
  const token = adminSessionToken(request);
  if (!token) return null;
  const client = await db();
  const result = await client.execute({
    sql: `SELECT expires_at FROM admin_sessions WHERE token_hash = ? AND expires_at > ?
      AND pin_hash = (SELECT value FROM settings WHERE key = 'admin_pin_hash')`,
    args: [hashToken(token), Date.now()]
  });
  return result.rows[0] ? { expiresAt: Number(result.rows[0].expires_at) } : null;
}

export async function createAdminSession(): Promise<{ token: string; expiresAt: number }> {
  const client = await db();
  const token = createToken();
  const expiresAt = Date.now() + ADMIN_SESSION_DURATION_MS;
  await client.batch([
    { sql: "DELETE FROM admin_sessions WHERE expires_at <= ?", args: [Date.now()] },
    {
      sql: `INSERT INTO admin_sessions (token_hash, pin_hash, expires_at)
        SELECT ?, value, ? FROM settings WHERE key = 'admin_pin_hash'`,
      args: [hashToken(token), expiresAt]
    }
  ], "write");
  return { token, expiresAt };
}

export async function revokeAdminSession(request: Request): Promise<void> {
  const token = adminSessionToken(request);
  if (token) {
    const client = await db();
    await client.execute({ sql: "DELETE FROM admin_sessions WHERE token_hash = ?", args: [hashToken(token)] });
  }
}

export async function pairDevice(profileId: string, label: string | null) {
  const client = await db();
  const token = createToken();
  await client.execute({
    sql: "INSERT INTO paired_devices (id, profile_id, token_hash, label, last_seen_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
    args: [randomUUID(), profileId, hashToken(token), label]
  });
  return token;
}

export async function getPairedProfile(token: string | undefined) {
  if (!token) return null;
  const client = await db();
  const result = await client.execute({
    sql: `SELECT profile_id FROM paired_devices
      WHERE token_hash = ? AND revoked_at IS NULL LIMIT 1`,
    args: [hashToken(token)]
  });
  if (!result.rows[0]) return null;
  await client.execute({
    sql: "UPDATE paired_devices SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = ?",
    args: [hashToken(token)]
  });
  return String(result.rows[0].profile_id);
}
