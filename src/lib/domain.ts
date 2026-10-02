export type TrainingType = "strength" | "endurance";
export const AVATAR_IDS = ["mama", "papa", "fabian", "frieda"] as const;
export type AvatarId = typeof AVATAR_IDS[number];
export const AVATAR_DESIGN_IDS = [...AVATAR_IDS, "fabian-alt", "frieda-alt"] as const;
export type AvatarDesignId = typeof AVATAR_DESIGN_IDS[number];
export type ProfileAvatar = AvatarDesignId | "female" | "male" | "neutral";
export type AvatarPhysique = "balanced" | "endurance" | "strength";

export type Profile = {
  id: string;
  name: string;
  email?: string | null;
  color: string;
  avatar: ProfileAvatar;
  customAvatar?: boolean;
  startingFitness: number;
  birthDate: string | null;
  scoreBaseline: number;
  scoreResetAt?: string | null;
  targetResetAt?: string | null;
  goal: string;
};

export function avatarAssetForProfile(profileId: string, avatar: ProfileAvatar) {
  if (AVATAR_DESIGN_IDS.includes(avatar as AvatarDesignId)) return avatar as AvatarDesignId;
  return AVATAR_IDS.includes(avatar as AvatarId) ? avatar : AVATAR_IDS.includes(profileId as AvatarId) ? profileId as AvatarId : "neutral";
}

export function avatarProgressAssetForProfile(profileId: string, avatar: ProfileAvatar, fitnessStage: number, physique: AvatarPhysique, stageCount = 7) {
  const base = avatarAssetForProfile(profileId, avatar);
  // Keep children's avatars age-appropriate: their progress is reflected by the stage UI,
  // not by changes to their body shape.
  if (stageCount <= 3 || ["fabian", "fabian-alt", "frieda", "frieda-alt"].includes(base)) return base;
  if (fitnessStage <= 1) return `${base}-stage1`;
  if (fitnessStage === 2) return `${base}-stage2`;
  if (fitnessStage === 3) return `${base}-stage3`;
  if (fitnessStage >= 6 && physique !== "balanced") return `${base}-${physique}`;
  return base;
}

export function physiqueLabel(physique: AvatarPhysique): string {
  switch (physique) {
    case "strength":
      return "Kraftbetont";
    case "endurance":
      return "Ausdauerbetont";
    case "balanced":
      return "Ausgewogen";
  }
}

export const FITNESS_STAGES = [
  { stage: 1, label: "1 · Sanfter Neustart", description: "Der Einstieg beginnt ruhig und ohne Druck" },
  { stage: 2, label: "2 · Wieder in Bewegung", description: "Erste regelmäßige Bewegung" },
  { stage: 3, label: "3 · Einsteiger", description: "Gelegentliche Bewegung und Trainingseinheiten" },
  { stage: 4, label: "4 · Aktiv", description: "Regelmäßiges, ausgewogenes Training" },
  { stage: 5, label: "5 · Fit", description: "Kontinuierliches Training" },
  { stage: 6, label: "6 · Sehr fit", description: "Ambitioniertes Training mit Routine" },
  { stage: 7, label: "7 · Topform", description: "Hohes, langfristig aufgebautes Trainingspensum" }
] as const;

export const CHILD_FITNESS_STAGES = [
  { stage: 1, label: "1 · Start", description: "Jede Bewegung zählt" },
  { stage: 2, label: "2 · Aktiv", description: "Regelmäßig in Bewegung" },
  { stage: 3, label: "3 · Fit", description: "Bewegung ist Teil des Alltags" }
] as const;

export function getFitnessStageCount(profileId: string, birthDate?: string | null) {
  if (birthDate) {
    const birth = new Date(`${birthDate}T00:00:00`);
    if (!Number.isNaN(birth.getTime())) {
      const now = new Date();
      let age = now.getFullYear() - birth.getFullYear();
      const monthDifference = now.getMonth() - birth.getMonth();
      if (monthDifference < 0 || (monthDifference === 0 && now.getDate() < birth.getDate())) age -= 1;
      return age < 18 ? 3 : 7;
    }
  }
  return profileId === "fabian" || profileId === "frieda" ? 3 : 7;
}

export function getStartingFitnessStages(profileId: string, birthDate?: string | null) {
  const count = getFitnessStageCount(profileId, birthDate);
  return count === 3 ? CHILD_FITNESS_STAGES : FITNESS_STAGES;
}

export function getAvatarProgress(startingFitness: number, strengthMinutes: number, enduranceMinutes: number, stageCount = 7) {
  const strength = Math.max(0, strengthMinutes);
  const endurance = Math.max(0, enduranceMinutes);
  const trainingMinutes = strength + endurance;
  // The selected stage is the person's self-assessment. Lifetime training minutes
  // must not silently promote them; automatic progression uses a separate rule.
  const fitnessStage = Math.max(1, Math.min(stageCount, Math.round(startingFitness)));
  const strengthShare = trainingMinutes ? strength / trainingMinutes : 0.5;
  const physique: AvatarPhysique = strengthShare >= 0.62 ? "strength" : strengthShare <= 0.38 ? "endurance" : "balanced";
  return { fitnessStage, physique, strengthShare, trainingMinutes, strengthMinutes: strength, enduranceMinutes: endurance };
}

export type ActiveTraining = {
  sessionId: string;
  segmentId: string;
  type: TrainingType;
  exerciseId: string | null;
  exerciseName: string | null;
  startedAt: string;
  segmentStartedAt: string;
};

export type AppleHealthRings = {
  moveCalories: number;
  moveGoal: number;
  exerciseMinutes: number;
  exerciseGoal: number;
  standHours: number;
  standGoal: number;
  stepCount: number;
  walkingRunningDistanceKm: number;
  flightsClimbed: number;
  lastSyncedAt?: string | null;
};

export type ActivityTrendPoint = {
  date: string;
  activityMinutes: number | null;
  targetMinutes: number;
};

export type DashboardProfile = Profile & {
  strengthMinutes: number;
  enduranceMinutes: number;
  fitnessStage: number;
  physique: AvatarPhysique;
  strengthShare: number;
  trainingMinutes: number;
  score: number;
  totalMinutes: number;
  todayMinutes: number;
  targetPercent: number;
  targetMinutes: number;
  targetPeriod: "Tag" | "Woche";
  nextTraining: string | null;
  activeTraining: ActiveTraining | null;
  appleHealthRings?: AppleHealthRings | null;
  activityTrend: ActivityTrendPoint[];
};

export function movementTargetForAge(age: number) {
  return age < 18
    ? { minutes: 90, period: "Tag" as const }
    : { minutes: 150, period: "Woche" as const };
}

export const SCORE_MULTIPLIER: Record<TrainingType, number> = {
  strength: 1,
  endurance: 2
};

export const PROFILE_SEEDS: Profile[] = [
  { id: "mama", name: "Mama", color: "#a78bfa", avatar: "female", startingFitness: 1, birthDate: null, scoreBaseline: 0, goal: "Allgemeine Fitness" },
  { id: "papa", name: "Papa", color: "#22d3ee", avatar: "male", startingFitness: 1, birthDate: null, scoreBaseline: 0, goal: "Allgemeine Fitness" },
  { id: "fabian", name: "Fabian", color: "#fb923c", avatar: "male", startingFitness: 1, birthDate: null, scoreBaseline: 0, goal: "Allgemeine Fitness" },
  { id: "frieda", name: "Frieda", color: "#4ade80", avatar: "female", startingFitness: 1, birthDate: null, scoreBaseline: 0, goal: "Allgemeine Fitness" }
];

export const GOALS = [
  "Allgemeine Fitness",
  "Mehr Ausdauer",
  "5-km-Lauf",
  "10-km-Lauf",
  "Halbmarathon",
  "Marathon",
  "Muskelaufbau",
  "Kraftpaket",
  "Gewichtsmanagement",
  "Beweglichkeit und Haltung",
  "Boxfitness",
  "Individuelles Ziel"
] as const;

export const EXERCISE_SEEDS = [
  ["pull-up", "Klimmzüge", "strength", "Klimmzugstation"],
  ["push-up", "Liegestütze", "strength", "Klimmzugstation"],
  ["sit-up", "Sit-ups", "strength", "Klimmzugstation"],
  ["leg-raise", "Hängendes Beinheben", "strength", "Klimmzugstation"],
  ["dip", "Dips", "strength", "Klimmzugstation"],
  ["lunge", "Ausfallschritte", "strength", "Klimmzugstation"],
  ["plank", "Unterarmstütz (Plank)", "strength", "Klimmzugstation"],
  ["burpee", "Burpees", "endurance", "Klimmzugstation"],
  ["butterfly", "Butterfly", "strength", "Kraftstation"],
  ["lat-pulldown", "Latzug", "strength", "Kraftstation"],
  ["bench-press", "Bankdrücken", "strength", "Kraftstation"],
  ["rowing", "Rudern", "strength", "Kraftstation"],
  ["shoulder-press", "Schulterdrücken", "strength", "Kraftstation"],
  ["squat", "Kniebeugen", "strength", "Kraftstation"],
  ["deadlift", "Kreuzheben", "strength", "Kraftstation"],
  ["treadmill", "Laufband", "endurance", "Laufband"],
  ["vibration", "Vibrationsplatte", "strength", "Vibrationsplatte"],
  ["punchbag", "Boxsack", "endurance", "Boxsack"],
  ["bike", "Fahrrad", "endurance", "Fahrrad"],
  ["jump-rope", "Seilspringen", "endurance", "Springseil"]
] as const;

export const EQUIPMENT_SEEDS = [
  ["klimmzugstation", "Klimmzugstation", 1],
  ["kraftstation", "Kraftstation", 1],
  ["laufband", "Laufband", 2],
  ["vibrationsplatte", "Vibrationsplatte", 1],
  ["boxsack", "Boxsack", 1],
  ["fahrrad", "Fahrrad", 1],
  ["springseil", "Springseil", 1]
] as const;
