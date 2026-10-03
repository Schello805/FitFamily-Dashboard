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
  videoUrl: z.string().url().max(500).nullable().optional(),
  manualPdfUrl: manualPdfUrlSchema,
  manualPdfUpload: manualPdfUploadSchema,
  instructions: z.string().max(3000).nullable().optional()
});

export async function GET(request: Request) {
  const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "true";
  const client = await db();
  const result = await client.execute({
    sql: `SELECT id, name, quantity, available, active, video_url, instructions, manual_pdf_url FROM equipment_inventory ${includeArchived ? "" : "WHERE active = 1"} ORDER BY active DESC, name`,
    args: []
  });
  return NextResponse.json({ equipment: result.rows.map((row) => ({
    id: String(row.id), name: String(row.name), quantity: Number(row.quantity),
    available: Boolean(row.available), active: Boolean(row.active), videoUrl: row.video_url ? String(row.video_url) : null, instructions: row.instructions ? String(row.instructions) : null, manualPdfUrl: row.manual_pdf_url ? String(row.manual_pdf_url) : null
  })) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = await readEquipmentBody(request);
  if (body instanceof Response) return body;
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Bitte Gerätename, Stückzahl (1–8) und PDF-Anleitung (gültige PDF bis 10 MiB oder Web-Link) prüfen." }, { status: 400 });
  if (!isAllowedVideoUrl(parsed.data.videoUrl ?? null)) return NextResponse.json({ error: "Bitte einen gültigen HTTPS-Link zu YouTube angeben." }, { status: 400 });
  const pinError = await verifyAdminPinOrReject(parsed.data.pin, request);
  if (pinError) return pinError;
  const client = await db();
  const duplicate = await client.execute({ sql: "SELECT id FROM equipment_inventory WHERE name = ? COLLATE NOCASE", args: [parsed.data.name] });
  if (duplicate.rows[0]) return NextResponse.json({ error: "Dieses Gerät ist bereits in der Liste." }, { status: 409 });
  const id = `${parsed.data.name.toLocaleLowerCase("de").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "geraet"}-${randomUUID().slice(0, 8)}`;
  const upload = parsed.data.manualPdfUpload;
  const manualPdfUrl = upload ? equipmentManualUrl(id) : parsed.data.manualPdfUrl ?? null;
  if (!upload && manualPdfUrl && isStoredManualUrl(manualPdfUrl)) return NextResponse.json({ error: "Bitte die PDF-Datei für dieses Gerät hochladen." }, { status: 400 });
  await client.batch([
    { sql: "INSERT INTO equipment_inventory (id, name, quantity, video_url, instructions, manual_pdf_url, manual_pdf_data, manual_pdf_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", args: [id, parsed.data.name, parsed.data.quantity, parsed.data.videoUrl ?? null, parsed.data.instructions ?? null, manualPdfUrl, upload?.data ?? null, upload?.name ?? null] },
    { sql: "INSERT INTO audit_log (id, action, details) VALUES (?, 'equipment.create', ?)", args: [randomUUID(), JSON.stringify({ equipmentId: id, quantity: parsed.data.quantity })] }
  ], "write");
  return NextResponse.json({ equipment: { id, name: parsed.data.name, quantity: parsed.data.quantity, available: true, active: true, videoUrl: parsed.data.videoUrl ?? null, instructions: parsed.data.instructions ?? null, manualPdfUrl } }, { status: 201 });
}
