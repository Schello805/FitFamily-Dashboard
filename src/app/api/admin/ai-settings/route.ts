import { NextResponse } from "next/server";
import { z } from "zod";
import { getAiApiKey, getAiProviderStatus, setAiApiKey, type AiProvider } from "@/lib/ai-config";
import { verifyAdminPin } from "@/lib/security";

const schema = z.object({
  pin: z.string().min(4).max(8),
  provider: z.enum(["openai", "gemini"]),
  action: z.enum(["save", "remove", "test"]),
  apiKey: z.string().max(500).optional()
});

async function testKey(provider: AiProvider, key: string) {
  const response = provider === "openai"
    ? await fetch("https://api.openai.com/v1/models", { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) })
    : await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(10_000) });
  return response.ok;
}

export async function POST(request: Request) {
  const body = schema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: "Bitte Anbieter, Schlüssel und Eltern-PIN prüfen." }, { status: 400 });
  if (!(await verifyAdminPin(body.data.pin))) return NextResponse.json({ error: "Eltern-PIN ist nicht richtig." }, { status: 401 });

  if (body.data.action === "remove") {
    await setAiApiKey(body.data.provider, null);
    return NextResponse.json({ ok: true, status: await getAiProviderStatus() });
  }

  const key = body.data.apiKey?.trim() || (body.data.action === "test" ? await getAiApiKey(body.data.provider) : null);
  if (!key) return NextResponse.json({ error: "Bitte zuerst einen API-Schlüssel eingeben und speichern." }, { status: 400 });
  if (body.data.action === "test") {
    try {
      const valid = await testKey(body.data.provider, key);
      return NextResponse.json(valid ? { ok: true, message: "Der Schlüssel wurde angenommen." } : { error: "Der Anbieter hat den Schlüssel abgelehnt. Bitte Schlüssel prüfen." }, { status: valid ? 200 : 400 });
    } catch {
      return NextResponse.json({ error: "Anbieter nicht erreichbar. Heimnetz und Internetverbindung prüfen." }, { status: 502 });
    }
  }

  await setAiApiKey(body.data.provider, key);
  return NextResponse.json({ ok: true, status: await getAiProviderStatus() });
}
