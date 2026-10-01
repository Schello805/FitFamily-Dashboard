import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPairedProfile } from "@/lib/security";
import { startOrSwitchTraining } from "@/lib/training";
import { createReachableUrl } from "@/lib/server-url";

export async function GET(request: Request, { params }: { params: Promise<{ exerciseId: string }> }) {
  const { exerciseId } = await params;
  const profileId = await getPairedProfile((await cookies()).get("ff_device")?.value);
  if (!profileId) {
    const target = encodeURIComponent(new URL(request.url).pathname);
    return NextResponse.redirect(createReachableUrl(`/geraet-koppeln?weiter=${target}`, request));
  }
  const client = await db();
  const exercise = await client.execute({ sql: `SELECT ex.type FROM exercises ex LEFT JOIN equipment_inventory inventory
    ON inventory.name = ex.equipment AND inventory.active = 1 AND inventory.available = 1
    WHERE ex.id = ? AND ex.active = 1 AND (inventory.id IS NOT NULL OR LOWER(ex.equipment) IN ('ohne gerät', 'körpergewicht')) LIMIT 1`, args: [exerciseId] });
  if (!exercise.rows[0]) return NextResponse.redirect(createReachableUrl(`/profil/${profileId}?fehler=unbekannte-uebung`, request));
  await startOrSwitchTraining({
    profileId,
    type: String(exercise.rows[0].type) as "strength" | "endurance",
    exerciseId,
    source: "nfc"
  });
  return NextResponse.redirect(createReachableUrl(`/uebung/${encodeURIComponent(exerciseId)}?profil=${profileId}&nfc=1`, request));
}
