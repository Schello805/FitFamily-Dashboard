import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyAdminPin } from "@/lib/security";

const schema = z.object({ pin: z.string().min(4) });

export async function POST(request: Request) {
  const body = schema.safeParse(await request.json());
  if (!body.success || !(await verifyAdminPin(body.data.pin))) {
    return NextResponse.json({ error: "Eltern-PIN ist nicht richtig" }, { status: 401 });
  }
  const client = await db();
  const tableNames = ["profiles", "exercises", "training_sessions", "training_segments", "training_plans", "audit_log"] as const;
  const data: Record<string, unknown> = {};
  for (const table of tableNames) data[table] = (await client.execute(`SELECT * FROM ${table}`)).rows;
  const settings = await client.execute("SELECT key, value, updated_at FROM settings WHERE key NOT IN ('admin_pin_hash') AND key NOT LIKE 'ai_key_%'");
  data.settings = settings.rows;
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(JSON.stringify({ format: "fitfamily-export", version: 1, exportedAt: new Date().toISOString(), data }, null, 2), {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="fitfamily-${date}.json"`, "Cache-Control": "no-store" }
  });
}
