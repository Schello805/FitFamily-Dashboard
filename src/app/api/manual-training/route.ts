import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyAdminPin } from "@/lib/security";

const postSchema = z.object({
  pin: z.string().regex(/^\d{4}$/), profileId: z.string(), type: z.enum(["strength", "endurance"]),
  startedAt: z.string().datetime(), endedAt: z.string().datetime(), exerciseId: z.string().nullable().optional()
}).refine((value) => new Date(value.endedAt) > new Date(value.startedAt), { message: "Endzeit muss nach der Startzeit liegen" })
  .refine((value) => new Date(value.startedAt).getTime() <= Date.now() + 60000, { message: "Trainingsbeginn darf nicht in der Zukunft liegen" });

const editSchema = z.object({
  pin: z.string().regex(/^\d{4}$/),
  sessionId: z.string(),
  profileId: z.string(),
  type: z.enum(["strength", "endurance"]),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime(),
  exerciseId: z.string().nullable().optional()
}).refine((value) => new Date(value.endedAt) > new Date(value.startedAt), { message: "Endzeit muss nach der Startzeit liegen" })
  .refine((value) => new Date(value.startedAt).getTime() <= Date.now() + 60000, { message: "Trainingsbeginn darf nicht in der Zukunft liegen" });

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
  if (!(await verifyAdminPin(body.data.pin))) return NextResponse.json({ error: "Eltern-PIN ist nicht richtig" }, { status: 401 });
  const sessionId = randomUUID();
  const client = await db();
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
  if (!(await verifyAdminPin(body.data.pin))) return NextResponse.json({ error: "Eltern-PIN ist nicht richtig" }, { status: 401 });

  const client = await db();
  const existing = await client.execute({
    sql: "SELECT id FROM training_sessions WHERE id = ? AND profile_id = ?",
    args: [body.data.sessionId, body.data.profileId]
  });
  if (existing.rows.length === 0) {
    return NextResponse.json({ error: "Trainingseinheit nicht gefunden" }, { status: 404 });
  }

  await client.batch([
    {
      sql: `UPDATE training_sessions 
            SET started_at = ?, ended_at = ?, edited = 1
            WHERE id = ? AND profile_id = ?`,
      args: [body.data.startedAt, body.data.endedAt, body.data.sessionId, body.data.profileId]
    },
    {
      sql: `UPDATE training_segments
            SET type = ?, started_at = ?, ended_at = ?
            WHERE session_id = ?`,
      args: [body.data.type, body.data.startedAt, body.data.endedAt, body.data.sessionId]
    },
    {
      sql: "INSERT INTO audit_log (id, action, profile_id, details) VALUES (?, 'training.manual_edit', ?, ?)",
      args: [randomUUID(), body.data.profileId, JSON.stringify({ sessionId: body.data.sessionId, startedAt: body.data.startedAt, endedAt: body.data.endedAt, type: body.data.type })]
    }
  ], "write");

  return NextResponse.json({ ok: true, sessionId: body.data.sessionId });
}

export async function DELETE(request: Request) {
  const body = deleteSchema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Ungültige Anfrage zum Löschen" }, { status: 400 });
  if (!(await verifyAdminPin(body.data.pin))) return NextResponse.json({ error: "Eltern-PIN ist nicht richtig" }, { status: 401 });

  const client = await db();
  const existing = await client.execute({
    sql: "SELECT id FROM training_sessions WHERE id = ? AND profile_id = ?",
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
