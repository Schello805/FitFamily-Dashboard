import { describe, expect, it } from "vitest";
import { trainingProgress } from "@/lib/training-progress";
describe("training level progression", () => {
  it.each([[0, 1, 150], [149, 1, 1], [150, 2, 300], [449, 2, 1], [450, 3, 450], [899, 3, 1], [900, 4, 600]])("%s minutes gives level %s and %s minutes remaining", (minutes, level, remaining) => {
    expect(trainingProgress(minutes)).toMatchObject({ level, remaining });
  });
  it("counts minutes equally and awards earned badges", () => {
    expect(trainingProgress(1000, 10).badges).toEqual(["Erstes Training", "10 Trainings", "1.000 Minuten"]);
    expect(trainingProgress(149.99, 0).level).toBe(1);
    expect(trainingProgress(-100).xp).toBe(0);
    expect(trainingProgress(Infinity).xp).toBe(0);
    expect(trainingProgress(1e9)).toMatchObject({ level: 50, remaining: 0, percent: 100 });
  });
});
