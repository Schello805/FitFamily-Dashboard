import { getDashboardData } from "@/lib/dashboard";
import { AdminView } from "@/components/admin-view";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  return <AdminView profiles={(await getDashboardData()).map(({ id, name, score }) => ({ id, name, score }))} />;
}
