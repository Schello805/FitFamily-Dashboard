import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { isAllowedVideoUrl } from "@/lib/exercise-video";
import { adminPinSchema, verifyAdminPinOrReject } from "@/lib/security";
import { manualPdfUrlSchema, manualPdfUploadSchema, readEquipmentBody } from "@/lib/manual-pdf";
import { equipmentManualUrl, isStoredManualUrl } from "@/lib/manual-pdf-shared";

const schema = z.object({
  pin: adminPinSchema,
  name: z.string().trim().min(2).max(60),
  quantity: z.number().int().min(1).max(8),
  available: z.boolean(),
  active: z.boolean().optional(),
  videoUrl: z.string().url().max(500).nullable().optional(),
  manualPdfUrl: manualPdfUrlSchema,
  manualPdfUpload: manualPdfUploadSchema,
  instructions: z.string().max(3000).nullable().optional()
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await readEquipmentBody(request);
  if (body instanceof Response) return body;
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Bitte Gerätename, Stückzahl, Verfügbarkeit und PDF-Anleitung (gültige PDF bis 10 MiB oder Web-Link) prüfen." }, { status: 400 });
  if (!isAllowedVideoUrl(parsed.data.videoUrl ?? null)) return NextResponse.json({ error: "Bitte einen gültigen HTTPS-Link zu YouTube angeben." }, { status: 400 });
  const pinError = await verifyAdminPinOrReject(parsed.data.pin, request);
  if (pinError) return pinError;
  const client = await db();
  const current = await client.execute({ sql: "SELECT id, name, video_url, instructions, manual_pdf_url, manual_pdf_data, manual_pdf_name, active FROM equipment_inventory WHERE id = ?", args: [id] });
  if (!current.rows[0]) return NextResponse.json({ error: "Gerät nicht gefunden." }, { status: 404 });
  const duplicate = await client.execute({ sql: "SELECT id FROM equipment_inventory WHERE name = ? COLLATE NOCASE AND id <> ?", args: [parsed.data.name, id] });
  if (duplicate.rows[0]) return NextResponse.json({ error: "Dieses Gerät ist bereits in der Liste." }, { status: 409 });
  const previousName = String(current.rows[0].name);
  const videoUrlToSave = parsed.data.videoUrl !== undefined ? (parsed.data.videoUrl ? parsed.data.videoUrl.trim() : null) : (current.rows[0].video_url ? String(current.rows[0].video_url) : null);
  const instructionsToSave = parsed.data.instructions !== undefined ? (parsed.data.instructions?.trim() || null) : (current.rows[0].instructions ? String(current.rows[0].instructions) : null);
  const upload = parsed.data.manualPdfUpload;
  const manualPdfUrlToSave = upload ? equipmentManualUrl(id) : parsed.data.manualPdfUrl !== undefined ? (parsed.data.manualPdfUrl?.trim() || null) : (current.rows[0].manual_pdf_url ? String(current.rows[0].manual_pdf_url) : null);
  const keepStored = manualPdfUrlToSave === equipmentManualUrl(id);
  const pdfData = upload?.data ?? (keepStored ? current.rows[0].manual_pdf_data : null);
  const pdfName = upload?.name ?? (keepStored ? current.rows[0].manual_pdf_name : null);
  if (manualPdfUrlToSave && isStoredManualUrl(manualPdfUrlToSave) && (!keepStored || !pdfData)) return NextResponse.json({ error: "Bitte die PDF-Datei für dieses Gerät hochladen." }, { status: 400 });
  const active = parsed.data.active ?? Boolean(current.rows[0].active);
  await client.batch([
    { sql: "UPDATE equipment_inventory SET name = ?, quantity = ?, available = ?, active = ?, video_url = ?, instructions = ?, manual_pdf_url = ?, manual_pdf_data = ?, manual_pdf_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", args: [parsed.data.name, parsed.data.quantity, Number(parsed.data.available), Number(active), videoUrlToSave, instructionsToSave, manualPdfUrlToSave, pdfData ?? null, pdfName ?? null, id] },
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
  const pinError = await verifyAdminPinOrReject(body.pin, request);
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
