import { createHash, randomBytes, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

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
  await client.execute({
    sql: `INSERT INTO settings (key, value, updated_at) VALUES ('admin_pin_hash', ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    args: [hash]
  });
}

export async function verifyAdminPin(pin: string) {
  const client = await db();
  const result = await client.execute({ sql: "SELECT value FROM settings WHERE key = 'admin_pin_hash'" });
  const hash = result.rows[0]?.value;
  return typeof hash === "string" && await bcrypt.compare(pin, hash);
}

export function adminPinRejectedResponse() {
  return Response.json({ error: "Eltern-PIN ist nicht richtig." }, { status: 401 });
}

export async function verifyAdminPinOrReject(pin: string): Promise<Response | null> {
  return await verifyAdminPin(pin) ? null : adminPinRejectedResponse();
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
