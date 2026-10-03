import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyAdminPinOrReject } from "@/lib/security";
import { writeAdminLog } from "@/lib/admin-log";
import { DATA_TABLE_SPECS, DATA_TRANSFER_TABLES, isPortableSetting } from "@/lib/data-transfer-schema";

const schema = z.object({ pin: z.string().regex(/^\d{4}$/) });

export async function POST(request: Request) {
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  const pinError = await verifyAdminPinOrReject(body.data.pin);
  if (pinError) return pinError;
  try {
    const client = await db();
    const data: Record<string, unknown> = {};
    for (const table of DATA_TRANSFER_TABLES) {
      const columns = DATA_TABLE_SPECS[table].columns.join(", ");
      const rows = (await client.execute(`SELECT ${columns} FROM ${table}`)).rows;
      data[table] = table === "settings"
        ? rows.filter((row) => isPortableSetting(String(row.key)))
        : rows;
    }
    data.excluded = {
      auditLogs: "separat in der geschützten Protokollansicht",
      credentials: "PIN-, KI- und Backup-Schlüssel sowie Apple-Health-Tokens werden nicht exportiert",
      deviceLinks: "gekoppelte Geräte und Einmal-Übergabetokens werden nicht exportiert"
    };
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
