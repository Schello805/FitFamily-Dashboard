import { NextResponse } from "next/server";
import { verifyAdminPinOrReject } from "@/lib/security";
import { db } from "@/lib/db";
import { energyInstaller } from "@/lib/health-shortcut";
import { healthMacApp } from "@/lib/health-mac-app";

export async function GET(request: Request) {
  const error = await verifyAdminPinOrReject(undefined, request);
  if (error) return error;
  const url = new URL(request.url);
  const profileId = url.searchParams.get("profileId") || "";
  const client = await db();
  const profile = await client.execute({ sql: "SELECT id FROM profiles WHERE id=?", args: [profileId] });
  if (!profile.rows.length) return NextResponse.json({ error: "Profil-ID nicht gefunden." }, { status: 404 });
  try {
    if (url.searchParams.get("format") === "app") {
      const archive = healthMacApp(profileId, url.searchParams.get("server") || url.origin);
      return new Response(new Uint8Array(archive), { headers: {
        "Content-Type": "application/zip", "Content-Disposition": 'attachment; filename="FitFamily-Kurzbefehl-Mac.zip"',
        "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"
      } });
    }
    const command = energyInstaller(profileId, url.searchParams.get("server") || url.origin);
    return new Response(command, { headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="FitFamily-Energie-installieren.command"',
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff"
    } });
  } catch { return NextResponse.json({ error: "Profil-ID oder Server-Basisadresse ungültig." }, { status: 400 }); }
}
