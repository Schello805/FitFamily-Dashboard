import { describe, expect, it } from "vitest";
import { usesUnavailableEquipment } from "@/lib/plan-equipment-policy";

describe("usesUnavailableEquipment", () => {
  it("rejects invented machines when they are not in the family inventory", () => {
    const plan = { weeks: [{ sessions: [{ title: "Krafttraining", exercises: ["Beinpresse", "Rudern am Kabelzug sitzend"] }] }] };
    expect(usesUnavailableEquipment(plan, ["Kraftstation", "Laufband"])).toBe(true);
  });

  it("allows a machine when the configured inventory contains it", () => {
    const plan = { weeks: [{ sessions: [{ title: "Beintraining", exercises: ["Beinpresse"] }] }] };
    expect(usesUnavailableEquipment(plan, ["Beinpresse"])).toBe(false);
  });

  it("leaves bodyweight training unaffected", () => {
    const plan = { weeks: [{ sessions: [{ title: "Ganzkörpertraining", exercises: ["Kniebeugen", "Liegestütze"] }] }] };
    expect(usesUnavailableEquipment(plan, ["Kraftstation", "Klimmzugstation"])).toBe(false);
  });
});
