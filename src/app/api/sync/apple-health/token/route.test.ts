import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { localIsoDate } from "@/lib/apple-health-activity";

const { execute, verifyPin } = vi.hoisted(() => ({ execute: vi.fn(), verifyPin: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: async () => ({ execute }) }));
vi.mock("@/lib/security", () => ({ verifyAdminPinOrReject: verifyPin, createToken: vi.fn(), hashToken: vi.fn() }));

function request() {
  return new Request("http://localhost/api/sync/apple-health/token", { method: "POST", body: JSON.stringify({ profileId: "papa", pin: "2468", action: "check" }) });
}

function prepare(log?: Record<string, unknown>, configured = true) {
  execute.mockResolvedValueOnce({ rows: [{ id: "papa" }] });
  execute.mockResolvedValueOnce({ rows: configured ? [{ created_at: "2026-10-01 10:00:00" }] : [] });
  execute.mockResolvedValueOnce({ rows: log ? [log] : [] });
}

describe("real Apple Health transfer check", () => {
  beforeEach(() => { vi.resetAllMocks(); verifyPin.mockResolvedValue(null); });

  it("requires PIN authorization before reading private imports", async () => {
    verifyPin.mockResolvedValue(Response.json({ error: "PIN falsch" }, { status: 403 }));
    expect((await POST(request())).status).toBe(403);
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not verify a configured key without a real import", async () => {
    prepare();
    expect(await (await POST(request())).json()).toMatchObject({ verified: false, message: expect.stringContaining("Noch keine Übertragung") });
    expect(execute.mock.calls[2][0]).toMatchObject({ args: ["papa", "2026-10-01 10:00:00"] });
  });

  it("explains a missing key", async () => {
    prepare(undefined, false);
    expect(await (await POST(request())).json()).toMatchObject({ verified: false, message: expect.stringContaining("Kein Sync-Schlüssel") });
  });

  it("shows the actual last import error", async () => {
    prepare({ action: "health.apple_sync.failed", details: JSON.stringify({ message: "dailyActivity: ungültiges Datum" }) });
    expect(await (await POST(request())).json()).toMatchObject({ verified: false, message: "dailyActivity: ungültiges Datum" });
  });

  it("verifies received and saved today's core fields without inventing optional values", async () => {
    const day = { date: localIsoDate(new Date()), moveCalories: 386, exerciseMinutes: 8, stepCount: 5735, walkingRunningDistanceKm: 4.66 };
    prepare({ action: "health.apple_sync.completed", details: JSON.stringify({ receivedActivity: { dailyActivity: [day] }, savedActivity: [{ ...day, standHours: 0, cyclingDistanceKm: 0 }] }) });
    expect(await (await POST(request())).json()).toMatchObject({ verified: true, values: day });
  });

  it("flags incomplete imports instead of verifying default zeros", async () => {
    const day = { date: localIsoDate(new Date()), stepCount: 0 };
    prepare({ action: "health.apple_sync.completed", details: JSON.stringify({ receivedActivity: day, savedActivity: [day] }) });
    expect(await (await POST(request())).json()).toMatchObject({ verified: false, message: expect.stringContaining("Trainingsminuten") });
  });

  it("does not verify yesterday's data or malformed diagnostics", async () => {
    prepare({ action: "health.apple_sync.completed", details: "null" });
    expect(await (await POST(request())).json()).toMatchObject({ verified: false });
  });
});
