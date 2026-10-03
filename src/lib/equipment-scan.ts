import { db } from "@/lib/db";
import type { TrainingType } from "@/lib/domain";

export async function equipmentScanConfig(id: string) {
  const client = await db();
  const result = await client.execute({ sql: "SELECT id, name, active, available FROM equipment_inventory WHERE id = ?", args: [id] });
  const item = result.rows[0];
  if (!item) return null;
  const exercises = await client.execute({ sql: "SELECT id, name FROM exercises WHERE equipment = ? COLLATE NOCASE AND active = 1 ORDER BY name", args: [String(item.name)] });
  const saved = await client.execute({ sql: "SELECT value FROM settings WHERE key = ?", args: [`equipment_scan:${id}`] });
  let config: { type?: TrainingType; exerciseId?: string | null } = {};
  try { config = JSON.parse(String(saved.rows[0]?.value ?? "{}")); } catch { /* Use defaults for older imports. */ }
  const type: TrainingType = config?.type === "strength" || config?.type === "endurance" ? config.type : /laufband|ergometer|treadmill|bike/i.test(String(item.name)) ? "endurance" : "strength";
  const choices = exercises.rows.map(e => ({ id: String(e.id), name: String(e.name) }));
  return { id, name: String(item.name), active: Boolean(item.active), available: Boolean(item.available), type, exerciseId: config?.exerciseId ?? choices[0]?.id ?? null, exercises: choices };
}

export async function scanTarget(kind: "geraet" | "uebung", id: string) {
  if (kind === "geraet") {
    const config = await equipmentScanConfig(id);
    if (!config?.active || !config.available) throw new Error("Dieses Gerät ist nicht verfügbar.");
    if (!config.exerciseId || !config.exercises.some(e => e.id === config.exerciseId)) throw new Error("Bitte zuerst in der Verwaltung eine aktive Standardübung für dieses Gerät auswählen.");
    return { type: config.type, exerciseId: config.exerciseId, name: config.name };
  }
  const client = await db();
  const result = await client.execute({ sql: "SELECT ex.id, ex.name, ex.equipment, ex.type FROM exercises ex WHERE ex.id = ? AND ex.active = 1", args: [id] });
  const exercise = result.rows[0];
  if (!exercise) throw new Error("Diese Übung ist nicht verfügbar.");
  if (["ohne gerät", "körpergewicht"].includes(String(exercise.equipment).toLowerCase())) return { type: String(exercise.type) as TrainingType, exerciseId: id, name: String(exercise.name) };
  const inventory = await client.execute({ sql: "SELECT id FROM equipment_inventory WHERE name = ? COLLATE NOCASE", args: [String(exercise.equipment)] });
  const config = inventory.rows[0] ? await equipmentScanConfig(String(inventory.rows[0].id)) : null;
  if (!config?.active || !config.available) throw new Error("Das Gerät dieser Übung ist nicht verfügbar.");
  return { type: config.type, exerciseId: id, name: `${config.name} · ${String(exercise.name)}` };
}
