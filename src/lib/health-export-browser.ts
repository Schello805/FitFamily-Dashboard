import { Unzip, UnzipInflate } from "fflate";
import { SaxesParser } from "saxes";

export type ExportWorkout = {
  externalId: string; startedAt: string; endedAt: string; durationSeconds: number;
  sourceName: string; activityType: string; trainingType: "strength" | "endurance" | "";
};
function healthDate(value: string) {
  const normalized = value.replace(/^(\d{4}-\d{2}-\d{2}) /, "$1T").replace(/ ([+-]\d{2})(\d{2})$/, "$1:$2");
  const date = new Date(normalized);
  if (!Number.isFinite(date.getTime())) throw new Error("Ungültiges Trainingsdatum im Export.");
  return date.toISOString().replace(".000Z", "Z");
}
export function workoutFromAttributes(attrs: Record<string, string>): Omit<ExportWorkout, "externalId"> {
  const startedAt = healthDate(attrs.startDate), endedAt = healthDate(attrs.endDate);
  const factor = { s: 1, sec: 1, min: 60, h: 3600 }[attrs.durationUnit];
  const durationSeconds = Number(attrs.duration) * (factor ?? NaN);
  if (!Number.isFinite(durationSeconds) || durationSeconds < 1 || durationSeconds > 14400 ||
    durationSeconds > (Date.parse(endedAt) - Date.parse(startedAt)) / 1000 + 1 || Date.parse(endedAt) > Date.now() + 300000) {
    throw new Error("Ungültige aktive Trainingsdauer. Keine Zeiten werden geschätzt.");
  }
  const sourceName = attrs.sourceName || "Unbekannt", activityType = attrs.workoutActivityType || "Unbekannt";
  if (sourceName.length > 120 || activityType.length > 100) throw new Error("Trainingsquelle oder Trainingsart zu lang.");
  const kind = activityType.replace("HKWorkoutActivityType", "");
  const strength = ["TraditionalStrengthTraining", "FunctionalStrengthTraining", "CoreTraining", "Pilates", "Yoga"];
  const endurance = ["Cycling", "Running", "Walking", "Swimming", "Elliptical", "Rowing", "StairClimbing", "Hiking", "Dance", "HighIntensityIntervalTraining"];
  return { startedAt, endedAt, durationSeconds, sourceName, activityType,
    trainingType: strength.includes(kind) ? "strength" : endurance.includes(kind) ? "endurance" : "" };
}

/** Entire export stays on this device. Only confirmed workout timing is uploaded. */
export async function readHealthExport(file: Blob, from: string, to: string, signal: AbortSignal,
  progress: (percent: number) => void): Promise<ExportWorkout[]> {
  if (file.size > 4 * 1024 ** 3) throw new Error("Export größer als 4 GiB.");
  const parser = new SaxesParser({ xmlns: false });
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const selected: Omit<ExportWorkout, "externalId">[] = [];
  const day = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" });
  let root = false, bytes = 0, tail = "", xmlEnded = false;
  parser.on("error", error => { throw new Error(`Ungültiger XML-Export: ${error.message}`); });
  parser.on("opentag", tag => {
    if (!root) { if (tag.name !== "HealthData") throw new Error("Kein Apple-Health-Export."); root = true; }
    if (tag.name !== "Workout") return;
    const attrs = tag.attributes as Record<string, string>;
    const workoutDay = day.format(new Date(healthDate(attrs.startDate)));
    if (workoutDay < from || workoutDay > to) return;
    if (selected.length >= 500) throw new Error("Mehr als 500 Trainings. Bitte einen kürzeren Zeitraum wählen.");
    selected.push(workoutFromAttributes(attrs));
  });
  const feed = (data: Uint8Array, final: boolean) => {
    signal.throwIfAborted(); bytes += data.length;
    if (bytes > 4 * 1024 ** 3) throw new Error("Entpackter Export größer als 4 GiB.");
    const text = decoder.decode(data, { stream: !final });
    if ((tail + text).includes("<!ENTITY")) throw new Error("Benutzerdefinierte XML-Entities werden nicht unterstützt.");
    tail = text.slice(-16); parser.write(text);
    if (final) { parser.close(); xmlEnded = true; }
  };
  const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const zipped = signature[0] === 80 && signature[1] === 75;
  let exports = 0;
  const unzip = new Unzip(entry => {
    if (entry.name.split("/").at(-1)?.toLowerCase() !== "export.xml") return;
    if (++exports !== 1) throw new Error("ZIP muss genau eine Export.xml enthalten.");
    entry.ondata = (error, data, final) => { if (error) throw error; feed(data, final); };
    entry.start();
  });
  unzip.register(UnzipInflate);
  for (let offset = 0; offset < file.size; offset += 65536) {
    signal.throwIfAborted();
    const data = new Uint8Array(await file.slice(offset, offset + 65536).arrayBuffer());
    const final = offset + data.length >= file.size;
    if (zipped) unzip.push(data, final); else feed(data, final);
    progress(Math.round((offset + data.length) / file.size * 100));
  }
  if (!root || !xmlEnded || (zipped && exports !== 1)) throw new Error("Unvollständiger Export oder Export.xml fehlt.");
  const unique = new Map<string, ExportWorkout>();
  for (const workout of selected) {
    signal.throwIfAborted();
    const fingerprint = JSON.stringify([workout.startedAt, workout.endedAt, workout.durationSeconds, workout.sourceName, workout.activityType]);
    // Local selection identity only; the server computes the SHA-256 import ID
    // from these exact fields, matching the existing Mac import on LAN HTTP too.
    const externalId = fingerprint;
    unique.set(externalId, { ...workout, externalId });
  }
  return [...unique.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
