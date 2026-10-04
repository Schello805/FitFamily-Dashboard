import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { adminPinSchema, verifyAdminPinOrReject } from "@/lib/security";

const schema = z.object({
  pin: adminPinSchema,
  filter: z.enum(["all", "errors", "updates", "backups", "health"]).default("all")
});

export async function POST(request: Request) {
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const pinError = await verifyAdminPinOrReject(body.data.pin, request);
  if (pinError) return pinError;

  const client = await db();
  // Apply the selected category before the limit, so other events cannot hide it.
  const result = await client.execute({
    sql: `SELECT id, action, details, created_at FROM audit_log
      WHERE (action LIKE 'admin.%' OR action LIKE 'app.%' OR action LIKE 'health.%')
        AND (? != 'health' OR action LIKE 'health.%')
      ORDER BY created_at DESC, rowid DESC LIMIT 500`
    , args: [body.data.filter]
  });
  const parsed = result.rows.map((row) => {
    let details: Record<string, unknown> = {};
    try {
      const value = JSON.parse(String(row.details ?? "{}"));
      if (value && typeof value === "object" && !Array.isArray(value)) details = value;
    } catch {
      details = { level: "warning", message: "Protokolldetails konnten nicht gelesen werden." };
    }
    return { id: String(row.id), action: String(row.action), createdAt: String(row.created_at), details };
  });

  const filter = body.data.filter;
  const logs = parsed.filter((entry) => {
    if (filter === "errors") return entry.details.level === "error" || entry.action.endsWith(".error") || entry.action.endsWith(".failed");
    if (filter === "updates") return entry.action.includes(".update.");
    if (filter === "backups") return entry.action.includes(".backup.") || entry.action.includes(".export.") || entry.action.includes(".import.");
    if (filter === "health") return entry.action.startsWith("health.");
    return true;
  });

  return NextResponse.json({ logs }, { headers: { "Cache-Control": "no-store" } });
}
