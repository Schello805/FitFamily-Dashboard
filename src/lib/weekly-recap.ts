import type { TrainingType } from "@/lib/domain";

export type WeeklyRecapPeriod = {
  startDate: string;
  endDate: string;
  appMinutes: number;
  healthMinutes: number;
  strengthMinutes: number;
  enduranceMinutes: number;
  steps: number;
  stepDays: number;
  activeEnergyKcal: number;
  energyDays: number;
};

export type WeeklyRecap = { lastWeek: WeeklyRecapPeriod; previousWeek: WeeklyRecapPeriod };
export type RecapSegment = { startedAt: string; endedAt: string | null; type: TrainingType; source: "app" | "health"; factor?: number };
export type RecapHealthDay = { date: string; stepCount: number | null; activeEnergyKcal: number | null };

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function oneWeek(start: Date, segments: RecapSegment[], healthDays: RecapHealthDay[]): WeeklyRecapPeriod {
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  const result: WeeklyRecapPeriod = { startDate: dateKey(start), endDate: dateKey(new Date(end.getTime() - 1)), appMinutes: 0, healthMinutes: 0, strengthMinutes: 0, enduranceMinutes: 0, steps: 0, stepDays: 0, activeEnergyKcal: 0, energyDays: 0 };
  for (const segment of segments) {
    if (!segment.endedAt) continue;
    const started = Date.parse(segment.startedAt);
    const finished = Date.parse(segment.endedAt);
    if (!Number.isFinite(started) || !Number.isFinite(finished) || finished <= started) continue;
    const overlap = Math.max(0, Math.min(finished, end.getTime()) - Math.max(started, start.getTime()));
    const minutes = overlap / 60000 * (Number.isFinite(segment.factor) ? Math.max(0, segment.factor!) : 1);
    if (segment.source === "health") result.healthMinutes += minutes;
    else result.appMinutes += minutes;
    if (segment.type === "strength") result.strengthMinutes += minutes;
    else result.enduranceMinutes += minutes;
  }
  for (const day of healthDays) {
    if (day.date < result.startDate || day.date > result.endDate) continue;
    if (day.stepCount !== null) { result.steps += day.stepCount; result.stepDays += 1; }
    if (day.activeEnergyKcal !== null) { result.activeEnergyKcal += day.activeEnergyKcal; result.energyDays += 1; }
  }
  for (const field of ["appMinutes", "healthMinutes", "strengthMinutes", "enduranceMinutes", "activeEnergyKcal"] as const) result[field] = Math.round(result[field] * 10) / 10;
  return result;
}

export function weeklyRecap(now: Date, segments: RecapSegment[], healthDays: RecapHealthDay[]): WeeklyRecap {
  const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  thisMonday.setDate(thisMonday.getDate() - ((thisMonday.getDay() + 6) % 7));
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(lastMonday.getDate() - 7);
  const previousMonday = new Date(lastMonday);
  previousMonday.setDate(previousMonday.getDate() - 7);
  return { lastWeek: oneWeek(lastMonday, segments, healthDays), previousWeek: oneWeek(previousMonday, segments, healthDays) };
}
