import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/dashboard";
import { enforceSafetyPauses } from "@/lib/training";
import { getDisplaySettings } from "@/lib/display-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  await enforceSafetyPauses();
  const [profiles, displaySettings] = await Promise.all([
    getDashboardData(),
    getDisplaySettings()
  ]);
  return NextResponse.json({ profiles, displaySettings, now: new Date().toISOString() });
}
