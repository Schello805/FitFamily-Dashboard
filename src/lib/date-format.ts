const germanDateOptions: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric"
};

function toLocalDate(value: string | Date): Date {
  if (value instanceof Date) return value;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]), 12);
  return new Date(value);
}

export function formatGermanDate(value: string | Date, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat("de-DE", { ...germanDateOptions, ...options }).format(toLocalDate(value));
}

export function formatGermanDateTime(value: string | Date) {
  return formatGermanDate(value, { hour: "2-digit", minute: "2-digit" });
}

export function formatGermanTime(value: string | Date) {
  return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit" }).format(toLocalDate(value));
}

/** Server log timestamps without a zone are stored as UTC. */
export function formatGermanLogTimestamp(value: string) {
  const normalized = value.replace(" ", "T");
  const zoned = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : `${normalized}Z`;
  return formatGermanDateTime(zoned);
}

export function formatGermanWeekday(value: string | Date) {
  return new Intl.DateTimeFormat("de-DE", { weekday: "long" }).format(toLocalDate(value));
}
