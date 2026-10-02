import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyAdminPin } from "@/lib/security";
import { writeAdminLog } from "@/lib/admin-log";

type Cell = string | number | boolean | null;
type Row = Record<string, Cell>;
type Spec = { columns: string[]; keys: string[]; required: string[] };

const specs: Record<string, Spec> = {
  profiles: { columns: ["id", "name", "color", "avatar", "starting_fitness", "birth_date", "score_baseline", "score_reset_at", "target_reset_at", "goal", "created_at", "updated_at"], keys: ["id"], required: ["id", "name", "color", "avatar"] },
  exercises: { columns: ["id", "name", "type", "equipment", "instructions", "safety_notes", "video_url", "active"], keys: ["id"], required: ["id", "name", "type", "equipment"] },
  equipment_inventory: { columns: ["id", "name", "quantity", "available", "active", "created_at", "updated_at", "video_url"], keys: ["id"], required: ["id", "name"] },
  training_sessions: { columns: ["id", "profile_id", "started_at", "ended_at", "status", "source", "external_id", "health_title", "health_calories", "health_distance_km", "edited", "created_at"], keys: ["id"], required: ["id", "profile_id", "started_at", "status"] },
  training_segments: { columns: ["id", "session_id", "type", "exercise_id", "started_at", "ended_at"], keys: ["id"], required: ["id", "session_id", "type", "started_at"] },
  training_plans: { columns: ["id", "profile_id", "title", "goal", "target_date", "status", "plan_json", "created_at", "updated_at"], keys: ["id"], required: ["id", "profile_id", "title", "goal", "plan_json"] },
  apple_health_daily: { columns: ["profile_id", "date", "move_calories", "move_goal", "exercise_minutes", "exercise_goal", "stand_hours", "stand_goal", "step_count", "walking_running_distance_km", "flights_climbed", "updated_at"], keys: ["profile_id", "date"], required: ["profile_id", "date"] },
  apple_health_ignored_workouts: { columns: ["profile_id", "external_id", "deleted_at"], keys: ["profile_id", "external_id"], required: ["profile_id", "external_id"] },
  settings: { columns: ["key", "value", "updated_at"], keys: ["key"], required: ["key", "value"] }
};
const blockedSettings = new Set(["admin_pin_hash", "nas_backup_key", "nas_backup_path"]);

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

  for (const [table, spec] of Object.entries(specs)) {
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
    for (const [index, item] of list.entries()) {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        errors.push(`${table}, Zeile ${index + 1}: ungültiger Datensatz.`);
        continue;
      }
      const sourceRow = item as Record<string, unknown>;
      if (table === "settings" && typeof sourceRow.key === "string" && (blockedSettings.has(sourceRow.key) || sourceRow.key.startsWith("ai_key_"))) continue;
      for (const field of spec.required) {
        if (!(field in sourceRow) || sourceRow[field] === null || sourceRow[field] === "") errors.push(`${table}, Zeile ${index + 1}: Pflichtfeld „${field}“ fehlt.`);
      }
      const row: Row = {};
      for (const column of spec.columns) {
        const cell = sourceRow[column];
        if (cell === undefined) continue;
        if (cell !== null && typeof cell !== "string" && typeof cell !== "number" && typeof cell !== "boolean") {
          errors.push(`${table}, Zeile ${index + 1}: Feld „${column}“ hat einen ungültigen Wert.`);
          continue;
        }
        if (typeof cell === "number" && !Number.isFinite(cell)) errors.push(`${table}, Zeile ${index + 1}: Feld „${column}“ ist keine gültige Zahl.`);
        else if (typeof cell === "string" && cell.length > 2_000_000) errors.push(`${table}, Zeile ${index + 1}: Feld „${column}“ ist zu groß.`);
        else row[column] = typeof cell === "boolean" ? Number(cell) : cell;
      }
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
  const [profiles, sessions, exercises] = await Promise.all([
    client.execute("SELECT id FROM profiles"),
    client.execute("SELECT id FROM training_sessions"),
    client.execute("SELECT id FROM exercises")
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
  return errors;
}

async function mergeData(rows: Record<string, Row[]>) {
  const client = await db();
  const order = ["profiles", "exercises", "equipment_inventory", "training_sessions", "training_plans", "training_segments", "apple_health_daily", "apple_health_ignored_workouts", "settings"];
  const statements: { sql: string; args: (string | number | null)[] }[] = [];
  for (const table of order) {
    const spec = specs[table];
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
  if (Number(request.headers.get("content-length") ?? 0) > 15 * 1024 * 1024) return NextResponse.json({ error: "Die Datei ist größer als 15 MB." }, { status: 413 });
  const body = await request.json().catch(() => null) as { pin?: unknown; action?: unknown; backup?: unknown } | null;
  if (!body || typeof body.pin !== "string" || !/^\d{4}$/.test(body.pin) || !(await verifyAdminPin(body.pin))) return NextResponse.json({ error: "Eltern-PIN ist nicht richtig." }, { status: 401 });
  if (body.action !== "validate" && body.action !== "import") return NextResponse.json({ error: "Unbekannte Datenaktion." }, { status: 400 });
  const normalized = normalize(body.backup);
  if (!normalized.errors.length) normalized.errors.push(...await checkReferences(normalized.rows));
  const total = Object.values(normalized.counts).reduce((sum, count) => sum + count, 0);
  if (body.action === "validate") return NextResponse.json({ valid: normalized.errors.length === 0, errors: normalized.errors, counts: normalized.counts, total });
  if (normalized.errors.length) return NextResponse.json({ error: "Die Datei hat die Prüfung nicht bestanden.", errors: normalized.errors }, { status: 400 });
  try {
    await mergeData(normalized.rows);
    await writeAdminLog("admin.import.success", "info", "Geprüfte FitFamily-Daten zusammengeführt.", { counts: normalized.counts, total });
    return NextResponse.json({ ok: true, counts: normalized.counts, total, message: "Daten wurden ergänzt oder aktualisiert. Nicht enthaltene lokale Einträge blieben bestehen." });
  } catch (error) {
    await writeAdminLog("admin.import.error", "error", error instanceof Error ? error.message : "Datenimport fehlgeschlagen.").catch(() => undefined);
    return NextResponse.json({ error: "Import fehlgeschlagen. Die Datenbank hat die Änderungen zurückgewiesen." }, { status: 500 });
  }
}
