import { expect, it, vi } from "vitest";
import { DELETE, POST } from "@/app/api/profiles/[profileId]/avatar/route";
const execute = vi.hoisted(() => vi.fn(async () => ({ rows: [{ id: "frieda", avatar: "frieda" }] })));
vi.mock("./db", () => ({ db: async () => ({ execute }) }));
vi.mock("./ai-config", () => ({ getAiApiKey: async () => null }));
const params = { params: Promise.resolve({ profileId: "frieda" }) };
it("removes personal heads without PIN but rejects foreign websites", async () => {
  const request = new Request("http://localhost/api/profiles/frieda/avatar", { method: "DELETE", headers: { origin: "http://localhost" } });
  expect((await DELETE(request, params)).status).toBe(200);
  expect(execute.mock.calls.length).toBeGreaterThan(1);
  const foreign = new Request(request.url, { method: "DELETE", headers: { origin: "https://foreign.example" } });
  expect((await DELETE(foreign, params)).status).toBe(403);
});
it("generation needs provider, photo and consent, not an admin PIN", async () => {
  const form = new FormData();
  form.set("provider", "openai"); form.set("consent", "yes");
  form.set("photo", new File([new Uint8Array([1, 2])], "photo.jpg", { type: "image/jpeg" }));
  const response = await POST(new Request("http://localhost/api/profiles/frieda/avatar", { method: "POST", body: form }), params);
  expect(response.status).toBe(409); // Missing provider key, not missing PIN.
  expect((await response.json()).error).toContain("API-Schlüssel");
});
