import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getEquipmentStats } from "@/lib/equipment-stats";
import { enforceSafetyPauses } from "@/lib/training";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  await enforceSafetyPauses();
  const client = await db();
  const result = await client.execute({
    sql: `SELECT ts.id, ts.started_at, ts.ended_at, ts.status, ts.source, ts.edited,
      sg.id segment_id, sg.type, sg.started_at segment_started_at, sg.ended_at segment_ended_at,
      ex.name exercise_name, ex.equipment equipment_name
      FROM training_sessions ts
      LEFT JOIN training_segments sg ON sg.session_id = ts.id
      LEFT JOIN exercises ex ON ex.id = sg.exercise_id
      WHERE ts.profile_id = ? AND COALESCE(ts.source, '') <> 'apple_health' ORDER BY ts.started_at DESC, sg.started_at ASC LIMIT 500`,
    args: [profileId]
  });
  const sessions = new Map<string, Record<string, unknown> & { segments: Record<string, unknown>[] }>();
  for (const row of result.rows) {
    const id = String(row.id);
    if (!sessions.has(id)) sessions.set(id, {
      id, startedAt: row.started_at, endedAt: row.ended_at, status: row.status,
      source: row.source, edited: Boolean(row.edited), segments: []
    });
    if (row.segment_id) sessions.get(id)?.segments.push({
      id: row.segment_id, type: row.type, exerciseName: row.exercise_name, equipmentName: row.equipment_name,
      startedAt: row.segment_started_at, endedAt: row.segment_ended_at
    });
  }
  return NextResponse.json({ sessions: [...sessions.values()], equipmentStats: await getEquipmentStats(profileId) }, { headers: { "Cache-Control": "no-store" } });
}
