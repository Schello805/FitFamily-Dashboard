import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getPairedProfile } from "@/lib/security";
import { getDashboardData } from "@/lib/dashboard";
import { DeviceTraining } from "@/components/device-training";
export const dynamic = "force-dynamic";
export default async function DeviceTrainingPage() {
  const id = await getPairedProfile((await cookies()).get("ff_device")?.value);
  if (!id) redirect("/geraet-koppeln?weiter=%2Ftraining%2Fam-geraet");
  const profile = (await getDashboardData()).find(p => p.id === id);
  if (!profile) redirect("/geraet-koppeln");
  return <DeviceTraining initialProfile={profile} />;
}
