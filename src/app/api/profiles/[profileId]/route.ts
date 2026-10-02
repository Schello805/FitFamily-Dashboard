import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { AVATAR_IDS, GOALS } from "@/lib/domain";
import { verifyAdminPin } from "@/lib/security";

const schema = z.object({
  name: z.string().trim().min(1).max(30),
  email: z.string().trim().email().max(254).nullable(),
  birthDate: z.string().date().nullable(),
  avatar: z.enum([...AVATAR_IDS, "female", "male", "neutral"]),
  startingFitness: z.number().int().min(1).max(5),
  goal: z.string().min(1).max(100),
  pin: z.string().regex(/^\d{4}$/)
});

export async function PATCH(request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  const client = await db();
  const exists = await client.execute({ sql: "SELECT id FROM profiles WHERE id = ? LIMIT 1", args: [profileId] });
  if (!exists.rows[0]) return NextResponse.json({ error: "Profil nicht gefunden." }, { status: 404 });

  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success || !GOALS.includes(body.data.goal as typeof GOALS[number])) {
    return NextResponse.json({ error: "Bitte Profilangaben prüfen." }, { status: 400 });
  }
  if (!(await verifyAdminPin(body.data.pin))) return NextResponse.json({ error: "Eltern-PIN ist nicht richtig." }, { status: 401 });

  await client.batch([
    { sql: "UPDATE profiles SET name = ?, email = ?, birth_date = ?, avatar = ?, starting_fitness = ?, goal = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", args: [body.data.name, body.data.email, body.data.birthDate, body.data.avatar, body.data.startingFitness, body.data.goal, profileId] },
    { sql: "INSERT INTO audit_log (id, action, profile_id, details) VALUES (?, 'profile.update', ?, ?)", args: [randomUUID(), profileId, JSON.stringify({ fields: ["name", "email", "birthDate", "avatar", "startingFitness", "goal"] })] }
  ], "write");
  return NextResponse.json({ ok: true });
}
