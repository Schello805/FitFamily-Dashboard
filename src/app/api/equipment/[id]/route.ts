import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { isAllowedVideoUrl } from "@/lib/exercise-video";
import { verifyAdminPinOrReject } from "@/lib/security";

const isWebDocumentUrl = (url: string | null | undefined) => !url || /^https?:\/\//i.test(url);

const schema = z.object({
  pin: z.string().regex(/^\d{4}$/),
  name: z.string().trim().min(2).max(60),
  quantity: z.number().int().min(1).max(8),
  available: z.boolean(),
  active: z.boolean().optional(),
  videoUrl: z.string().url().max(500).nullable().optional(),
  manualPdfUrl: z.string().url().max(1000).nullable().optional(),
  instructions: z.string().max(3000).nullable().optional()
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bitte Gerätename, Stückzahl und Verfügbarkeit prüfen." }, { status: 400 });
  if (!isAllowedVideoUrl(parsed.data.videoUrl ?? null)) return NextResponse.json({ error: "Bitte einen gültigen HTTPS-Link zu YouTube angeben." }, { status: 400 });
  if (!isWebDocumentUrl(parsed.data.manualPdfUrl)) return NextResponse.json({ error: "Die PDF-Anleitung muss über HTTP oder HTTPS erreichbar sein." }, { status: 400 });
  const pinError = await verifyAdminPinOrReject(parsed.data.pin);
  if (pinError) return pinError;
  const client = await db();
  const current = await client.execute({ sql: "SELECT id, name, video_url, instructions, manual_pdf_url, active FROM equipment_inventory WHERE id = ?", args: [id] });
  if (!current.rows[0]) return NextResponse.json({ error: "Gerät nicht gefunden." }, { status: 404 });
  const duplicate = await client.execute({ sql: "SELECT id FROM equipment_inventory WHERE name = ? COLLATE NOCASE AND id <> ?", args: [parsed.data.name, id] });
  if (duplicate.rows[0]) return NextResponse.json({ error: "Dieses Gerät ist bereits in der Liste." }, { status: 409 });
  const previousName = String(current.rows[0].name);
  const videoUrlToSave = parsed.data.videoUrl !== undefined ? (parsed.data.videoUrl ? parsed.data.videoUrl.trim() : null) : (current.rows[0].video_url ? String(current.rows[0].video_url) : null);
  const instructionsToSave = parsed.data.instructions !== undefined ? (parsed.data.instructions?.trim() || null) : (current.rows[0].instructions ? String(current.rows[0].instructions) : null);
  const manualPdfUrlToSave = parsed.data.manualPdfUrl !== undefined ? (parsed.data.manualPdfUrl?.trim() || null) : (current.rows[0].manual_pdf_url ? String(current.rows[0].manual_pdf_url) : null);
  const active = parsed.data.active ?? Boolean(current.rows[0].active);
  await client.batch([
    { sql: "UPDATE equipment_inventory SET name = ?, quantity = ?, available = ?, active = ?, video_url = ?, instructions = ?, manual_pdf_url = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", args: [parsed.data.name, parsed.data.quantity, Number(parsed.data.available), Number(active), videoUrlToSave, instructionsToSave, manualPdfUrlToSave, id] },
    ...(previousName === parsed.data.name ? [] : [{ sql: "UPDATE exercises SET equipment = ? WHERE equipment = ?", args: [parsed.data.name, previousName] }]),
    { sql: "INSERT INTO audit_log (id, action, details) VALUES (?, 'equipment.update', ?)", args: [randomUUID(), JSON.stringify({ equipmentId: id, quantity: parsed.data.quantity, available: parsed.data.available, videoUrl: videoUrlToSave, renamed: previousName !== parsed.data.name })] }
  ], "write");
  return NextResponse.json({ equipment: { id, name: parsed.data.name, quantity: parsed.data.quantity, available: parsed.data.available, active, videoUrl: videoUrlToSave, instructions: instructionsToSave, manualPdfUrl: manualPdfUrlToSave } });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => null) as { pin?: unknown } | null;
  if (typeof body?.pin !== "string" || !/^\d{4}$/.test(body.pin)) {
    return NextResponse.json({ error: "Bitte die vierstellige Eltern-PIN eingeben." }, { status: 400 });
  }
  const pinError = await verifyAdminPinOrReject(body.pin);
  if (pinError) return pinError;

  const client = await db();
  const current = await client.execute({ sql: "SELECT name, active FROM equipment_inventory WHERE id = ?", args: [id] });
  if (!current.rows[0] || !current.rows[0].active) return NextResponse.json({ error: "Aktives Gerät nicht gefunden." }, { status: 404 });
  const name = String(current.rows[0].name);
  const linkedExercises = await client.execute({
    sql: "SELECT COUNT(*) AS count FROM exercises WHERE equipment = ? COLLATE NOCASE AND active = 1",
    args: [name]
  });
  if (Number(linkedExercises.rows[0]?.count ?? 0) > 0) {
    return NextResponse.json({ error: "Dieses Gerät wird noch von aktiven Übungen verwendet. Ändere oder archiviere diese Übungen zuerst." }, { status: 409 });
  }
  await client.batch([
    { sql: "UPDATE equipment_inventory SET active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?", args: [id] },
    { sql: "INSERT INTO audit_log (id, action, details) VALUES (?, 'equipment.archive', ?)", args: [randomUUID(), JSON.stringify({ equipmentId: id, name })] }
  ], "write");
  return NextResponse.json({ ok: true, id, active: false });
}
