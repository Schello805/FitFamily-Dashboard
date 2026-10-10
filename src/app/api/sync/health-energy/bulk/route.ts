import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { verifyFamilyHealthKey } from "@/lib/health-training-test";
import { healthEnergySchema, storeHealthEnergy } from "@/lib/health-energy";
import { readBoundedJson } from "@/lib/request-body";
import { writeAdminLog } from "@/lib/admin-log";

export type DayRows = { energy: string[]; steps: string[]; training: string[] };
// A rolling 30 × 24-hour interval can touch yesterday's partial boundary and
// today's partial boundary, so it legitimately spans 31 calendar dates.
export const BULK_SYNC_MAX_CALENDAR_DAYS = 31;

export function validationMessages(error: { issues: { code: string; path: PropertyKey[]; message: string; errors?: { path: PropertyKey[]; message: string }[][] }[] }) {
  return error.issues.flatMap(issue => issue.code === "invalid_union" && issue.errors
    ? issue.errors.flat().map(nested => `${nested.path.join(".") || "Daten"}: ${nested.message}`)
    : [`${issue.path.join(".") || "Daten"}: ${issue.message}`]);
}

export function failedDayTranscript(date: string, rows: DayRows) {
  return {
    date,
    energyRows: rows.energy.slice(0, 8).map(row => row.slice(0, 500)),
    stepRows: rows.steps.slice(0, 8).map(row => row.slice(0, 500)),
    trainingRows: rows.training.slice(0, 8).map(row => row.slice(0, 500))
  };
}

export function receivedDaysTranscript(days: Map<string, DayRows>) {
  return [...days.entries()].sort(([left], [right]) => left.localeCompare(right)).slice(0, BULK_SYNC_MAX_CALENDAR_DAYS)
    .map(([date, rows]) => failedDayTranscript(date, rows));
}

class BulkDayValidationError extends Error {
  constructor(message: string, readonly transcript: ReturnType<typeof failedDayTranscript>, readonly receivedDays: ReturnType<typeof receivedDaysTranscript>) {
    super(message);
  }
}

export function parseRows(value: unknown, label: string, target: Map<string, DayRows>, kind: "energy" | "steps" | "training", fallbackSource: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} fehlen.`);
  const rows = value.trim().split(/\r?\n/);
  if (rows.length > 60000) throw new Error(`Zu viele ${label}; maximal 60.000.`);
  for (const row of rows) {
    const fields = row.split("\t");
    // A grouped-by-day Health result no longer has one individual source.
    // It is safe to use the declared source because the shortcut filters that
    // source before grouping. Ungrouped rows retain their actual source.
    if (fields.length !== 3 && fields.length !== 4) throw new Error(`${label} benötigen Tag, Wert, Einheit und optional Quelle.`);
    const [date, valuePart, unit, rowSource] = fields.map(field => field.trim());
    const source = rowSource || fallbackSource;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !valuePart || !unit || !source) throw new Error(`${label} enthalten eine unvollständige Zeile.`);
    const day = target.get(date) ?? { energy: [], steps: [], training: [] };
    day[kind].push(`${valuePart}\t${unit}\t${source}`);
    target.set(date, day);
  }
}

export async function POST(request: Request) {
  const key = request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
  const importId = randomUUID();
  if (!await verifyFamilyHealthKey(key)) return NextResponse.json({ error: "Familienschlüssel fehlt oder ist ungültig.", importId }, { status: 401 });
  const body = await readBoundedJson(request, 2_000_000, "Health-30-Tage-Daten sind zu groß.");
  if (body instanceof Response) return body;
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Ungültige 30-Tage-Daten.", importId }, { status: 400 });
  const input = body as Record<string, unknown>;
  if (typeof input.profileId !== "string" || typeof input.sourceName !== "string" || !input.sourceName.trim()) return NextResponse.json({ error: "Profil oder Datenquelle fehlt.", importId }, { status: 400 });
  try {
    const days = new Map<string, DayRows>();
    const sourceName = input.sourceName.trim();
    parseRows(input.sampleRows, "Energie-Messungen", days, "energy", sourceName);
    if (input.stepRows !== undefined && input.stepRows !== "") parseRows(input.stepRows, "Schritt-Messungen", days, "steps", sourceName);
    if (input.trainingRows !== undefined && input.trainingRows !== "") parseRows(input.trainingRows, "Trainingsminuten-Messungen", days, "training", sourceName);
    const dates = [...days.keys()].sort();
    if (dates.length > BULK_SYNC_MAX_CALENDAR_DAYS) throw new Error(`Maximal ${BULK_SYNC_MAX_CALENDAR_DAYS} Kalendertage senden.`);
    const saved = [];
    for (const date of dates) {
      const rows = days.get(date)!;
      if (!rows.energy.length) continue;
      const parsed = healthEnergySchema.safeParse({ profileId: input.profileId, date, sourceName, sampleRows: rows.energy.join("\n"), ...(rows.steps.length ? { stepRows: rows.steps.join("\n") } : {}), ...(rows.training.length ? { trainingRows: rows.training.join("\n") } : {}) });
      if (!parsed.success) throw new BulkDayValidationError(`${date}: ${validationMessages(parsed.error).join(" · ")}`, failedDayTranscript(date, rows), receivedDaysTranscript(days));
      const result = await storeHealthEnergy(parsed.data);
      if (!result) return NextResponse.json({ error: "Profil-ID nicht gefunden.", importId }, { status: 404 });
      saved.push({ date: result.date, activeEnergyKcal: result.activeEnergyKcal, stepCount: result.stepCount, trainingMinutes: result.trainingMinutes });
    }
    await writeAdminLog("health.energy.bulk.received", "info", "Apple Health · 30-Tage-Alltag mit Trainingsminuten aktualisiert.", { importId, profileId: input.profileId, sourceName: input.sourceName, days: saved });
    return NextResponse.json({ ok: true, importId, savedDays: saved.length, days: saved }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message.replaceAll(key, "[SCHLÜSSEL ENTFERNT]") : "Ungültige 30-Tage-Daten.";
    const transcript = error instanceof BulkDayValidationError ? { receivedDay: error.transcript, receivedDays: error.receivedDays } : {};
    await writeAdminLog("health.energy.bulk.failed", "error", "Apple Health · 30-Tage-Alltag abgelehnt; nichts gespeichert.", { importId, error: message, ...transcript });
    return NextResponse.json({ error: message, importId, ...transcript }, { status: 400 });
  }
}
