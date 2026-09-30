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
  distanceKm: z.number().optional().nullable()
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

  // Normalize workouts into a single list
  const rawList = Array.isArray(arrayWorkouts) && arrayWorkouts.length > 0
    ? arrayWorkouts
    : [singleWorkout];

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
      // Default to 30 min if no duration or start time given
      durMinutes = 30;
      endIso = now.toISOString();
      startIso = new Date(now.getTime() - 30 * 60000).toISOString();
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

  const message = importedCount > 0
    ? `${importedCount} Einheit(en) synchronisiert (+${totalPointsEarned} Punkte für ${profileName}).`
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
    const stats = await client.execute({
      sql: `SELECT COUNT(*) total_synced, MAX(started_at) last_sync
        FROM training_sessions 
        WHERE profile_id = ? AND source = 'apple_health'`,
      args: [profileId]
    });
    return NextResponse.json({
      profileId,
      totalSynced: Number(stats.rows[0]?.total_synced ?? 0),
      lastSync: stats.rows[0]?.last_sync ? String(stats.rows[0].last_sync) : null,
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
