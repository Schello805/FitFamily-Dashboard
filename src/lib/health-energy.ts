import { z } from "zod";
import { db } from "./db";

// No locale-dependent coercion, thousands separators or arithmetic in Shortcuts.
export const energyKcalSchema = z.union([
  z.number(),
  z.string().trim().regex(/^\d{1,5}(?:[.,]\d{1,18})?$/, "kcal als Dezimalzahl ohne Tausendertrennzeichen senden.")
    .transform(value => Number(value.replace(",", ".")))
]).pipe(z.number().finite().min(0).max(20000));

export function energyDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export const healthEnergySchema = z.object({
  profileId: z.string().min(1).max(80),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
    const time = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value && value >= "2000-01-01" && value <= energyDate();
  }, "Gültigen Tag YYYY-MM-DD senden; keine zukünftigen Tage."),
  activeEnergyKcal: energyKcalSchema,
  unit: z.literal("kcal")
}).strict();

export async function storeHealthEnergy(input: z.infer<typeof healthEnergySchema>) {
  const client = await db();
  const profiles = await client.execute({ sql: "SELECT name FROM profiles WHERE id=?", args: [input.profileId] });
  if (!profiles.rows.length) return null;
  await client.execute({
    sql: `INSERT INTO health_energy_daily (profile_id,date,active_energy_kcal) VALUES (?,?,?)
      ON CONFLICT(profile_id,date) DO UPDATE SET active_energy_kcal=excluded.active_energy_kcal, updated_at=CURRENT_TIMESTAMP`,
    args: [input.profileId, input.date, input.activeEnergyKcal]
  });
  return { profileId: input.profileId, profileName: String(profiles.rows[0].name), date: input.date, activeEnergyKcal: input.activeEnergyKcal,
    unit: "kcal", message: "Aktive Energie gespeichert. Tageswert ersetzt, nicht addiert. Keine Trainingsminuten, Punkte oder Level geändert." };
}
