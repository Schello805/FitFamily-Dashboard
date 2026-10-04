import { expect, it } from "vitest";
import { zipSync, strToU8 } from "fflate";
import { readHealthExport, workoutFromAttributes } from "./health-export-browser";
const workout = '<Workout sourceName="Gymondo" workoutActivityType="HKWorkoutActivityTypeTraditionalStrengthTraining" startDate="2025-08-31 17:21:55 +0200" endDate="2025-08-31 17:27:57 +0200" duration="5.266666666666667" durationUnit="min" />';
const xml = `<?xml version="1.0"?><!DOCTYPE HealthData [<!ELEMENT HealthData (Workout*)>]><HealthData>${workout}${workout}</HealthData>`;
it("streams XML and compressed ZIP locally, filters Berlin dates and deduplicates", async () => {
  for (const file of [new Blob([xml]), new Blob([new Uint8Array(zipSync({ "apple_health_export/Export.xml": strToU8(xml), "export_cda.xml": strToU8("ignored") }))])]) {
    const found = await readHealthExport(file, "2025-08-31", "2025-08-31", new AbortController().signal, () => {});
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ durationSeconds: 316, trainingType: "strength", startedAt: "2025-08-31T15:21:55Z" });
  }
  expect(await readHealthExport(new Blob([xml]), "2025-09-01", "2025-09-01", new AbortController().signal, () => {})).toEqual([]);
});
it("rejects custom entities, wrong/incomplete exports and duplicate XML members", async () => {
  for (const data of ['<!DOCTYPE HealthData [<!ENTITY x "bad">]><HealthData/>', '<HealthData>', '<Other/>']) {
    await expect(readHealthExport(new Blob([data]), "2025-08-31", "2025-08-31", new AbortController().signal, () => {})).rejects.toThrow();
  }
  const data = zipSync({ "Export.xml": strToU8(xml), "nested/export.xml": strToU8(xml) });
  await expect(readHealthExport(new Blob([new Uint8Array(data)]), "2025-08-31", "2025-08-31", new AbortController().signal, () => {})).rejects.toThrow("genau eine");
});
it("does not invent durations or silently classify unknown workouts", () => {
  const attrs = { startDate: "2025-08-31 17:00:00 +0200", endDate: "2025-08-31 17:01:00 +0200", duration: "1", durationUnit: "min", workoutActivityType: "Unknown" };
  expect(workoutFromAttributes(attrs).trainingType).toBe("");
  expect(() => workoutFromAttributes({ ...attrs, duration: "2" })).toThrow("Trainingsdauer");
});
