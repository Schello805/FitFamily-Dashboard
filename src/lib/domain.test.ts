import { describe, expect, it } from "vitest";
import {
  avatarAssetForProfile,
  EQUIPMENT_SEEDS,
  EXERCISE_SEEDS,
  FITNESS_STAGES,
  getAvatarProgress,
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
  });

  it("entwickelt den Avatar anhand des gewählten Starts und getrennter Kraft-/Ausdauerminuten", () => {
    expect(getAvatarProgress(1, 0, 0)).toMatchObject({ fitnessStage: 1, physique: "balanced" });
    expect(getAvatarProgress(2, 1_000, 0)).toMatchObject({ fitnessStage: 3, physique: "strength" });
    expect(getAvatarProgress(2, 0, 1_000)).toMatchObject({ fitnessStage: 3, physique: "endurance" });
    expect(getAvatarProgress(3, 500, 500)).toMatchObject({ fitnessStage: 4, physique: "balanced" });
    expect(getAvatarProgress(0, -10, -50)).toMatchObject({ fitnessStage: 1, physique: "balanced" });
    expect(getAvatarProgress(5, 20_000, 20_000).fitnessStage).toBe(5);
  });

  it("liefert verständliche Bezeichnungen für Ausprägungen und 5 transparente Fitnessstufen", () => {
    expect(physiqueLabel("strength")).toBe("Kraftbetont");
    expect(physiqueLabel("endurance")).toBe("Ausdauerbetont");
    expect(physiqueLabel("balanced")).toBe("Ausgewogen");
    expect(FITNESS_STAGES).toHaveLength(5);
    expect(FITNESS_STAGES[0].stage).toBe(1);
    expect(FITNESS_STAGES[4].stage).toBe(5);
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
