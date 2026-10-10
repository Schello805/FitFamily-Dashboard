import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { db } from "./db";
import { energyDate, energyKcalSchema, healthEnergySchema, storeHealthEnergy, energyGoal, energyGoalPercent, energyGoalKey, stepGoal, stepGoalKey, trainingGoalKey } from "./health-energy";
import { getDashboardData } from "./dashboard";
import { POST, energyTranscript } from "@/app/api/sync/health-energy/route";
import { DATA_TABLE_SPECS, DATA_IMPORT_ORDER } from "./data-transfer-schema";

vi.mock("./health-training-test", async original => ({ ...await original<object>(), verifyFamilyHealthKey: async (key: string) => key === "test-key" }));
const profileId = "energy-" + randomUUID();
const input = { profileId, date: "2026-10-04", activeEnergyKcal: 343.391100000182, unit: "kcal" as const };
beforeEach(async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-04T12:00:00Z"));
  await (await db()).execute({ sql: "INSERT INTO profiles (id,name,color,avatar) VALUES (?,'Energy Test','#22d3ee','papa')", args: [profileId] });
});
afterEach(async () => {
  vi.useRealTimers();
  await (await db()).execute({ sql: "DELETE FROM profiles WHERE id=?", args: [profileId] });
});
const request = (body: unknown, key = "test-key") => new Request("http://localhost/api/sync/health-energy", {
  method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body)
});

it("records a bounded transcript without arbitrary secrets, including rejected values", async () => {
  const body = { profileId, date: input.date, sourceName: "Watch", sampleRows: "6.337\tkcal\tWatch", secret: "test-key", authorization: "test-key" };
  const response = await POST(request({ ...body, sampleRows: "broken test-key" }));
  expect(response.status).toBe(400);
  const result = await response.json();
  const logs = await (await db()).execute({ sql: "SELECT details FROM audit_log WHERE action='health.energy.failed' AND details LIKE ?", args: [`%${result.importId}%`] });
  const details = JSON.parse(String(logs.rows[0].details));
  expect(details.received.sampleRows).toBe("broken [SCHLÜSSEL ENTFERNT]");
  expect(details.errors.length).toBeGreaterThan(0);
  expect(JSON.stringify(details)).not.toContain("test-key");
  expect(details.received.secret).toBeUndefined();
  const bounded = energyTranscript({ sampleRows: "a".repeat(15000) }, "test-key");
  expect(bounded.transcriptTruncated).toBe(true);
  expect(bounded.sampleRowsCharacters).toBe(15000);
});

it("reads dot and comma decimals without removing separators or multiplying", () => {
  expect(energyKcalSchema.parse("6.337000000000004")).toBe(6.337000000000004);
  expect(energyKcalSchema.parse("343,391100000182")).toBe(input.activeEnergyKcal);
  expect(energyKcalSchema.parse(" 514 ")).toBe(514);
  for (const bad of ["", "1.234,56", "1,234.56", "343 kcal", "1e3", "NaN", "Infinity", -1, 20001, "343391100000182000", null, {}, []]) {
    expect(energyKcalSchema.safeParse(bad).success, String(bad)).toBe(false);
  }
});
it("compares energy against a persistent manual goal, without changing training", async () => {
  expect(energyGoal(null)).toBe(500);
  expect(energyGoalPercent(250, 500)).toBe(50);
  expect(energyGoalPercent(750, 500)).toBe(150);
  await storeHealthEnergy({ ...input, activeEnergyKcal: 250 });
  expect((await getDashboardData()).find(p => p.id === profileId)?.healthEnergy).toMatchObject({ goalKcal: 500, goalPercent: 50 });
  await (await db()).execute({ sql: "INSERT INTO settings(key,value) VALUES (?,?)", args: [energyGoalKey(profileId), "1000"] });
  expect((await getDashboardData()).find(p => p.id === profileId)?.healthEnergy).toMatchObject({ goalKcal: 1000, goalPercent: 25 });
  await (await db()).execute({ sql: "DELETE FROM settings WHERE key=?", args: [energyGoalKey(profileId)] });
});
it("rejects invalid/future dates, wrong units and unwanted training fields", () => {
  for (const date of ["", "04.10.2026", "2026-02-30", "2026-10-05"]) expect(healthEnergySchema.safeParse({ ...input, date }).success).toBe(false);
  expect(healthEnergySchema.safeParse({ ...input, unit: "kJ" }).success).toBe(false);
  expect(healthEnergySchema.safeParse({ ...input, exerciseMinutes: 14 }).success).toBe(false);
  expect(energyDate(new Date("2026-10-03T22:30:00Z"))).toBe("2026-10-04");
});
it("stores and replaces even corrected lower values without affecting training calculations", async () => {
  const before = (await getDashboardData()).find(p => p.id === profileId)!;
  expect(before.healthEnergy).toBeNull();
  await storeHealthEnergy(input);
  await storeHealthEnergy(input);
  await storeHealthEnergy({ ...input, activeEnergyKcal: 300 });
  const after = (await getDashboardData()).find(p => p.id === profileId)!;
  expect(after.healthEnergy).toMatchObject({ date: input.date, activeEnergyKcal: 300 });
  for (const key of ["score", "todayMinutes", "totalMinutes", "targetPercent", "strengthMinutes", "enduranceMinutes", "trainingProgress", "activityTrend"] as const) expect(after[key]).toEqual(before[key]);
  const rows = await (await db()).execute({ sql: "SELECT * FROM health_energy_daily WHERE profile_id=?", args: [profileId] });
  expect(rows.rows).toHaveLength(1);
});
it("keeps a real zero distinct from no receipt and labels historical energy with its actual date", async () => {
  await storeHealthEnergy({ ...input, date: "2026-10-03", activeEnergyKcal: 0 });
  expect((await getDashboardData()).find(p => p.id === profileId)?.healthEnergy).toMatchObject({ date: "2026-10-03", activeEnergyKcal: 0 });
  expect(DATA_TABLE_SPECS.health_energy_daily.keys).toEqual(["profile_id", "date"]);
  expect(DATA_IMPORT_ORDER.indexOf("health_energy_daily")).toBeGreaterThan(DATA_IMPORT_ORDER.indexOf("profiles"));
});
it("authenticates, logs successful normalized kcal and never echoes the secret", async () => {
  expect((await POST(request(input, "wrong"))).status).toBe(401);
  const response = await POST(request({ ...input, activeEnergyKcal: "343,391100000182" }));
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result).toMatchObject({ ok: true, date: input.date, activeEnergyKcal: input.activeEnergyKcal });
  expect(JSON.stringify(result)).not.toContain("test-key");
  const logs = await (await db()).execute({ sql: "SELECT details FROM audit_log WHERE action='health.energy.received' AND details LIKE ?", args: [`%${result.importId}%`] });
  expect(JSON.parse(String(logs.rows[0].details))).toMatchObject({ importId: result.importId, activeEnergyKcal: input.activeEnergyKcal });
});
it("rejects huge, malformed and unknown-profile payloads without writing daily energy", async () => {
  expect((await POST(request({ ...input, activeEnergyKcal: "343391100000182000" }))).status).toBe(400);
  expect((await POST(request({ ...input, profileId: "nonexistent-energy-profile" }))).status).toBe(404);
  expect((await POST(request({ ...input, extra: "x".repeat(140000) }))).status).toBe(413);
  expect((await POST(new Request("http://localhost", { method: "POST", headers: { Authorization: "Bearer test-key" }, body: "not JSON" }))).status).toBe(400);
  expect((await (await db()).execute({ sql: "SELECT * FROM health_energy_daily WHERE profile_id=?", args: [profileId] })).rows).toHaveLength(0);
});
it("sums decimal sample texts from one source only, replacing daily energy without scoring", async () => {
  const payload = { profileId, date: input.date, sourceName: "Apple Watch", sampleRows: "6.337000000000004\tkcal\tApple Watch\n3,663\tkcal\tApple Watch\n900\tkcal\tiPhone" };
  const response = await POST(request(payload));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ activeEnergyKcal: expect.closeTo(10, 10), sourceName: "Apple Watch", sampleCount: 2 });
  expect((await getDashboardData()).find(p => p.id === profileId)?.healthDailyTrend?.at(-1)).toMatchObject({ sourceName: "Apple Watch", activeEnergyKcal: expect.closeTo(10, 10) });
  expect((await getDashboardData()).find(p => p.id === profileId)?.score).toBe(0);
  const again = await POST(request({ ...payload, sampleRows: "5\tkcal\tApple Watch" }));
  expect(await again.json()).toMatchObject({ activeEnergyKcal: 5 });
  for (const sampleRows of ["", "123456789\tkcal\tApple Watch", "5\tkJ\tApple Watch", "5\tkcal\tiPhone", "5 kcal", Array(2002).fill("1\tkcal\tApple Watch").join("\n")]) {
    expect((await POST(request({ ...payload, sampleRows }))).status).toBe(400);
  }
  expect((await (await db()).execute({ sql: "SELECT active_energy_kcal FROM health_energy_daily WHERE profile_id=?", args: [profileId] })).rows[0].active_energy_kcal).toBe(5);
});
it("stores steps separately without scoring, replacing rather than adding and preserving them on old energy uploads", async () => {
  const before = (await getDashboardData()).find(p => p.id === profileId)!;
  const payload = { profileId, date: input.date, sourceName: "Watch", sampleRows: "12\tkcal\tWatch", stepRows: "100\tcount\tWatch\n150\tcount\tWatch\n300\tcount\tiPhone" };
  expect((await POST(request(payload))).status).toBe(200);
  let after = (await getDashboardData()).find(p => p.id === profileId)!;
  expect(after.healthEnergy?.stepCount).toBe(250);
  expect(after.healthEnergy?.goalSteps).toBe(10000);
  expect((await POST(request({ ...payload, stepRows: "3.493\tSchritte\tWatch" }))).status).toBe(200);
  expect((await getDashboardData()).find(p => p.id === profileId)?.healthEnergy?.stepCount).toBe(3493);
  expect((await POST(request({ ...payload, stepRows: "3.493\tAnzahl\tWatch" }))).status).toBe(200);
  expect((await getDashboardData()).find(p => p.id === profileId)?.healthEnergy?.stepCount).toBe(3493);
  expect((await POST(request({ ...payload, stepRows: "3.493 Schritte\tAnzahl\tWatch" }))).status).toBe(200);
  expect((await getDashboardData()).find(p => p.id === profileId)?.healthEnergy?.stepCount).toBe(3493);
  expect((await POST(request({ ...payload, stepRows: "21145\tcount\tWatch" }))).status).toBe(200);
  expect((await getDashboardData()).find(p => p.id === profileId)?.healthEnergy?.stepCount).toBe(21145);
  await (await db()).execute({ sql: "INSERT INTO settings(key,value) VALUES (?,?)", args: [stepGoalKey(profileId), "8000"] });
  expect((await getDashboardData()).find(p => p.id === profileId)?.healthEnergy?.goalSteps).toBe(8000);
  expect(stepGoal("invalid")).toBe(10000);
  expect(stepGoal(0)).toBe(10000);
  expect(stepGoal(1.5)).toBe(10000);
  for (const field of ["score", "todayMinutes", "totalMinutes", "trainingProgress"] as const) expect(after[field]).toEqual(before[field]);
  expect((await POST(request({ ...payload, stepRows: "0\tcount\tWatch" }))).status).toBe(200);
  await POST(request(input));
  after = (await getDashboardData()).find(p => p.id === profileId)!;
  expect(after.healthEnergy?.stepCount).toBe(0);
  for (const stepRows of ["1.5\tcount\tWatch", "2\tkcal\tWatch", "broken"]) expect((await POST(request({ ...payload, stepRows }))).status).toBe(400);
  await POST(request({ ...payload, stepRows: "" }));
  expect((await getDashboardData()).find(p => p.id === profileId)?.healthEnergy?.stepCount).toBe(0);
});
it("counts imported daily training minutes once at factor 1.5 and replaces corrections", async () => {
  const payload = { profileId, date: input.date, sourceName: "Watch", sampleRows: "12\tkcal\tWatch", trainingRows: "20\tmin\tWatch\n10\tminutes\tWatch\n5\tmin\tiPhone" };
  expect((await POST(request(payload))).status).toBe(200);
  let dashboard = (await getDashboardData()).find(p => p.id === profileId)!;
  expect(dashboard.score).toBe(45);
  expect(dashboard.totalMinutes).toBe(30);
  expect(dashboard.todayMinutes).toBe(30);
  expect(dashboard.trainingProgress).toMatchObject({ xp: 30 });
  expect((await POST(request({ ...payload, trainingRows: "10\tmin\tWatch" }))).status).toBe(200);
  dashboard = (await getDashboardData()).find(p => p.id === profileId)!;
  expect(dashboard.score).toBe(15);
  expect(dashboard.totalMinutes).toBe(10);
  expect((await (await db()).execute({ sql: "SELECT training_minutes FROM health_energy_daily WHERE profile_id=?", args: [profileId] })).rows[0].training_minutes).toBe(10);
  expect((await POST(request({ ...payload, trainingRows: "1\tkcal\tWatch" }))).status).toBe(400);
});
it("uses a saved custom weekly training goal instead of the age-based default", async () => {
  await (await db()).execute({ sql: "INSERT INTO settings(key,value) VALUES (?,?)", args: [trainingGoalKey(profileId), "200"] });
  const dashboard = (await getDashboardData()).find(p => p.id === profileId)!;
  expect(dashboard).toMatchObject({ targetMinutes: 200, targetPeriod: "Woche" });
  await (await db()).execute({ sql: "DELETE FROM settings WHERE key=?", args: [trainingGoalKey(profileId)] });
});
it("keeps all imported days and exposes exactly 30 calendar days with gaps", async () => {
  await storeHealthEnergy({ ...input, date: "2026-09-04", activeEnergyKcal: 50, stepCount: 500 });
  await storeHealthEnergy({ ...input, date: "2026-09-05", activeEnergyKcal: 0, stepCount: 0 });
  await storeHealthEnergy({ ...input, date: "2026-10-04", activeEnergyKcal: 250, stepCount: 3500 });
  const days = (await getDashboardData()).find(profile => profile.id === profileId)?.healthDailyTrend ?? [];
  expect(days).toHaveLength(30);
  expect(days[0]).toMatchObject({ date: "2026-09-05", activeEnergyKcal: 0, stepCount: 0 });
  expect(days[1]).toMatchObject({ date: "2026-09-06", activeEnergyKcal: null, stepCount: null });
  expect(days[29]).toMatchObject({ date: "2026-10-04", activeEnergyKcal: 250, stepCount: 3500 });
  expect((await (await db()).execute({ sql: "SELECT COUNT(*) count FROM health_energy_daily WHERE profile_id=?", args: [profileId] })).rows[0].count).toBe(3);
});
