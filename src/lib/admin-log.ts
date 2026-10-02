import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

export type AdminLogLevel = "info" | "warning" | "error";

export async function writeAdminLog(
  action: string,
  level: AdminLogLevel,
  message: string,
  details: Record<string, unknown> = {}
) {
  const client = await db();
  await client.execute({
    sql: "INSERT INTO audit_log (id, action, profile_id, details) VALUES (?, ?, NULL, ?)",
    args: [randomUUID(), action, JSON.stringify({ level, message, ...details })]
  });
}
