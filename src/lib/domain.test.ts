import { describe, expect, it } from "vitest";
import {
  avatarAssetForProfile,
  avatarProgressAssetForProfile,
  EQUIPMENT_SEEDS,
  EXERCISE_SEEDS,
  FITNESS_STAGES,
  getAvatarProgress,
  getFitnessStageCount,
  getStartingFitnessStages,
  movementTargetForAge,
  physiqueLabel,
  PROFILE_SEEDS,
  SCORE_MULTIPLIER
} from "@/lib/domain";
import { isAllowedVideoUrl } from "@/lib/exercise-video";

describe("FitFamily-Domänenregeln", () => {
  it("bewertet Ausdauer doppelt so hoch wie Kraft", () => {
    expect(SCORE_MULTIPLIER.strength).toBe(1);
    expect(SCORE_MULTIPLIER.endurance).toBe(2);
  });

  it("liefert genau die vier vereinbarten Startprofile", () => {
    expect(PROFILE_SEEDS.map((profile) => profile.name)).toEqual(["Mama", "Papa", "Fabian", "Frieda"]);
  });

  it("verwendet konfigurierbare Figuren und erhält bestehende Geschlechtswerte kompatibel", () => {
    expect(avatarAssetForProfile("mama", "papa")).toBe("papa");
    expect(avatarAssetForProfile("fabian", "male")).toBe("fabian");
    expect(avatarAssetForProfile("fabian", "fabian-alt")).toBe("fabian-alt");
  });

  it("entwickelt den Avatar anhand des gewählten Starts und getrennter Kraft-/Ausdauerminuten", () => {
    expect(getAvatarProgress(1, 0, 0)).toMatchObject({ fitnessStage: 1, physique: "balanced" });
    expect(getAvatarProgress(2, 1_000, 0)).toMatchObject({ fitnessStage: 3, physique: "strength" });
    expect(getAvatarProgress(2, 0, 1_000)).toMatchObject({ fitnessStage: 3, physique: "endurance" });
    expect(getAvatarProgress(3, 500, 500)).toMatchObject({ fitnessStage: 4, physique: "balanced" });
    expect(getAvatarProgress(0, -10, -50)).toMatchObject({ fitnessStage: 1, physique: "balanced" });
    expect(getAvatarProgress(5, 20_000, 20_000).fitnessStage).toBe(5);
  });

  it("wählt sichtbare Avatar-Entwicklungen nur für Erwachsene", () => {
    expect(avatarProgressAssetForProfile("papa", "male", 1, "balanced")).toBe("papa-stage1");
    expect(avatarProgressAssetForProfile("mama", "female", 1, "balanced", 7)).toBe("mama-stage1");
    expect(avatarProgressAssetForProfile("papa", "male", 2, "balanced", 7)).toBe("papa-stage2");
    expect(avatarProgressAssetForProfile("papa", "male", 3, "balanced", 7)).toBe("papa-stage3");
    expect(avatarProgressAssetForProfile("mama", "female", 7, "strength", 7)).toBe("mama-strength");
    expect(avatarProgressAssetForProfile("papa", "male", 7, "endurance", 7)).toBe("papa-endurance");
    expect(avatarProgressAssetForProfile("mama", "female", 5, "balanced")).toBe("mama");
    expect(avatarProgressAssetForProfile("fabian", "male", 1, "balanced", 3)).toBe("fabian");
    expect(avatarProgressAssetForProfile("frieda", "female", 3, "strength", 3)).toBe("frieda");
    expect(avatarProgressAssetForProfile("fabian", "papa", 3, "strength", 3)).toBe("papa");
  });

  it("gibt Erwachsenen sieben und Kindern drei altersabhängige Stufen", () => {
    expect(getFitnessStageCount("mama", "1980-01-01")).toBe(7);
    expect(getFitnessStageCount("fabian", "2012-01-01")).toBe(3);
    expect(getFitnessStageCount("family-child", "2012-01-01")).toBe(3);
    expect(getFitnessStageCount("fabian", null)).toBe(3);
    expect(getStartingFitnessStages("fabian", "2012-01-01")).toHaveLength(3);
    expect(getStartingFitnessStages("mama", "1980-01-01")).toHaveLength(5);
    expect(getAvatarProgress(5, 1_800, 0, 7).fitnessStage).toBe(7);
    expect(getAvatarProgress(2, 100_000, 0, 3).fitnessStage).toBe(3);
    expect(avatarProgressAssetForProfile("fabian", "fabian-alt", 3, "strength", 3)).toBe("fabian-alt");
  });

  it("liefert verständliche Bezeichnungen für Ausprägungen und 7 Erwachsenen-Fitnessstufen", () => {
    expect(physiqueLabel("strength")).toBe("Kraftbetont");
    expect(physiqueLabel("endurance")).toBe("Ausdauerbetont");
    expect(physiqueLabel("balanced")).toBe("Ausgewogen");
    expect(FITNESS_STAGES).toHaveLength(7);
    expect(FITNESS_STAGES[0].stage).toBe(1);
    expect(FITNESS_STAGES[6].stage).toBe(7);
  });

  it("unterscheidet Übungen an Multifunktionsgeräten", () => {
    const pullupStation = EXERCISE_SEEDS.filter((exercise) => exercise[3] === "Klimmzugstation");
    expect(pullupStation.length).toBeGreaterThanOrEqual(4);
  });

  it("fasst gleichartige Laufbänder mit gemeinsamer Stückzahl zusammen", () => {
    expect(EQUIPMENT_SEEDS.filter(([, name]) => name === "Laufband")).toHaveLength(1);
    expect(EQUIPMENT_SEEDS.find(([, name]) => name === "Laufband")?.[2]).toBe(2);
  });

  it("zeigt altersgerechte Bewegungsziele nach der DOSB-Orientierung", () => {
    expect(movementTargetForAge(8)).toEqual({ minutes: 90, period: "Tag" });
    expect(movementTargetForAge(14)).toEqual({ minutes: 90, period: "Tag" });
    expect(movementTargetForAge(35)).toEqual({ minutes: 150, period: "Woche" });
  });

  it("erlaubt sichere HTTPS-Videolinks nur von YouTube", () => {
    expect(isAllowedVideoUrl("https://youtu.be/abc123")).toBe(true);
    expect(isAllowedVideoUrl("https://www.youtube.com/watch?v=abc123")).toBe(true);
    expect(isAllowedVideoUrl("https://youtube.com.evil.example/watch?v=abc123")).toBe(false);
    expect(isAllowedVideoUrl("http://youtube.com/watch?v=abc123")).toBe(false);
    expect(isAllowedVideoUrl(null)).toBe(true);
  });
});
