import { createHash, randomUUID } from "node:crypto";
import { isSameOriginRequest } from "@/lib/security";
import { readBoundedJson } from "@/lib/request-body";
import { healthTrainingSchema, bookHealthTraining } from "@/lib/health-training";
import { writeAdminLog } from "@/lib/admin-log";

export async function POST(request: Request, context: { params: Promise<{ profileId: string }> }) {
  if (!isSameOriginRequest(request)) return Response.json({ error: "Import nur aus der FitFamily-App erlaubt." }, { status: 403 });
  const { profileId } = await context.params;
  let body: unknown;
  try { body = await readBoundedJson(request, 131072, "Trainingsauswahl zu groß."); }
  catch { return Response.json({ error: "Ungültige oder zu große Trainingsauswahl." }, { status: 400 }); }
  if (body instanceof Response) return body;
  if (!body || typeof body !== "object" || !("workouts" in body) || !Array.isArray(body.workouts) || Object.keys(body).some(key => key !== "workouts")) {
    return Response.json({ error: "Ungültige Trainingsauswahl." }, { status: 400 });
  }
  const workouts = body.workouts.map(value => {
    if (!value || typeof value !== "object") return value;
    const w = value as Record<string, unknown>;
    const fingerprint = JSON.stringify([w.startedAt, w.endedAt, w.durationSeconds, w.sourceName, w.activityType]);
    return { ...w, externalId: createHash("sha256").update(fingerprint).digest("hex") };
  });
  const parsed = healthTrainingSchema.safeParse({ profileId, workouts });
  if (!parsed.success) return Response.json({ error: "Ungültige Trainingsdaten oder Trainingsart fehlt." }, { status: 400 });
  const result = await bookHealthTraining(parsed.data);
  if (!result) return Response.json({ error: "Profil nicht gefunden." }, { status: 404 });
  const importId = randomUUID();
  await writeAdminLog("health.training.received", result.conflicts ? "error" : "info", "Manueller Profilimport verarbeitet.", { importId, ...result });
  return Response.json({ importId, ...result }, { headers: { "Cache-Control": "no-store" } });
}
