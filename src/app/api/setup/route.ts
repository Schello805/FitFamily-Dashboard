import { NextResponse } from "next/server";
import { z } from "zod";
import { db, getSetting } from "@/lib/db";
import { setAdminPin } from "@/lib/security";
import { AVATAR_IDS } from "@/lib/domain";

const profileSchema = z.object({
  id: z.enum(["mama", "papa", "fabian", "frieda"]),
  name: z.string().min(1).max(30),
  birthDate: z.string().date().nullable(),
  avatar: z.enum([...AVATAR_IDS, "female", "male", "neutral"]),
  startingFitness: z.number().int().min(1).max(5)
});
const schema = z.object({
  pin: z.string().regex(/^\d{4,8}$/),
  profiles: z.array(profileSchema).length(4)
});

export const dynamic = "force-dynamic";

export async function GET() {
  const complete = (await getSetting("setup_complete")) === "true";
  return NextResponse.json({ setupComplete: complete });
}

export async function POST(request: Request) {
  if ((await getSetting("setup_complete")) === "true") {
    return NextResponse.json({ error: "Die Ersteinrichtung ist bereits abgeschlossen." }, { status: 409 });
  }
  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Bitte alle Pflichtfelder prüfen." }, { status: 400 });
  await setAdminPin(body.data.pin);
  const client = await db();
  await client.batch([
    ...body.data.profiles.map((profile) => ({
      sql: "UPDATE profiles SET name = ?, birth_date = ?, avatar = ?, starting_fitness = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      args: [profile.name, profile.birthDate, profile.avatar, profile.startingFitness, profile.id]
    })),
    {
      sql: `INSERT INTO settings (key, value, updated_at) VALUES ('setup_complete', 'true', CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = 'true', updated_at = CURRENT_TIMESTAMP`
    }
  ], "write");
  return NextResponse.json({ ok: true });
}
