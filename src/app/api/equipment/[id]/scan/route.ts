import { z } from "zod";
import { db } from "@/lib/db";
import { equipmentScanConfig } from "@/lib/equipment-scan";
import { adminPinSchema, verifyAdminPinOrReject } from "@/lib/security";
import { getMobileReachableBaseUrl } from "@/lib/server-url";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const config = await equipmentScanConfig(id);
  if (!config) return Response.json({ error: "Gerät nicht gefunden." }, { status: 404 });
  return Response.json({ ...config, baseUrl: getMobileReachableBaseUrl(request) }, { headers: { "Cache-Control": "no-store" } });
}
const schema = z.object({ pin: adminPinSchema, type: z.enum(["strength", "endurance"]), exerciseId: z.string().min(1) });
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Bitte Trainingsart und Standardübung auswählen." }, { status: 400 });
  const denied = await verifyAdminPinOrReject(input.data.pin, request);
  if (denied) return denied;
  const { id } = await params;
  const config = await equipmentScanConfig(id);
  if (!config) return Response.json({ error: "Gerät nicht gefunden." }, { status: 404 });
  if (!config.exercises.some(e => e.id === input.data.exerciseId)) return Response.json({ error: "Die Übung muss aktiv sein und zu diesem Gerät gehören." }, { status: 400 });
  const client = await db();
  await client.execute({ sql: "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP", args: [`equipment_scan:${id}`, JSON.stringify({ type: input.data.type, exerciseId: input.data.exerciseId })] });
  return Response.json({ ok: true });
}
