import { describe, expect, it } from "vitest";
import { exerciseSlotSeconds, formatCountdown, getCurrentExerciseIndex, getExerciseRemainingSeconds } from "@/lib/plan-timers";

describe("Zeitaufteilung von Trainingseinheiten", () => {
  it("verteilt die Gesamtdauer gleichmäßig und erhält auch Restsekunden", () => {
    expect([0, 1, 2, 3].map((index) => exerciseSlotSeconds(1801, 4, index))).toEqual([451, 450, 450, 450]);
    expect([0, 1, 2, 3].reduce((sum, index) => sum + exerciseSlotSeconds(1801, 4, index), 0)).toBe(1801);
  });

  it("zeigt aktuelle Unterübung und deren verbleibende Zeit passend zum Gesamttimer", () => {
    expect(getCurrentExerciseIndex(1800, 449, 4)).toBe(0);
    expect(getExerciseRemainingSeconds(1800, 449, 4, 0)).toBe(1);
    expect(getCurrentExerciseIndex(1800, 450, 4)).toBe(1);
    expect(getExerciseRemainingSeconds(1800, 450, 4, 1)).toBe(450);
    expect(getCurrentExerciseIndex(1800, 1800, 4)).toBe(3);
    expect(getExerciseRemainingSeconds(1800, 1800, 4, 3)).toBe(0);
  });

  it("formatiert Timer als Minuten und Sekunden", () => {
    expect(formatCountdown(1800)).toBe("30:00");
    expect(formatCountdown(9)).toBe("00:09");
    expect(formatCountdown(-1)).toBe("00:00");
  });
});
