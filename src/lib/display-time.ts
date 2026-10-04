export const DEFAULT_TIME_ZONE = "Europe/Berlin";

export function weeklyTargetFraction(clock: Date, timeZone = DEFAULT_TIME_ZONE) {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(clock);
  return (["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(weekday) + 1) / 7;
}
export const CLOCK_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export const TIME_ZONE_OPTIONS = [
  "Europe/Berlin", "Europe/London", "Europe/Paris", "Europe/Vienna", "Europe/Zurich",
  "Europe/Istanbul", "UTC", "America/New_York", "America/Los_Angeles", "Asia/Tokyo", "Australia/Sydney"
];

export function validTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 100) return false;
  try { new Intl.DateTimeFormat("de-DE", { timeZone: value }); return true; } catch { return false; }
}

export function isWithinNightWindow(clock: Date, start: string, end: string, timeZone = DEFAULT_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(clock);
  const current = Number(parts.find(p => p.type === "hour")?.value) * 60 + Number(parts.find(p => p.type === "minute")?.value);
  const minutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const from = minutes(start), to = minutes(end);
  return from > to ? current >= from || current < to : current >= from && current < to;
}
