import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAdminPin } from "@/lib/security";
import { getAiProviderStatus } from "@/lib/ai-config";
import { getBackupSettings } from "@/lib/backup";
import { getDisplaySettings } from "@/lib/display-settings";

const schema = z.object({ pin: z.string().regex(/^\d{4}$/) });

export async function POST(request: Request) {
  const body = schema.safeParse(await request.json());
  if (!body.success || !(await verifyAdminPin(body.data.pin))) return NextResponse.json({ error: "Eltern-PIN ist nicht richtig" }, { status: 401 });
  const [providers, backup, displaySettings] = await Promise.all([
    getAiProviderStatus(),
    getBackupSettings(),
    getDisplaySettings()
  ]);
  return NextResponse.json({
    ok: true,
    providers: { openai: providers.openai, gemini: providers.gemini },
    models: providers.models,
    usage: providers.usage,
    nas: backup.configured && backup.writable,
    backup,
    displaySettings
  });
}
