import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyAdminPin } from "@/lib/security";

const schema = z.object({
  pin: z.string().regex(/^\d{4}$/),
  name: z.string().trim().min(2).max(60),
  quantity: z.number().int().min(1).max(8)
});

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bitte einen Gerätenamen und eine Stückzahl von 1 bis 8 angeben." }, { status: 400 });
  if (!(await verifyAdminPin(parsed.data.pin))) return NextResponse.json({ error: "Eltern-PIN ist nicht richtig." }, { status: 401 });
  const client = await db();
  const duplicate = await client.execute({ sql: "SELECT id FROM equipment_inventory WHERE name = ? COLLATE NOCASE", args: [parsed.data.name] });
  if (duplicate.rows[0]) return NextResponse.json({ error: "Dieses Gerät ist bereits in der Liste." }, { status: 409 });
  const id = `${parsed.data.name.toLocaleLowerCase("de").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "geraet"}-${randomUUID().slice(0, 8)}`;
  await client.batch([
    { sql: "INSERT INTO equipment_inventory (id, name, quantity) VALUES (?, ?, ?)", args: [id, parsed.data.name, parsed.data.quantity] },
    { sql: "INSERT INTO audit_log (id, action, details) VALUES (?, 'equipment.create', ?)", args: [randomUUID(), JSON.stringify({ equipmentId: id, quantity: parsed.data.quantity })] }
  ], "write");
  return NextResponse.json({ equipment: { id, name: parsed.data.name, quantity: parsed.data.quantity, available: true } }, { status: 201 });
}
