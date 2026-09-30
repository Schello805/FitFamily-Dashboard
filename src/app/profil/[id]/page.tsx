import { notFound } from "next/navigation";
import { getDashboardData } from "@/lib/dashboard";
import { ProfileView } from "@/components/profile-view";
import { EXERCISE_SEEDS } from "@/lib/domain";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = (await getDashboardData()).find((item) => item.id === id);
  if (!profile) notFound();
  const exercises = EXERCISE_SEEDS.map(([exerciseId, name, type, equipment]) => ({ id: exerciseId, name, type, equipment }));
  return <ProfileView initialProfile={profile} exercises={exercises} />;
}
