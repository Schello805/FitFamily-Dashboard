import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyAdminPinOrReject } from "@/lib/security";
import { writeAdminLog } from "@/lib/admin-log";

const schema = z.object({ pin: z.string().regex(/^\d{4}$/) });

export async function POST(request: Request) {
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const pinError = await verifyAdminPinOrReject(body.data.pin);
  if (pinError) return pinError;
  try {
    const client = await db();
    const tableNames = [
      "profiles", "exercises", "equipment_inventory", "training_sessions",
      "training_segments", "training_plans", "apple_health_daily", "apple_health_ignored_workouts"
    ] as const;
    const data: Record<string, unknown> = {};
    for (const table of tableNames) data[table] = (await client.execute(`SELECT * FROM ${table}`)).rows;
    const settings = await client.execute(`SELECT key, value, updated_at FROM settings
      WHERE key NOT IN ('admin_pin_hash', 'nas_backup_key', 'nas_backup_path')
        AND key NOT LIKE 'ai_key_%'`);
    data.settings = settings.rows;
    data.excluded = { auditLogs: "separat in der geschützten Protokollansicht", secrets: "PIN-, KI- und Backup-Schlüssel werden nicht exportiert" };
    const date = new Date().toISOString().slice(0, 10);
    const exportedAt = new Date().toISOString();
    await writeAdminLog("admin.export.success", "info", "JSON-Datenexport erstellt", { exportedAt });
    return new NextResponse(JSON.stringify({ format: "fitfamily-export", version: 1, exportedAt, data }, null, 2), {
      headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="fitfamily-${date}.json"`, "Cache-Control": "no-store" }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "JSON-Export fehlgeschlagen.";
    await writeAdminLog("admin.export.error", "error", message).catch(() => undefined);
    return NextResponse.json({ error: "Der Datenexport ist fehlgeschlagen." }, { status: 500 });
  }
}
