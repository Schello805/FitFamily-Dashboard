import { randomUUID } from "node:crypto";
import type { InStatement } from "@libsql/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { SCORE_MULTIPLIER, type TrainingType } from "@/lib/domain";
import { hashToken, verifyAdminPinOrReject } from "@/lib/security";
import {
  APPLE_HEALTH_ACTIVITY_FIELDS,
  APPLE_HEALTH_MAX_SYNC_DAYS,
  appleHealthActivityShape,
  appleHealthDailySchema,
  isAppleHealthDateWithinWindow,
  localIsoDate,
  mergeAppleHealthDays
} from "@/lib/apple-health-activity";

function inferTrainingType(title?: string | null, explicitType?: string | null): TrainingType {
  if (explicitType === "strength" || explicitType === "endurance") return explicitType;
  if (!title) return "endurance";
  const t = title.toLowerCase();
  const strengthKeywords = [
    "kraft", "hantel", "dumbbell", "barbell", "weights", "gym", "bodyweight",
    "liegestütz", "klimmzug", "core", "yoga", "pilates", "functional", "strength", "bauch"
  ];
  for (const kw of strengthKeywords) {
    if (t.includes(kw)) return "strength";
  }
  return "endurance";
}

const workoutItemSchema = z.object({
  id: z.string().max(200).optional().transform((value) => value || undefined),
  title: z.string().max(200).optional().nullable(),
  type: z.enum(["strength", "endurance"]).optional().nullable(),
  startedAt: z.string().datetime({ offset: true }).optional().nullable(),
  endedAt: z.string().datetime({ offset: true }).optional().nullable(),
  durationMinutes: z.number().min(1).max(1440).optional().nullable(),
  calories: z.number().nonnegative().max(100_000).optional().nullable(),
  distanceKm: z.number().nonnegative().max(2_000).optional().nullable(),
  source: z.string().max(80).optional()
});

const bodySchema = z.object({
  profileId: z.string().min(1),
  secret: z.string().min(32).max(256),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dryRun: z.boolean().optional(),
  workouts: z.array(workoutItemSchema).max(500).optional(),
  dailyActivity: z.union([z.array(appleHealthDailySchema).max(90), appleHealthDailySchema.transform((day) => [day])]).optional(),
  // Single workout fallback fields for simple Shortcuts
  id: z.string().max(200).optional().transform((value) => value || undefined),
  title: z.string().max(200).optional().nullable(),
  type: z.enum(["strength", "endurance"]).optional().nullable(),
  startedAt: z.string().datetime({ offset: true }).optional().nullable(),
  endedAt: z.string().datetime({ offset: true }).optional().nullable(),
  durationMinutes: z.number().min(1).max(1440).optional().nullable(),
  calories: z.number().nonnegative().max(100_000).optional().nullable(),
  distanceKm: z.number().nonnegative().max(2_000).optional().nullable(),
  ...appleHealthActivityShape
});

function diagnosticActivityPayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  // Explicit allowlist: credentials and arbitrary payload text never enter the log.
  return Object.fromEntries(["date", ...APPLE_HEALTH_ACTIVITY_FIELDS.map(({ key }) => key), "standMinutes"].flatMap((key) =>
    typeof source[key] === "number" || (key === "date" && typeof source[key] === "string") ? [[key, source[key]]] : []
  ));
}

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON-Format." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    // Record authenticated payload errors (for example an aggregated 30-day step
    // total sent as a single-day field) without ever storing the health payload
    // or the sync secret itself.
    try {
      const candidate = json && typeof json === "object" && !Array.isArray(json)
        ? json as Record<string, unknown>
        : null;
      const profileId = typeof candidate?.profileId === "string" ? candidate.profileId : "";
      const secret = typeof candidate?.secret === "string" ? candidate.secret : "";
      if (profileId && secret.length >= 32 && secret.length <= 256) {
        const client = await db();
        const token = await client.execute({
          sql: "SELECT token_hash FROM apple_health_tokens WHERE profile_id = ? LIMIT 1",
          args: [profileId]
        });
        if (typeof token.rows[0]?.token_hash === "string" && hashToken(secret) === token.rows[0].token_hash) {
          const validationErrors = parsed.error.issues
            .slice(0, 12)
            .map((issue) => `${issue.path.map(String).join(".") || "Anfrage"}: ${issue.message}`);
          await client.execute({
            sql: "INSERT INTO audit_log (id, action, profile_id, details) VALUES (?, 'health.apple_sync.failed', ?, ?)",
            args: [randomUUID(), profileId, JSON.stringify({
              status: "failed",
              received: 0,
              reason: "validation",
              message: `Ungültige Anfrage: ${validationErrors.join("; ")}`.slice(0, 500)
            })]
          });
        }
      }
    } catch {
      // Logging must never replace the validation response to the Shortcut.
    }
    return NextResponse.json({ error: "Ungültige Anfrage.", details: parsed.error.flatten() }, { status: 400 });
  }

  const { profileId, workouts: arrayWorkouts, ...singleWorkout } = parsed.data;
  const client = await db();

  const profileExists = await client.execute({
    sql: "SELECT id, name FROM profiles WHERE id = ? LIMIT 1",
    args: [profileId]
  });
  if (!profileExists.rows[0]) {
    return NextResponse.json({ error: `Profil '${profileId}' existiert nicht.` }, { status: 404 });
  }

  const tokenRow = await client.execute({
    sql: "SELECT token_hash FROM apple_health_tokens WHERE profile_id = ? LIMIT 1",
    args: [profileId]
  });
  const storedHash = tokenRow.rows[0]?.token_hash;
  if (typeof storedHash !== "string" || hashToken(parsed.data.secret) !== storedHash) {
    await client.execute({
      sql: "INSERT INTO audit_log (id, action, profile_id, details) VALUES (?, 'health.apple_sync.failed', ?, ?)",
      args: [randomUUID(), profileId, JSON.stringify({ status: "failed", message: "Sync-Schlüssel ungültig", received: 0 })]
    });
    return NextResponse.json({ error: "Sync-Schlüssel fehlt oder ist ungültig. Bitte in FitFamily neu erstellen." }, { status: 401 });
  }

  const syncLogId = randomUUID();
  await client.execute({
    sql: "INSERT INTO audit_log (id, action, profile_id, details) VALUES (?, 'health.apple_sync.started', ?, ?)",
    args: [syncLogId, profileId, JSON.stringify({ status: "received", received: 0 })]
  });

  async function finishSyncLog(action: "health.apple_sync.checked" | "health.apple_sync.completed" | "health.apple_sync.failed", details: Record<string, unknown>) {
    await client.execute({
      sql: "UPDATE audit_log SET action = ?, details = ? WHERE id = ?",
      args: [action, JSON.stringify(details), syncLogId]
    });
  }

  const profileName = String(profileExists.rows[0].name);

  // Normalize workouts into a single list - only include actual workouts
  const rawList = Array.isArray(arrayWorkouts) && arrayWorkouts.length > 0
    ? arrayWorkouts.filter((w) => Boolean(w.title || w.durationMinutes || w.startedAt))
    : (singleWorkout.title || singleWorkout.durationMinutes || singleWorkout.startedAt)
      ? [singleWorkout]
      : [];

  const latestAllowedStart = Date.now() + 60_000;
  for (const item of rawList) {
    if (!item.startedAt || !item.endedAt) {
      await finishSyncLog("health.apple_sync.failed", { status: "failed", received: rawList.length, message: "Start- oder Endzeit fehlt" });
      return NextResponse.json({ error: "Jedes Health-Workout muss echte Start- und Endzeitpunkte enthalten." }, { status: 400 });
    }
    const start = Date.parse(item.startedAt);
    const end = Date.parse(item.endedAt);
    if (start > latestAllowedStart) {
      await finishSyncLog("health.apple_sync.failed", { status: "failed", received: rawList.length, message: "Training beginnt in der Zukunft" });
      return NextResponse.json({ error: "Ein Training darf nicht in der Zukunft beginnen." }, { status: 400 });
    }
    if (end > latestAllowedStart) {
      await finishSyncLog("health.apple_sync.failed", { status: "failed", received: rawList.length, message: "Training endet in der Zukunft" });
      return NextResponse.json({ error: "Ein Training darf nicht in der Zukunft enden." }, { status: 400 });
    }
    if (end - start < 60_000 || end - start > 24 * 60 * 60 * 1000) {
      await finishSyncLog("health.apple_sync.failed", { status: "failed", received: rawList.length, message: "Trainingsdauer außerhalb des erlaubten Bereichs" });
      return NextResponse.json({ error: "Ein Training muss zwischen 1 Minute und 24 Stunden dauern." }, { status: 400 });
    }
  }

  const todayStr = localIsoDate(new Date());
  const hasLegacyActivity = APPLE_HEALTH_ACTIVITY_FIELDS.some(({ key }) => parsed.data[key] != null);
  const legacyDay = hasLegacyActivity ? {
    date: parsed.data.date ?? todayStr,
    ...Object.fromEntries(APPLE_HEALTH_ACTIVITY_FIELDS.flatMap(({ key }) =>
      parsed.data[key] == null ? [] : [[key, parsed.data[key]]]
    ))
  } as z.infer<typeof appleHealthDailySchema> : undefined;
  const dailyActivity = mergeAppleHealthDays(parsed.data.dailyActivity ?? [], legacyDay);
  if (dailyActivity.length > APPLE_HEALTH_MAX_SYNC_DAYS || dailyActivity.some((day) => !isAppleHealthDateWithinWindow(day.date, todayStr))) {
    const message = dailyActivity.length > APPLE_HEALTH_MAX_SYNC_DAYS
      ? "Pro Sync sind höchstens 30 verschiedene Aktivitätstage erlaubt."
      : "Tagesaktivität darf nur gültige Datumswerte der letzten 30 Tage enthalten.";
    await finishSyncLog("health.apple_sync.failed", { status: "failed", received: rawList.length, imported: 0, activityDaysSynced: 0, message });
    return NextResponse.json({ error: message, imported: 0, activityDaysSynced: 0 }, { status: 400 });
  }

  if (parsed.data.dryRun) {
    await finishSyncLog("health.apple_sync.checked", { status: "checked", received: rawList.length, imported: 0, skipped: 0, message: "Schlüssel geprüft; keine Trainingsdaten gespeichert" });
    return NextResponse.json({
      ok: true,
      validToken: true,
      received: rawList.length,
      message: rawList.length ? "Sync-Schlüssel gültig. Trainingsdaten wurden nicht gespeichert." : "Sync-Schlüssel gültig. Noch keine Trainingsdaten empfangen."
    });
  }

  let importedCount = 0;
  let skippedCount = 0;
  let totalPointsEarned = 0;

  const statements: InStatement[] = [{
    sql: "SELECT token_hash FROM apple_health_tokens WHERE profile_id = ? AND token_hash = ?",
    args: [profileId, hashToken(parsed.data.secret)]
  }];
  const pendingWorkouts: { resultIndex: number; points: number }[] = [];
  const syncedActivityDays: { date: string; fields: string[] }[] = [];
  const activityResultIndices: number[] = [];
  let hasActivityData = false;
  let activityDaysSynced = 0;
  const secretHash = hashToken(parsed.data.secret);

  for (const item of rawList) {
    if (!item.startedAt || !item.endedAt) continue;
    const startIso = new Date(item.startedAt).toISOString();
    const endIso = new Date(item.endedAt).toISOString();
    const durMinutes = (Date.parse(endIso) - Date.parse(startIso)) / 60000;
    const externalId = item.id ?? `start:${startIso}`;
    const trainingType = inferTrainingType(item.title, item.type);
    const sessionId = randomUUID();
    const points = durMinutes * SCORE_MULTIPLIER[trainingType];
    const duplicateSql = item.id
      ? "external_id = ?"
      : "ABS(strftime('%s', started_at) - strftime('%s', ?)) < 180";
    pendingWorkouts.push({ resultIndex: statements.length, points });
    statements.push(
      {
        sql: `INSERT INTO training_sessions
          (id, profile_id, started_at, ended_at, status, source, external_id, health_title, health_calories, health_distance_km, edited)
          SELECT ?, ?, ?, ?, 'completed', 'apple_health', ?, ?, ?, ?, 0
          WHERE EXISTS (SELECT 1 FROM apple_health_tokens WHERE profile_id = ? AND token_hash = ?)
          AND NOT EXISTS (SELECT 1 FROM apple_health_ignored_workouts WHERE profile_id = ? AND external_id = ?)
          AND NOT EXISTS (SELECT 1 FROM training_sessions WHERE profile_id = ? AND source = 'apple_health' AND ${duplicateSql})`,
        args: [sessionId, profileId, startIso, endIso, externalId, item.title ?? "Apple Health Workout", item.calories ?? null, item.distanceKm ?? null, profileId, secretHash, profileId, externalId, profileId, item.id ?? startIso]
      },
      {
        sql: `INSERT INTO training_segments (id, session_id, type, exercise_id, started_at, ended_at)
          SELECT ?, ?, ?, NULL, ?, ? WHERE EXISTS (SELECT 1 FROM training_sessions WHERE id = ?)`,
        args: [randomUUID(), sessionId, trainingType, startIso, endIso, sessionId]
      },
      {
        sql: `INSERT INTO audit_log (id, action, profile_id, details)
          SELECT ?, 'health.apple_sync', ?, ? WHERE EXISTS (SELECT 1 FROM training_sessions WHERE id = ?)`,
        args: [randomUUID(), profileId, JSON.stringify({ title: item.title ?? "Apple Health Training", type: trainingType, durationMinutes: durMinutes, calories: item.calories, distanceKm: item.distanceKm, points }), sessionId]
      }
    );
  }

  for (const day of dailyActivity) {
    const providedFields = APPLE_HEALTH_ACTIVITY_FIELDS.filter(({ key }) => day[key] != null);
    if (!providedFields.length) continue;
    hasActivityData = hasActivityData || providedFields.some(({ key }) => !key.endsWith("Goal"));
    const columns = ["profile_id", "date", ...providedFields.map(({ column }) => column), "updated_at"];
    const selectedValues = ["?", "?", ...providedFields.map(() => "?"), "CURRENT_TIMESTAMP"];
    const updates = [...providedFields.map(({ column }) => `${column} = excluded.${column}`), "updated_at = CURRENT_TIMESTAMP"];
    activityResultIndices.push(statements.length);
    statements.push({
      sql: `INSERT INTO apple_health_daily (${columns.join(", ")})
        SELECT ${selectedValues.join(", ")}
        WHERE EXISTS (SELECT 1 FROM apple_health_tokens WHERE profile_id = ? AND token_hash = ?)
        ON CONFLICT(profile_id, date) DO UPDATE SET ${updates.join(", ")}`,
      args: [profileId, day.date, ...providedFields.map(({ key }) => day[key] as number), profileId, secretHash]
    });
    syncedActivityDays.push({ date: day.date, fields: providedFields.map(({ key }) => key) });
  }

  try {
    // One write transaction serializes duplicate checks, revocation and every
    // data change. A failed statement rolls back the entire request.
    const results = await client.batch(statements, "write");
    if (!results[0]?.rows.length) {
      await finishSyncLog("health.apple_sync.failed", { status: "failed", received: rawList.length, imported: 0, skipped: 0, activityDaysSynced: 0, message: "Sync-Schlüssel vor dem Import getrennt" });
      return NextResponse.json({ error: "Der Sync-Schlüssel wurde getrennt. Es wurden keine Daten übernommen.", imported: 0, activityDaysSynced: 0 }, { status: 401 });
    }
    for (const workout of pendingWorkouts) {
      if (results[workout.resultIndex]?.rowsAffected === 1) {
        importedCount++;
        totalPointsEarned += workout.points;
      } else {
        skippedCount++;
      }
    }
    activityDaysSynced = activityResultIndices.filter((index) => results[index]?.rowsAffected === 1).length;
  } catch {
    await finishSyncLog("health.apple_sync.failed", { status: "failed", received: rawList.length, imported: 0, skipped: 0, activityDaysSynced: 0, message: "Import fehlgeschlagen; alle Datenänderungen zurückgerollt" }).catch(() => undefined);
    return NextResponse.json({ error: "Der Import ist fehlgeschlagen. Es wurden keine Daten übernommen.", imported: 0, activityDaysSynced: 0 }, { status: 500 });
  }

  const message = importedCount > 0
    ? `${importedCount} Einheit(en) für ${profileName} synchronisiert.`
    : hasActivityData
      ? `Aktivitätsringe für ${profileName} erfolgreich aktualisiert.`
      : skippedCount > 0
        ? "Keine neuen Einheiten (bereits vorhanden)."
        : "Keine Daten übertragen.";

  await finishSyncLog("health.apple_sync.completed", {
    status: "completed",
    received: rawList.length,
    imported: importedCount,
    skipped: skippedCount,
    activityDaysSynced,
    activityDays: syncedActivityDays,
    profileName,
    receivedActivity: {
      ...diagnosticActivityPayload(json),
      dailyActivity: Array.isArray((json as Record<string, unknown>).dailyActivity)
        ? ((json as Record<string, unknown>).dailyActivity as unknown[]).map(diagnosticActivityPayload)
        : (json as Record<string, unknown>).dailyActivity ? [diagnosticActivityPayload((json as Record<string, unknown>).dailyActivity)] : []
    },
    savedActivity: await Promise.all(dailyActivity.map(async (day) => {
      const stored = await client.execute({ sql: "SELECT * FROM apple_health_daily WHERE profile_id = ? AND date = ?", args: [profileId, day.date] });
      const row = stored.rows[0];
      return { date: day.date, ...Object.fromEntries(APPLE_HEALTH_ACTIVITY_FIELDS.map(({ key, column }) => [key, Number(row?.[column] ?? 0)])) };
    })),
    warnings: dailyActivity.some((day) => day.standMinutes != null) || (json as Record<string, unknown>).standMinutes != null
      ? ["standMinutes ist Stehzeit, nicht erfüllte Stehstunden. Für den Stehen-Ring wird standHours benötigt; Stehminuten werden dafür nicht übernommen."] : [],
    pointsEarned: totalPointsEarned,
    message
  }).catch(() => undefined);

  return NextResponse.json({
    ok: true,
    imported: importedCount,
    skipped: skippedCount,
    activityDaysSynced,
    activityDays: syncedActivityDays,
    pointsEarned: totalPointsEarned,
    profileId,
    profileName,
    message
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const profileId = searchParams.get("profileId");

  if (profileId) {
    const client = await db();
    const profile = await client.execute({ sql: "SELECT id FROM profiles WHERE id = ?", args: [profileId] });
    if (!profile.rows[0]) return NextResponse.json({ error: "Profil nicht gefunden." }, { status: 404 });
    const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const configured = await client.execute({ sql: "SELECT token_hash FROM apple_health_tokens WHERE profile_id = ?", args: [profileId] });
    if (!configured.rows[0] || hashToken(token) !== String(configured.rows[0].token_hash)) {
      return NextResponse.json({ error: "Sync-Schlüssel fehlt oder ist ungültig." }, { status: 401 });
    }
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const [stats, ringRow] = await Promise.all([
      client.execute({
        sql: `SELECT COUNT(*) total_synced, MAX(started_at) last_sync
          FROM training_sessions 
          WHERE profile_id = ? AND source = 'apple_health'`,
        args: [profileId]
      }),
      client.execute({
        sql: `SELECT move_calories, move_goal, exercise_minutes, exercise_goal, stand_hours, stand_goal, step_count, walking_running_distance_km, cycling_distance_km, flights_climbed, updated_at
          FROM apple_health_daily WHERE profile_id = ? AND date = ? LIMIT 1`,
        args: [profileId, todayStr]
      }).catch(() => ({ rows: [] }))
    ]);

    const ring = ringRow.rows[0];

    return NextResponse.json({
      profileId,
      totalSynced: Number(stats.rows[0]?.total_synced ?? 0),
      lastSync: stats.rows[0]?.last_sync ? String(stats.rows[0].last_sync) : null,
      rings: ring ? {
        moveCalories: Number(ring.move_calories),
        moveGoal: Number(ring.move_goal),
        exerciseMinutes: Number(ring.exercise_minutes),
        exerciseGoal: Number(ring.exercise_goal),
        standHours: Number(ring.stand_hours),
        standGoal: Number(ring.stand_goal),
        stepCount: Number(ring.step_count ?? 0),
        walkingRunningDistanceKm: Number(ring.walking_running_distance_km ?? 0),
        cyclingDistanceKm: Number(ring.cycling_distance_km ?? 0),
        flightsClimbed: Number(ring.flights_climbed ?? 0),
        updatedAt: String(ring.updated_at)
      } : null,
      status: "ready"
    });
  }

  return NextResponse.json({
    status: "ok",
    service: "FitFamily Apple Health Sync API",
    endpoint: "/api/sync/apple-health",
    supportedMethods: ["POST", "GET"]
  });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const profileId = searchParams.get("profileId");
  const body = await request.json().catch(() => null) as { pin?: unknown } | null;

  if (!profileId) {
    return NextResponse.json({ error: "profileId ist erforderlich." }, { status: 400 });
  }
  if (typeof body?.pin !== "string" || !/^\d{4}$/.test(body.pin)) {
    return NextResponse.json({ error: "Zum Löschen ist die Eltern-PIN erforderlich." }, { status: 400 });
  }
  const pinError = await verifyAdminPinOrReject(body.pin, request);
  if (pinError) return pinError;

  const client = await db();

  const profile = await client.execute({ sql: "SELECT id FROM profiles WHERE id = ? LIMIT 1", args: [profileId] });
  if (!profile.rows.length) return NextResponse.json({ error: "Profil nicht gefunden." }, { status: 404 });

  // 1. Finde alle Apple Health Training-Sessions für das Profil
  const sessions = await client.execute({
    sql: "SELECT id FROM training_sessions WHERE profile_id = ? AND source = 'apple_health'",
    args: [profileId]
  });

  const deletedSessions = sessions.rows.length;

  // Alles wird atomar entfernt. Eine zeitgleich eintreffende Synchronisation
  // prüft den Token zusätzlich direkt beim INSERT auf seine fortbestehende Gültigkeit.
  await client.batch([
    { sql: "DELETE FROM apple_health_tokens WHERE profile_id = ?", args: [profileId] },
    { sql: "DELETE FROM training_segments WHERE session_id IN (SELECT id FROM training_sessions WHERE profile_id = ? AND source = 'apple_health')", args: [profileId] },
    { sql: "DELETE FROM training_sessions WHERE profile_id = ? AND source = 'apple_health'", args: [profileId] },
    { sql: "DELETE FROM apple_health_daily WHERE profile_id = ?", args: [profileId] },
    { sql: "DELETE FROM apple_health_ignored_workouts WHERE profile_id = ?", args: [profileId] },
    { sql: `DELETE FROM audit_log WHERE profile_id = ? AND (
      action LIKE 'health.apple_sync%' OR action IN (
        'health.apple_token.create', 'health.apple_token.revoke', 'health.apple_reset'
      )
    )`, args: [profileId] },
    { sql: "INSERT INTO audit_log (id, action, profile_id, details) VALUES (?, 'health.apple_reset', ?, ?)", args: [randomUUID(), profileId, JSON.stringify({ deletedSessions })] }
  ], "write");

  return NextResponse.json({
    ok: true,
    deletedSessions,
    message: `Apple-Health-Daten, Aktivitätswerte und Sync-Schlüssel wurden atomar entfernt (${deletedSessions} Einheit(en)).`
  });
}
