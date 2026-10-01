import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { isAllowedVideoUrl } from "@/lib/exercise-video";
import { verifyAdminPin } from "@/lib/security";
import { getExerciseGuide } from "@/lib/exercise-guides";

const schema = z.object({
  pin: z.string().regex(/^\d{4}$/),
  videoUrl: z.string().url().max(500).nullable()
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guide = getExerciseGuide(id);
  const client = await db();
  let result = await client.execute({
    sql: "SELECT video_url FROM exercises WHERE id = ? AND video_url IS NOT NULL AND TRIM(video_url) != '' LIMIT 1",
    args: [id]
  });
  if (!result.rows[0] && guide.id !== id) {
    result = await client.execute({
      sql: "SELECT video_url FROM exercises WHERE id = ? AND video_url IS NOT NULL AND TRIM(video_url) != '' LIMIT 1",
      args: [guide.id]
    });
  }
  let videoUrl = result.rows[0]?.video_url ? String(result.rows[0].video_url) : null;
  if (!videoUrl) {
    const equipment = await client.execute({
      sql: "SELECT video_url FROM equipment_inventory WHERE LOWER(name) = LOWER(?) AND video_url IS NOT NULL AND TRIM(video_url) != '' LIMIT 1",
      args: [guide.equipment]
    });
    videoUrl = equipment.rows[0]?.video_url ? String(equipment.rows[0].video_url) : null;
  }
  if (!videoUrl) {
    const sibling = await client.execute({
      sql: "SELECT video_url FROM exercises WHERE equipment = ? AND video_url IS NOT NULL AND TRIM(video_url) != '' LIMIT 1",
      args: [guide.equipment]
    });
    videoUrl = sibling.rows[0]?.video_url ? String(sibling.rows[0].video_url) : null;
  }
  return NextResponse.json({ guide, videoUrl }, { headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Bitte einen gültigen HTTPS-Link zu YouTube oder einen leeren Eintrag angeben." }, { status: 400 });
  }
  if (!isAllowedVideoUrl(parsed.data.videoUrl)) {
    return NextResponse.json({ error: "Bitte einen gültigen HTTPS-Link zu YouTube oder einen leeren Eintrag angeben." }, { status: 400 });
  }
  if (!(await verifyAdminPin(parsed.data.pin))) return NextResponse.json({ error: "Eltern-PIN ist nicht richtig." }, { status: 401 });

  const client = await db();
  const updated = await client.execute({ sql: "UPDATE exercises SET video_url = ? WHERE id = ?", args: [parsed.data.videoUrl, id] });
  if (!updated.rowsAffected) return NextResponse.json({ error: "Übung nicht gefunden." }, { status: 404 });
  await client.execute({
    sql: "INSERT INTO audit_log (id, action, details) VALUES (?, 'exercise.video.update', ?)",
    args: [randomUUID(), JSON.stringify({ exerciseId: id, hasVideo: Boolean(parsed.data.videoUrl) })]
  });
  return NextResponse.json({ ok: true, videoUrl: parsed.data.videoUrl });
}
