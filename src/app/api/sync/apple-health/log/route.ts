import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyAdminPin } from "@/lib/security";

const requestSchema = z.object({
  profileId: z.string().min(1),
  pin: z.string().regex(/^\d{4}$/)
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bitte Profil und vierstellige Eltern-PIN prüfen." }, { status: 400 });
  if (!(await verifyAdminPin(parsed.data.pin))) return NextResponse.json({ error: "Eltern-PIN ist nicht richtig." }, { status: 401 });

  const client = await db();
  const result = await client.execute({
    sql: `SELECT id, action, details, created_at FROM audit_log
      WHERE profile_id = ? AND action IN (
        'health.apple_sync.started', 'health.apple_sync.checked',
        'health.apple_sync.completed', 'health.apple_sync.failed'
      )
      ORDER BY created_at DESC LIMIT 30`,
    args: [parsed.data.profileId]
  });

  return NextResponse.json({
    logs: result.rows.map((row) => {
      let details: Record<string, unknown> = {};
      try {
        const parsedDetails = JSON.parse(String(row.details ?? "{}"));
        if (parsedDetails && typeof parsedDetails === "object" && !Array.isArray(parsedDetails)) details = parsedDetails;
      } catch {
        // Older or malformed log rows should not prevent the rest from loading.
      }
      return {
        id: String(row.id),
        action: String(row.action),
        createdAt: String(row.created_at),
        details
      };
    })
  }, { headers: { "Cache-Control": "no-store" } });
}
