import { getDashboardData } from "@/lib/dashboard";
import { db } from "@/lib/db";
import { AdminView } from "@/components/admin-view";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const client = await db();
  const [exercises, inventory] = await Promise.all([
    client.execute("SELECT id, name, equipment, video_url FROM exercises ORDER BY equipment, name"),
    client.execute("SELECT id, name, quantity, available, video_url FROM equipment_inventory ORDER BY name")
  ]);
  return <AdminView
    profiles={(await getDashboardData()).map(({ id, name, score }) => ({ id, name, score }))}
    exercises={exercises.rows.map((row) => ({ id: String(row.id), name: String(row.name), equipment: String(row.equipment), videoUrl: row.video_url ? String(row.video_url) : null }))}
    equipment={inventory.rows.map((row) => ({ id: String(row.id), name: String(row.name), quantity: Number(row.quantity), available: Boolean(row.available), videoUrl: row.video_url ? String(row.video_url) : null }))}
  />;
}
