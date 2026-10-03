import { NextResponse } from "next/server";
import { z } from "zod";
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_DURATION_MS, createAdminSession, getAdminSession, isSameOriginRequest, requestUsesHttps, revokeAdminSession, verifyAdminPinOrReject } from "@/lib/security";
import { getAiProviderStatus } from "@/lib/ai-config";
import { getBackupSettings } from "@/lib/backup";
import { getDisplaySettings } from "@/lib/display-settings";

const schema = z.object({ pin: z.string().regex(/^\d{4}$/) });

async function adminStatus(expiresAt: number) {
  const [providers, backup, displaySettings] = await Promise.all([
    getAiProviderStatus(),
    getBackupSettings(),
    getDisplaySettings()
  ]);
  return {
    ok: true,
    expiresAt,
    providers: { openai: providers.openai, gemini: providers.gemini },
    models: providers.models,
    usage: providers.usage,
    nas: backup.configured && backup.writable,
    backup,
    displaySettings
  };
}

export async function GET(request: Request) {
  const pinError = await verifyAdminPinOrReject(undefined, request);
  if (pinError) return pinError;
  const session = await getAdminSession(request);
  if (!session) return NextResponse.json({ error: "Die Verwaltung wurde gesperrt." }, { status: 401 });
  return NextResponse.json(await adminStatus(session.expiresAt), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const pinError = await verifyAdminPinOrReject(body.data.pin, request);
  if (pinError) return pinError;
  await revokeAdminSession(request);
  const session = await createAdminSession();
  const response = NextResponse.json(await adminStatus(session.expiresAt), { headers: { "Cache-Control": "no-store" } });
  response.cookies.set(ADMIN_SESSION_COOKIE, session.token, {
    httpOnly: true, sameSite: "strict", secure: requestUsesHttps(request),
    maxAge: ADMIN_SESSION_DURATION_MS / 1000, path: "/"
  });
  return response;
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: "Ungültiger Ursprung." }, { status: 403 });
  await revokeAdminSession(request);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true, sameSite: "strict", secure: requestUsesHttps(request), maxAge: 0, path: "/"
  });
  return response;
}
