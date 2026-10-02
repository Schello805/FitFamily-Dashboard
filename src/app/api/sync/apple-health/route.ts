import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { SCORE_MULTIPLIER, type TrainingType } from "@/lib/domain";
import { hashToken, verifyAdminPin } from "@/lib/security";

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
  id: z.string().max(200).optional(),
  title: z.string().max(200).optional().nullable(),
  type: z.enum(["strength", "endurance"]).optional().nullable(),
  startedAt: z.string().datetime({ offset: true }).optional().nullable(),
  endedAt: z.string().datetime({ offset: true }).optional().nullable(),
  durationMinutes: z.number().min(1).max(1440).optional().nullable(),
  calories: z.number().nonnegative().max(100_000).optional().nullable(),
  distanceKm: z.number().nonnegative().max(2_000).optional().nullable(),
  source: z.string().max(80).optional()
});

const dailyActivitySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  moveCalories: z.number().nonnegative().max(100_000).optional().nullable(),
  moveGoal: z.number().positive().max(100_000).optional().nullable(),
  exerciseMinutes: z.number().nonnegative().max(1440).optional().nullable(),
  exerciseGoal: z.number().positive().max(1440).optional().nullable(),
  standHours: z.number().nonnegative().max(24).optional().nullable(),
  standGoal: z.number().positive().max(24).optional().nullable(),
  stepCount: z.number().int().nonnegative().max(200_000).optional().nullable(),
  walkingRunningDistanceKm: z.number().nonnegative().max(500).optional().nullable(),
  flightsClimbed: z.number().nonnegative().max(1_000).optional().nullable()
}).refine((entry) => Object.entries(entry).some(([key, value]) => key !== "date" && value != null), {
  message: "Jeder Tag braucht mindestens einen Aktivitätswert."
});

const bodySchema = z.object({
  profileId: z.string().min(1),
  secret: z.string().min(32).max(256),
  dryRun: z.boolean().optional(),
  workouts: z.array(workoutItemSchema).max(500).optional(),
  dailyActivity: z.array(dailyActivitySchema).max(90).optional(),
  // Single workout fallback fields for simple Shortcuts
  id: z.string().max(200).optional(),
  title: z.string().max(200).optional().nullable(),
  type: z.enum(["strength", "endurance"]).optional().nullable(),
  startedAt: z.string().datetime({ offset: true }).optional().nullable(),
  endedAt: z.string().datetime({ offset: true }).optional().nullable(),
  durationMinutes: z.number().min(1).max(1440).optional().nullable(),
  calories: z.number().nonnegative().max(100_000).optional().nullable(),
  distanceKm: z.number().nonnegative().max(2_000).optional().nullable(),
  // Activity Rings fields
  moveCalories: z.number().nonnegative().max(100_000).optional().nullable(),
  moveGoal: z.number().positive().max(100_000).optional().nullable(),
  exerciseMinutes: z.number().nonnegative().max(1440).optional().nullable(),
  exerciseGoal: z.number().positive().max(1440).optional().nullable(),
  standHours: z.number().nonnegative().max(24).optional().nullable(),
  standGoal: z.number().positive().max(24).optional().nullable(),
  stepCount: z.number().int().nonnegative().max(200_000).optional().nullable(),
  walkingRunningDistanceKm: z.number().nonnegative().max(500).optional().nullable(),
  flightsClimbed: z.number().nonnegative().max(1_000).optional().nullable()
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Ungültiges JSON-Format." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
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

  if (parsed.data.dryRun) {
    await finishSyncLog("health.apple_sync.checked", { status: "checked", received: rawList.length, imported: 0, skipped: 0, message: "Schlüssel geprüft; keine Trainingsdaten gespeichert" });
    return NextResponse.json({
      ok: true,
      validToken: true,
      received: rawList.length,
      message: rawList.length ? "Sync-Schlüssel gültig. Trainingsdaten wurden nicht gespeichert." : "Sync-Schlüssel gültig. Noch keine Trainingsdaten empfangen."
    });
  }

  const now = new Date();
  let importedCount = 0;
  let skippedCount = 0;
  let totalPointsEarned = 0;

  for (const item of rawList) {
    if (!item.startedAt || !item.endedAt) continue;
    const startIso = new Date(item.startedAt).toISOString();
    const endIso = new Date(item.endedAt).toISOString();
    const durMinutes = (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000;
    const externalId = item.id ?? `start:${startIso}`;

    if (!Number.isFinite(Date.parse(startIso)) || !Number.isFinite(Date.parse(endIso))) {
      await finishSyncLog("health.apple_sync.failed", { status: "failed", received: rawList.length, imported: importedCount, skipped: skippedCount, message: "Ungültige Trainingszeit" });
      return NextResponse.json({ error: "Ungültige Trainingszeit." }, { status: 400 });
    }

    const ignored = await client.execute({
      sql: "SELECT external_id FROM apple_health_ignored_workouts WHERE profile_id = ? AND external_id = ? LIMIT 1",
      args: [profileId, externalId]
    });
    if (ignored.rows.length) {
      skippedCount++;
      continue;
    }

    // Duplicate guard for repeated HealthKit imports.
    const duplicate = item.id
      ? await client.execute({
          sql: "SELECT id FROM training_sessions WHERE profile_id = ? AND source = 'apple_health' AND external_id = ? LIMIT 1",
          args: [profileId, item.id]
        })
      : await client.execute({
          sql: `SELECT id FROM training_sessions
            WHERE profile_id = ? AND source = 'apple_health' AND ABS(strftime('%s', started_at) - strftime('%s', ?)) < 180
            LIMIT 1`,
          args: [profileId, startIso]
        });

    if (duplicate.rows.length > 0) {
      skippedCount++;
      continue;
    }

    const trainingType = inferTrainingType(item.title, item.type);
    const sessionId = randomUUID();
    const segmentId = randomUUID();
    const points = durMinutes * SCORE_MULTIPLIER[trainingType];
    const secretHash = hashToken(parsed.data.secret);

    try {
      const writeResults = await client.batch([
        {
          sql: `INSERT INTO training_sessions
            (id, profile_id, started_at, ended_at, status, source, external_id, health_title, health_calories, health_distance_km, edited)
            SELECT ?, ?, ?, ?, 'completed', 'apple_health', ?, ?, ?, ?, 0
            WHERE EXISTS (SELECT 1 FROM apple_health_tokens WHERE profile_id = ? AND token_hash = ?)`,
          args: [sessionId, profileId, startIso, endIso, externalId, item.title ?? "Apple Health Workout", item.calories ?? null, item.distanceKm ?? null, profileId, secretHash]
        },
        {
          sql: `INSERT INTO training_segments (id, session_id, type, exercise_id, started_at, ended_at)
            SELECT ?, ?, ?, NULL, ?, ? WHERE EXISTS (SELECT 1 FROM training_sessions WHERE id = ?)`,
          args: [segmentId, sessionId, trainingType, startIso, endIso, sessionId]
        },
        {
          sql: `INSERT INTO audit_log (id, action, profile_id, details)
            SELECT ?, 'health.apple_sync', ?, ? WHERE EXISTS (SELECT 1 FROM training_sessions WHERE id = ?)`,
          args: [
            randomUUID(),
            profileId,
            JSON.stringify({
              title: item.title ?? "Apple Health Training",
              type: trainingType,
              durationMinutes: durMinutes,
              calories: item.calories,
              distanceKm: item.distanceKm,
              points
            }),
            sessionId
          ]
        }
      ], "write");
      if (writeResults[0]?.rowsAffected !== 1) {
        await finishSyncLog("health.apple_sync.failed", { status: "failed", received: rawList.length, imported: importedCount, skipped: skippedCount, message: "Sync-Schlüssel während des Imports getrennt" });
        return NextResponse.json({ error: "Der Sync-Schlüssel wurde während des Imports getrennt. Es wurden keine Daten übernommen." }, { status: 401 });
      }
    } catch (error) {
      if (!item.id) throw error;
      const concurrentDuplicate = await client.execute({
        sql: "SELECT id FROM training_sessions WHERE profile_id = ? AND source = 'apple_health' AND external_id = ? LIMIT 1",
        args: [profileId, externalId]
      });
      if (!concurrentDuplicate.rows.length) throw error;
      skippedCount++;
      continue;
    }

    importedCount++;
    totalPointsEarned += points;
  }

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const ringFields = [
    { key: "moveCalories", column: "move_calories" },
    { key: "moveGoal", column: "move_goal" },
    { key: "exerciseMinutes", column: "exercise_minutes" },
    { key: "exerciseGoal", column: "exercise_goal" },
    { key: "standHours", column: "stand_hours" },
    { key: "standGoal", column: "stand_goal" },
    { key: "stepCount", column: "step_count" },
    { key: "walkingRunningDistanceKm", column: "walking_running_distance_km" },
    { key: "flightsClimbed", column: "flights_climbed" }
  ] as const;
  const dailyByDate = new Map<string, z.infer<typeof dailyActivitySchema>>();
  for (const day of parsed.data.dailyActivity ?? []) {
    const existing = dailyByDate.get(day.date);
    dailyByDate.set(day.date, existing ? { ...existing, ...day } : day);
  }
  const hasLegacyActivity = ringFields.some(({ key }) => parsed.data[key] != null);
  if (hasLegacyActivity) {
    const legacyDay = Object.fromEntries([
      ["date", todayStr],
      ...ringFields.flatMap(({ key }) => parsed.data[key] == null ? [] : [[key, parsed.data[key]]])
    ]) as z.infer<typeof dailyActivitySchema>;
    const existing = dailyByDate.get(todayStr);
    dailyByDate.set(todayStr, existing ? { ...existing, ...legacyDay } : legacyDay);
  }

  const dailyActivity = [...dailyByDate.values()];
  if (dailyActivity.length > 30) {
    await finishSyncLog("health.apple_sync.failed", { status: "failed", received: rawList.length, message: "Mehr als 30 verschiedene Aktivitätstage empfangen" });
    return NextResponse.json({ error: "Pro Sync sind höchstens 30 verschiedene Aktivitätstage erlaubt." }, { status: 400 });
  }

  const dateTimestamp = (value: string) => {
    const timestamp = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value ? timestamp : null;
  };
  const todayTimestamp = dateTimestamp(todayStr)!;
  const oldestAllowedTimestamp = todayTimestamp - 29 * 24 * 60 * 60 * 1000;
  let activityDaysSynced = 0;
  let hasActivityData = false;

  for (const day of dailyActivity) {
    const dayTimestamp = dateTimestamp(day.date);
    if (dayTimestamp == null || dayTimestamp > todayTimestamp || dayTimestamp < oldestAllowedTimestamp) {
      await finishSyncLog("health.apple_sync.failed", { status: "failed", received: rawList.length, message: "Tagesaktivität muss ein gültiges Datum innerhalb der letzten 30 Tage haben" });
      return NextResponse.json({ error: "Tagesaktivität darf nur gültige Datumswerte der letzten 30 Tage enthalten." }, { status: 400 });
    }

    const providedFields = ringFields.filter(({ key }) => day[key] != null);
    if (!providedFields.length) continue;
    hasActivityData = hasActivityData || providedFields.some(({ key }) => !key.endsWith("Goal"));
    const columns = ["profile_id", "date", ...providedFields.map(({ column }) => column), "updated_at"];
    const selectedValues = ["?", "?", ...providedFields.map(() => "?"), "CURRENT_TIMESTAMP"];
    const updates = [
      ...providedFields.map(({ column }) => `${column} = excluded.${column}`),
      "updated_at = CURRENT_TIMESTAMP"
    ];
    const ringResult = await client.execute({
      sql: `INSERT INTO apple_health_daily (${columns.join(", ")})
        SELECT ${selectedValues.join(", ")}
        WHERE EXISTS (SELECT 1 FROM apple_health_tokens WHERE profile_id = ? AND token_hash = ?)
        ON CONFLICT(profile_id, date) DO UPDATE SET
          ${updates.join(",\n          ")}`,
      args: [profileId, day.date, ...providedFields.map(({ key }) => day[key] as number), profileId, hashToken(parsed.data.secret)]
    });
    if (ringResult.rowsAffected !== 1) {
      return NextResponse.json({ error: "Der Sync-Schlüssel wurde während des Imports getrennt. Es wurden keine Aktivitätswerte übernommen." }, { status: 401 });
    }
    activityDaysSynced++;
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
    pointsEarned: totalPointsEarned,
    message
  });

  return NextResponse.json({
    ok: true,
    imported: importedCount,
    skipped: skippedCount,
    activityDaysSynced,
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
        sql: `SELECT move_calories, move_goal, exercise_minutes, exercise_goal, stand_hours, stand_goal, updated_at
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
  if (typeof body?.pin !== "string" || !/^\d{4}$/.test(body.pin) || !(await verifyAdminPin(body.pin))) {
    return NextResponse.json({ error: "Zum Löschen ist die Eltern-PIN erforderlich." }, { status: 401 });
  }

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
