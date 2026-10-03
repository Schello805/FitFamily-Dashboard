import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { isAllowedVideoUrl } from "@/lib/exercise-video";
import { verifyAdminPinOrReject } from "@/lib/security";
import { getExerciseGuide, getExerciseGuideFromRecord } from "@/lib/exercise-guides";

const schema = z.object({
  pin: z.string().regex(/^\d{4}$/),
  name: z.string().trim().min(2).max(80).optional(),
  type: z.enum(["strength", "endurance"]).optional(),
  equipment: z.string().trim().min(2).max(80).optional(),
  instructions: z.string().trim().max(3000).nullable().optional(),
  safetyNotes: z.string().trim().max(1200).nullable().optional(),
  videoUrl: z.string().url().max(500).nullable().optional(),
  active: z.boolean().optional()
}).refine((value) => Object.keys(value).some((key) => key !== "pin"), { message: "Mindestens ein Übungsfeld muss geändert werden." });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guide = getExerciseGuide(id);
  const client = await db();
  const exercise = await client.execute({ sql: "SELECT id, name, type, equipment, instructions, safety_notes FROM exercises WHERE id = ? LIMIT 1", args: [id] });
  const exerciseRow = exercise.rows[0];
  const resolvedGuide = exerciseRow ? getExerciseGuideFromRecord({
    id: String(exerciseRow.id), name: String(exerciseRow.name), equipment: String(exerciseRow.equipment),
    instructions: exerciseRow.instructions ? String(exerciseRow.instructions) : null,
    safetyNotes: exerciseRow.safety_notes ? String(exerciseRow.safety_notes) : null
  }) : guide;
  let result = await client.execute({
    sql: "SELECT video_url FROM exercises WHERE id = ? AND video_url IS NOT NULL AND TRIM(video_url) != '' LIMIT 1",
    args: [id]
  });
  if (!result.rows[0] && resolvedGuide.id !== id) {
    result = await client.execute({
      sql: "SELECT video_url FROM exercises WHERE id = ? AND video_url IS NOT NULL AND TRIM(video_url) != '' LIMIT 1",
      args: [resolvedGuide.id]
    });
  }
  const videoUrl = result.rows[0]?.video_url ? String(result.rows[0].video_url) : null;
  const equipmentMedia = await client.execute({
    sql: "SELECT manual_pdf_url FROM equipment_inventory WHERE LOWER(name) = LOWER(?) LIMIT 1",
    args: [resolvedGuide.equipment]
  });
  const manualPdfUrl = equipmentMedia.rows[0]?.manual_pdf_url ? String(equipmentMedia.rows[0].manual_pdf_url) : null;
  return NextResponse.json({ guide: resolvedGuide, videoUrl, manualPdfUrl }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bitte einen gültigen HTTPS-Link zu YouTube oder einen leeren Eintrag angeben." }, { status: 400 });
  }
  if (parsed.data.videoUrl !== undefined && !isAllowedVideoUrl(parsed.data.videoUrl)) {
    return NextResponse.json({ error: "Bitte einen gültigen HTTPS-Link zu YouTube oder einen leeren Eintrag angeben." }, { status: 400 });
  }
  const pinError = await verifyAdminPinOrReject(parsed.data.pin);
  if (pinError) return pinError;

  const client = await db();
  const currentResult = await client.execute({ sql: "SELECT name, type, equipment, instructions, safety_notes, video_url, active FROM exercises WHERE id = ?", args: [id] });
  const current = currentResult.rows[0];
  if (!current) return NextResponse.json({ error: "Übung nicht gefunden." }, { status: 404 });

  const next = {
    name: parsed.data.name ?? String(current.name),
    type: parsed.data.type ?? String(current.type),
    equipment: parsed.data.equipment ?? String(current.equipment),
    instructions: parsed.data.instructions !== undefined ? parsed.data.instructions : (current.instructions ? String(current.instructions) : null),
    safetyNotes: parsed.data.safetyNotes !== undefined ? parsed.data.safetyNotes : (current.safety_notes ? String(current.safety_notes) : null),
    videoUrl: parsed.data.videoUrl !== undefined ? parsed.data.videoUrl : (current.video_url ? String(current.video_url) : null),
    active: parsed.data.active !== undefined ? parsed.data.active : Boolean(current.active)
  };
  if (!isAllowedVideoUrl(next.videoUrl)) return NextResponse.json({ error: "Bitte einen gültigen HTTPS-Link zu YouTube angeben." }, { status: 400 });
  if (next.active) {
    const equipment = await client.execute({ sql: "SELECT id FROM equipment_inventory WHERE name = ? COLLATE NOCASE AND active = 1 LIMIT 1", args: [next.equipment] });
    if (!equipment.rows[0] && !["ohne gerät", "körpergewicht"].includes(next.equipment.toLocaleLowerCase("de"))) {
      return NextResponse.json({ error: "Das zugeordnete Gerät existiert nicht. Bitte wähle ein Gerät aus dem Bestand oder archiviere die Übung." }, { status: 409 });
    }
  }
  const duplicate = await client.execute({ sql: "SELECT id FROM exercises WHERE name = ? COLLATE NOCASE AND equipment = ? COLLATE NOCASE AND active = 1 AND id <> ? LIMIT 1", args: [next.name, next.equipment, id] });
  if (next.active && duplicate.rows[0]) return NextResponse.json({ error: "Diese Übung ist für das Gerät bereits vorhanden." }, { status: 409 });

  await client.batch([
    { sql: "UPDATE exercises SET name = ?, type = ?, equipment = ?, instructions = ?, safety_notes = ?, video_url = ?, active = ? WHERE id = ?", args: [next.name, next.type, next.equipment, next.instructions, next.safetyNotes, next.videoUrl, Number(next.active), id] },
    { sql: "INSERT INTO audit_log (id, action, details) VALUES (?, 'exercise.update', ?)", args: [randomUUID(), JSON.stringify({ exerciseId: id, name: next.name, equipment: next.equipment, active: next.active })] }
  ], "write");
  const updatedGuide = getExerciseGuideFromRecord({ id, name: next.name, equipment: next.equipment, instructions: next.instructions, safetyNotes: next.safetyNotes });
  return NextResponse.json({ exercise: { id, ...next }, guide: updatedGuide, videoUrl: next.videoUrl });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null) as { pin?: unknown } | null;
  if (typeof body?.pin !== "string" || !/^\d{4}$/.test(body.pin)) return NextResponse.json({ error: "Bitte die vierstellige Eltern-PIN eingeben." }, { status: 400 });
  const pinError = await verifyAdminPinOrReject(body.pin);
  if (pinError) return pinError;
  const client = await db();
  const result = await client.execute({ sql: "UPDATE exercises SET active = 0 WHERE id = ? AND active = 1", args: [id] });
  if (!result.rowsAffected) return NextResponse.json({ error: "Aktive Übung nicht gefunden." }, { status: 404 });
  await client.execute({ sql: "INSERT INTO audit_log (id, action, details) VALUES (?, 'exercise.archive', ?)", args: [randomUUID(), JSON.stringify({ exerciseId: id })] });
  return NextResponse.json({ ok: true, id, active: false });
}
