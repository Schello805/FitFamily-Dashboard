import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyAdminPinOrReject } from "@/lib/security";

const schema = z.object({ pin: z.string().regex(/^\d{4}$/), profileId: z.string().min(1) });

export async function POST(request: Request) {
  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const pinError = await verifyAdminPinOrReject(body.data.pin);
  if (pinError) return pinError;

  const client = await db();
  const profileCheck = await client.execute({
    sql: "SELECT id, name FROM profiles WHERE id = ?",
    args: [body.data.profileId]
  });
  if (profileCheck.rows.length === 0) {
    return NextResponse.json({ error: "Profil nicht gefunden" }, { status: 404 });
  }

  const resetAt = new Date().toISOString();
  await client.execute({
    sql: `UPDATE profiles SET score_baseline = 0, score_reset_at = ?, target_reset_at = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`,
    args: [resetAt, resetAt, body.data.profileId]
  });

  return NextResponse.json({ ok: true, newScore: 0, targetPercent: 0, resetAt, profileId: body.data.profileId });
}
