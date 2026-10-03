export function trainingProgress(minutes: number, completedSessions = 0) {
  const xp = Math.max(0, Math.floor(Number.isFinite(minutes) ? minutes : 0));
  // Level 2: 150 minutes, level 3: 450, level 4: 900. Both training kinds count equally.
  let level = 1;
  while (level < 50 && xp >= 150 * level * (level + 1) / 2) level++;
  const currentThreshold = 150 * (level - 1) * level / 2;
  const nextThreshold = level === 50 ? null : 150 * level * (level + 1) / 2;
  const percent = nextThreshold === null ? 100 : Math.floor(100 * (xp - currentThreshold) / (nextThreshold - currentThreshold));
  const badges = [
    ...(completedSessions >= 1 ? ["Erstes Training"] : []),
    ...(completedSessions >= 10 ? ["10 Trainings"] : []),
    ...(xp >= 1000 ? ["1.000 Minuten"] : [])
  ];
  return { level, xp, nextThreshold, remaining: nextThreshold === null ? 0 : nextThreshold - xp, percent, badges };
}
export type TrainingProgress = ReturnType<typeof trainingProgress>;
