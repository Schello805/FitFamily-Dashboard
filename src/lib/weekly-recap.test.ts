import { expect, it } from "vitest";
import { weeklyRecap } from "./weekly-recap";

it("compares two completed Monday–Sunday weeks, splits app and Health, and keeps missing Health days missing", () => {
  const recap = weeklyRecap(new Date(2026, 9, 5, 12), [
    { startedAt: new Date(2026, 8, 30, 10).toISOString(), endedAt: new Date(2026, 8, 30, 10, 30).toISOString(), type: "strength", source: "app" },
    { startedAt: new Date(2026, 9, 4, 11).toISOString(), endedAt: new Date(2026, 9, 4, 11, 20).toISOString(), type: "endurance", source: "health", factor: 0.5 },
    { startedAt: new Date(2026, 9, 5, 8).toISOString(), endedAt: new Date(2026, 9, 5, 8, 30).toISOString(), type: "strength", source: "app" }
  ], [
    { date: "2026-09-30", stepCount: 4000, activeEnergyKcal: 200 },
    { date: "2026-10-01", stepCount: null, activeEnergyKcal: 100 },
    { date: "2026-09-23", stepCount: 3000, activeEnergyKcal: null }
  ]);
  expect(recap.lastWeek).toMatchObject({ startDate: "2026-09-28", endDate: "2026-10-04", appMinutes: 30, healthMinutes: 10, strengthMinutes: 30, enduranceMinutes: 10, steps: 4000, stepDays: 1, activeEnergyKcal: 300, energyDays: 2 });
  expect(recap.previousWeek).toMatchObject({ startDate: "2026-09-21", endDate: "2026-09-27", appMinutes: 0, healthMinutes: 0, steps: 3000, stepDays: 1, energyDays: 0 });
});
