import { db, getSetting } from "@/lib/db";

export type AiProvider = "openai" | "gemini";
export type AiUsage = { requests: number; inputTokens: number; outputTokens: number; estimateUsd: number; updatedAt: string | null };

const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";

/** Return a generateContent-compatible Gemini model, even when an old .env value remains. */
export function getGeminiModel() {
  const configured = process.env.GEMINI_MODEL?.trim().replace(/^models\//, "");
  if (!configured || configured.startsWith("gemini-1.5-")) return DEFAULT_GEMINI_MODEL;
  return configured;
}

const emptyUsage = (): AiUsage => ({ requests: 0, inputTokens: 0, outputTokens: 0, estimateUsd: 0, updatedAt: null });
const rates: Record<AiProvider, { input: number; output: number }> = {
  openai: { input: 0.2, output: 1.2 },
  gemini: { input: 0.3, output: 2.5 }
};

export async function getAiApiKey(provider: AiProvider) {
  const stored = await getSetting(`ai_key_${provider}`);
  if (stored) return stored;
  return provider === "openai" ? process.env.OPENAI_API_KEY ?? null : process.env.GEMINI_API_KEY ?? null;
}

export async function setAiApiKey(provider: AiProvider, apiKey: string | null) {
  const client = await db();
  if (apiKey) {
    await client.execute({ sql: `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`, args: [`ai_key_${provider}`, apiKey] });
  } else {
    await client.execute({ sql: "DELETE FROM settings WHERE key = ?", args: [`ai_key_${provider}`] });
  }
}

export async function getAiUsage(provider: AiProvider): Promise<AiUsage> {
  const value = await getSetting(`ai_usage_${provider}`);
  if (!value) return emptyUsage();
  try {
    const parsed = JSON.parse(value) as Partial<AiUsage>;
    return { ...emptyUsage(), ...parsed };
  } catch {
    return emptyUsage();
  }
}

export async function recordAiUsage(provider: AiProvider, inputTokens: number, outputTokens: number) {
  const current = await getAiUsage(provider);
  const estimateUsd = (Math.max(0, inputTokens) * rates[provider].input + Math.max(0, outputTokens) * rates[provider].output) / 1_000_000;
  const updated: AiUsage = {
    requests: current.requests + 1,
    inputTokens: current.inputTokens + Math.max(0, inputTokens),
    outputTokens: current.outputTokens + Math.max(0, outputTokens),
    estimateUsd: current.estimateUsd + estimateUsd,
    updatedAt: new Date().toISOString()
  };
  const client = await db();
  await client.execute({ sql: "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP", args: [`ai_usage_${provider}`, JSON.stringify(updated)] });
}

export async function getAiProviderStatus() {
  const [openaiKey, geminiKey, openaiUsage, geminiUsage] = await Promise.all([
    getAiApiKey("openai"), getAiApiKey("gemini"), getAiUsage("openai"), getAiUsage("gemini")
  ]);
  return {
    openai: Boolean(openaiKey), gemini: Boolean(geminiKey),
    models: { openai: process.env.OPENAI_MODEL ?? "gpt-5.6-luna", gemini: getGeminiModel() },
    usage: { openai: openaiUsage, gemini: geminiUsage }
  };
}
