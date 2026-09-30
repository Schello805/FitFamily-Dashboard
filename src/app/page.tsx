import packageJson from "../../package.json";
import { getDashboardData } from "@/lib/dashboard";
import { getSetting } from "@/lib/db";
import { Dashboard } from "@/components/dashboard";
import { FirstRun } from "@/components/first-run";

export const dynamic = "force-dynamic";

export default async function Home() {
  if ((await getSetting("setup_complete")) !== "true") {
    return <FirstRun setupUrl={`${process.env.APP_URL ?? "http://fitfamily.local:3000"}/einrichtung`} />;
  }
  const profiles = await getDashboardData();
  return <Dashboard initialProfiles={profiles} version={process.env.NEXT_PUBLIC_APP_VERSION ?? packageJson.version} />;
}
