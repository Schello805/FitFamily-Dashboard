import { NextResponse } from "next/server";
import { db, getSetting } from "@/lib/db";
import { verifyAdminPinOrReject } from "@/lib/security";
import { createFamilyHealthKey, FAMILY_HEALTH_KEY } from "@/lib/health-training-test";
import { writeAdminLog } from "@/lib/admin-log";
import { energyGoal, energyGoalKey, stepGoal, stepGoalKey } from "@/lib/health-energy";
import { z } from "zod";

export async function GET(request: Request) {
  const error = await verifyAdminPinOrReject(undefined, request);
  if (error) return error;
  const client = await db();
  const profiles = await client.execute("SELECT p.id, p.name, s.value energy_goal, t.value step_goal FROM profiles p LEFT JOIN settings s ON s.key='health_energy_goal:' || p.id LEFT JOIN settings t ON t.key='health_step_goal:' || p.id ORDER BY p.name");
  const latest = await client.execute("SELECT created_at, details FROM audit_log WHERE action IN ('health.training.test.received','health.training.received') ORDER BY created_at DESC, rowid DESC LIMIT 1");
  const attempt = await client.execute("SELECT details FROM audit_log WHERE action IN ('health.training.test.received', 'health.training.test.failed','health.training.received','health.training.failed') ORDER BY created_at DESC, rowid DESC LIMIT 1");
  const lastAttempt = attempt.rows[0] ? JSON.parse(String(attempt.rows[0].details)) : null;
  const energy = await client.execute("SELECT e.*, p.name profile_name FROM health_energy_daily e JOIN profiles p ON p.id=e.profile_id ORDER BY e.date DESC, e.updated_at DESC LIMIT 28");
  const energyAttempt = await client.execute("SELECT details FROM audit_log WHERE action IN ('health.energy.received','health.energy.failed') ORDER BY created_at DESC, rowid DESC LIMIT 1");
  return NextResponse.json({ configured: Boolean(await getSetting(FAMILY_HEALTH_KEY)), profiles: profiles.rows.map(p => ({ id: p.id, name: p.name, energyGoalKcal: energyGoal(p.energy_goal), goalSteps: stepGoal(p.step_goal) })),
    energyDaily: energy.rows,
    energyAttempt: energyAttempt.rows[0] ? JSON.parse(String(energyAttempt.rows[0].details)) : null,
    latestError: lastAttempt?.level === "error" ? { importId: lastAttempt.importId, message: lastAttempt.message,
      errors: lastAttempt.errors ?? lastAttempt.workouts?.filter((w: { conflict?: boolean }) => w.conflict).map((w: { error?: string }) => w.error) ?? [] } : null,
    latest: latest.rows[0] ? { at: latest.rows[0].created_at, ...JSON.parse(String(latest.rows[0].details)) } : null }, { headers: { "Cache-Control": "no-store" } });
}
export async function PATCH(request: Request) {
  const error = await verifyAdminPinOrReject(undefined, request);
  if (error) return error;
  const body = z.object({ profileId: z.string().min(1).max(80), goalKcal: z.number().int().min(1).max(20000).optional(), goalSteps: z.number().int().min(1).max(100000).optional() }).strict().refine(value => value.goalKcal !== undefined || value.goalSteps !== undefined).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Bitte ein kcal-Ziel zwischen 1 und 20000 oder ein Schritte-Ziel zwischen 1 und 100000 eingeben." }, { status: 400 });
  const client = await db();
  if (!(await client.execute({ sql: "SELECT id FROM profiles WHERE id=?", args: [body.data.profileId] })).rows.length) return NextResponse.json({ error: "Profil nicht gefunden." }, { status: 404 });
  const goals = [body.data.goalKcal !== undefined ? [energyGoalKey(body.data.profileId), body.data.goalKcal] as const : null, body.data.goalSteps !== undefined ? [stepGoalKey(body.data.profileId), body.data.goalSteps] as const : null].filter(goal => goal !== null);
  await client.batch(goals.map(([key, value]) => ({ sql: "INSERT INTO settings(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", args: [key, String(value)] })), "write");
  return NextResponse.json({ ok: true });
}
export async function POST(request: Request) {
  const error = await verifyAdminPinOrReject(undefined, request);
  if (error) return error;
  const secret = await createFamilyHealthKey();
  await writeAdminLog("health.training.key.rotated", "info", "Gemeinsamer Familienschlüssel für den Trainingstest erneuert.");
  return NextResponse.json({ secret }, { headers: { "Cache-Control": "no-store" } });
}
