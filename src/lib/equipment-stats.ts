import { db } from "@/lib/db";

export type EquipmentStats = {
  id: string;
  name: string;
  seconds: number;
  strengthSeconds: number;
  enduranceSeconds: number;
  sessions: number;
  lastTrainedAt: string | null;
};

export async function getEquipmentStats(profileId: string): Promise<EquipmentStats[]> {
  const client = await db();
  const [inventory, segments] = await Promise.all([
    client.execute("SELECT id, name FROM equipment_inventory WHERE active = 1"),
    client.execute({
      sql: `SELECT ts.id session_id, sg.type, sg.started_at, sg.ended_at,
        ex.equipment, inventory.id equipment_id, inventory.name equipment_name
        FROM training_segments sg JOIN training_sessions ts ON ts.id = sg.session_id
        LEFT JOIN exercises ex ON ex.id = sg.exercise_id
        LEFT JOIN equipment_inventory inventory ON inventory.name = ex.equipment COLLATE NOCASE
        WHERE ts.profile_id = ? AND COALESCE(ts.source, '') <> 'apple_health'
          AND ts.recording_mode = 'app'
          AND ts.status IN ('completed', 'paused') AND sg.ended_at IS NOT NULL`,
      args: [profileId]
    })
  ]);
  const stats = new Map<string, EquipmentStats & { sessionIds: Set<string> }>();
  function entry(id: string, name: string) {
    if (!stats.has(id)) stats.set(id, { id, name, seconds: 0, strengthSeconds: 0, enduranceSeconds: 0, sessions: 0, lastTrainedAt: null, sessionIds: new Set() });
    return stats.get(id)!;
  }
  for (const item of inventory.rows) entry(String(item.id), String(item.name));
  for (const segment of segments.rows) {
    const seconds = (Date.parse(String(segment.ended_at)) - Date.parse(String(segment.started_at))) / 1000;
    if (!Number.isFinite(seconds) || seconds <= 0) continue;
    const name = String(segment.equipment_name ?? segment.equipment ?? "Ohne Gerätezuordnung");
    const id = segment.equipment_id ? String(segment.equipment_id) : `unassigned:${name.toLocaleLowerCase("de-DE")}`;
    const item = entry(id, name);
    item.seconds += seconds;
    if (segment.type === "strength") item.strengthSeconds += seconds;
    else item.enduranceSeconds += seconds;
    item.sessionIds.add(String(segment.session_id));
    const endedAt = String(segment.ended_at);
    if (!item.lastTrainedAt || Date.parse(endedAt) > Date.parse(item.lastTrainedAt)) item.lastTrainedAt = endedAt;
  }
  return [...stats.values()].map(({ sessionIds, ...item }) => ({ ...item, sessions: sessionIds.size }))
    .sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name, "de"));
}
