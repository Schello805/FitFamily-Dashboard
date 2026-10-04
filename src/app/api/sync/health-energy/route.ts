import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { verifyFamilyHealthKey } from "@/lib/health-training-test";
import { healthEnergySchema, storeHealthEnergy } from "@/lib/health-energy";
import { readBoundedJson } from "@/lib/request-body";
import { writeAdminLog } from "@/lib/admin-log";

// Allowlist only the energy protocol, never headers or arbitrary request fields.
// Keep the transcript bounded and redact a key even if pasted into a value.
export function energyTranscript(body: unknown, key: string) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { format: "Kein JSON-Objekt" };
  const input = body as Record<string, unknown>;
  const received: Record<string, unknown> = {};
  for (const field of ["profileId", "date", "sourceName", "sampleRows", "activeEnergyKcal", "unit"]) {
    const value = input[field];
    if (typeof value === "string") received[field] = (key ? value.replaceAll(key, "[SCHLÜSSEL ENTFERNT]") : value).slice(0, field === "sampleRows" ? 12000 : 300);
    else if (typeof value === "number" || value === null) received[field] = value;
    else if (value !== undefined) received[field] = "[Unerwarteter Datentyp]";
  }
  return { received, sampleRowsCharacters: typeof input.sampleRows === "string" ? input.sampleRows.length : 0,
    transcriptTruncated: typeof input.sampleRows === "string" && input.sampleRows.length > 12000 };
}

export async function POST(request: Request) {
  const key = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  const importId = randomUUID();
  if (!await verifyFamilyHealthKey(key)) {
    await writeAdminLog("health.energy.failed", "error", "Energie-Übertragung: Familienschlüssel fehlt oder ist ungültig. Inhalt aus Sicherheitsgründen nicht protokolliert.", { importId, status: 401 });
    return NextResponse.json({ error: "Familienschlüssel fehlt oder ist ungültig.", importId }, { status: 401 });
  }
  const body = await readBoundedJson(request, 65536, "Energiedaten sind zu groß.");
  if (body instanceof Response) {
    await writeAdminLog("health.energy.failed", "error", "Energie-Übertragung zu groß; nichts gespeichert.", { importId, status: body.status });
    return body;
  }
  const transcript = energyTranscript(body, key);
  const parsed = healthEnergySchema.safeParse(body);
  if (!parsed.success) {
    const errors = parsed.error.issues.flatMap(issue => issue.code === "invalid_union"
      ? issue.errors.flat().map(error => `${error.path.join(".")}: ${error.message}`)
      : [`${issue.path.join(".")}: ${issue.message}`]).map(message => key ? message.replaceAll(key, "[SCHLÜSSEL ENTFERNT]") : message);
    await writeAdminLog("health.energy.failed", "error", "Aktive Energie abgelehnt; nichts gespeichert.", { importId, errors, ...transcript });
    return NextResponse.json({ error: "Ungültige Energiedaten. Tageswert oder Messwert-Texte in kcal senden, keine Health-Objekte.", importId, errors }, { status: 400 });
  }
  const result = await storeHealthEnergy(parsed.data);
  if (!result) {
    await writeAdminLog("health.energy.failed", "error", "Profil-ID nicht gefunden.", { importId, ...transcript });
    return NextResponse.json({ error: "Profil-ID nicht gefunden.", importId }, { status: 404 });
  }
  await writeAdminLog("health.energy.received", "info", "Apple Health · aktive kcal aktualisiert · ohne Wertung.", { importId, ...transcript, stored: result, ...result });
  return NextResponse.json({ ok: true, importId, ...result }, { headers: { "Cache-Control": "no-store" } });
}
