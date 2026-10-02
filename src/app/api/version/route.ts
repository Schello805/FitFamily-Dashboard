import { NextResponse } from "next/server";
import { getAppRevision } from "@/lib/version";

export async function GET() {
  return NextResponse.json(getAppRevision(), {
    headers: { "Cache-Control": "no-store, max-age=0" }
  });
}
