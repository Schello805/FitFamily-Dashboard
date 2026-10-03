import { expect, it } from "vitest";
import { appleHealthDailySchema } from "./apple-health-activity";

it("does not turn standing duration into completed stand hours", () => {
  const day = appleHealthDailySchema.parse({ date: "2026-10-03", stepCount: 5735, standMinutes: 120 });
  expect(day.standHours).toBeUndefined();
  expect(appleHealthDailySchema.parse({ ...day, standHours: 11 }).standHours).toBe(11);
});
