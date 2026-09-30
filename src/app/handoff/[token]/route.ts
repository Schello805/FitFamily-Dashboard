import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/security";

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const client = await db();
  const result = await client.execute({
    sql: `SELECT profile_id FROM handoff_tokens
      WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? LIMIT 1`,
    args: [hashToken(token), new Date().toISOString()]
  });
  if (!result.rows[0]) return NextResponse.redirect(new URL("/link-abgelaufen", request.url));
  const profileId = String(result.rows[0].profile_id);
  await client.execute({
    sql: "UPDATE handoff_tokens SET used_at = ? WHERE token_hash = ?",
    args: [new Date().toISOString(), hashToken(token)]
  });
  return NextResponse.redirect(new URL(`/profil/${profileId}?mobil=1`, request.url));
}
