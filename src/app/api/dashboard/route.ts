import { NextResponse } from "next/server";
import { getDashboardData } from "@/lib/dashboard";
import { enforceSafetyPauses } from "@/lib/training";

export const dynamic = "force-dynamic";

export async function GET() {
  await enforceSafetyPauses();
  return NextResponse.json({ profiles: await getDashboardData(), now: new Date().toISOString() });
}
