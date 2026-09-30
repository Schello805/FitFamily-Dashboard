import packageJson from "../../package.json";
import { execFileSync } from "node:child_process";
import { getDashboardData } from "@/lib/dashboard";
import { getSetting } from "@/lib/db";
import { Dashboard } from "@/components/dashboard";
import { FirstRun } from "@/components/first-run";
import { headers } from "next/headers";

export const dynamic = "force-dynamic";

function getRevision() {
  if (process.env.NEXT_PUBLIC_APP_VERSION) return process.env.NEXT_PUBLIC_APP_VERSION;
  try {
    const commit = execFileSync("git", ["rev-parse", "--short=7", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    return `${packageJson.version}+${commit}`;
  } catch {
    return packageJson.version;
  }
}

export default async function Home() {
  if ((await getSetting("setup_complete")) !== "true") {
    const requestHeaders = await headers();
    const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
    const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
    const configuredUrl = process.env.APP_URL?.trim().replace(/\/$/, "");
    const baseUrl = configuredUrl || `${protocol}://${host}`;
    return <FirstRun setupUrl={`${baseUrl}/einrichtung`} />;
  }
  const profiles = await getDashboardData();
  return <Dashboard initialProfiles={profiles} version={getRevision()} />;
}
