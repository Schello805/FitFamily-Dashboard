import { notFound } from "next/navigation";
import { getDashboardData } from "@/lib/dashboard";
import { ProfileView } from "@/components/profile-view";
import { db } from "@/lib/db";
import { getMobileReachableBaseUrl } from "@/lib/server-url";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = (await getDashboardData()).find((item) => item.id === id);
  if (!profile) notFound();
  const client = await db();
  const result = await client.execute(`SELECT ex.id, ex.name, ex.type, ex.equipment FROM exercises ex
    LEFT JOIN equipment_inventory inv ON inv.name = ex.equipment
    WHERE ex.active = 1 AND ((inv.active = 1 AND inv.available = 1) OR LOWER(ex.equipment) IN ('ohne gerät', 'körpergewicht'))
    ORDER BY ex.equipment, ex.name`);
  const exercises = result.rows.map((row) => ({ id: String(row.id), name: String(row.name), type: String(row.type), equipment: String(row.equipment) }));
  const serverBaseUrl = getMobileReachableBaseUrl();
  return <ProfileView initialProfile={profile} exercises={exercises} serverBaseUrl={serverBaseUrl} />;
}
