import { z } from "zod";

const optionalNumber = (max: number) => z.number().nonnegative().max(max).optional().nullable();
const optionalPositiveNumber = (max: number) => z.number().positive().max(max).optional().nullable();

export const APPLE_HEALTH_ACTIVITY_FIELDS = [
  { key: "moveCalories", column: "move_calories", unit: "kcal", schema: optionalNumber(100_000) },
  { key: "moveGoal", column: "move_goal", unit: "kcal", schema: optionalPositiveNumber(100_000) },
  { key: "exerciseMinutes", column: "exercise_minutes", unit: "min", schema: optionalNumber(1440) },
  { key: "exerciseGoal", column: "exercise_goal", unit: "min", schema: optionalPositiveNumber(1440) },
  { key: "standHours", column: "stand_hours", unit: "h", schema: optionalNumber(24) },
  { key: "standGoal", column: "stand_goal", unit: "h", schema: optionalPositiveNumber(24) },
  { key: "stepCount", column: "step_count", unit: "Schritte", schema: z.number().int().nonnegative().max(200_000).optional().nullable() },
  { key: "walkingRunningDistanceKm", column: "walking_running_distance_km", unit: "km", schema: optionalNumber(500) },
  { key: "cyclingDistanceKm", column: "cycling_distance_km", unit: "km", schema: optionalNumber(2_000) },
  { key: "flightsClimbed", column: "flights_climbed", unit: "Etagen", schema: optionalNumber(1_000) }
] as const;

type ActivitySchemaShape = {
  [Field in typeof APPLE_HEALTH_ACTIVITY_FIELDS[number] as Field["key"]]: Field["schema"]
};

export const appleHealthActivityShape = Object.fromEntries(
  APPLE_HEALTH_ACTIVITY_FIELDS.map(({ key, schema }) => [key, schema])
) as ActivitySchemaShape;

export const appleHealthActivitySchema = z.object(appleHealthActivityShape);
export const appleHealthDailySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ...appleHealthActivityShape
}).refine((entry) => APPLE_HEALTH_ACTIVITY_FIELDS.some(({ key }) => entry[key] != null), {
  message: "Jeder Tag braucht mindestens einen Aktivitätswert."
});

export type AppleHealthDailyActivity = z.infer<typeof appleHealthDailySchema>;
export const APPLE_HEALTH_MAX_SYNC_DAYS = 30;

export function mergeAppleHealthDays(days: AppleHealthDailyActivity[], legacyDay?: AppleHealthDailyActivity) {
  const byDate = new Map<string, AppleHealthDailyActivity>();
  for (const day of [...days, ...(legacyDay ? [legacyDay] : [])]) {
    const suppliedValues = Object.fromEntries(Object.entries(day).filter(([key, value]) => key === "date" || value != null));
    const previous = byDate.get(day.date);
    byDate.set(day.date, previous ? { ...previous, ...suppliedValues } as AppleHealthDailyActivity : day);
  }
  return [...byDate.values()];
}

export function localIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function isAppleHealthDateWithinWindow(value: string, today: string) {
  const timestamp = (date: string) => {
    const parsed = Date.parse(`${date}T00:00:00Z`);
    return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === date ? parsed : null;
  };
  const day = timestamp(value);
  const current = timestamp(today);
  return day != null && current != null && day <= current && day >= current - (APPLE_HEALTH_MAX_SYNC_DAYS - 1) * 24 * 60 * 60 * 1000;
}
