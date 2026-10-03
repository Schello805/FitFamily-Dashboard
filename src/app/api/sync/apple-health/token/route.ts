import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createToken, hashToken, verifyAdminPinOrReject } from "@/lib/security";
import { localIsoDate } from "@/lib/apple-health-activity";

const schema = z.object({
  profileId: z.string().min(1),
  pin: z.string().regex(/^\d{4}$/),
  action: z.enum(["create", "revoke", "check"])
});

export async function GET(request: Request) {
  const profileId = new URL(request.url).searchParams.get("profileId");
  if (!profileId) return NextResponse.json({ error: "Profil fehlt." }, { status: 400 });
  const client = await db();
  const result = await client.execute({ sql: "SELECT 1 FROM apple_health_tokens WHERE profile_id = ?", args: [profileId] });
  return NextResponse.json({ configured: Boolean(result.rows[0]) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bitte Profil, Eltern-PIN und Aktion prüfen." }, { status: 400 });
  const pinError = await verifyAdminPinOrReject(parsed.data.pin, request);
  if (pinError) return pinError;

  const client = await db();
  const profile = await client.execute({ sql: "SELECT id FROM profiles WHERE id = ?", args: [parsed.data.profileId] });
  if (!profile.rows[0]) return NextResponse.json({ error: "Profil nicht gefunden." }, { status: 404 });

  if (parsed.data.action === "check") {
    const configured = await client.execute({ sql: "SELECT created_at FROM apple_health_tokens WHERE profile_id = ?", args: [parsed.data.profileId] });
    if (!configured.rows[0]) return NextResponse.json({ verified: false, message: "Kein Sync-Schlüssel eingerichtet. Erstelle einen Schlüssel und füge ihn im Kurzbefehl ein." });
    const result = await client.execute({
      sql: "SELECT id, action, details, created_at FROM audit_log WHERE profile_id = ? AND action IN ('health.apple_sync.started', 'health.apple_sync.completed', 'health.apple_sync.failed') AND created_at >= ? ORDER BY created_at DESC, rowid DESC LIMIT 1",
      args: [parsed.data.profileId, String(configured.rows[0].created_at)]
    });
    const log = result.rows[0];
    if (!log) return NextResponse.json({ verified: false, message: "Noch keine Übertragung mit dieser Verbindung empfangen. Führe den Kurzbefehl auf dem iPhone aus und prüfe danach erneut." });
    const reference = { importId: log.id, checkedAt: log.created_at };
    if (log.action === "health.apple_sync.started") return NextResponse.json({ verified: false, ...reference, message: "Der letzte Aufruf wurde empfangen, aber noch nicht vollständig bestätigt. Er läuft noch oder sein Abschlussprotokoll ist fehlgeschlagen. Bitte erneut prüfen; bei dauerhaftem Fehler die Import-ID angeben." });
    let details: Record<string, unknown> = {};
    try {
      const parsedDetails = JSON.parse(String(log.details ?? "{}"));
      if (parsedDetails && typeof parsedDetails === "object" && !Array.isArray(parsedDetails)) details = parsedDetails;
    } catch { /* Treat missing details as unverified. */ }
    if (log.action === "health.apple_sync.failed") return NextResponse.json({ verified: false, ...reference, message: typeof details.message === "string" ? details.message : "Der letzte Import ist fehlgeschlagen. Prüfe JSON-Felder, Zahlen und Sync-Schlüssel." });
    const days = Array.isArray(details.savedActivity) ? details.savedActivity as Record<string, unknown>[] : [];
    const today = days.find((day) => day.date === localIsoDate(new Date()));
    if (!today) return NextResponse.json({ verified: false, ...reference, message: "Der letzte Aufruf enthält keine prüfbaren Tageswerte für heute. Führe den eingerichteten Kurzbefehl erneut aus." });
    const warnings = Array.isArray(details.warnings) ? details.warnings.filter((item): item is string => typeof item === "string") : [];
    const received = details.receivedActivity as Record<string, unknown> | undefined;
    const receivedDays = Array.isArray(received?.dailyActivity) ? received.dailyActivity as Record<string, unknown>[] : [];
    const receivedToday = { ...(received?.date == null || received.date === today.date ? received : {}), ...receivedDays.find((day) => day.date === today.date) };
    const requiredFields = { moveCalories: "Aktive Energie", exerciseMinutes: "Trainingsminuten", stepCount: "Schritte", walkingRunningDistanceKm: "Geh-/Laufstrecke" };
    const missing = Object.entries(requiredFields).filter(([key]) => typeof receivedToday[key] !== "number").map(([, label]) => label);
    if (missing.length) warnings.push(`Im letzten Aufruf fehlen: ${missing.join(", ")}. Prüfe diese Felder im Kurzbefehl.`);
    const values = Object.fromEntries(Object.entries(today).filter(([key]) => key === "date" || typeof receivedToday[key] === "number"));
    return NextResponse.json({ verified: warnings.length === 0, ...reference, values, message: warnings.length ? warnings.join(" ") : "Der letzte Kurzbefehl-Aufruf wurde angenommen und Tageswerte für heute gespeichert. Vergleiche die Zahlen unten mit Apple Fitness; deren Herkunft kann der Server nicht überprüfen." });
  }

  if (parsed.data.action === "revoke") {
    await client.execute({ sql: "DELETE FROM apple_health_tokens WHERE profile_id = ?", args: [parsed.data.profileId] });
    await client.execute({
      sql: "INSERT INTO audit_log (id, action, profile_id, details) VALUES (?, 'health.apple_token.revoke', ?, NULL)",
      args: [randomUUID(), parsed.data.profileId]
    });
    return NextResponse.json({ ok: true, configured: false });
  }

  const token = createToken(32);
  await client.batch([
    {
      sql: `INSERT INTO apple_health_tokens (profile_id, token_hash, created_at) VALUES (?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(profile_id) DO UPDATE SET token_hash = excluded.token_hash, created_at = CURRENT_TIMESTAMP`,
      args: [parsed.data.profileId, hashToken(token)]
    },
    {
      sql: "INSERT INTO audit_log (id, action, profile_id, details) VALUES (?, 'health.apple_token.create', ?, NULL)",
      args: [randomUUID(), parsed.data.profileId]
    }
  ], "write");
  return NextResponse.json({ ok: true, configured: true, token });
}
