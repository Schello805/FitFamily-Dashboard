import { describe, expect, it } from "vitest";
import {
  APPLE_HEALTH_ACTIVITY_FIELDS,
  appleHealthActivitySchema,
  appleHealthDailySchema,
  isAppleHealthDateWithinWindow,
  mergeAppleHealthDays
} from "@/lib/apple-health-activity";

describe("Apple Health daily activity schema", () => {
  it("keeps API field names and database columns unique", () => {
    expect(new Set(APPLE_HEALTH_ACTIVITY_FIELDS.map(({ key }) => key)).size).toBe(APPLE_HEALTH_ACTIVITY_FIELDS.length);
    expect(new Set(APPLE_HEALTH_ACTIVITY_FIELDS.map(({ column }) => column)).size).toBe(APPLE_HEALTH_ACTIVITY_FIELDS.length);
  });

  it("validates both daily and legacy activity payload fields from the shared schema", () => {
    const values = { stepCount: 5432, cyclingDistanceKm: 4.2 };
    expect(appleHealthActivitySchema.safeParse(values).success).toBe(true);
    expect(appleHealthDailySchema.safeParse({ date: "2026-10-03", ...values }).success).toBe(true);
    expect(appleHealthDailySchema.safeParse({ date: "2026-10-03" }).success).toBe(false);
    expect(appleHealthActivitySchema.safeParse({ stepCount: 200_001 }).success).toBe(false);
  });

  it("merges duplicate dates without erasing values with nulls", () => {
    const days = mergeAppleHealthDays([
      { date: "2026-10-03", stepCount: 5432 },
      { date: "2026-10-03", stepCount: null, cyclingDistanceKm: 2 }
    ]);
    expect(days).toEqual([{ date: "2026-10-03", stepCount: 5432, cyclingDistanceKm: 2 }]);
  });

  it("accepts only valid dates in the inclusive 30-day window ending today", () => {
    expect(isAppleHealthDateWithinWindow("2026-09-04", "2026-10-03")).toBe(true);
    expect(isAppleHealthDateWithinWindow("2026-09-03", "2026-10-03")).toBe(false);
    expect(isAppleHealthDateWithinWindow("2026-10-04", "2026-10-03")).toBe(false);
    expect(isAppleHealthDateWithinWindow("2026-02-30", "2026-10-03")).toBe(false);
  });
});
