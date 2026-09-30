import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminPin } from "@/lib/security";

const schema = z.object({ pin: z.string().min(4) });

export async function POST(request: Request) {
  const body = schema.safeParse(await request.json());
  if (!body.success || !(await verifyAdminPin(body.data.pin))) return NextResponse.json({ error: "Eltern-PIN ist nicht richtig" }, { status: 401 });
  return NextResponse.json({ ok: true, providers: { openai: Boolean(process.env.OPENAI_API_KEY), gemini: Boolean(process.env.GEMINI_API_KEY) }, nas: Boolean(process.env.NAS_BACKUP_PATH) });
}
