import { db } from "@/lib/db";
import { AdminView } from "@/components/admin-view";
import { getAppRevision } from "@/lib/version";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const client = await db();
  const [exercises, inventory] = await Promise.all([
    client.execute("SELECT id, name, type, equipment, instructions, safety_notes, video_url, active FROM exercises ORDER BY active DESC, equipment, name"),
    client.execute("SELECT id, name, quantity, available, active, video_url, instructions, manual_pdf_url FROM equipment_inventory ORDER BY active DESC, name")
  ]);
  const rev = getAppRevision();
  return <AdminView
    exercises={exercises.rows.map((row) => ({ id: String(row.id), name: String(row.name), type: String(row.type) as "strength" | "endurance", equipment: String(row.equipment), instructions: row.instructions ? String(row.instructions) : "", safetyNotes: row.safety_notes ? String(row.safety_notes) : "", videoUrl: row.video_url ? String(row.video_url) : null, active: Boolean(row.active) }))}
    equipment={inventory.rows.map((row) => ({ id: String(row.id), name: String(row.name), quantity: Number(row.quantity), available: Boolean(row.available), active: Boolean(row.active), videoUrl: row.video_url ? String(row.video_url) : null, manualPdfUrl: row.manual_pdf_url ? String(row.manual_pdf_url) : null, instructions: row.instructions ? String(row.instructions) : null }))}
    initialVersion={rev.version}
    initialCommit={rev.commit}
  />;
}
