import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { readBoundedJson } from "@/lib/request-body";
import { healthTrainingTestSchema, storeHealthTrainingTest, verifyFamilyHealthKey } from "@/lib/health-training-test";
import { writeAdminLog } from "@/lib/admin-log";

export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  if (!await verifyFamilyHealthKey(token)) return NextResponse.json({ error: "Familienschlüssel fehlt oder ist ungültig." }, { status: 401 });
  const importId = randomUUID();
  const body = await readBoundedJson(request, 64 * 1024, "Trainingsdaten sind zu groß (maximal 64 KiB).");
  if (body instanceof Response) return body;
  const parsed = healthTrainingTestSchema.safeParse(body);
  if (!parsed.success) {
    // Log only validation paths, never arbitrary payloads or credentials.
    const errors = parsed.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`);
    await writeAdminLog("health.training.test.failed", "error", "Health-Trainingstest: ungültige Zeiten.", { importId, errors });
    return NextResponse.json({ error: "Ungültige Trainingsdaten.", importId, errors }, { status: 400 });
  }
  const result = await storeHealthTrainingTest(parsed.data);
  if (!result) {
    await writeAdminLog("health.training.test.failed", "error", "Profil-ID nicht gefunden.", { importId, errors: ["Profil-ID bitte mit der Anzeige in der Verwaltung vergleichen."] });
    return NextResponse.json({ error: "Profil-ID nicht gefunden.", importId }, { status: 404 });
  }
  await writeAdminLog("health.training.test.received", "info", "Health-Trainingstest empfangen; noch keine Punkte gebucht.", { importId, ...result });
  return NextResponse.json({ importId, ...result }, { headers: { "Cache-Control": "no-store" } });
}
