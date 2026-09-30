import { describe, expect, it } from "vitest";
import { EXERCISE_SEEDS, movementTargetForAge, PROFILE_SEEDS, SCORE_MULTIPLIER } from "@/lib/domain";

describe("FitFamily-Domänenregeln", () => {
  it("bewertet Ausdauer doppelt so hoch wie Kraft", () => {
    expect(SCORE_MULTIPLIER.strength).toBe(1);
    expect(SCORE_MULTIPLIER.endurance).toBe(2);
  });

  it("liefert genau die vier vereinbarten Startprofile", () => {
    expect(PROFILE_SEEDS.map((profile) => profile.name)).toEqual(["Mama", "Papa", "Fabian", "Frieda"]);
  });

  it("unterscheidet Übungen an Multifunktionsgeräten", () => {
    const pullupStation = EXERCISE_SEEDS.filter((exercise) => exercise[3] === "Klimmzugstation");
    expect(pullupStation).toHaveLength(4);
  });

  it("zeigt altersgerechte Bewegungsziele nach der DOSB-Orientierung", () => {
    expect(movementTargetForAge(8)).toEqual({ minutes: 90, period: "Tag" });
    expect(movementTargetForAge(14)).toEqual({ minutes: 90, period: "Tag" });
    expect(movementTargetForAge(35)).toEqual({ minutes: 150, period: "Woche" });
  });
});
