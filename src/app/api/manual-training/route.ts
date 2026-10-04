import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyAdminPinOrReject } from "@/lib/security";

const postSchema = z.object({
  pin: z.string().regex(/^\d{4}$/), profileId: z.string(), type: z.enum(["strength", "endurance"]),
  startedAt: z.string().datetime(), endedAt: z.string().datetime(), exerciseId: z.string().nullable().optional()
}).refine((value) => new Date(value.endedAt) > new Date(value.startedAt), { message: "Endzeit muss nach der Startzeit liegen" })
  .refine((value) => new Date(value.startedAt).getTime() <= Date.now() + 60000, { message: "Trainingsbeginn darf nicht in der Zukunft liegen" })
  .refine((value) => new Date(value.endedAt).getTime() <= Date.now() + 60000, { message: "Trainingsende darf nicht in der Zukunft liegen" })
  .refine((value) => new Date(value.endedAt).getTime() - new Date(value.startedAt).getTime() <= 24 * 60 * 60 * 1000, { message: "Eine Einheit darf höchstens 24 Stunden dauern" });

const editSchema = z.object({
  pin: z.string().regex(/^\d{4}$/),
  sessionId: z.string(),
  profileId: z.string(),
  type: z.enum(["strength", "endurance"]),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  exerciseId: z.string().nullable().optional()
}).refine((value) => new Date(value.endedAt) > new Date(value.startedAt), { message: "Endzeit muss nach der Startzeit liegen" })
  .refine((value) => new Date(value.startedAt).getTime() <= Date.now() + 60000, { message: "Trainingsbeginn darf nicht in der Zukunft liegen" })
  .refine((value) => new Date(value.endedAt).getTime() <= Date.now() + 60000, { message: "Trainingsende darf nicht in der Zukunft liegen" })
  .refine((value) => new Date(value.endedAt).getTime() - new Date(value.startedAt).getTime() <= 24 * 60 * 60 * 1000, { message: "Eine Einheit darf höchstens 24 Stunden dauern" });

const deleteSchema = z.object({
  pin: z.string().regex(/^\d{4}$/),
  sessionId: z.string(),
  profileId: z.string()
});

export async function POST(request: Request) {
  const body = postSchema.safeParse(await request.json());
  if (!body.success) {
    const errorMsg = body.error.issues[0]?.message || "Zeitangaben sind ungültig";
    return NextResponse.json({ error: errorMsg }, { status: 400 });
  }
  const pinError = await verifyAdminPinOrReject(body.data.pin, request);
  if (pinError) return pinError;
  const sessionId = randomUUID();
  const client = await db();
  const conflict = await client.execute({sql:"SELECT 1 FROM health_workouts WHERE profile_id=? AND julianday(started_at)<julianday(?) AND julianday(ended_at)>julianday(?) LIMIT 1",args:[body.data.profileId,body.data.endedAt,body.data.startedAt]});
  if(conflict.rows.length) return NextResponse.json({error:"Diese Zeit wurde bereits durch Apple Health gewertet. Keine zusätzliche App-Buchung."},{status:409});
  await client.batch([
    {
      sql: `INSERT INTO training_sessions (id, profile_id, started_at, ended_at, status, source, edited)
        VALUES (?, ?, ?, ?, 'completed', 'manual', 1)`,
      args: [sessionId, body.data.profileId, body.data.startedAt, body.data.endedAt]
    },
    {
      sql: `INSERT INTO training_segments (id, session_id, type, exercise_id, started_at, ended_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
      args: [randomUUID(), sessionId, body.data.type, body.data.exerciseId ?? null, body.data.startedAt, body.data.endedAt]
    },
    {
      sql: "INSERT INTO audit_log (id, action, profile_id, details) VALUES (?, 'training.manual_add', ?, ?)",
      args: [randomUUID(), body.data.profileId, JSON.stringify({ sessionId })]
    }
  ], "write");
  return NextResponse.json({ ok: true, sessionId });
}

export async function PUT(request: Request) {
  const body = editSchema.safeParse(await request.json());
  if (!body.success) {
    const errorMsg = body.error.issues[0]?.message || "Zeitangaben oder Eingaben sind ungültig";
    return NextResponse.json({ error: errorMsg }, { status: 400 });
  }
  const pinError = await verifyAdminPinOrReject(body.data.pin, request);
  if (pinError) return pinError;

  const client = await db();
  const existing = await client.execute({
    sql: "SELECT id, started_at, ended_at, recording_mode FROM training_sessions WHERE id = ? AND profile_id = ? AND COALESCE(source, '') <> 'apple_health'",
    args: [body.data.sessionId, body.data.profileId]
  });
  if (existing.rows.length === 0) {
    return NextResponse.json({ error: "Trainingseinheit nicht gefunden" }, { status: 404 });
  }
  if(existing.rows[0].recording_mode === "health") return NextResponse.json({error:"Health-App-Timer hat keine Wertung und kann nicht als App-Training bearbeitet werden."},{status:409});
  const conflict = await client.execute({sql:"SELECT 1 FROM health_workouts WHERE profile_id=? AND julianday(started_at)<julianday(?) AND julianday(ended_at)>julianday(?) LIMIT 1",args:[body.data.profileId,body.data.endedAt,body.data.startedAt]});
  if(conflict.rows.length) return NextResponse.json({error:"Diese Zeit wurde bereits durch Apple Health gewertet. Keine zusätzliche App-Buchung."},{status:409});

  const segmentResult = await client.execute({
    sql: "SELECT id, type, started_at, ended_at FROM training_segments WHERE session_id = ? ORDER BY started_at ASC",
    args: [body.data.sessionId]
  });
  const oldStartMs = new Date(String(existing.rows[0].started_at)).getTime();
  const oldEndMs = existing.rows[0].ended_at
    ? new Date(String(existing.rows[0].ended_at)).getTime()
    : Math.max(Date.now(), ...segmentResult.rows.map((segment) => new Date(String(segment.ended_at ?? segment.started_at)).getTime()));
  const newStartMs = new Date(body.data.startedAt).getTime();
  const newEndMs = new Date(body.data.endedAt).getTime();
  const scale = oldEndMs > oldStartMs ? (newEndMs - newStartMs) / (oldEndMs - oldStartMs) : 1;

  const statements = [
    {
      sql: `UPDATE training_sessions 
            SET started_at = ?, ended_at = ?, status = 'completed', edited = 1
            WHERE id = ? AND profile_id = ?`,
      args: [body.data.startedAt, body.data.endedAt, body.data.sessionId, body.data.profileId]
    }
  ];

  for (const segment of segmentResult.rows) {
    const mapTime = (value: unknown) => {
      const original = new Date(String(value)).getTime();
      return new Date(newStartMs + (original - oldStartMs) * scale).toISOString();
    };
    const segmentStart = mapTime(segment.started_at);
    const segmentEnd = mapTime(segment.ended_at ?? new Date(oldEndMs).toISOString());
    statements.push({
      sql: `UPDATE training_segments SET type = ?, started_at = ?, ended_at = ? WHERE id = ? AND session_id = ?`,
      args: [segmentResult.rows.length === 1 ? body.data.type : String(segment.type), segmentStart, segmentEnd, String(segment.id), body.data.sessionId]
    });
  }
  statements.push({
    sql: "INSERT INTO audit_log (id, action, profile_id, details) VALUES (?, 'training.manual_edit', ?, ?)",
    args: [randomUUID(), body.data.profileId, JSON.stringify({ sessionId: body.data.sessionId, startedAt: body.data.startedAt, endedAt: body.data.endedAt, type: body.data.type })]
  });
  await client.batch(statements, "write");

  return NextResponse.json({ ok: true, sessionId: body.data.sessionId });
}

export async function DELETE(request: Request) {
  const body = deleteSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Ungültige Anfrage zum Löschen" }, { status: 400 });
  const pinError = await verifyAdminPinOrReject(body.data.pin, request);
  if (pinError) return pinError;

  const client = await db();
  const existing = await client.execute({
    sql: "SELECT id FROM training_sessions WHERE id = ? AND profile_id = ? AND COALESCE(source, '') <> 'apple_health'",
    args: [body.data.sessionId, body.data.profileId]
  });
  if (existing.rows.length === 0) {
    return NextResponse.json({ error: "Trainingseinheit nicht gefunden" }, { status: 404 });
  }

  await client.batch([
    {
      sql: "DELETE FROM training_segments WHERE session_id = ?",
      args: [body.data.sessionId]
    },
    {
      sql: "DELETE FROM training_sessions WHERE id = ? AND profile_id = ?",
      args: [body.data.sessionId, body.data.profileId]
    },
    {
      sql: "INSERT INTO audit_log (id, action, profile_id, details) VALUES (?, 'training.manual_delete', ?, ?)",
      args: [randomUUID(), body.data.profileId, JSON.stringify({ sessionId: body.data.sessionId })]
    }
  ], "write");

  return NextResponse.json({ ok: true, deletedSessionId: body.data.sessionId });
}
