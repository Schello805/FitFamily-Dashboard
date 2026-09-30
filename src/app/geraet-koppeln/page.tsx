import { getDashboardData } from "@/lib/dashboard";
import { DevicePairing } from "@/components/device-pairing";

export const dynamic = "force-dynamic";

export default async function DevicePairingPage({ searchParams }: { searchParams: Promise<{ weiter?: string }> }) {
  const { weiter } = await searchParams;
  const profiles = (await getDashboardData()).map(({ id, name, color }) => ({ id, name, color }));
  return <DevicePairing profiles={profiles} nextPath={weiter?.startsWith("/") ? weiter : "/"} />;
}
