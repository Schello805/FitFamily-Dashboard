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
    sql: `SELECT ts.id, ts.started_at, ts.ended_at, ts.status, ts.source, ts.edited, ts.recording_mode,
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
      source: row.source, recordingMode: row.recording_mode, edited: Boolean(row.edited), segments: []
    });
    if (row.segment_id) sessions.get(id)?.segments.push({
      id: row.segment_id, type: row.type, exerciseName: row.exercise_name, equipmentName: row.equipment_name,
      startedAt: row.segment_started_at, endedAt: row.segment_ended_at,
      ...(row.recording_mode === "health" ? { durationSeconds: 0 } : {})
    });
  }
  const health = await client.execute({sql:"SELECT * FROM health_workouts WHERE profile_id=? ORDER BY started_at DESC LIMIT 500",args:[profileId]});
  for (const row of health.rows) {
    const id=`health:${row.external_id}`;
    sessions.set(id,{id,startedAt:row.started_at,endedAt:row.ended_at,status:"completed",source:"health_import",edited:false,
      segments:[{id,type:row.training_type,exerciseName:row.source_name,equipmentName:null,startedAt:row.started_at,endedAt:row.ended_at,durationSeconds:Number(row.duration_seconds)}]});
  }
  const ordered=[...sessions.values()].sort((a,b)=>Date.parse(String(b.startedAt))-Date.parse(String(a.startedAt))).slice(0,500);
  return NextResponse.json({ sessions: ordered, equipmentStats: await getEquipmentStats(profileId) }, { headers: { "Cache-Control": "no-store" } });
}
