import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyAdminPin } from "@/lib/security";

const schema = z.object({ pin: z.string().regex(/^\d{4}$/), profileId: z.string().min(1) });

export async function POST(request: Request) {
  const body = schema.safeParse(await request.json());
  if (!body.success || !(await verifyAdminPin(body.data.pin))) {
    return NextResponse.json({ error: "Eltern-PIN ist nicht richtig" }, { status: 401 });
  }

  const client = await db();
  const profileCheck = await client.execute({
    sql: "SELECT id, name FROM profiles WHERE id = ?",
    args: [body.data.profileId]
  });
  if (profileCheck.rows.length === 0) {
    return NextResponse.json({ error: "Profil nicht gefunden" }, { status: 404 });
  }

  // Berechne alle bisher erarbeiteten Punkte aus allen Einheiten dieses Profils
  const segmentsResult = await client.execute({
    sql: `SELECT sg.type, sg.started_at, sg.ended_at
          FROM training_segments sg
          JOIN training_sessions ts ON ts.id = sg.session_id
          WHERE ts.profile_id = ?`,
    args: [body.data.profileId]
  });

  let totalEarnedPoints = 0;
  for (const row of segmentsResult.rows) {
    const start = new Date(String(row.started_at)).getTime();
    const end = row.ended_at ? new Date(String(row.ended_at)).getTime() : Date.now();
    const seconds = Math.max(0, (end - start) / 1000);
    const multiplier = String(row.type) === "endurance" ? 2 : 1;
    totalEarnedPoints += (seconds / 60) * multiplier;
  }

  // Setze score_baseline exakt so, dass scoreBaseline + totalEarnedPoints = 0 ergibt
  await client.execute({
    sql: "UPDATE profiles SET score_baseline = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    args: [-totalEarnedPoints, body.data.profileId]
  });

  return NextResponse.json({ ok: true, newScore: 0, profileId: body.data.profileId });
}
