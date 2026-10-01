import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { isAllowedVideoUrl } from "@/lib/exercise-video";
import { verifyAdminPin } from "@/lib/security";

const schema = z.object({
  pin: z.string().regex(/^\d{4}$/),
  name: z.string().trim().min(2).max(60),
  quantity: z.number().int().min(1).max(8),
  videoUrl: z.string().url().max(500).nullable().optional()
});

export async function GET(request: Request) {
  const includeArchived = new URL(request.url).searchParams.get("includeArchived") === "true";
  const client = await db();
  const result = await client.execute({
    sql: `SELECT id, name, quantity, available, active, video_url FROM equipment_inventory ${includeArchived ? "" : "WHERE active = 1"} ORDER BY active DESC, name`,
    args: []
  });
  return NextResponse.json({ equipment: result.rows.map((row) => ({
    id: String(row.id), name: String(row.name), quantity: Number(row.quantity),
    available: Boolean(row.available), active: Boolean(row.active), videoUrl: row.video_url ? String(row.video_url) : null
  })) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bitte einen Gerätenamen und eine Stückzahl von 1 bis 8 angeben." }, { status: 400 });
  if (!isAllowedVideoUrl(parsed.data.videoUrl ?? null)) return NextResponse.json({ error: "Bitte einen gültigen HTTPS-Link zu YouTube angeben." }, { status: 400 });
  if (!(await verifyAdminPin(parsed.data.pin))) return NextResponse.json({ error: "Eltern-PIN ist nicht richtig." }, { status: 401 });
  const client = await db();
  const duplicate = await client.execute({ sql: "SELECT id FROM equipment_inventory WHERE name = ? COLLATE NOCASE", args: [parsed.data.name] });
  if (duplicate.rows[0]) return NextResponse.json({ error: "Dieses Gerät ist bereits in der Liste." }, { status: 409 });
  const id = `${parsed.data.name.toLocaleLowerCase("de").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "geraet"}-${randomUUID().slice(0, 8)}`;
  await client.batch([
    { sql: "INSERT INTO equipment_inventory (id, name, quantity, video_url) VALUES (?, ?, ?, ?)", args: [id, parsed.data.name, parsed.data.quantity, parsed.data.videoUrl ?? null] },
    { sql: "INSERT INTO audit_log (id, action, details) VALUES (?, 'equipment.create', ?)", args: [randomUUID(), JSON.stringify({ equipmentId: id, quantity: parsed.data.quantity })] }
  ], "write");
  return NextResponse.json({ equipment: { id, name: parsed.data.name, quantity: parsed.data.quantity, available: true, active: true, videoUrl: parsed.data.videoUrl ?? null } }, { status: 201 });
}
