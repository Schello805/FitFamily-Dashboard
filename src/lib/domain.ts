export type TrainingType = "strength" | "endurance";
export const AVATAR_IDS = ["mama", "papa", "fabian", "frieda"] as const;
export type AvatarId = typeof AVATAR_IDS[number];
export type ProfileAvatar = AvatarId | "female" | "male" | "neutral";

export type Profile = {
  id: string;
  name: string;
  color: string;
  avatar: ProfileAvatar;
  birthDate: string | null;
  scoreBaseline: number;
  goal: string;
};

export function avatarAssetForProfile(profileId: string, avatar: ProfileAvatar) {
  return AVATAR_IDS.includes(avatar as AvatarId) ? avatar : AVATAR_IDS.includes(profileId as AvatarId) ? profileId as AvatarId : "neutral";
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

export type DashboardProfile = Profile & {
  score: number;
  totalMinutes: number;
  todayMinutes: number;
  targetPercent: number;
  targetMinutes: number;
  targetPeriod: "Tag" | "Woche";
  nextTraining: string | null;
  activeTraining: ActiveTraining | null;
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
  { id: "mama", name: "Mama", color: "#a78bfa", avatar: "female", birthDate: null, scoreBaseline: 0, goal: "Allgemeine Fitness" },
  { id: "papa", name: "Papa", color: "#22d3ee", avatar: "male", birthDate: null, scoreBaseline: 0, goal: "Allgemeine Fitness" },
  { id: "fabian", name: "Fabian", color: "#fb923c", avatar: "male", birthDate: null, scoreBaseline: 0, goal: "Allgemeine Fitness" },
  { id: "frieda", name: "Frieda", color: "#4ade80", avatar: "female", birthDate: null, scoreBaseline: 0, goal: "Allgemeine Fitness" }
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
  ["butterfly", "Butterfly", "strength", "Kraftstation"],
  ["lat-pulldown", "Latzug", "strength", "Kraftstation"],
  ["treadmill", "Laufband", "endurance", "Laufband"],
  ["vibration", "Vibrationsplatte", "strength", "Vibrationsplatte"],
  ["punchbag", "Boxsack", "endurance", "Boxsack"],
  ["bike", "Fahrrad", "endurance", "Fahrrad"]
] as const;

export const EQUIPMENT_SEEDS = [
  ["klimmzugstation", "Klimmzugstation", 1],
  ["kraftstation", "Kraftstation", 1],
  ["laufband", "Laufband", 2],
  ["vibrationsplatte", "Vibrationsplatte", 1],
  ["boxsack", "Boxsack", 1],
  ["fahrrad", "Fahrrad", 1]
] as const;
