type EquipmentMention = {
  pattern: RegExp;
  acceptedInventoryNames: string[];
};

const EQUIPMENT_MENTIONS: EquipmentMention[] = [
  { pattern: /\b(?:beinpress(?:e|en)|beinstreck(?:er|en)|beinbeug(?:er|en))\b/i, acceptedInventoryNames: ["beinpresse", "beinstrecker", "beinbeuger"] },
  { pattern: /\b(?:rudergerät|rudermaschine|ruderergometer|rowing machine)\b/i, acceptedInventoryNames: ["rudergerät", "rudermaschine", "ruderergometer", "rowing machine"] },
  { pattern: /\b(?:kurzhantel(?:n)?|langhantel(?:n)?|hantel(?:n)?|dumbbells?|barbells?)\b/i, acceptedInventoryNames: ["hantel", "dumbbell", "barbell"] },
  { pattern: /\b(?:kettlebell(?:s)?|medizinball|medicine ball|widerstandsband|resistance band|fitnessband)\b/i, acceptedInventoryNames: ["kettlebell", "medizinball", "medicine ball", "widerstandsband", "resistance band", "fitnessband"] },
  { pattern: /\b(?:bankdrücken|bench press)\b/i, acceptedInventoryNames: ["hantelbank", "bankdrückstation", "bench press"] },
  { pattern: /\b(?:kreuzheben|deadlift)\b/i, acceptedInventoryNames: ["langhantel", "hantel", "deadlift"] },
  { pattern: /\b(?:seilspringen|springseil|jump rope)\b/i, acceptedInventoryNames: ["springseil", "seil", "jump rope"] },
  { pattern: /\b(?:sitzendes rudern|rudern am kabelzug|kabelzug-rudern|seated cable row)\b/i, acceptedInventoryNames: ["rudergerät", "ruderstation", "kabelzug-ruderzug"] },
  { pattern: /\b(?:beinpresse|leg press|hackenschmidt)\b/i, acceptedInventoryNames: ["beinpresse", "leg press", "hackenschmidt"] }
];

function flattenPlanText(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenPlanText);
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .filter(([key]) => ["summary", "title", "exercises", "weeks", "sessions"].includes(key))
      .flatMap(([, child]) => flattenPlanText(child));
  }
  return [];
}

/** True when a generated plan references a known machine not present in the configured inventory. */
export function usesUnavailableEquipment(plan: unknown, availableEquipment: string[]): boolean {
  const text = flattenPlanText(plan).join("\n");
  const inventory = availableEquipment.map((name) => name.toLocaleLowerCase("de-DE"));
  return EQUIPMENT_MENTIONS.some(({ pattern, acceptedInventoryNames }) => {
    if (!pattern.test(text)) return false;
    return !inventory.some((name) => acceptedInventoryNames.some((accepted) => name.includes(accepted)));
  });
}
