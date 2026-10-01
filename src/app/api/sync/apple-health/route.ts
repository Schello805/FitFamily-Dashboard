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

const bodySchema = z.object({
  profileId: z.string().min(1),
  secret: z.string().min(32).max(256),
  dryRun: z.boolean().optional(),
  workouts: z.array(workoutItemSchema).max(500).optional(),
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
  standGoal: z.number().positive().max(24).optional().nullable()
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
    return NextResponse.json({ error: "Sync-Schlüssel fehlt oder ist ungültig. Bitte in FitFamily neu erstellen." }, { status: 401 });
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
    const start = item.startedAt ? Date.parse(item.startedAt) : null;
    const end = item.endedAt ? Date.parse(item.endedAt) : null;
    const duration = item.durationMinutes ?? null;
    if ((start !== null) !== (end !== null) && duration === null) {
      return NextResponse.json({ error: "Bitte Start und Ende oder Start und Dauer eines Trainings mitsenden." }, { status: 400 });
    }
    if (start !== null && start > latestAllowedStart) {
      return NextResponse.json({ error: "Ein Training darf nicht in der Zukunft beginnen." }, { status: 400 });
    }
    if (end !== null && end > latestAllowedStart) {
      return NextResponse.json({ error: "Ein Training darf nicht in der Zukunft enden." }, { status: 400 });
    }
    if (start !== null && end !== null && (end - start < 60_000 || end - start > 24 * 60 * 60 * 1000)) {
      return NextResponse.json({ error: "Ein Training muss zwischen 1 Minute und 24 Stunden dauern." }, { status: 400 });
    }
  }

  if (parsed.data.dryRun) {
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
    let durMinutes = item.durationMinutes ?? null;
    let startIso: string;
    let endIso: string;

    if (item.startedAt && item.endedAt) {
      startIso = new Date(item.startedAt).toISOString();
      endIso = new Date(item.endedAt).toISOString();
      const actualMinutes = (new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000;
      if (actualMinutes < 1 || actualMinutes > 1440) return NextResponse.json({ error: "Ein Training muss zwischen 1 Minute und 24 Stunden dauern." }, { status: 400 });
      durMinutes = actualMinutes;
    } else if (item.startedAt && durMinutes) {
      startIso = new Date(item.startedAt).toISOString();
      endIso = new Date(new Date(startIso).getTime() + durMinutes * 60000).toISOString();
    } else if (item.endedAt && durMinutes) {
      endIso = new Date(item.endedAt).toISOString();
      startIso = new Date(new Date(endIso).getTime() - durMinutes * 60000).toISOString();
    } else if (durMinutes) {
      const durationMs = durMinutes * 60000;
      endIso = now.toISOString();
      startIso = new Date(now.getTime() - durationMs).toISOString();
    } else {
      // Wenn weder Dauer noch Startzeit angegeben sind, überspringen
      continue;
    }

    if (!Number.isFinite(Date.parse(startIso)) || !Number.isFinite(Date.parse(endIso))) {
      return NextResponse.json({ error: "Ungültige Trainingszeit." }, { status: 400 });
    }

    // Deduplication check: check if a session already exists for this profile within 3 minutes of start time
    const duplicate = item.id
      ? await client.execute({
          sql: "SELECT id FROM training_sessions WHERE profile_id = ? AND source = 'apple_health' AND external_id = ? LIMIT 1",
          args: [profileId, item.id]
        })
      : await client.execute({
          sql: `SELECT id FROM training_sessions
            WHERE profile_id = ? AND ABS(strftime('%s', started_at) - strftime('%s', ?)) < 180
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

    try {
      await client.batch([
        {
          sql: `INSERT INTO training_sessions (id, profile_id, started_at, ended_at, status, source, external_id, edited)
            VALUES (?, ?, ?, ?, 'completed', 'apple_health', ?, 0)`,
          args: [sessionId, profileId, startIso, endIso, item.id ?? null]
        },
        {
          sql: `INSERT INTO training_segments (id, session_id, type, exercise_id, started_at, ended_at)
            VALUES (?, ?, ?, NULL, ?, ?)`,
          args: [segmentId, sessionId, trainingType, startIso, endIso]
        },
        {
          sql: `INSERT INTO audit_log (id, action, profile_id, details)
            VALUES (?, 'health.apple_sync', ?, ?)`,
          args: [
            randomUUID(),
            profileId,
            JSON.stringify({
              title: item.title ?? "Apple Health Training",
              type: trainingType,
              durationMinutes: durMinutes,
              calories: item.calories,
              points
            })
          ]
        }
      ], "write");
    } catch (error) {
      if (!item.id) throw error;
      const concurrentDuplicate = await client.execute({
        sql: "SELECT id FROM training_sessions WHERE profile_id = ? AND source = 'apple_health' AND external_id = ? LIMIT 1",
        args: [profileId, item.id]
      });
      if (!concurrentDuplicate.rows.length) throw error;
      skippedCount++;
      continue;
    }

    importedCount++;
    totalPointsEarned += points;
  }

  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  if (parsed.data.moveCalories != null || parsed.data.exerciseMinutes != null || parsed.data.standHours != null) {
    await client.execute({
      sql: `INSERT INTO apple_health_daily (profile_id, date, move_calories, move_goal, exercise_minutes, exercise_goal, stand_hours, stand_goal, updated_at)
        VALUES (?, ?, ?, COALESCE(?, 500), ?, COALESCE(?, 30), ?, COALESCE(?, 12), CURRENT_TIMESTAMP)
        ON CONFLICT(profile_id, date) DO UPDATE SET
          move_calories = excluded.move_calories,
          move_goal = excluded.move_goal,
          exercise_minutes = excluded.exercise_minutes,
          exercise_goal = excluded.exercise_goal,
          stand_hours = excluded.stand_hours,
          stand_goal = excluded.stand_goal,
          updated_at = CURRENT_TIMESTAMP`,
      args: [
        profileId,
        todayStr,
        parsed.data.moveCalories ?? 0,
        parsed.data.moveGoal ?? 500,
        parsed.data.exerciseMinutes ?? 0,
        parsed.data.exerciseGoal ?? 30,
        parsed.data.standHours ?? 0,
        parsed.data.standGoal ?? 12
      ]
    }).catch(() => { /* ignorieren falls DB-Lock */ });
  }

  const message = importedCount > 0
    ? `${importedCount} Einheit(en) für ${profileName} synchronisiert.`
    : (parsed.data.moveCalories != null || parsed.data.exerciseMinutes != null)
      ? `Aktivitätsringe für ${profileName} erfolgreich aktualisiert.`
      : skippedCount > 0
        ? "Keine neuen Einheiten (bereits vorhanden)."
        : "Keine Daten übertragen.";

  return NextResponse.json({
    ok: true,
    imported: importedCount,
    skipped: skippedCount,
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
  if (typeof body?.pin !== "string" || !(await verifyAdminPin(body.pin))) {
    return NextResponse.json({ error: "Zum Löschen ist die Eltern-PIN erforderlich." }, { status: 401 });
  }

  const client = await db();

  // 1. Finde alle Apple Health Training-Sessions für das Profil
  const sessions = await client.execute({
    sql: "SELECT id FROM training_sessions WHERE profile_id = ? AND source = 'apple_health'",
    args: [profileId]
  });

  const sessionIds = sessions.rows.map((r) => String(r.id));

  // 2. Lösche zugehörige Segmente & Sessions
  if (sessionIds.length > 0) {
    const placeholders = sessionIds.map(() => "?").join(",");
    await client.execute({
      sql: `DELETE FROM training_segments WHERE session_id IN (${placeholders})`,
      args: sessionIds
    });
    await client.execute({
      sql: `DELETE FROM training_sessions WHERE id IN (${placeholders})`,
      args: sessionIds
    });
  }

  // 3. Lösche Aktivitätsringe für dieses Profil
  await client.execute({
    sql: "DELETE FROM apple_health_daily WHERE profile_id = ?",
    args: [profileId]
  });

  // 4. Audit-Log bereinigen
  await client.execute({
    sql: "DELETE FROM audit_log WHERE profile_id = ? AND action = 'health.apple_sync'",
    args: [profileId]
  });
  await client.execute({ sql: "DELETE FROM apple_health_tokens WHERE profile_id = ?", args: [profileId] });
  await client.execute({
    sql: "INSERT INTO audit_log (id, action, profile_id, details) VALUES (?, 'health.apple_reset', ?, ?)",
    args: [randomUUID(), profileId, JSON.stringify({ deletedSessions: sessionIds.length })]
  });

  return NextResponse.json({
    ok: true,
    deletedSessions: sessionIds.length,
    message: `Apple-Health-Daten und Sync-Schlüssel wurden zurückgesetzt (${sessionIds.length} Einheit(en) und Aktivitätsringe entfernt).`
  });
}
