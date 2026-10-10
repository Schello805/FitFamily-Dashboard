import { NextResponse } from "next/server";
import { db, getSetting } from "@/lib/db";
import { verifyAdminPinOrReject } from "@/lib/security";
import { createFamilyHealthKey, FAMILY_HEALTH_KEY } from "@/lib/health-training-test";
import { writeAdminLog } from "@/lib/admin-log";
import { energyGoal, energyGoalKey, stepGoal, stepGoalKey, trainingGoal, trainingGoalKey } from "@/lib/health-energy";
import { getProfileAge, movementTargetForAge } from "@/lib/domain";
import { z } from "zod";

function defaultWeeklyTrainingGoal(profileId: string, birthDate: unknown) {
  const target = movementTargetForAge(getProfileAge(profileId, birthDate == null ? null : String(birthDate)));
  return target.period === "Woche" ? target.minutes : target.minutes * 7;
}

export async function GET(request: Request) {
  const error = await verifyAdminPinOrReject(undefined, request);
  if (error) return error;
  const client = await db();
  const profiles = await client.execute("SELECT p.id, p.name, p.birth_date, s.value energy_goal, t.value step_goal, u.value training_goal FROM profiles p LEFT JOIN settings s ON s.key='health_energy_goal:' || p.id LEFT JOIN settings t ON t.key='health_step_goal:' || p.id LEFT JOIN settings u ON u.key='training_weekly_goal:' || p.id ORDER BY p.name");
  const latest = await client.execute("SELECT created_at, details FROM audit_log WHERE action IN ('health.training.test.received','health.training.received') ORDER BY created_at DESC, rowid DESC LIMIT 1");
  const attempt = await client.execute("SELECT details FROM audit_log WHERE action IN ('health.training.test.received', 'health.training.test.failed','health.training.received','health.training.failed') ORDER BY created_at DESC, rowid DESC LIMIT 1");
  const lastAttempt = attempt.rows[0] ? JSON.parse(String(attempt.rows[0].details)) : null;
  const energy = await client.execute("SELECT e.*, p.name profile_name FROM health_energy_daily e JOIN profiles p ON p.id=e.profile_id ORDER BY e.date DESC, e.updated_at DESC LIMIT 28");
  const energyAttempt = await client.execute("SELECT details FROM audit_log WHERE action IN ('health.energy.received','health.energy.failed') ORDER BY created_at DESC, rowid DESC LIMIT 1");
  const latestBulk = await client.execute("SELECT created_at, details FROM audit_log WHERE action='health.energy.bulk.received' ORDER BY created_at DESC, rowid DESC LIMIT 1");
  const latestBulkDetails = latestBulk.rows[0] ? JSON.parse(String(latestBulk.rows[0].details)) as { importId?: string; profileId?: string; sourceName?: string; days?: { date?: string }[] } : null;
  const latestEnergyImport = latestBulkDetails?.importId && latestBulkDetails.profileId && Array.isArray(latestBulkDetails.days)
    ? { importId: latestBulkDetails.importId, profileId: latestBulkDetails.profileId, sourceName: latestBulkDetails.sourceName ?? "", dates: latestBulkDetails.days.map(day => day.date).filter((date): date is string => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) }
    : null;
  return NextResponse.json({ configured: Boolean(await getSetting(FAMILY_HEALTH_KEY)), profiles: profiles.rows.map(p => ({ id: p.id, name: p.name, energyGoalKcal: energyGoal(p.energy_goal), goalSteps: stepGoal(p.step_goal), trainingGoalMinutes: trainingGoal(p.training_goal) ?? defaultWeeklyTrainingGoal(String(p.id), p.birth_date) })),
    energyDaily: energy.rows,
    energyAttempt: energyAttempt.rows[0] ? JSON.parse(String(energyAttempt.rows[0].details)) : null,
    latestEnergyImport,
    latestError: lastAttempt?.level === "error" ? { importId: lastAttempt.importId, message: lastAttempt.message,
      errors: lastAttempt.errors ?? lastAttempt.workouts?.filter((w: { conflict?: boolean }) => w.conflict).map((w: { error?: string }) => w.error) ?? [] } : null,
    latest: latest.rows[0] ? { at: latest.rows[0].created_at, ...JSON.parse(String(latest.rows[0].details)) } : null }, { headers: { "Cache-Control": "no-store" } });
}
export async function PATCH(request: Request) {
  const error = await verifyAdminPinOrReject(undefined, request);
  if (error) return error;
  const body = z.object({ profileId: z.string().min(1).max(80), goalKcal: z.number().int().min(1).max(20000).optional(), goalSteps: z.number().int().min(1).max(100000).optional(), trainingGoalMinutes: z.number().int().min(1).max(10000).optional() }).strict().refine(value => value.goalKcal !== undefined || value.goalSteps !== undefined || value.trainingGoalMinutes !== undefined).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Bitte ein kcal-, Schritte- oder Wochenziel in gültigem Bereich eingeben." }, { status: 400 });
  const client = await db();
  if (!(await client.execute({ sql: "SELECT id FROM profiles WHERE id=?", args: [body.data.profileId] })).rows.length) return NextResponse.json({ error: "Profil nicht gefunden." }, { status: 404 });
  const goals = [body.data.goalKcal !== undefined ? [energyGoalKey(body.data.profileId), body.data.goalKcal] as const : null, body.data.goalSteps !== undefined ? [stepGoalKey(body.data.profileId), body.data.goalSteps] as const : null, body.data.trainingGoalMinutes !== undefined ? [trainingGoalKey(body.data.profileId), body.data.trainingGoalMinutes] as const : null].filter(goal => goal !== null);
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
export async function DELETE(request: Request) {
  const error = await verifyAdminPinOrReject(undefined, request);
  if (error) return error;
  const body = z.union([
    z.object({ importId: z.string().uuid() }).strict(),
    z.object({ profileId: z.string().min(1).max(80), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict()
  ]).safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Ungültiger Apple-Health-Tag oder Import-ID." }, { status: 400 });
  const target = body.data;
  const client = await db();
  if ("profileId" in target) {
    const result = await client.execute({
      sql: "DELETE FROM health_energy_daily WHERE profile_id=? AND date=?",
      args: [target.profileId, target.date]
    });
    const deleted = Number(result.rowsAffected ?? 0);
    if (!deleted) return NextResponse.json({ error: "Dieser Apple-Health-Tageswert wurde nicht gefunden." }, { status: 404 });
    await writeAdminLog("health.energy.day.deleted", "info", "Apple Health · Tageswert gelöscht.", {
      profileId: target.profileId, date: target.date, deleted
    });
    return NextResponse.json({ ok: true, deleted, profileId: target.profileId, date: target.date });
  }
  const receipts = await client.execute({ sql: "SELECT details FROM audit_log WHERE action='health.energy.bulk.received' ORDER BY created_at DESC, rowid DESC LIMIT 100", args: [] });
  const receipt = receipts.rows.map(row => JSON.parse(String(row.details)) as { importId?: string; profileId?: string; days?: { date?: string }[] }).find(value => value.importId === target.importId);
  const dates = [...new Set(receipt?.days?.map(day => day.date).filter((date): date is string => typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)) ?? [])];
  if (!receipt?.profileId || !dates.length || dates.length > 31) return NextResponse.json({ error: "Import nicht gefunden oder nicht sicher rückgängig zu machen." }, { status: 404 });
  const result = await client.execute({ sql: `DELETE FROM health_energy_daily WHERE profile_id=? AND date IN (${dates.map(() => "?").join(",")})`, args: [receipt.profileId, ...dates] });
  await writeAdminLog("health.energy.bulk.reverted", "info", "Apple Health · 30-Tage-Alltag zurückgenommen.", { importId: target.importId, profileId: receipt.profileId, dates, deleted: Number(result.rowsAffected ?? 0) });
  return NextResponse.json({ ok: true, deleted: Number(result.rowsAffected ?? 0), profileId: receipt.profileId });
}
