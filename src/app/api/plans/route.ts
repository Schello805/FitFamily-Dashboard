import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getAiApiKey, recordAiUsage } from "@/lib/ai-config";

const schema = z.object({
  profileId: z.string(), goal: z.string().min(2).max(100), level: z.enum(["Einsteiger", "Fortgeschritten", "Erfahren"]),
  sessionsPerWeek: z.number().int().min(1).max(7), minutesPerSession: z.number().int().min(15).max(120),
  targetDate: z.string().date().nullable(), provider: z.enum(["openai", "gemini", "local"])
});

const importedPlanSchema = z.object({
  title: z.string().min(2).max(100),
  goal: z.string().min(2).max(100).optional(),
  targetDate: z.string().date().nullable().optional(),
  summary: z.string().max(1000).optional(),
  weeks: z.array(z.object({
    week: z.number().int().min(1).max(52),
    sessions: z.array(z.object({
      date: z.string().date().optional(),
      title: z.string().min(2).max(100),
      type: z.enum(["strength", "endurance"]),
      minutes: z.number().int().min(1).max(300),
      distanceKm: z.number().positive().max(100).optional(),
      exercises: z.array(z.string().min(1).max(100)).max(12)
    })).min(1).max(14)
  })).min(1).max(52)
});

const importRequestSchema = z.object({
  action: z.literal("import"),
  profileId: z.enum(["mama", "papa", "fabian", "frieda"]),
  plan: importedPlanSchema
});

function localPlan(input: z.infer<typeof schema>, equipment: string[]) {
  const enduranceGoal = /Lauf|Marathon|Ausdauer|Box/i.test(input.goal);
  const enduranceEquipment = equipment.filter((name) => /laufband|fahrrad|boxsack/i.test(name));
  const strengthEquipment = equipment.filter((name) => /klimmzug|kraftstation|vibrationsplatte|hantel|gewicht/i.test(name));
  const anyEquipment = equipment.length ? equipment : ["Bewegung ohne Gerät"];
  return {
    summary: `${input.sessionsPerWeek} Einheiten pro Woche für ${input.goal}`,
    safety: ["Saubere Technik geht immer vor Tempo.", "Bei Schmerz, Schwindel oder Unwohlsein Training beenden."],
    weeks: Array.from({ length: 4 }, (_, week) => ({
      week: week + 1,
      sessions: Array.from({ length: input.sessionsPerWeek }, (_, index) => ({
        title: enduranceGoal && index % 2 === 0 ? "Ausdauer – ruhig und gleichmäßig" : "Kraft – Ganzkörper und Technik",
        type: enduranceGoal && index % 2 === 0 ? "endurance" : "strength",
        minutes: input.minutesPerSession,
        exercises: enduranceGoal && index % 2 === 0
          ? [enduranceEquipment[0] ?? anyEquipment[0], "Tempo so wählen, dass Sprechen noch möglich ist"]
          : [strengthEquipment[0] ?? anyEquipment[0], strengthEquipment[1] ?? "Rumpftraining"]
      }))
    }))
  };
}

async function callOpenAI(input: z.infer<typeof schema>, equipment: string[]) {
  const apiKey = await getAiApiKey("openai");
  if (!apiKey) return null;
  const prompt = `Erstelle einen sicheren deutschsprachigen Trainingsplan als JSON. Anonymisierte Daten: Ziel ${input.goal}; Niveau ${input.level}; ${input.sessionsPerWeek} Einheiten pro Woche; ${input.minutesPerSession} Minuten je Einheit; Zieltermin ${input.targetDate ?? "offenes Ende"}; Geräte: ${equipment.join(", ")}. Keine medizinischen Versprechen. Fokus auf korrekte Technik.`;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL ?? "gpt-5.6-luna", store: false, input: prompt, text: { format: { type: "json_object" } } })
  });
  if (!response.ok) throw new Error(`OpenAI API: ${response.status}`);
  const data = await response.json();
  if (data.usage) await recordAiUsage("openai", Number(data.usage.input_tokens ?? 0), Number(data.usage.output_tokens ?? 0));
  const text = data.output?.flatMap((item: { content?: { text?: string }[] }) => item.content ?? []).find((item: { text?: string }) => item.text)?.text;
  return text ? JSON.parse(text) : null;
}

async function callGemini(input: z.infer<typeof schema>, equipment: string[]) {
  const apiKey = await getAiApiKey("gemini");
  if (!apiKey) return null;
  const prompt = `Erstelle ausschließlich JSON für einen sicheren deutschen Trainingsplan. Ziel: ${input.goal}; Niveau: ${input.level}; Einheiten/Woche: ${input.sessionsPerWeek}; Minuten: ${input.minutesPerSession}; Zieltermin: ${input.targetDate ?? "offen"}; Geräte: ${equipment.join(", ")}.`;
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } })
  });
  if (!response.ok) throw new Error(`Gemini API: ${response.status}`);
  const data = await response.json();
  if (data.usageMetadata) await recordAiUsage("gemini", Number(data.usageMetadata.promptTokenCount ?? 0), Number(data.usageMetadata.candidatesTokenCount ?? 0) + Number(data.usageMetadata.thoughtsTokenCount ?? 0));
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return text ? JSON.parse(text) : null;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > 512 * 1024) {
    return NextResponse.json({ error: "Die Plan-Datei darf höchstens 512 KB groß sein." }, { status: 413 });
  }
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Die Anfrage enthält kein gültiges JSON." }, { status: 400 });
  }
  if (payload && typeof payload === "object" && "action" in payload && payload.action === "import") {
    const imported = importRequestSchema.safeParse(payload);
    if (!imported.success) return NextResponse.json({ error: "Die JSON-Datei passt nicht zur FitFamily-Planvorlage. Bitte prüfe Datum, Minuten und Einheiten." }, { status: 400 });
    const client = await db();
    const id = randomUUID();
    const goal = imported.data.plan.goal ?? imported.data.plan.title;
    await client.batch([
      { sql: "UPDATE training_plans SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE profile_id = ? AND status = 'active'", args: [imported.data.profileId] },
      {
        sql: `INSERT INTO training_plans (id, profile_id, title, goal, target_date, status, plan_json)
          VALUES (?, ?, ?, ?, ?, 'active', ?)`,
        args: [id, imported.data.profileId, imported.data.plan.title, goal, imported.data.plan.targetDate ?? null, JSON.stringify({ ...imported.data.plan, summary: imported.data.plan.summary ?? "Importierter Trainingsplan", provider: "Import" })]
      }
    ], "write");
    return NextResponse.json({ id, provider: "import" }, { status: 201 });
  }

  const body = schema.safeParse(payload);
  if (!body.success) return NextResponse.json({ error: "Bitte Planangaben prüfen" }, { status: 400 });
  const client = await db();
  const inventory = await client.execute("SELECT name FROM equipment_inventory WHERE available = 1 ORDER BY name");
  const equipment = inventory.rows.map((row) => String(row.name));
  let plan;
  let usedProvider = body.data.provider;
  try {
    plan = body.data.provider === "openai" ? await callOpenAI(body.data, equipment) : body.data.provider === "gemini" ? await callGemini(body.data, equipment) : null;
  } catch (error) {
    console.error(error);
  }
  if (!plan) { plan = localPlan(body.data, equipment); usedProvider = "local"; }
  const id = randomUUID();
  await client.batch([
    { sql: "UPDATE training_plans SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE profile_id = ? AND status = 'active'", args: [body.data.profileId] },
    {
      sql: `INSERT INTO training_plans (id, profile_id, title, goal, target_date, status, plan_json)
        VALUES (?, ?, ?, ?, ?, 'active', ?)`,
      args: [id, body.data.profileId, body.data.goal, body.data.goal, body.data.targetDate, JSON.stringify({ ...plan, provider: usedProvider, input: { level: body.data.level, sessionsPerWeek: body.data.sessionsPerWeek, minutesPerSession: body.data.minutesPerSession } })]
    }
  ], "write");
  return NextResponse.json({ id, plan, provider: usedProvider });
}

export async function GET(request: Request) {
  const profileId = new URL(request.url).searchParams.get("profileId");
  if (!profileId) return NextResponse.json({ error: "Profil fehlt" }, { status: 400 });
  const client = await db();
  const result = await client.execute({ sql: "SELECT * FROM training_plans WHERE profile_id = ? ORDER BY created_at DESC", args: [profileId] });
  return NextResponse.json({ plans: result.rows.map((row) => ({ ...row, plan_json: JSON.parse(String(row.plan_json)) })) });
}
