import { NextRequest } from "next/server";
import { z } from "zod";
import { getPairedProfile, isSameOriginRequest } from "@/lib/security";
import { scanTarget } from "@/lib/equipment-scan";
import { startOrSwitchTraining } from "@/lib/training";

const schema = z.object({ kind: z.enum(["geraet", "uebung"]), id: z.string().min(1).max(150) });
export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) return Response.json({ error: "Bitte den Geräte-Link in FitFamily öffnen." }, { status: 403 });
  const profileId = await getPairedProfile(request.cookies.get("ff_device")?.value);
  if (!profileId) return Response.json({ error: "Bitte dieses Handy zuerst mit deinem Profil koppeln." }, { status: 401 });
  const input = schema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "Ungültiger Geräte-Link." }, { status: 400 });
  try {
    const target = await scanTarget(input.data.kind, input.data.id);
    const result = await startOrSwitchTraining({ profileId, type: target.type, exerciseId: target.exerciseId, source: "nfc" });
    return Response.json({ ...result, profileId, name: target.name });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Training konnte nicht gestartet werden." }, { status: 409 });
  }
}
