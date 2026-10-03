import { describe, expect, it, vi } from "vitest";
import { GET, POST, DELETE } from "./route";

vi.mock("@/lib/db", () => ({ db: () => { throw new Error("Retired endpoints must not access the database"); } }));

describe("retired sync endpoint", () => {
  for (const [method, handler] of Object.entries({ GET, POST, DELETE })) {
    it(`rejects ${method} without importing, creating keys or deleting stored data`, async () => {
      const response = handler();
      expect(response.status).toBe(410);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.json()).toEqual({ error: expect.stringContaining("eingestellt") });
    });
  }
});
