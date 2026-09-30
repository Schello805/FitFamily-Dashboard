import { notFound } from "next/navigation";
import { getDashboardData } from "@/lib/dashboard";
import { HistoryView } from "@/components/history-view";

export const dynamic = "force-dynamic";

export default async function HistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = (await getDashboardData()).find((item) => item.id === id);
  if (!profile) notFound();
  return <HistoryView profile={profile} />;
}
