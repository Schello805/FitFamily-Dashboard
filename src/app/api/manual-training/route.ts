import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyAdminPin } from "@/lib/security";

const schema = z.object({
  pin: z.string(), profileId: z.string(), type: z.enum(["strength", "endurance"]),
  startedAt: z.string().datetime(), endedAt: z.string().datetime(), exerciseId: z.string().nullable().optional()
}).refine((value) => new Date(value.endedAt) > new Date(value.startedAt), { message: "Endzeit muss nach der Startzeit liegen" })
  .refine((value) => new Date(value.startedAt).getTime() <= Date.now() + 60000, { message: "Trainingsbeginn darf nicht in der Zukunft liegen" });

export async function POST(request: Request) {
  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Zeitangaben sind ungültig" }, { status: 400 });
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
