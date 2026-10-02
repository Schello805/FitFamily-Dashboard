export function formatCountdown(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safeSeconds / 60)).padStart(2, "0")}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

export function exerciseSlotSeconds(totalSeconds: number, exerciseCount: number, index: number) {
  if (exerciseCount <= 0 || index < 0 || index >= exerciseCount) return 0;
  const wholeSeconds = Math.max(0, Math.floor(totalSeconds));
  const baseSeconds = Math.floor(wholeSeconds / exerciseCount);
  const extraSeconds = wholeSeconds % exerciseCount;
  return baseSeconds + (index < extraSeconds ? 1 : 0);
}

export function getCurrentExerciseIndex(totalSeconds: number, elapsedSeconds: number, exerciseCount: number) {
  if (exerciseCount <= 0) return -1;
  let elapsed = Math.max(0, elapsedSeconds);
  for (let index = 0; index < exerciseCount; index += 1) {
    const slot = exerciseSlotSeconds(totalSeconds, exerciseCount, index);
    if (elapsed < slot) return index;
    elapsed -= slot;
  }
  return exerciseCount - 1;
}

export function getExerciseRemainingSeconds(totalSeconds: number, elapsedSeconds: number, exerciseCount: number, activeIndex: number) {
  if (exerciseCount <= 0 || activeIndex < 0 || activeIndex >= exerciseCount) return 0;
  let elapsed = Math.max(0, elapsedSeconds);
  for (let index = 0; index < activeIndex; index += 1) elapsed -= exerciseSlotSeconds(totalSeconds, exerciseCount, index);
  return Math.max(0, exerciseSlotSeconds(totalSeconds, exerciseCount, activeIndex) - elapsed);
}
