import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import type { TrainingType } from "@/lib/domain";

type StartInput = {
  profileId: string;
  type: TrainingType;
  exerciseId?: string | null;
  source?: "touch" | "mobile" | "nfc" | "manual";
};

export async function startOrSwitchTraining(input: StartInput) {
  const client = await db();
  const now = new Date().toISOString();
  const active = await client.execute({
    sql: `SELECT ts.id session_id, sg.id segment_id, sg.type, sg.exercise_id
      FROM training_sessions ts
      JOIN training_segments sg ON sg.session_id = ts.id AND sg.ended_at IS NULL
      WHERE ts.profile_id = ? AND ts.status = 'active' LIMIT 1`,
    args: [input.profileId]
  });

  const current = active.rows[0];
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
      sql: `INSERT INTO training_sessions (id, profile_id, started_at, status, source)
        VALUES (?, ?, ?, 'active', ?)`,
      args: [sessionId, input.profileId, now, input.source ?? "touch"]
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
  return { sessionId, segmentId, changed: true };
}

export async function stopTraining(profileId: string) {
  const client = await db();
  const now = new Date().toISOString();
  const active = await client.execute({
    sql: "SELECT id FROM training_sessions WHERE profile_id = ? AND status = 'active' LIMIT 1",
    args: [profileId]
  });
  if (!active.rows[0]) return { changed: false };
  const sessionId = String(active.rows[0].id);
  await client.batch([
    { sql: "UPDATE training_segments SET ended_at = ? WHERE session_id = ? AND ended_at IS NULL", args: [now, sessionId] },
    { sql: "UPDATE training_sessions SET ended_at = ?, status = 'completed' WHERE id = ?", args: [now, sessionId] },
    {
      sql: "INSERT INTO audit_log (id, action, profile_id, details) VALUES (?, 'training.stop', ?, ?)",
      args: [randomUUID(), profileId, JSON.stringify({ sessionId })]
    }
  ], "write");
  return { changed: true, sessionId };
}

export async function enforceSafetyPauses() {
  const client = await db();
  const cutoff = new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString();
  const sessions = await client.execute({
    sql: "SELECT id, profile_id FROM training_sessions WHERE status = 'active' AND started_at <= ?",
    args: [cutoff]
  });
  const now = new Date().toISOString();
  for (const session of sessions.rows) {
    const sessionId = String(session.id);
    await client.batch([
      { sql: "UPDATE training_segments SET ended_at = ? WHERE session_id = ? AND ended_at IS NULL", args: [now, sessionId] },
      { sql: "UPDATE training_sessions SET ended_at = ?, status = 'paused' WHERE id = ?", args: [now, sessionId] },
      {
        sql: "INSERT INTO audit_log (id, action, profile_id, details) VALUES (?, 'training.safety_pause', ?, ?)",
        args: [randomUUID(), String(session.profile_id), JSON.stringify({ sessionId })]
      }
    ], "write");
  }
}
