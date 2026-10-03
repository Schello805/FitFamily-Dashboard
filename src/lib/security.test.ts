import { describe, expect, it } from "vitest";
import { adminPinRejectedResponse } from "@/lib/security";

describe("admin PIN response", () => {
  it("uses the standard unauthorized status and message", async () => {
    const response = adminPinRejectedResponse();

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Eltern-PIN ist nicht richtig." });
  });
});
