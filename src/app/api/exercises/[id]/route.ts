import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { isAllowedVideoUrl } from "@/lib/exercise-video";
import { verifyAdminPin } from "@/lib/security";

const schema = z.object({
  pin: z.string().regex(/^\d{4,8}$/),
  videoUrl: z.string().url().max(500).nullable()
});

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
