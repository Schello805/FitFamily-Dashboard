import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { startOrSwitchTraining, stopTraining } from "@/lib/training";

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("start"),
    profileId: z.string().min(1),
    type: z.enum(["strength", "endurance"]),
    exerciseId: z.string().nullable().optional(),
    source: z.enum(["touch", "mobile", "nfc", "manual"]).optional()
  }),
  z.object({ action: z.literal("stop"), profileId: z.string().min(1) })
]);

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Trainingsanfrage", details: parsed.error.flatten() }, { status: 400 });
  }
  if (parsed.data.action === "start" && parsed.data.exerciseId) {
    const client = await db();
    const unavailable = await client.execute({
      sql: `SELECT inventory.name FROM exercises ex JOIN equipment_inventory inventory
        ON (inventory.name = ex.equipment OR inventory.id = LOWER(ex.equipment))
        WHERE ex.id = ? AND inventory.available = 0 LIMIT 1`,
      args: [parsed.data.exerciseId]
    });
    if (unavailable.rows[0]) {
      return NextResponse.json({ error: `Das Gerät ${String(unavailable.rows[0].name)} ist derzeit nicht verfügbar.` }, { status: 409 });
    }
  }
  const result = parsed.data.action === "stop"
    ? await stopTraining(parsed.data.profileId)
    : await startOrSwitchTraining(parsed.data);
  return NextResponse.json(result);
}
