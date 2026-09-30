import { describe, expect, it } from "vitest";
import { normalizePlanJson } from "./plan-normalizer";

describe("normalizePlanJson", () => {
  it("keeps already normalized plans intact", () => {
    const input = {
      summary: "Ein schöner Plan",
      weeks: [
        {
          week: 1,
          sessions: [
            { title: "Laufen", type: "endurance", minutes: 30, exercises: ["Laufband"] }
          ]
        }
      ]
    };
    const result = normalizePlanJson(input);
    expect(result.summary).toBe("Ein schöner Plan");
    expect(result.weeks).toHaveLength(1);
    expect(result.weeks[0].sessions[0].title).toBe("Laufen");
    expect(result.weeks[0].sessions[0].type).toBe("endurance");
    expect(result.weeks[0].sessions[0].minutes).toBe(30);
    expect(result.weeks[0].sessions[0].exercises).toEqual(["Laufband"]);
  });

  it("handles German keys from OpenAI / Gemini (wochen, einheiten, dauer, uebungen)", () => {
    const germanInput = {
      zusammenfassung: "4-Wochen-Plan für mehr Fitness",
      wochen: [
        {
          woche: 1,
          einheiten: [
            {
              titel: "Ganzkörper-Kraft",
              dauer: 45,
              uebungen: ["Klimmzug", "Liegestütz"]
            },
            {
              titel: "Laufband Ausdauer",
              dauer: 30,
              uebungen: "Laufband, Gehpausen"
            }
          ]
        }
      ]
    };
    const result = normalizePlanJson(germanInput);
    expect(result.summary).toBe("4-Wochen-Plan für mehr Fitness");
    expect(result.weeks).toHaveLength(1);
    expect(result.weeks[0].week).toBe(1);
    expect(result.weeks[0].sessions).toHaveLength(2);
    expect(result.weeks[0].sessions[0].title).toBe("Ganzkörper-Kraft");
    expect(result.weeks[0].sessions[0].type).toBe("strength");
    expect(result.weeks[0].sessions[0].minutes).toBe(45);
    expect(result.weeks[0].sessions[0].exercises).toEqual(["Klimmzug", "Liegestütz"]);

    expect(result.weeks[0].sessions[1].title).toBe("Laufband Ausdauer");
    expect(result.weeks[0].sessions[1].type).toBe("endurance");
    expect(result.weeks[0].sessions[1].minutes).toBe(30);
    expect(result.weeks[0].sessions[1].exercises).toEqual(["Laufband", "Gehpausen"]);
  });

  it("unwraps nested root objects like { trainingsplan: ... }", () => {
    const nested = {
      trainingsplan: {
        summary: "Geschachtelter Plan",
        weeks: [
          {
            week: 1,
            sessions: [{ title: "Rumpf", minutes: 20 }]
          }
        ]
      }
    };
    const result = normalizePlanJson(nested);
    expect(result.summary).toBe("Geschachtelter Plan");
    expect(result.weeks).toHaveLength(1);
    expect(result.weeks[0].sessions[0].title).toBe("Rumpf");
    expect(result.weeks[0].sessions[0].minutes).toBe(20);
    expect(result.weeks[0].sessions[0].type).toBe("strength");
  });
});
