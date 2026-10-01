import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createToken, hashToken, verifyAdminPin } from "@/lib/security";

const schema = z.object({
  profileId: z.string().min(1),
  pin: z.string().regex(/^\d{4,8}$/),
  action: z.enum(["create", "revoke"])
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
  if (!(await verifyAdminPin(parsed.data.pin))) return NextResponse.json({ error: "Eltern-PIN ist nicht richtig." }, { status: 401 });

  const client = await db();
  const profile = await client.execute({ sql: "SELECT id FROM profiles WHERE id = ?", args: [parsed.data.profileId] });
  if (!profile.rows[0]) return NextResponse.json({ error: "Profil nicht gefunden." }, { status: 404 });

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
