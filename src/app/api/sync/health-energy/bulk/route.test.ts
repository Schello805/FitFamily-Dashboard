import { expect, it } from "vitest";
import { parseRows, type DayRows } from "./route";

it("uses the selected source for Health values grouped by day", () => {
  const days = new Map<string, DayRows>();

  parseRows("2026-10-08\t432.5\tkcal", "Energie-Messungen", days, "energy", "Apple Watch von Michael");
  parseRows("2026-10-08\t7123\tcount\t", "Schritt-Messungen", days, "steps", "Apple Watch von Michael");

  expect(days.get("2026-10-08")).toEqual({
    energy: ["432.5\tkcal\tApple Watch von Michael"],
    steps: ["7123\tcount\tApple Watch von Michael"]
  });
});
