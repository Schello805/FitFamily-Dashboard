import { z } from "zod";
import { db } from "./db";

export const DEFAULT_ENERGY_GOAL = 500;
export const DEFAULT_STEP_GOAL = 10000;
export const stepGoalKey = (profileId: string) => `health_step_goal:${profileId}`;
export function stepGoal(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 100000 ? number : DEFAULT_STEP_GOAL;
}
export const energyGoalKey = (profileId: string) => `health_energy_goal:${profileId}`;
export function energyGoal(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 && number <= 20000 ? number : DEFAULT_ENERGY_GOAL;
}
export function energyGoalPercent(kcal: number, goal: number) {
  return Math.round(kcal / goal * 100);
}

// No locale-dependent coercion, thousands separators or arithmetic in Shortcuts.
export const energyKcalSchema = z.union([
  z.number(),
  z.string().trim().regex(/^\d{1,5}(?:[.,]\d{1,18})?$/, "kcal als Dezimalzahl ohne Tausendertrennzeichen senden.")
    .transform(value => Number(value.replace(",", ".")))
]).pipe(z.number().finite().min(0).max(20000));

export function energyDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

const dailyIdentity = {
  profileId: z.string().min(1).max(80),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const time = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value && value >= "2000-01-01" && value <= energyDate();
  }, "Gültigen Tag YYYY-MM-DD senden; keine zukünftigen Tage.")
};
const dayValueSchema = z.object({
  ...dailyIdentity,
  activeEnergyKcal: energyKcalSchema,
  unit: z.literal("kcal"),
  stepCount: z.number().int().min(0).max(200000).optional()
}).strict();
const sampleTextSchema = z.object({
  ...dailyIdentity,
  sourceName: z.string().trim().min(1).max(200).regex(/^[^\r\n\t]+$/),
  sampleRows: z.string().min(1).max(60000),
  stepRows: z.string().max(60000).optional()
}).strict().transform((input, context) => {
  const rows = input.sampleRows.trim().split(/\r?\n/);
  if (rows.length > 2000) { context.addIssue({ code: "custom", message: "Zu viele Energie-Messungen; maximal 2000 pro Tag." }); return z.NEVER; }
  let total = 0, selected = 0;
  const sources = new Set<string>();
  for (const row of rows) {
    const fields = row.split("\t");
    if (fields.length !== 3) { context.addIssue({ code: "custom", message: "Messzeile benötigt Wert, Einheit und Quelle, getrennt durch Tabulatoren." }); return z.NEVER; }
    const [value, unit, source] = fields.map(field => field.trim());
    sources.add(source);
    if (source !== input.sourceName) continue;
    const parsed = energyKcalSchema.safeParse(value);
    if (!parsed.success || unit !== "kcal") { context.addIssue({ code: "custom", message: "Ausgewählte Quelle liefert ungültige Dezimalwerte oder eine andere Einheit als kcal." }); return z.NEVER; }
    total += parsed.data; selected++;
  }
  if (!selected) { context.addIssue({ code: "custom", message: `Keine Messungen für diese Quelle. Empfangene Quellen: ${[...sources].slice(0, 8).join(" · ")}` }); return z.NEVER; }
  if (!Number.isFinite(total) || total > 20000) { context.addIssue({ code: "custom", message: "Energie-Tagessumme ist unplausibel (maximal 20000 kcal)." }); return z.NEVER; }
  let steps = 0, stepSamples = 0;
  if (input.stepRows?.trim()) {
    const stepRows = input.stepRows.trim().split(/\r?\n/);
    if (stepRows.length > 2000) { context.addIssue({ code: "custom", message: "Zu viele Schritt-Messungen; maximal 2000 pro Tag." }); return z.NEVER; }
    for (const row of stepRows) {
      const fields = row.split("\t");
      if (fields.length !== 3) { context.addIssue({ code: "custom", message: "Schritt-Messzeile benötigt Wert, Einheit und Quelle." }); return z.NEVER; }
      const [value, unit, source] = fields.map(field => field.trim());
      if (source !== input.sourceName) continue;
      const parsed = energyKcalSchema.safeParse(value);
      if (!parsed.success || !Number.isInteger(parsed.data) || !["count", "steps", "Schritte"].includes(unit)) { context.addIssue({ code: "custom", message: "Schritte benötigen ganze Zahlen und eine Zähleinheit." }); return z.NEVER; }
      steps += parsed.data; stepSamples++;
    }
    if (steps > 200000) { context.addIssue({ code: "custom", message: "Schrittsumme ist unplausibel (maximal 200000)." }); return z.NEVER; }
  }
  return { profileId: input.profileId, date: input.date, activeEnergyKcal: total, unit: "kcal" as const, sourceName: input.sourceName, sampleCount: selected, ...(stepSamples ? { stepCount: steps } : {}) };
});
export const healthEnergySchema = z.union([dayValueSchema, sampleTextSchema]);

export async function storeHealthEnergy(input: z.infer<typeof healthEnergySchema>) {
  const client = await db();
  const profiles = await client.execute({ sql: "SELECT name FROM profiles WHERE id=?", args: [input.profileId] });
  if (!profiles.rows.length) return null;
  await client.execute({
    sql: `INSERT INTO health_energy_daily (profile_id,date,active_energy_kcal,step_count) VALUES (?,?,?,?)
      ON CONFLICT(profile_id,date) DO UPDATE SET active_energy_kcal=excluded.active_energy_kcal, step_count=COALESCE(excluded.step_count,health_energy_daily.step_count), updated_at=CURRENT_TIMESTAMP`,
    args: [input.profileId, input.date, input.activeEnergyKcal, input.stepCount ?? null]
  });
  return { profileId: input.profileId, profileName: String(profiles.rows[0].name), date: input.date, activeEnergyKcal: input.activeEnergyKcal,
    ...("sourceName" in input ? { sourceName: input.sourceName, sampleCount: input.sampleCount } : {}),
    ...(input.stepCount !== undefined ? { stepCount: input.stepCount } : {}),
    unit: "kcal", message: `${input.stepCount !== undefined ? "Aktive Energie und Schritte" : "Aktive Energie"} gespeichert. Tageswert ersetzt, nicht addiert. Keine Trainingsminuten, Punkte oder Level geändert.` };
}
