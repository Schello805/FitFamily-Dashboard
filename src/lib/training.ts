import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { TrainingType } from "@/lib/domain";

type StartInput = {
  profileId: string;
  type: TrainingType;
  exerciseId?: string | null;
  source?: "touch" | "mobile" | "nfc" | "manual";
  recordingMode?: "app" | "health";
  plannedDurationSeconds?: number;
};

// Serialize updates for one profile so two quick scans cannot create overlapping segments.
const pendingTraining = new Map<string, Promise<unknown>>();
async function updateTraining<T>(profileId: string, action: () => Promise<T>): Promise<T> {
  const previous = pendingTraining.get(profileId) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(action);
  pendingTraining.set(profileId, next);
  try { return await next; }
  finally { if (pendingTraining.get(profileId) === next) pendingTraining.delete(profileId); }
}
export function startOrSwitchTraining(input: StartInput) {
  return updateTraining(input.profileId, () => startOrSwitch(input));
}
export function stopTraining(profileId: string, expectedSessionId?: string) {
  return updateTraining(profileId, () => stop(profileId, expectedSessionId));
}

async function startOrSwitch(input: StartInput) {
  await enforceSafetyPauses();
  const client = await db();
  const now = new Date().toISOString();
  const active = await client.execute({
    sql: `SELECT ts.id session_id, ts.recording_mode, sg.id segment_id, sg.type, sg.exercise_id
      FROM training_sessions ts
      JOIN training_segments sg ON sg.session_id = ts.id AND sg.ended_at IS NULL
      WHERE ts.profile_id = ? AND ts.status = 'active' LIMIT 1`,
    args: [input.profileId]
  });

  const current = active.rows[0];
  if (input.plannedDurationSeconds !== undefined && current) {
    return { error: "Es läuft bereits ein Training. Bitte dieses zuerst beenden.", conflict: true };
  }
  const mode = input.recordingMode ?? (current?.recording_mode === "health" ? "health" : "app");
  if (current && String(current.recording_mode) !== mode) {
    await stop(input.profileId);
    return startOrSwitch(input);
  }
  const wantedExercise = input.exerciseId ?? null;
  if (
    current &&
    String(current.type) === input.type &&
    String(current.exercise_id ?? "") === String(wantedExercise ?? "")
  ) {
    return { sessionId: String(current.session_id), changed: false };
  }

  const sessionId = current ? String(current.session_id) : randomUUID();
  const segmentId = randomUUID();
  const statements = [];

  if (current) {
    statements.push({
      sql: "UPDATE training_segments SET ended_at = ? WHERE id = ? AND ended_at IS NULL",
      args: [now, String(current.segment_id)]
    });
  } else {
    statements.push({
      sql: `INSERT INTO training_sessions (id, profile_id, started_at, status, source, recording_mode, planned_end_at)
        VALUES (?, ?, ?, 'active', ?, ?, ?)`,
      args: [sessionId, input.profileId, now, input.source ?? "touch", mode, input.plannedDurationSeconds ? new Date(Date.parse(now) + input.plannedDurationSeconds * 1000).toISOString() : null]
    });
  }

  statements.push({
    sql: `INSERT INTO training_segments (id, session_id, type, exercise_id, started_at)
      VALUES (?, ?, ?, ?, ?)`,
    args: [segmentId, sessionId, input.type, wantedExercise, now]
  });
  statements.push({
    sql: "INSERT INTO audit_log (id, action, profile_id, details) VALUES (?, 'training.switch', ?, ?)",
    args: [randomUUID(), input.profileId, JSON.stringify({ type: input.type, exerciseId: wantedExercise, source: input.source ?? "touch" })]
  });

  await client.batch(statements, "write");
  return { sessionId, segmentId, changed: true, startedAt: now, plannedEndAt: input.plannedDurationSeconds ? new Date(Date.parse(now) + input.plannedDurationSeconds * 1000).toISOString() : null };
}

async function stop(profileId: string, expectedSessionId?: string) {
  await enforceSafetyPauses();
  const client = await db();
  const now = new Date().toISOString();
  const active = await client.execute({
    sql: "SELECT id FROM training_sessions WHERE profile_id = ? AND status = 'active' AND (? IS NULL OR id=?)",
    args: [profileId, expectedSessionId ?? null, expectedSessionId ?? null]
  });
  if (!active.rows.length) return { changed: false };
  const sessionIds = active.rows.map((row) => String(row.id));
  const statements = [
    {
      sql: `UPDATE training_segments SET ended_at = ? WHERE session_id IN (${sessionIds.map(() => "?").join(",")}) AND ended_at IS NULL`,
      args: [now, ...sessionIds]
    },
    {
      sql: `UPDATE training_sessions SET ended_at = ?, status = 'completed' WHERE id IN (${sessionIds.map(() => "?").join(",")})`,
      args: [now, ...sessionIds]
    },
    {
      sql: "INSERT INTO audit_log (id, action, profile_id, details) VALUES (?, 'training.stop', ?, ?)",
      args: [randomUUID(), profileId, JSON.stringify({ sessionIds })]
    }
  ];
  await client.batch(statements, "write");
  return { changed: true, sessionId: sessionIds[0] };
}

export async function enforceSafetyPauses() {
  const client = await db();
  const limitMs = 4 * 60 * 60 * 1000;
  const sessions = await client.execute({
    sql: "SELECT id, profile_id, started_at, planned_end_at FROM training_sessions WHERE status = 'active' AND (julianday(started_at) <= julianday(?) OR julianday(planned_end_at)<=julianday(?))",
    args: [new Date(Date.now() - limitMs).toISOString(), new Date().toISOString()]
  });
  for (const session of sessions.rows) {
      const sessionId = String(session.id);
      const safetyEnd = new Date(String(session.started_at)).getTime() + limitMs;
      const parsedEnd = session.planned_end_at ? Date.parse(String(session.planned_end_at)) : Infinity;
      const plannedEnd = Number.isFinite(parsedEnd) ? parsedEnd : Infinity;
      const endedAt = new Date(Math.min(safetyEnd, plannedEnd)).toISOString();
      const status = plannedEnd <= safetyEnd ? "completed" : "paused";
      // A delayed read or switch must never credit time after the safety limit.
      // Keep late segments as zero-duration records instead of deleting history.
      const details = JSON.stringify({ sessionId, endedAt });
      await client.batch([
        { sql: `UPDATE training_segments SET
            started_at = CASE WHEN julianday(started_at) > julianday(?) THEN ? ELSE started_at END,
            ended_at = CASE WHEN ended_at IS NULL OR julianday(ended_at) > julianday(?) THEN ? ELSE ended_at END
            WHERE session_id = ? AND EXISTS (SELECT 1 FROM training_sessions WHERE id = ? AND status = 'active')`, args: [endedAt, endedAt, endedAt, endedAt, sessionId, sessionId] },
        { sql: "UPDATE training_sessions SET ended_at = ?, status = ? WHERE id = ? AND status = 'active'", args: [endedAt, status, sessionId] },
        {
          sql: `INSERT INTO audit_log (id, action, profile_id, details)
            SELECT ?, 'training.safety_pause', ?, ?
            WHERE EXISTS (SELECT 1 FROM training_sessions WHERE id = ? AND status IN ('paused','completed') AND ended_at = ?)
            AND NOT EXISTS (SELECT 1 FROM audit_log WHERE action = 'training.safety_pause' AND details = ?)`,
          args: [randomUUID(), String(session.profile_id), details, sessionId, endedAt, details]
        }
      ], "write");
  }
}
