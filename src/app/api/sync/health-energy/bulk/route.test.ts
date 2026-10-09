import { expect, it } from "vitest";
import { BULK_SYNC_MAX_CALENDAR_DAYS, failedDayTranscript, parseRows, receivedDaysTranscript, type DayRows, validationMessages } from "./route";

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

it("keeps a small, exact transcript of a rejected day", () => {
  expect(failedDayTranscript("2026-10-05", { energy: ["421.2\tkcal\tApple Watch"], steps: ["3.493 Schritte\tAnzahl\tApple Watch"] }))
    .toEqual({ date: "2026-10-05", energyRows: ["421.2\tkcal\tApple Watch"], stepRows: ["3.493 Schritte\tAnzahl\tApple Watch"] });
});

it("lists every received daily group for diagnosing a Health shortcut", () => {
  const days = new Map<string, DayRows>([
    ["2026-10-06", { energy: ["500\tkcal\tWatch"], steps: ["4000\tcount\tWatch"] }],
    ["2026-10-05", { energy: ["420\tkcal\tWatch"], steps: ["3000\tcount\tWatch"] }]
  ]);
  expect(receivedDaysTranscript(days)).toEqual([
    { date: "2026-10-05", energyRows: ["420\tkcal\tWatch"], stepRows: ["3000\tcount\tWatch"] },
    { date: "2026-10-06", energyRows: ["500\tkcal\tWatch"], stepRows: ["4000\tcount\tWatch"] }
  ]);
});
