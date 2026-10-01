import { describe, expect, it } from "vitest";
import { getExerciseGuideFromRecord } from "@/lib/exercise-guides";

describe("stored exercise guides", () => {
  it("uses configured steps, safety notes, name and equipment for a custom exercise", () => {
    const guide = getExerciseGuideFromRecord({
      id: "custom-row-1234",
      name: "Rudern am Band",
      equipment: "Fitnessband",
      instructions: "Band sicher befestigen.\nEllbogen kontrolliert nach hinten führen.",
      safetyNotes: "Befestigung vor jedem Satz prüfen.\nBei Schmerzen abbrechen."
    });

    expect(guide.name).toBe("Rudern am Band");
    expect(guide.equipment).toBe("Fitnessband");
    expect(guide.movement).toEqual(["Band sicher befestigen.", "Ellbogen kontrolliert nach hinten führen."]);
    expect(guide.safety).toEqual(["Befestigung vor jedem Satz prüfen.", "Bei Schmerzen abbrechen."]);
  });

  it("keeps the reviewed built-in guide when no custom text has been saved", () => {
    const guide = getExerciseGuideFromRecord({
      id: "push-up",
      name: "Liegestütze",
      equipment: "Klimmzugstation",
      instructions: null,
      safetyNotes: null
    });

    expect(guide.movement.length).toBeGreaterThan(0);
    expect(guide.safety.length).toBeGreaterThan(0);
  });
});
