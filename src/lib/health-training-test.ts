import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { db, getSetting } from "./db";
import { createToken, hashToken } from "./security";

export const FAMILY_HEALTH_KEY = "health_training_family_key_hash";
export { HEALTH_RECORDING_QUESTION } from "./recording-mode";
export const healthTrainingTestSchema = z.object({
  profileId: z.string().min(1).max(80),
  workouts: z.array(z.object({
    externalId: z.string().regex(/^[a-f0-9]{64}$/),
    startedAt: z.iso.datetime({ offset: true }),
    endedAt: z.iso.datetime({ offset: true }),
    durationSeconds: z.number().finite().min(1).max(14400),
    sourceName: z.string().min(1).max(120),
    activityType: z.string().min(1).max(100)
  }).strict().superRefine((workout, context) => {
    const elapsed = (Date.parse(workout.endedAt) - Date.parse(workout.startedAt)) / 1000;
    if (elapsed <= 0 || workout.durationSeconds > elapsed + 1) context.addIssue({ code: "custom", message: "Aktive Dauer darf nicht größer als der Trainingszeitraum sein." });
    if (Date.parse(workout.endedAt) > Date.now() + 300000) context.addIssue({ code: "custom", message: "Training liegt in der Zukunft." });
  })).min(1).max(25)
}).strict();

export async function createFamilyHealthKey() {
  const secret = createToken();
  const client = await db();
  await client.execute({ sql: "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP", args: [FAMILY_HEALTH_KEY, hashToken(secret)] });
  return secret;
}
export async function verifyFamilyHealthKey(secret: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(secret)) return false;
  const expected = await getSetting(FAMILY_HEALTH_KEY);
  return !!expected && /^[a-f0-9]{64}$/.test(expected) && timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(hashToken(secret), "hex"));
}

// Test-only storage. Never changes local sessions, points, goal or level.
export async function storeHealthTrainingTest(input: z.infer<typeof healthTrainingTestSchema>) {
  const client = await db();
  const profile = await client.execute({ sql: "SELECT name FROM profiles WHERE id = ?", args: [input.profileId] });
  if (!profile.rows.length) return null;
  const results = await client.batch(input.workouts.map(workout => ({
    sql: "INSERT OR IGNORE INTO health_training_tests (profile_id, external_id, started_at, ended_at, duration_seconds, source_name, activity_type) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [input.profileId, workout.externalId, workout.startedAt, workout.endedAt, workout.durationSeconds, workout.sourceName, workout.activityType]
  })), "write");
  const stored = await client.execute({
    sql: `SELECT * FROM health_training_tests WHERE profile_id = ? AND external_id IN (${input.workouts.map(() => "?").join(",")})`,
    args: [input.profileId, ...input.workouts.map(workout => workout.externalId)]
  });
  const records = new Map(stored.rows.map(row => [String(row.external_id), row]));
  return { mode: "test", profileId: input.profileId, profileName: String(profile.rows[0].name),
    saved: results.filter(result => result.rowsAffected > 0).length,
    alreadyReceived: results.filter(result => result.rowsAffected === 0).length,
    workouts: input.workouts.map((workout, index) => {
      const row = records.get(workout.externalId)!;
      const seconds = Number(row.duration_seconds);
      return { externalId: workout.externalId, startedAt: String(row.started_at), endedAt: String(row.ended_at),
        sourceName: String(row.source_name), activityType: String(row.activity_type), durationSeconds: seconds,
        minutes: seconds / 60, testPoints: seconds / 60 * 1.5, duplicate: results[index].rowsAffected === 0 };
    }),
    message: "Testempfang erfolgreich. Zeiten und Punkte nur als Vorschau; Dashboard-Zähler unverändert." };
}
