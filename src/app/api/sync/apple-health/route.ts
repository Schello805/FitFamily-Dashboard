import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { SCORE_MULTIPLIER, type TrainingType } from "@/lib/domain";

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
  id: z.string().optional(),
  title: z.string().optional().nullable(),
  type: z.enum(["strength", "endurance"]).optional().nullable(),
  startedAt: z.string().optional().nullable(),
  endedAt: z.string().optional().nullable(),
  durationMinutes: z.number().positive().optional().nullable(),
  calories: z.number().optional().nullable(),
  distanceKm: z.number().optional().nullable(),
  source: z.string().optional()
});

const bodySchema = z.object({
  profileId: z.string().min(1),
  secret: z.string().optional(),
  workouts: z.array(workoutItemSchema).optional(),
  // Single workout fallback fields for simple Shortcuts
  title: z.string().optional().nullable(),
  type: z.enum(["strength", "endurance"]).optional().nullable(),
  startedAt: z.string().optional().nullable(),
  endedAt: z.string().optional().nullable(),
  durationMinutes: z.number().positive().optional().nullable(),
  calories: z.number().optional().nullable(),
  distanceKm: z.number().optional().nullable(),
  // Activity Rings fields
  moveCalories: z.number().optional().nullable(),
  moveGoal: z.number().optional().nullable(),
  exerciseMinutes: z.number().optional().nullable(),
  exerciseGoal: z.number().optional().nullable(),
  standHours: z.number().optional().nullable(),
  standGoal: z.number().optional().nullable()
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

  const profileName = String(profileExists.rows[0].name);

  // Normalize workouts into a single list - only include actual workouts
  const rawList = Array.isArray(arrayWorkouts) && arrayWorkouts.length > 0
    ? arrayWorkouts.filter((w) => Boolean(w.title || w.durationMinutes || w.startedAt))
    : (singleWorkout.title || singleWorkout.durationMinutes || singleWorkout.startedAt)
      ? [singleWorkout]
      : [];

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
      if (!durMinutes) {
        durMinutes = Math.max(1, Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000));
      }
    } else if (item.startedAt && durMinutes) {
      startIso = new Date(item.startedAt).toISOString();
      endIso = new Date(new Date(startIso).getTime() + durMinutes * 60000).toISOString();
    } else if (durMinutes) {
      const durationMs = durMinutes * 60000;
      endIso = now.toISOString();
      startIso = new Date(now.getTime() - durationMs).toISOString();
    } else {
      // Wenn weder Dauer noch Startzeit angegeben sind, überspringen
      continue;
    }

    // Safety check: ensure end time is strictly after start time
    if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
      endIso = new Date(new Date(startIso).getTime() + 60000).toISOString();
      durMinutes = 1;
    }

    // Deduplication check: check if a session already exists for this profile within 3 minutes of start time
    const duplicate = await client.execute({
      sql: `SELECT id FROM training_sessions 
        WHERE profile_id = ? 
        AND ABS(strftime('%s', started_at) - strftime('%s', ?)) < 180
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
    const points = Math.round(durMinutes * SCORE_MULTIPLIER[trainingType]);

    await client.batch([
      {
        sql: `INSERT INTO training_sessions (id, profile_id, started_at, ended_at, status, source, edited)
          VALUES (?, ?, ?, ?, 'completed', 'apple_health', 0)`,
        args: [sessionId, profileId, startIso, endIso]
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
  } else if (importedCount > 0) {
    // Falls Workouts übertragen wurden, automatisch die Ringe für heute fortschreiben
    await client.execute({
      sql: `INSERT INTO apple_health_daily (profile_id, date, move_calories, move_goal, exercise_minutes, exercise_goal, stand_hours, stand_goal, updated_at)
        VALUES (?, ?, ?, 500, ?, 30, 1, 12, CURRENT_TIMESTAMP)
        ON CONFLICT(profile_id, date) DO UPDATE SET
          move_calories = move_calories + excluded.move_calories,
          exercise_minutes = exercise_minutes + excluded.exercise_minutes,
          stand_hours = MIN(12, stand_hours + 1),
          updated_at = CURRENT_TIMESTAMP`,
      args: [profileId, todayStr, totalPointsEarned * 10, Math.round(totalPointsEarned / 2)]
    }).catch(() => { /* ignorieren */ });
  }

  const message = importedCount > 0
    ? `${importedCount} Einheit(en) synchronisiert (+${totalPointsEarned} Punkte für ${profileName}).`
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
  const client = await db();

  if (profileId) {
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

  const allStats = await client.execute(
    "SELECT profile_id, COUNT(*) count FROM training_sessions WHERE source = 'apple_health' GROUP BY profile_id"
  );

  return NextResponse.json({
    status: "ok",
    service: "FitFamily Apple Health Sync API",
    endpoint: "/api/sync/apple-health",
    supportedMethods: ["POST"],
    profiles: allStats.rows.map((row) => ({
      profileId: String(row.profile_id),
      syncedWorkouts: Number(row.count)
    }))
  });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const profileId = searchParams.get("profileId");

  if (!profileId) {
    return NextResponse.json({ error: "profileId ist erforderlich." }, { status: 400 });
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

  return NextResponse.json({
    ok: true,
    deletedSessions: sessionIds.length,
    message: `Apple Health Daten für dieses Profil wurden vollständig zurückgesetzt (${sessionIds.length} Einheit(en) und Aktivitätsringe entfernt).`
  });
}
