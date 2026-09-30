import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

const schema = z.object({
  profileId: z.string(), goal: z.string().min(2).max(100), level: z.enum(["Einsteiger", "Fortgeschritten", "Erfahren"]),
  sessionsPerWeek: z.number().int().min(1).max(7), minutesPerSession: z.number().int().min(15).max(120),
  targetDate: z.string().date().nullable(), provider: z.enum(["openai", "gemini", "local"])
});

const equipment = ["Klimmzugstation", "Kraftstation mit Butterfly und Latzug", "Laufband", "Vibrationsplatte", "Boxsack", "Fahrrad"];

function localPlan(input: z.infer<typeof schema>) {
  const enduranceGoal = /Lauf|Marathon|Ausdauer|Box/i.test(input.goal);
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
          ? ["Laufband oder Fahrrad", "Tempo so wählen, dass Sprechen noch möglich ist"]
          : ["Klimmzugstation", "Butterfly oder Latzug", "Rumpftraining"]
      }))
    }))
  };
}

async function callOpenAI(input: z.infer<typeof schema>) {
  if (!process.env.OPENAI_API_KEY) return null;
  const prompt = `Erstelle einen sicheren deutschsprachigen Trainingsplan als JSON. Anonymisierte Daten: Ziel ${input.goal}; Niveau ${input.level}; ${input.sessionsPerWeek} Einheiten pro Woche; ${input.minutesPerSession} Minuten je Einheit; Zieltermin ${input.targetDate ?? "offenes Ende"}; Geräte: ${equipment.join(", ")}. Keine medizinischen Versprechen. Fokus auf korrekte Technik.`;
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: process.env.OPENAI_MODEL ?? "gpt-5.6-luna", store: false, input: prompt, text: { format: { type: "json_object" } } })
  });
  if (!response.ok) throw new Error(`OpenAI API: ${response.status}`);
  const data = await response.json();
  const text = data.output?.flatMap((item: { content?: { text?: string }[] }) => item.content ?? []).find((item: { text?: string }) => item.text)?.text;
  return text ? JSON.parse(text) : null;
}

async function callGemini(input: z.infer<typeof schema>) {
  if (!process.env.GEMINI_API_KEY) return null;
  const prompt = `Erstelle ausschließlich JSON für einen sicheren deutschen Trainingsplan. Ziel: ${input.goal}; Niveau: ${input.level}; Einheiten/Woche: ${input.sessionsPerWeek}; Minuten: ${input.minutesPerSession}; Zieltermin: ${input.targetDate ?? "offen"}; Geräte: ${equipment.join(", ")}.`;
  const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash";
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseMimeType: "application/json" } })
  });
  if (!response.ok) throw new Error(`Gemini API: ${response.status}`);
  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return text ? JSON.parse(text) : null;
}

export async function POST(request: Request) {
  const body = schema.safeParse(await request.json());
  if (!body.success) return NextResponse.json({ error: "Bitte Planangaben prüfen" }, { status: 400 });
  let plan;
  let usedProvider = body.data.provider;
  try {
    plan = body.data.provider === "openai" ? await callOpenAI(body.data) : body.data.provider === "gemini" ? await callGemini(body.data) : null;
  } catch (error) {
    console.error(error);
  }
  if (!plan) { plan = localPlan(body.data); usedProvider = "local"; }
  const id = randomUUID();
  const client = await db();
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
