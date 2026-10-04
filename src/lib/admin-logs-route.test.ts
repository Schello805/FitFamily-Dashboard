import { expect, it, vi } from "vitest";
import { POST } from "@/app/api/admin/logs/route";
const execute = vi.hoisted(() => vi.fn(async () => ({ rows: [{ id: "health", action: "health.energy.failed", created_at: "2026-10-04 10:00:00", details: JSON.stringify({ level: "error", message: "Rejected", received: { sampleRows: "broken" } }) }] })));
vi.mock("./db", () => ({ db: async () => ({ execute }) }));
vi.mock("./security", async original => ({ ...await original<object>(), verifyAdminPinOrReject: async () => null }));
it("includes Health receipts and filters Health before the row limit", async () => {
  const response = await POST(new Request("http://localhost/api/admin/logs", { method: "POST", body: JSON.stringify({ pin: "1234", filter: "health" }) }));
  expect(response.status).toBe(200);
  expect((await response.json()).logs[0].details.received.sampleRows).toBe("broken");
  const call = execute.mock.calls[0] as unknown as [{ sql: string; args: string[] }];
  expect(call[0].sql).toContain("action LIKE 'health.%'");
  expect(call[0].args).toEqual(["health"]);
});
