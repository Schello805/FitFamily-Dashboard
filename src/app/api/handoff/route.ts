import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { createToken, hashToken } from "@/lib/security";
import { getMobileReachableBaseUrl } from "@/lib/server-url";

const schema = z.object({
  profileId: z.string().min(1),
  clientOrigin: z.string().url().optional()
});

export async function POST(request: Request) {
  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Ungültiges Profil" }, { status: 400 });
  const token = createToken(24);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const client = await db();
  await client.batch([
    { sql: "DELETE FROM handoff_tokens WHERE expires_at < ? OR used_at IS NOT NULL", args: [new Date().toISOString()] },
    {
      sql: "INSERT INTO handoff_tokens (token_hash, profile_id, expires_at) VALUES (?, ?, ?)",
      args: [hashToken(token), body.data.profileId, expiresAt]
    },
    {
      sql: "INSERT INTO audit_log (id, action, profile_id, details) VALUES (?, 'handoff.create', ?, ?)",
      args: [randomUUID(), body.data.profileId, JSON.stringify({ expiresAt })]
    }
  ], "write");

  let origin = getMobileReachableBaseUrl(request);
  if (body.data.clientOrigin) {
    const testOrigin = body.data.clientOrigin.trim().replace(/\/$/, "");
    if (!testOrigin.includes("0.0.0.0") && !testOrigin.includes("localhost") && !testOrigin.includes("127.0.0.1")) {
      origin = testOrigin;
    }
  }

  const url = `${origin.replace(/\/$/, "")}/handoff/${token}`;
  return NextResponse.json({
    url,
    qr: await QRCode.toDataURL(url, { width: 420, margin: 2, color: { dark: "#071316", light: "#ffffff" } }),
    expiresAt
  });
}
