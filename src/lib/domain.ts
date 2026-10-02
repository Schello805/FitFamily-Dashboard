export type TrainingType = "strength" | "endurance";
export const AVATAR_IDS = ["mama", "papa", "fabian", "frieda"] as const;
export type AvatarId = typeof AVATAR_IDS[number];
export type ProfileAvatar = AvatarId | "female" | "male" | "neutral";
export type AvatarPhysique = "balanced" | "endurance" | "strength";

export type Profile = {
  id: string;
  name: string;
  color: string;
  avatar: ProfileAvatar;
  startingFitness: number;
  birthDate: string | null;
  scoreBaseline: number;
  scoreResetAt?: string | null;
  targetResetAt?: string | null;
  goal: string;
};

export function avatarAssetForProfile(profileId: string, avatar: ProfileAvatar) {
  return AVATAR_IDS.includes(avatar as AvatarId) ? avatar : AVATAR_IDS.includes(profileId as AvatarId) ? profileId as AvatarId : "neutral";
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
  { stage: 1, label: "1 · Gerade am Anfang", description: "Sanfter Einstieg in mehr Bewegung" },
  { stage: 2, label: "2 · Einsteiger", description: "Gelegentliche Bewegung und Trainingseinheiten" },
  { stage: 3, label: "3 · Aktiv", description: "Regelmäßiges, ausgewogenes Training" },
  { stage: 4, label: "4 · Fit", description: "Ambitioniertes, kontinuierliches Training" },
  { stage: 5, label: "5 · Sehr fit", description: "Hohes Trainingspensum und Routine" }
] as const;

export function getAvatarProgress(startingFitness: number, strengthMinutes: number, enduranceMinutes: number) {
  const strength = Math.max(0, strengthMinutes);
  const endurance = Math.max(0, enduranceMinutes);
  const trainingMinutes = strength + endurance;
  const fitnessStage = Math.max(1, Math.min(5, Math.round(startingFitness) + Math.floor(trainingMinutes / 900)));
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
  { id: "mama", name: "Mama", color: "#a78bfa", avatar: "female", startingFitness: 3, birthDate: null, scoreBaseline: 0, goal: "Allgemeine Fitness" },
  { id: "papa", name: "Papa", color: "#22d3ee", avatar: "male", startingFitness: 3, birthDate: null, scoreBaseline: 0, goal: "Allgemeine Fitness" },
  { id: "fabian", name: "Fabian", color: "#fb923c", avatar: "male", startingFitness: 2, birthDate: null, scoreBaseline: 0, goal: "Allgemeine Fitness" },
  { id: "frieda", name: "Frieda", color: "#4ade80", avatar: "female", startingFitness: 2, birthDate: null, scoreBaseline: 0, goal: "Allgemeine Fitness" }
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
