import { beforeEach, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { GET } from "./route";
import { verifyAdminPinOrReject } from "@/lib/security";

vi.mock("node:fs/promises", () => ({ readFile: vi.fn(), lstat: vi.fn() }));
vi.mock("@/lib/security", () => ({ verifyAdminPinOrReject: vi.fn() }));
vi.mock("@/lib/admin-log", () => ({ writeAdminLog: vi.fn() }));
vi.mock("@/lib/version", () => ({ getAppRevision: () => ({ version: "0.3.8", commit: "abcdef0" }) }));
const jobId = "12345678-1234-1234-1234-123456789abc";
const request = () => new Request(`http://localhost/api/admin/update?status=1&jobId=${jobId}`);
beforeEach(() => { vi.resetAllMocks(); vi.mocked(verifyAdminPinOrReject).mockResolvedValue(null); });

it("never reports a missing or corrupt job as running", async () => {
  vi.mocked(readFile).mockRejectedValueOnce(Object.assign(new Error(), { code: "ENOENT" }));
  expect((await (await GET(request())).json()).state).toBe("unknown");
  vi.mocked(readFile).mockResolvedValueOnce("{broken");
  expect((await (await GET(request())).json()).state).toBe("unknown");
  vi.mocked(readFile).mockRejectedValueOnce(Object.assign(new Error(), { code: "EACCES" }));
  expect((await (await GET(request())).json()).message).toContain("unlesbar");
});
it("confirms success only when the actual running build matches", async () => {
  vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify({ state: "success", jobId, newCommit: "1234567", newVersion: "0.3.8" }));
  expect((await (await GET(request())).json()).state).toBe("unknown");
  vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify({ state: "success", jobId, newCommit: "abcdef0", newVersion: "0.3.8" }));
  expect((await (await GET(request())).json()).state).toBe("success");
});
it("rejects mismatched job files and authenticates before reading status", async () => {
  vi.mocked(readFile).mockResolvedValueOnce(JSON.stringify({ state: "running", jobId: "different" }));
  expect((await (await GET(request())).json()).state).toBe("unknown");
  vi.mocked(readFile).mockClear();
  vi.mocked(verifyAdminPinOrReject).mockResolvedValueOnce(Response.json({ error: "PIN" }, { status: 401 }));
  expect((await GET(request())).status).toBe(401);
  expect(readFile).not.toHaveBeenCalled();
});
