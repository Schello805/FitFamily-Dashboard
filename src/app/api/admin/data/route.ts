import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyAdminPinOrReject } from "@/lib/security";
import { writeAdminLog } from "@/lib/admin-log";
import { MAX_DATA_IMPORT_BYTES, DATA_IMPORT_ORDER, DATA_TABLE_SPECS, DATA_TRANSFER_TABLES, isPortableSetting, type DataTransferTable } from "@/lib/data-transfer-schema";
import { readBoundedJson } from "@/lib/request-body";
import { AVATAR_DESIGN_IDS } from "@/lib/domain";
import { isAllowedVideoUrl } from "@/lib/exercise-video";
import { manualPdfDataSchema, manualPdfUrlSchema } from "@/lib/manual-pdf";
import { equipmentManualUrl, isStoredManualUrl } from "@/lib/manual-pdf-shared";

type Cell = string | number | boolean | null;
type Row = Record<string, Cell>;

const text = z.string().max(2_000_000);
const identifier = z.string().min(1).max(200);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}, "Ungültiges Kalenderdatum.");
const isoTimestamp = z.string().datetime({ offset: true });
const normalizeTimestamp = (value: string) => /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value) ? `${value.replace(" ", "T")}Z` : value;
const timestamp = z.string().refine((value) => isoTimestamp.safeParse(normalizeTimestamp(value)).success, "Ungültiger Zeitstempel.")
  .transform((value) => new Date(normalizeTimestamp(value)).toISOString());
const trainingTimestamp = timestamp.refine((value) => Date.parse(value) <= Date.now() + 60_000, "Training darf nicht in der Zukunft liegen.");
const flag = z.union([z.literal(0), z.literal(1), z.boolean()]).transform(Number);
const metadata = { created_at: timestamp.optional(), updated_at: timestamp.optional() };
const nullableText = text.nullable().optional();
const videoUrl = z.string().max(500).refine((value) => isAllowedVideoUrl(value), "Video muss ein gültiger HTTPS-Link zu YouTube sein.").nullable().optional();
// Compatibility only: retain archived data when restoring backups from older versions.
// These fields are not read by the dashboard or used in training calculations.
const dailyFields = {
  move_calories: z.number().nonnegative().max(100_000), move_goal: z.number().positive().max(100_000),
  exercise_minutes: z.number().nonnegative().max(1440), exercise_goal: z.number().positive().max(1440),
  stand_hours: z.number().nonnegative().max(24), stand_goal: z.number().positive().max(24),
  step_count: z.number().int().nonnegative().max(200_000), walking_running_distance_km: z.number().nonnegative().max(500),
  cycling_distance_km: z.number().nonnegative().max(2000), flights_climbed: z.number().nonnegative().max(1000)
};
const rowSchemas: Record<DataTransferTable, z.ZodType> = {
  profiles: z.object({
    id: identifier, name: z.string().min(1).max(80), color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    avatar: z.enum([...AVATAR_DESIGN_IDS, "female", "male", "neutral"]), email: z.string().email().nullable().optional(),
    custom_avatar_data: nullableText, starting_fitness: z.number().int().min(1).max(7).optional(),
    starting_fitness_stage: z.number().int().min(1).max(7).optional(),
    birth_date: date.refine((value) => value <= new Date().toISOString().slice(0, 10), "Geburtstag darf nicht in der Zukunft liegen.").nullable().optional(),
    score_baseline: z.number().nonnegative().finite().optional(), score_reset_at: timestamp.nullable().optional(),
    target_reset_at: timestamp.nullable().optional(), goal: text.optional(), ...metadata
  }),
  exercises: z.object({ id: identifier, name: z.string().min(1).max(200), type: z.enum(["strength", "endurance"]), equipment: text.min(1),
    instructions: nullableText, safety_notes: nullableText, video_url: videoUrl, active: flag.optional() }),
  equipment_inventory: z.object({ id: identifier, name: z.string().min(1).max(200), quantity: z.number().int().min(1).max(8).optional(),
    available: flag.optional(), active: flag.optional(), video_url: videoUrl, instructions: nullableText, manual_pdf_url: manualPdfUrlSchema,
    manual_pdf_data: manualPdfDataSchema.nullable().optional(), manual_pdf_name: z.string().max(200).nullable().optional(), ...metadata })
    .refine(row => !row.manual_pdf_url || !isStoredManualUrl(row.manual_pdf_url) || (row.manual_pdf_url === equipmentManualUrl(row.id) && Boolean(row.manual_pdf_data)), "Die gespeicherte PDF-Anleitung fehlt oder gehört zu einem anderen Gerät."),
  training_sessions: z.object({ id: identifier, profile_id: identifier, started_at: trainingTimestamp, ended_at: trainingTimestamp.nullable().optional(),
    status: z.enum(["active", "paused", "completed"]), source: z.enum(["touch", "mobile", "nfc", "manual", "apple_health"]).optional(),
    external_id: identifier.nullable().optional(), health_title: nullableText,
    health_calories: z.number().nonnegative().max(100_000).nullable().optional(), health_distance_km: z.number().nonnegative().max(2_000).nullable().optional(),
    edited: flag.optional(), created_at: timestamp.optional() }),
  training_segments: z.object({ id: identifier, session_id: identifier, type: z.enum(["strength", "endurance"]), exercise_id: identifier.nullable().optional(),
    started_at: trainingTimestamp, ended_at: trainingTimestamp.nullable().optional() }),
  training_plans: z.object({ id: identifier, profile_id: identifier, title: z.string().min(1).max(200), goal: text.min(1), target_date: date.nullable().optional(),
    status: z.enum(["active", "archived"]).optional(), plan_json: text.refine((value) => {
      try { const plan = JSON.parse(value); return plan !== null && typeof plan === "object" && !Array.isArray(plan); } catch { return false; }
    }, "Trainingsplan muss ein JSON-Objekt enthalten."), ...metadata }),
  apple_health_daily: z.object({ profile_id: identifier, date, ...dailyFields, updated_at: timestamp.optional() }).partial().required({ profile_id: true, date: true }),
  apple_health_ignored_workouts: z.object({ profile_id: identifier, external_id: identifier, deleted_at: timestamp.optional() }),
  settings: z.object({ key: z.string().min(1).max(200), value: text, updated_at: timestamp.optional() })
};

function normalize(value: unknown) {
  const errors: string[] = [];
  const rows: Record<string, Row[]> = {};
  const counts: Record<string, number> = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return { errors: ["Datei enthält kein JSON-Objekt."], rows, counts };
  const bundle = value as Record<string, unknown>;
  if (bundle.format !== "fitfamily-export") errors.push("Das Dateiformat ist kein FitFamily-Export.");
  if (bundle.version !== 1) errors.push("Diese Exportversion wird nicht unterstützt.");
  const data = bundle.data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return { errors: [...errors, "Der Datenbereich fehlt oder ist ungültig."], rows, counts };
  const source = data as Record<string, unknown>;
  const receivedRows = DATA_TRANSFER_TABLES.reduce((sum, table) => sum + (Array.isArray(source[table]) ? source[table].length : 0), 0);
  if (receivedRows > 25_000) return { errors: [...errors, "Der Export enthält mehr als 25.000 Datensätze und kann nicht importiert werden."], rows, counts };

  for (const table of DATA_TRANSFER_TABLES) {
    const spec: { columns: readonly string[]; keys: readonly string[]; required: readonly string[] } = DATA_TABLE_SPECS[table];
    const list = source[table];
    if (list === undefined && table !== "profiles") {
      rows[table] = [];
      counts[table] = 0;
      continue;
    }
    if (!Array.isArray(list)) {
      errors.push(`„${table}“ muss eine Liste sein.`);
      rows[table] = [];
      counts[table] = 0;
      continue;
    }
    rows[table] = [];
    const seenKeys = new Set<string>();
    for (const [index, item] of list.entries()) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        errors.push(`${table}, Zeile ${index + 1}: ungültiger Datensatz.`);
        continue;
      }
      const sourceRow = item as Record<string, unknown>;
      if (table === "settings" && typeof sourceRow.key === "string" && !isPortableSetting(sourceRow.key)) continue;
      const parsed = rowSchemas[table].safeParse(sourceRow);
      if (!parsed.success) {
        errors.push(...parsed.error.issues.map((issue) => `${table}, Zeile ${index + 1}, ${issue.path.join(".")}: ${issue.message}`));
        continue;
      }
      const row = parsed.data as Row;
      const key = JSON.stringify(spec.keys.map((field) => row[field]));
      if (seenKeys.has(key)) errors.push(`${table}, Zeile ${index + 1}: Datensatzschlüssel ist mehrfach vorhanden.`);
      seenKeys.add(key);
      rows[table].push(row);
    }
    counts[table] = rows[table].length;
  }
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (total > 25_000) errors.push("Der Export enthält mehr als 25.000 Datensätze und kann nicht importiert werden.");
  return { errors, rows, counts };
}

async function checkReferences(rows: Record<string, Row[]>) {
  const client = await db();
  const [profiles, sessions, exercises, segments, equipment] = await Promise.all([
    client.execute("SELECT id FROM profiles"),
    client.execute("SELECT * FROM training_sessions"),
    client.execute("SELECT id FROM exercises"),
    client.execute("SELECT * FROM training_segments"),
    client.execute("SELECT id, name FROM equipment_inventory")
  ]);
  const profileIds = new Set([...profiles.rows.map((row) => String(row.id)), ...rows.profiles.map((row) => String(row.id))]);
  const sessionIds = new Set([...sessions.rows.map((row) => String(row.id)), ...rows.training_sessions.map((row) => String(row.id))]);
  const exerciseIds = new Set([...exercises.rows.map((row) => String(row.id)), ...rows.exercises.map((row) => String(row.id))]);
  const errors: string[] = [];
  for (const table of ["training_sessions", "training_plans", "apple_health_daily", "apple_health_ignored_workouts"]) {
    for (const [index, row] of rows[table].entries()) {
      if (typeof row.profile_id === "string" && !profileIds.has(row.profile_id)) errors.push(`${table}, Zeile ${index + 1}: zugehöriges Profil fehlt.`);
    }
  }
  for (const [index, row] of rows.training_segments.entries()) {
    if (typeof row.session_id === "string" && !sessionIds.has(row.session_id)) errors.push(`training_segments, Zeile ${index + 1}: Trainingseinheit fehlt.`);
    if (typeof row.exercise_id === "string" && row.exercise_id && !exerciseIds.has(row.exercise_id)) errors.push(`training_segments, Zeile ${index + 1}: Übung fehlt.`);
  }
  const mergedRows = (existing: Row[], incoming: Row[]) => {
    const result = new Map(existing.map((row) => [String(row.id), row]));
    for (const row of incoming) result.set(String(row.id), { ...result.get(String(row.id)), ...row });
    return result;
  };
  const effectiveSessions = mergedRows(sessions.rows as unknown as Row[], rows.training_sessions);
  const effectiveSegments = mergedRows(segments.rows as unknown as Row[], rows.training_segments);
  const segmentsBySession = new Map<string, Row[]>();
  for (const segment of effectiveSegments.values()) {
    const id = String(segment.session_id);
    const children = segmentsBySession.get(id) ?? [];
    children.push(segment);
    segmentsBySession.set(id, children);
  }
  const oldSegments = new Map(segments.rows.map((segment) => [String(segment.id), segment]));
  const touchedSessions = new Set([...rows.training_sessions.map((row) => String(row.id)), ...rows.training_segments.map((row) => String(row.session_id))]);
  // Moving a segment also changes the consistency of its former session.
  for (const row of rows.training_segments) {
    const previous = oldSegments.get(String(row.id));
    if (previous) touchedSessions.add(String(previous.session_id));
  }
  const touchedProfiles = new Set<string>();
  const parseTime = (value: Cell) => Date.parse(normalizeTimestamp(String(value)));
  const latestAllowedTime = Date.now() + 60_000;
  for (const id of touchedSessions) {
    const session = effectiveSessions.get(id);
    if (!session) continue;
    touchedProfiles.add(String(session.profile_id));
    const start = parseTime(session.started_at);
    const end = session.ended_at == null ? null : parseTime(session.ended_at);
    const children = (segmentsBySession.get(id) ?? []).sort((a, b) => parseTime(a.started_at) - parseTime(b.started_at));
    if (!Number.isFinite(start) || start > latestAllowedTime || (end !== null && (!Number.isFinite(end) || end > latestAllowedTime || end < start || end - start > 86_400_000))) errors.push(`training_sessions, ${id}: ungültiger Trainingszeitraum (maximal 24 Stunden).`);
    if ((session.status === "active") !== (end === null)) errors.push(`training_sessions, ${id}: Status und Endzeit passen nicht zusammen.`);
    if (!children.length) errors.push(`training_sessions, ${id}: zugehörige Trainingssegmente fehlen.`);
    let previousEnd = start;
    let openSegments = 0;
    for (const child of children) {
      const childStart = parseTime(child.started_at);
      const childEnd = child.ended_at == null ? null : parseTime(child.ended_at);
      if (!Number.isFinite(childStart) || childStart > latestAllowedTime || childStart < start || (childEnd !== null && (!Number.isFinite(childEnd) || childEnd > latestAllowedTime || childEnd < childStart || childEnd - childStart > 86_400_000)) || (end !== null && (childStart > end || childEnd === null || childEnd > end))) {
        errors.push(`training_segments, ${child.id}: Segment liegt außerhalb seiner Trainingseinheit oder hat ungültige Zeitangaben.`);
      }
      if (childStart < previousEnd) errors.push(`training_segments, ${child.id}: Segmente derselben Einheit überlappen sich.`);
      previousEnd = childEnd ?? Number.POSITIVE_INFINITY;
      if (childEnd === null) openSegments++;
    }
    if (session.status === "active" && openSegments !== 1) errors.push(`training_sessions, ${id}: eine aktive Einheit braucht genau ein offenes Segment.`);
  }
  const activeCounts = new Map<string, number>();
  const externalIds = new Map<string, number>();
  for (const session of effectiveSessions.values()) {
    const profileId = String(session.profile_id);
    if (session.status === "active") activeCounts.set(profileId, (activeCounts.get(profileId) ?? 0) + 1);
    if (session.source === "apple_health" && session.external_id != null) {
      const key = JSON.stringify([profileId, session.external_id]);
      externalIds.set(key, (externalIds.get(key) ?? 0) + 1);
    }
  }
  for (const profileId of touchedProfiles) if ((activeCounts.get(profileId) ?? 0) > 1) errors.push(`training_sessions: Profil ${profileId} hat mehrere aktive Einheiten.`);
  const effectiveEquipment = mergedRows(equipment.rows as unknown as Row[], rows.equipment_inventory);
  const equipmentNames = new Map<Cell, number>();
  for (const row of effectiveEquipment.values()) equipmentNames.set(row.name, (equipmentNames.get(row.name) ?? 0) + 1);
  for (const row of rows.equipment_inventory) {
    if ((equipmentNames.get(row.name) ?? 0) > 1) errors.push(`equipment_inventory, ${row.id}: Gerätename ist bereits vorhanden.`);
  }
  for (const row of rows.training_sessions) {
    const session = effectiveSessions.get(String(row.id));
    if (session?.source === "apple_health" && session.external_id != null && (externalIds.get(JSON.stringify([session.profile_id, session.external_id])) ?? 0) > 1) {
      errors.push(`training_sessions, ${row.id}: Apple-Health-Workout ist für dieses Profil bereits vorhanden.`);
    }
  }
  return errors;
}

async function mergeData(rows: Record<string, Row[]>) {
  const client = await db();
  const statements: { sql: string; args: (string | number | null)[] }[] = [];
  for (const table of DATA_IMPORT_ORDER) {
    const spec: { columns: readonly string[]; keys: readonly string[]; required: readonly string[] } = DATA_TABLE_SPECS[table];
    for (const row of rows[table]) {
      const columns = spec.columns.filter((column) => column in row);
      const keys = spec.keys.filter((key) => columns.includes(key));
      if (!columns.length || !keys.length) continue;
      const updates = columns.filter((column) => !keys.includes(column));
      const conflict = updates.length ? `DO UPDATE SET ${updates.map((column) => `${column} = excluded.${column}`).join(", ")}` : "DO NOTHING";
      statements.push({
        sql: `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")}) ON CONFLICT(${keys.join(", ")}) ${conflict}`,
        args: columns.map((column) => row[column] as string | number | null)
      });
    }
  }
  if (statements.length) await client.batch(statements, "write");
}

export async function POST(request: Request) {
  const payload = await readBoundedJson(request, MAX_DATA_IMPORT_BYTES, "Die Datei ist größer als 20 MiB. Bitte die Datensicherung verkleinern.");
  if (payload instanceof Response) return payload;
  const body = payload as { pin?: unknown; action?: unknown; backup?: unknown } | null;
  const parsedPin = z.string().regex(/^\d{4}$/).or(z.literal("")).optional().safeParse(body?.pin);
  if (!body || !parsedPin.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const pinError = await verifyAdminPinOrReject(parsedPin.data, request);
  if (pinError) return pinError;
  if (body.action !== "validate" && body.action !== "import") return NextResponse.json({ error: "Unbekannte Datenaktion." }, { status: 400 });
  const normalized = normalize(body.backup);
  if (!normalized.errors.length) normalized.errors.push(...await checkReferences(normalized.rows));
  const total = Object.values(normalized.counts).reduce((sum, count) => sum + count, 0);
  if (body.action === "validate") return NextResponse.json({ valid: normalized.errors.length === 0, errors: normalized.errors, counts: normalized.counts, total });
  if (normalized.errors.length) return NextResponse.json({ error: "Die Datei hat die Prüfung nicht bestanden.", errors: normalized.errors }, { status: 400 });
  try {
    await mergeData(normalized.rows);
    await writeAdminLog("admin.import.success", "info", "Geprüfte FitFamily-Daten zusammengeführt.", { counts: normalized.counts, total }).catch(() => undefined);
    return NextResponse.json({ ok: true, counts: normalized.counts, total, message: "Daten wurden ergänzt oder aktualisiert. Nicht enthaltene lokale Einträge blieben bestehen." });
  } catch (error) {
    await writeAdminLog("admin.import.error", "error", error instanceof Error ? error.message : "Datenimport fehlgeschlagen.").catch(() => undefined);
    return NextResponse.json({ error: "Import fehlgeschlagen. Die Datenbank hat die Änderungen zurückgewiesen." }, { status: 500 });
  }
}
