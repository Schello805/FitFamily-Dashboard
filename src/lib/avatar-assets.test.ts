import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Familien-Avatare", () => {
  it("stellt jedes Profil als eigenes transparentes Bild bereit", () => {
    for (const profileId of ["mama", "papa", "fabian", "frieda"]) {
      expect(existsSync(path.join(process.cwd(), "public", "assets", "avatars", `${profileId}.webp`))).toBe(true);
    }
  });

  it("stellt die erwachsenen Entwicklungsstufen transparent bereit", () => {
    for (const profileId of ["mama", "papa"]) {
      for (const variant of ["stage1", "strength", "endurance"]) {
        expect(existsSync(path.join(process.cwd(), "public", "assets", "avatars", `${profileId}-${variant}.webp`))).toBe(true);
      }
    }
  });
});
