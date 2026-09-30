import { getDashboardData } from "@/lib/dashboard";
import { getSetting } from "@/lib/db";
import { Dashboard } from "@/components/dashboard";
import { FirstRun } from "@/components/first-run";
import { getMobileReachableBaseUrl } from "@/lib/server-url";
import { getAppRevision } from "@/lib/version";

export const dynamic = "force-dynamic";

export default async function Home() {
  if ((await getSetting("setup_complete")) !== "true") {
    const baseUrl = getMobileReachableBaseUrl();
    const setupUrl = `${baseUrl}/einrichtung`;
    const { default: QRCode } = await import("qrcode");
    const qr = await QRCode.toDataURL(setupUrl, { width: 480, margin: 2, color: { dark: "#071316", light: "#ffffff" } });
    return <FirstRun setupUrl={setupUrl} qr={qr} />;
  }
  const profiles = await getDashboardData();
  const baseUrl = getMobileReachableBaseUrl();
  const { default: QRCode } = await import("qrcode");
  const mobileQr = await QRCode.toDataURL(baseUrl, {
    width: 360,
    margin: 1,
    color: { dark: "#06191d", light: "#ffffff" }
  });
  const revision = getAppRevision();
  return <Dashboard initialProfiles={profiles} version={revision.version} commitUrl={revision.commitUrl} mobileQr={mobileQr} mobileUrl={baseUrl} />;
}
