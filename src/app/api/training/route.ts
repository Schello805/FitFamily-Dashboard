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
    const available = await client.execute({
      sql: `SELECT ex.id FROM exercises ex JOIN equipment_inventory inventory
        ON inventory.name = ex.equipment AND inventory.available = 1 WHERE ex.id = ? LIMIT 1`,
      args: [parsed.data.exerciseId]
    });
    if (!available.rows[0]) return NextResponse.json({ error: "Dieses Gerät ist derzeit nicht verfügbar." }, { status: 409 });
  }
  const result = parsed.data.action === "stop"
    ? await stopTraining(parsed.data.profileId)
    : await startOrSwitchTraining(parsed.data);
  return NextResponse.json(result);
}
