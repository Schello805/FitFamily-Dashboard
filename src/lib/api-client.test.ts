import { afterEach, describe, expect, it, vi } from "vitest";
import { requestJson } from "@/lib/api-client";

afterEach(() => vi.unstubAllGlobals());

describe("requestJson", () => {
  it("returns decoded JSON for successful responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, value: 42 })));

    await expect(requestJson<{ value: number }>("/api/example", "Request fehlgeschlagen"))
      .resolves.toEqual({ ok: true, value: 42 });
  });

  it("uses the server error while retaining the HTTP status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "PIN falsch." }, { status: 401 })));

    await expect(requestJson("/api/example", "Request fehlgeschlagen"))
      .rejects.toMatchObject({ name: "ApiRequestError", message: "PIN falsch.", status: 401 });
  });

  it("falls back when an error response is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));

    await expect(requestJson("/api/example", "Request fehlgeschlagen"))
      .rejects.toMatchObject({ name: "ApiRequestError", message: "Request fehlgeschlagen", status: 503 });
  });
});
