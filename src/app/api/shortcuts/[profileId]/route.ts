import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateAppleShortcutXml } from "@/lib/apple-shortcut";
import { getMobileReachableBaseUrl } from "@/lib/server-url";

export async function GET(request: Request, { params }: { params: Promise<{ profileId: string }> }) {
  const { profileId } = await params;
  const client = await db();

  const profile = await client.execute({
    sql: "SELECT id, name FROM profiles WHERE id = ? LIMIT 1",
    args: [profileId]
  });

  if (!profile.rows[0]) {
    return NextResponse.json({ error: "Profil nicht gefunden." }, { status: 404 });
  }

  const profileName = String(profile.rows[0].name);
  const { searchParams } = new URL(request.url);
  const baseUrl = getMobileReachableBaseUrl(request);
  const webhookUrl = `${baseUrl.replace(/\/$/, "")}/api/sync/apple-health`;

  // If download parameter is requested, stream the .shortcut file directly
  if (searchParams.get("download") === "1") {
    const xml = generateAppleShortcutXml(profileId, profileName, request);
    return new NextResponse(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/x-apple-aspen-config; charset=utf-8",
        "Content-Disposition": `attachment; filename="FitFamily_Sync_${encodeURIComponent(profileName)}.shortcut"`,
        "Cache-Control": "no-store, no-cache, must-revalidate"
      }
    });
  }

  return NextResponse.json({
    profileId,
    profileName,
    webhookUrl,
    downloadUrl: `${baseUrl}/api/shortcuts/${profileId}?download=1`,
    samplePayload: {
      profileId,
      title: "Outdoor Laufen",
      type: "endurance",
      durationMinutes: 45,
      calories: 380,
      startedAt: new Date(Date.now() - 45 * 60000).toISOString(),
      endedAt: new Date().toISOString()
    },
    quickSetup: {
      step1: "Lade die Kurzbefehl-Datei herunter oder erstelle einen neuen Kurzbefehl in iOS.",
      step2: "Füge die Aktion 'Trainings suchen' ein (z. B. der letzten 24 Stunden).",
      step3: `Sende per POST an die Webhook-URL '${webhookUrl}' mit 'profileId': '${profileId}'.`,
      step4: "Aktiviere eine persönliche iOS Automation: 'Wenn Training beendet' -> Kurzbefehl ausführen."
    }
  });
}
