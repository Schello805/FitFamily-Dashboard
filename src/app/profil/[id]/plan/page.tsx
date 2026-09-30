import { notFound } from "next/navigation";
import { getDashboardData } from "@/lib/dashboard";
import { GOALS } from "@/lib/domain";
import { PlanView } from "@/components/plan-view";

export const dynamic = "force-dynamic";

export default async function PlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = (await getDashboardData()).find((item) => item.id === id);
  if (!profile) notFound();
  return <PlanView profile={profile} goals={[...GOALS]} />;
}
