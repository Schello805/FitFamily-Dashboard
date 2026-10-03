import { NextResponse } from "next/server";

export async function GET(request: Request, { params }: { params: Promise<{ exerciseId: string }> }) {
  const { exerciseId } = await params;
  // Legacy tags keep working. Training starts via the same-origin POST on the scan page.
  return NextResponse.redirect(new URL(`/scan/uebung/${encodeURIComponent(exerciseId)}`, request.url));
}
