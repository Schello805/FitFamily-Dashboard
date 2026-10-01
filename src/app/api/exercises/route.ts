import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { isAllowedVideoUrl } from "@/lib/exercise-video";
import { verifyAdminPin } from "@/lib/security";

const createSchema = z.object({
  pin: z.string().regex(/^\d{4}$/),
  name: z.string().trim().min(2).max(80),
  type: z.enum(["strength", "endurance"]),
  equipment: z.string().trim().min(2).max(80),
  instructions: z.string().trim().min(5).max(3000),
  safetyNotes: z.string().trim().min(5).max(1200),
  videoUrl: z.string().url().max(500).nullable().optional()
});

export async function GET(request: Request) {
  const name = new URL(request.url).searchParams.get("name")?.trim();
  const client = await db();
  if (!name) {
    const result = await client.execute("SELECT id, name, type, equipment, instructions, safety_notes, video_url, active FROM exercises WHERE active = 1 ORDER BY equipment, name");
    return NextResponse.json({ exercises: result.rows.map((row) => ({
      id: String(row.id), name: String(row.name), type: String(row.type), equipment: String(row.equipment),
      instructions: row.instructions ? String(row.instructions) : "", safetyNotes: row.safety_notes ? String(row.safety_notes) : "",
      videoUrl: row.video_url ? String(row.video_url) : null, active: Boolean(row.active)
    })) }, { headers: { "Cache-Control": "no-store" } });
  }
  const result = await client.execute({
    sql: "SELECT id, name, type, equipment FROM exercises WHERE name = ? COLLATE NOCASE ORDER BY active DESC, name LIMIT 1",
    args: [name]
  });
  if (!result.rows[0]) return NextResponse.json({ exercise: null });
  const row = result.rows[0];
  return NextResponse.json({ exercise: { id: String(row.id), name: String(row.name), type: String(row.type), equipment: String(row.equipment) } });
}

export async function POST(request: Request) {
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bitte Name, Trainingsart, Gerät und eine vollständige Anleitung samt Sicherheitshinweisen angeben." }, { status: 400 });
  if (!isAllowedVideoUrl(parsed.data.videoUrl ?? null)) return NextResponse.json({ error: "Bitte einen gültigen HTTPS-Link zu YouTube angeben." }, { status: 400 });
  if (!(await verifyAdminPin(parsed.data.pin))) return NextResponse.json({ error: "Eltern-PIN ist nicht richtig." }, { status: 401 });

  const client = await db();
  const equipment = await client.execute({
    sql: "SELECT id FROM equipment_inventory WHERE name = ? COLLATE NOCASE AND active = 1 AND available = 1 LIMIT 1",
    args: [parsed.data.equipment]
  });
  if (!equipment.rows[0] && !["ohne gerät", "körpergewicht"].includes(parsed.data.equipment.toLocaleLowerCase("de"))) {
    return NextResponse.json({ error: "Das ausgewählte Gerät ist nicht im aktiven Gerätebestand vorhanden." }, { status: 400 });
  }
  const duplicate = await client.execute({
    sql: "SELECT id FROM exercises WHERE name = ? COLLATE NOCASE AND equipment = ? COLLATE NOCASE AND active = 1 LIMIT 1",
    args: [parsed.data.name, parsed.data.equipment]
  });
  if (duplicate.rows[0]) return NextResponse.json({ error: "Diese Übung ist für das Gerät bereits vorhanden." }, { status: 409 });

  const slug = parsed.data.name.toLocaleLowerCase("de").normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "uebung";
  const id = `${slug}-${randomUUID().slice(0, 8)}`;
  await client.batch([
    { sql: "INSERT INTO exercises (id, name, type, equipment, instructions, safety_notes, video_url, active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)", args: [id, parsed.data.name, parsed.data.type, parsed.data.equipment, parsed.data.instructions, parsed.data.safetyNotes, parsed.data.videoUrl ?? null] },
    { sql: "INSERT INTO audit_log (id, action, details) VALUES (?, 'exercise.create', ?)", args: [randomUUID(), JSON.stringify({ exerciseId: id, name: parsed.data.name, equipment: parsed.data.equipment })] }
  ], "write");
  return NextResponse.json({ exercise: { id, name: parsed.data.name, type: parsed.data.type, equipment: parsed.data.equipment, instructions: parsed.data.instructions, safetyNotes: parsed.data.safetyNotes, videoUrl: parsed.data.videoUrl ?? null, active: true } }, { status: 201 });
}
