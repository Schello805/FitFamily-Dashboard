import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { GOALS } from "@/lib/domain";
import { verifyAdminPin } from "@/lib/security";

const profileIds = new Set(["mama", "papa", "fabian", "frieda"]);
const schema = z.object({
  name: z.string().trim().min(1).max(30),
  birthDate: z.string().date().nullable(),
  avatar: z.enum(["female", "male", "neutral"]),
  goal: z.string().min(1).max(100),
  pin: z.string().regex(/^\d{4,8}$/)
});

export async function PATCH(request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  if (!profileIds.has(profileId)) return NextResponse.json({ error: "Profil nicht gefunden." }, { status: 404 });

  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success || !GOALS.includes(body.data.goal as typeof GOALS[number])) {
    return NextResponse.json({ error: "Bitte Profilangaben prüfen." }, { status: 400 });
  }
  if (!(await verifyAdminPin(body.data.pin))) return NextResponse.json({ error: "Eltern-PIN ist nicht richtig." }, { status: 401 });

  const client = await db();
  await client.batch([
    { sql: "UPDATE profiles SET name = ?, birth_date = ?, avatar = ?, goal = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", args: [body.data.name, body.data.birthDate, body.data.avatar, body.data.goal, profileId] },
    { sql: "INSERT INTO audit_log (id, action, profile_id, details) VALUES (?, 'profile.update', ?, ?)", args: [randomUUID(), profileId, JSON.stringify({ fields: ["name", "birthDate", "avatar", "goal"] })] }
  ], "write");
  return NextResponse.json({ ok: true });
}
