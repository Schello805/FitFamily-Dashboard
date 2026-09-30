import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getPairedProfile } from "@/lib/security";
import { startOrSwitchTraining } from "@/lib/training";

export async function GET(request: Request, { params }: { params: Promise<{ exerciseId: string }> }) {
  const { exerciseId } = await params;
  const profileId = await getPairedProfile((await cookies()).get("ff_device")?.value);
  if (!profileId) {
    const target = encodeURIComponent(new URL(request.url).pathname);
    return NextResponse.redirect(new URL(`/geraet-koppeln?weiter=${target}`, request.url));
  }
  const client = await db();
  const exercise = await client.execute({ sql: "SELECT type FROM exercises WHERE id = ? LIMIT 1", args: [exerciseId] });
  if (!exercise.rows[0]) return NextResponse.redirect(new URL(`/profil/${profileId}?fehler=unbekannte-uebung`, request.url));
  await startOrSwitchTraining({
    profileId,
    type: String(exercise.rows[0].type) as "strength" | "endurance",
    exerciseId,
    source: "nfc"
  });
  return NextResponse.redirect(new URL(`/uebung/${encodeURIComponent(exerciseId)}?profil=${profileId}&nfc=1`, request.url));
}
