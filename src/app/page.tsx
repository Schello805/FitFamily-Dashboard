import packageJson from "../../package.json";
import { execFileSync } from "node:child_process";
import { getDashboardData } from "@/lib/dashboard";
import { getSetting } from "@/lib/db";
import { Dashboard } from "@/components/dashboard";
import { FirstRun } from "@/components/first-run";
import { getMobileReachableBaseUrl } from "@/lib/server-url";

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
    const baseUrl = getMobileReachableBaseUrl();
    const setupUrl = `${baseUrl}/einrichtung`;
    const { default: QRCode } = await import("qrcode");
    const qr = await QRCode.toDataURL(setupUrl, { width: 480, margin: 2, color: { dark: "#071316", light: "#ffffff" } });
    return <FirstRun setupUrl={setupUrl} qr={qr} />;
  }
  const profiles = await getDashboardData();
  return <Dashboard initialProfiles={profiles} version={getRevision()} />;
}
