import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { verifyFamilyHealthKey } from "@/lib/health-training-test";
import { healthEnergySchema, storeHealthEnergy } from "@/lib/health-energy";
import { readBoundedJson } from "@/lib/request-body";
import { writeAdminLog } from "@/lib/admin-log";

export async function POST(request: Request) {
  const key = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  if (!await verifyFamilyHealthKey(key)) return NextResponse.json({ error: "Familienschlüssel fehlt oder ist ungültig." }, { status: 401 });
  const importId = randomUUID();
  const body = await readBoundedJson(request, 4096, "Energiedaten sind zu groß.");
  if (body instanceof Response) return body;
  const parsed = healthEnergySchema.safeParse(body);
  if (!parsed.success) {
    const errors = parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`);
    await writeAdminLog("health.energy.failed", "error", "Aktive Energie abgelehnt.", { importId, errors });
    return NextResponse.json({ error: "Ungültige Energiedaten. Nur Tageswert in kcal, keine Health-Objekte senden.", importId, errors }, { status: 400 });
  }
  const result = await storeHealthEnergy(parsed.data);
  if (!result) {
    await writeAdminLog("health.energy.failed", "error", "Profil-ID nicht gefunden.", { importId });
    return NextResponse.json({ error: "Profil-ID nicht gefunden.", importId }, { status: 404 });
  }
  await writeAdminLog("health.energy.received", "info", "Apple Health · aktive kcal aktualisiert · ohne Wertung.", { importId, ...result });
  return NextResponse.json({ ok: true, importId, ...result }, { headers: { "Cache-Control": "no-store" } });
}
