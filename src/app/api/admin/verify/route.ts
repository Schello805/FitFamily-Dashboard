import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminPin } from "@/lib/security";
import { getAiProviderStatus } from "@/lib/ai-config";

const schema = z.object({ pin: z.string().min(4) });

export async function POST(request: Request) {
  const body = schema.safeParse(await request.json());
  if (!body.success || !(await verifyAdminPin(body.data.pin))) return NextResponse.json({ error: "Eltern-PIN ist nicht richtig" }, { status: 401 });
  const providers = await getAiProviderStatus();
  return NextResponse.json({ ok: true, providers: { openai: providers.openai, gemini: providers.gemini }, models: providers.models, usage: providers.usage, nas: Boolean(process.env.NAS_BACKUP_PATH) });
}
