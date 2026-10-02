import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAdminLog } from "@/lib/admin-log";

const schema = z.object({
  message: z.string().max(500).default("Unbehandelter Anwendungsfehler"),
  digest: z.string().max(120).optional(),
  path: z.string().max(200).optional()
});

const recentByAddress = new Map<string, { startedAt: number; count: number }>();

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  let sameOrigin = false;
  try {
    sameOrigin = Boolean(origin && host && new URL(origin).host === host);
  } catch {
    sameOrigin = false;
  }
  if (!sameOrigin) {
    return NextResponse.json({ error: "Nur gleich-originierte Anwendungsfehler dürfen protokolliert werden." }, { status: 403 });
  }
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const now = Date.now();
  const window = recentByAddress.get(address);
  if (window && now - window.startedAt < 60_000 && window.count >= 10) {
    return NextResponse.json({ ok: true }, { status: 202 });
  }
  if (!window || now - window.startedAt >= 60_000) recentByAddress.set(address, { startedAt: now, count: 1 });
  else window.count += 1;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Ungültiger Fehlerbericht." }, { status: 400 });
  await writeAdminLog("app.error", "error", parsed.data.message || "Unbehandelter Anwendungsfehler", {
    digest: parsed.data.digest ?? null,
    path: parsed.data.path ?? null
  });
  return NextResponse.json({ ok: true }, { status: 202 });
}
