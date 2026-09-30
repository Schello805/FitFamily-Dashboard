import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getDashboardData } from "@/lib/dashboard";
import { verifyAdminPin } from "@/lib/security";

const schema = z.object({ pin: z.string().min(4), profileId: z.string().min(1) });

export async function POST(request: Request) {
  const body = schema.safeParse(await request.json());
  if (!body.success || !(await verifyAdminPin(body.data.pin))) return NextResponse.json({ error: "Eltern-PIN ist nicht richtig" }, { status: 401 });
  const profile = (await getDashboardData()).find((item) => item.id === body.data.profileId);
  if (!profile) return NextResponse.json({ error: "Profil nicht gefunden" }, { status: 404 });
  const client = await db();
  await client.execute({ sql: "UPDATE profiles SET score_baseline = score_baseline - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", args: [profile.score, profile.id] });
  return NextResponse.json({ ok: true });
}
