import { NextResponse } from "next/server";
import { db, getSetting } from "@/lib/db";
import { verifyAdminPinOrReject } from "@/lib/security";
import { createFamilyHealthKey, FAMILY_HEALTH_KEY } from "@/lib/health-training-test";
import { writeAdminLog } from "@/lib/admin-log";

export async function GET(request: Request) {
  const error = await verifyAdminPinOrReject(undefined, request);
  if (error) return error;
  const client = await db();
  const profiles = await client.execute("SELECT id, name FROM profiles ORDER BY name");
  const latest = await client.execute("SELECT created_at, details FROM audit_log WHERE action = 'health.training.test.received' ORDER BY created_at DESC, rowid DESC LIMIT 1");
  const attempt = await client.execute("SELECT details FROM audit_log WHERE action IN ('health.training.test.received', 'health.training.test.failed') ORDER BY created_at DESC, rowid DESC LIMIT 1");
  const lastAttempt = attempt.rows[0] ? JSON.parse(String(attempt.rows[0].details)) : null;
  return NextResponse.json({ configured: Boolean(await getSetting(FAMILY_HEALTH_KEY)), profiles: profiles.rows,
    latestError: lastAttempt?.level === "error" ? { importId: lastAttempt.importId, message: lastAttempt.message, errors: lastAttempt.errors } : null,
    latest: latest.rows[0] ? { at: latest.rows[0].created_at, ...JSON.parse(String(latest.rows[0].details)) } : null }, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  const error = await verifyAdminPinOrReject(undefined, request);
  if (error) return error;
  const secret = await createFamilyHealthKey();
  await writeAdminLog("health.training.key.rotated", "info", "Gemeinsamer Familienschlüssel für den Trainingstest erneuert.");
  return NextResponse.json({ secret }, { headers: { "Cache-Control": "no-store" } });
}
