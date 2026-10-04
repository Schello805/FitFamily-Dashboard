import { z } from "zod";
import { db } from "./db";
import { healthTrainingTestSchema } from "./health-training-test";
import { enforceSafetyPauses } from "./training";

const workoutSchema = healthTrainingTestSchema.shape.workouts.element;
export const healthTrainingSchema = healthTrainingTestSchema.extend({
  workouts: z.array(workoutSchema.safeExtend({ trainingType: z.enum(["strength", "endurance"]) })).min(1).max(25)
});

// The batch holds a write transaction: overlapping sources cannot race each other.
export async function bookHealthTraining(input: z.infer<typeof healthTrainingSchema>) {
  await enforceSafetyPauses();
  const client = await db();
  const profile = await client.execute({ sql: "SELECT name FROM profiles WHERE id=?", args: [input.profileId] });
  if (!profile.rows.length) return null;
  const results = await client.batch(input.workouts.map(w => ({
    sql: `INSERT OR IGNORE INTO health_workouts
      (profile_id, external_id, started_at, ended_at, duration_seconds, source_name, activity_type, training_type)
      SELECT ?,?,?,?,?,?,?,? WHERE NOT EXISTS (
        SELECT 1 FROM health_workouts WHERE profile_id=? AND julianday(started_at)<julianday(?) AND julianday(ended_at)>julianday(?)
      ) AND NOT EXISTS (
        SELECT 1 FROM training_segments sg JOIN training_sessions ts ON ts.id=sg.session_id
        WHERE ts.profile_id=? AND ts.recording_mode='app' AND COALESCE(ts.source,'')<>'apple_health'
        AND julianday(sg.started_at)<julianday(?) AND julianday(COALESCE(sg.ended_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')))>julianday(?)
      )`,
    args: [input.profileId,w.externalId,w.startedAt,w.endedAt,w.durationSeconds,w.sourceName,w.activityType,w.trainingType,
      input.profileId,w.endedAt,w.startedAt,input.profileId,w.endedAt,w.startedAt]
  })), "write");
  const stored = await client.execute({ sql: "SELECT * FROM health_workouts WHERE profile_id=?", args: [input.profileId] });
  const workouts = input.workouts.map((w,index) => {
    const row = stored.rows.find(r => String(r.external_id)===w.externalId);
    const conflict = !row;
    const seconds = row ? Number(row.duration_seconds) : w.durationSeconds;
    return { externalId:w.externalId, startedAt:row ? String(row.started_at):w.startedAt, endedAt:row ? String(row.ended_at):w.endedAt,
      sourceName:row ? String(row.source_name):w.sourceName, activityType:row ? String(row.activity_type):w.activityType,
      trainingType:row ? String(row.training_type):w.trainingType, durationSeconds:seconds, minutes:seconds/60,
      points:conflict ? 0:seconds/60*1.5, duplicate:!!row && results[index].rowsAffected===0, conflict,
      ...(conflict ? { error:"Überschneidung mit bereits gezähltem App-Training oder einem anderen Health-Import. Nicht gebucht." }: {}) };
  });
  return { mode:"book", profileId:input.profileId, profileName:String(profile.rows[0].name),
    saved:results.filter(r=>r.rowsAffected>0).length, alreadyReceived:workouts.filter(w=>w.duplicate).length,
    conflicts:workouts.filter(w=>w.conflict).length, workouts,
    message:"Nur neu gebuchte Trainings zählen mit 1,5 Punkten pro aktiver Minute. Duplikate und Überschneidungen zählen nicht zusätzlich." };
}
