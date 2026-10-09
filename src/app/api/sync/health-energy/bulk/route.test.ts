import { expect, it } from "vitest";
import { BULK_SYNC_MAX_CALENDAR_DAYS, parseRows, type DayRows, validationMessages } from "./route";

it("uses the selected source for Health values grouped by day", () => {
  const days = new Map<string, DayRows>();

  parseRows("2026-10-08\t432.5\tkcal", "Energie-Messungen", days, "energy", "Apple Watch von Michael");
  parseRows("2026-10-08\t7123\tcount\t", "Schritt-Messungen", days, "steps", "Apple Watch von Michael");

  expect(days.get("2026-10-08")).toEqual({
    energy: ["432.5\tkcal\tApple Watch von Michael"],
    steps: ["7123\tcount\tApple Watch von Michael"]
  });
});

it("allows the 31 calendar dates touched by a rolling 30-day period", () => {
  expect(BULK_SYNC_MAX_CALENDAR_DAYS).toBe(31);
});

it("expands nested union validation errors for a useful shortcut response", () => {
  expect(validationMessages({ issues: [{ code: "invalid_union", path: [], message: "Invalid input", errors: [[{ path: ["stepRows"], message: "Schritte benötigen ganze Zahlen." }]] }] }))
    .toEqual(["stepRows: Schritte benötigen ganze Zahlen."]);
});
