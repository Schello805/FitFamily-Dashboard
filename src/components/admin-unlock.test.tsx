// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AdminView } from "./admin-view";
import { ApiRequestError, requestJson } from "@/lib/api-client";
import { UPDATE_JOB_KEY, UPDATE_RESULT_KEY } from "@/lib/update-state";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/api-client", async original => ({ ...await original<object>(), requestJson: vi.fn() }));
const request = vi.mocked(requestJson);
const authorized = { expiresAt: Date.now() + 60000, providers: { openai: false, gemini: false }, usage: {}, models: { openai: "", gemini: "" }, nas: false };
beforeEach(() => {
  sessionStorage.clear();
  request.mockReset();
  request.mockImplementation(async (_url, _message, init) => {
    if (init?.method === "POST") return authorized;
    throw new ApiRequestError("Nicht angemeldet", 401);
  });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({})));
});
afterEach(() => { cleanup(); sessionStorage.clear(); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function open() {
  render(<AdminView equipment={[]} exercises={[]} />);
  await waitFor(() => expect(request).toHaveBeenCalled());
  await waitFor(() => expect(screen.getByRole("button", { name: "1" })).toBeEnabled());
}
function posts() { return request.mock.calls.filter(call => call[2]?.method === "POST"); }

it("checks exactly once after digit four without an unlock button", async () => {
  await open();
  expect(screen.queryByRole("button", { name: "Entsperren" })).not.toBeInTheDocument();
  for (const digit of ["1", "2", "3"]) fireEvent.click(screen.getByRole("button", { name: digit }));
  expect(posts()).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "4" }));
  await waitFor(() => expect(screen.queryByRole("group", { name: "PIN-Tastenfeld" })).not.toBeInTheDocument());
  expect(posts()).toHaveLength(1);
  expect(posts()[0][2]?.body).toBe(JSON.stringify({ pin: "1234" }));
});

it("clears a rejected PIN and permits a new automatic attempt", async () => {
  await open();
  request.mockRejectedValueOnce(new ApiRequestError("PIN falsch", 401));
  for (const digit of ["1", "2", "3", "4"]) fireEvent.click(screen.getByRole("button", { name: digit }));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("PIN falsch"));
  expect(screen.getByLabelText("Eingegebene Ziffern: 0")).toBeInTheDocument();
  for (const digit of ["4", "3", "2", "1"]) fireEvent.click(screen.getByRole("button", { name: digit }));
  await waitFor(() => expect(posts()).toHaveLength(2));
});

it("also checks a pasted PIN and blocks duplicate attempts while pending", async () => {
  await open();
  let reject!: (error: Error) => void;
  request.mockImplementationOnce(() => new Promise((_resolve, no) => { reject = no; }));
  const input = screen.getByLabelText("Eltern-PIN");
  fireEvent.change(input, { target: { value: "1234" } });
  expect(screen.getByRole("button", { name: "1" })).toBeDisabled();
  fireEvent.change(input, { target: { value: "4321" } });
  fireEvent.submit(input.closest("form")!);
  expect(posts()).toHaveLength(1);
  reject(new ApiRequestError("Verbindung prüfen", 503));
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Verbindung prüfen"));
  expect(input).toBeEnabled();
});

it("resumes the persisted update after restoring authorization", async () => {
  const jobId = "12345678-1234-1234-1234-123456789abc";
  sessionStorage.setItem(UPDATE_JOB_KEY, JSON.stringify({ jobId, startedAt: Date.now() - 10000 }));
  request.mockImplementation(async url => {
    if (url === "/api/admin/verify") return authorized;
    if (String(url).includes("status=1")) return { state: "running", message: "Test-Update läuft" };
    return {};
  });
  render(<AdminView equipment={[]} exercises={[]} />);
  await waitFor(() => expect(screen.getByRole("button", { name: /Sperren/ })).toBeInTheDocument());
  await waitFor(() => expect(request.mock.calls.some(call => String(call[0]).includes(`jobId=${jobId}`))).toBe(true), { timeout: 4500 });
  expect(sessionStorage.getItem(UPDATE_JOB_KEY)).toContain(jobId);
});

it("does not display saved success for a different running revision", async () => {
  sessionStorage.setItem(UPDATE_RESULT_KEY, JSON.stringify({ targetVersion: "0.3.8", targetCommit: "abcdef0" }));
  request.mockImplementation(async url => {
    if (url === "/api/admin/verify") return authorized;
    if (url === "/api/version") return { version: "0.3.8", commit: "1234567" };
    return {};
  });
  render(<AdminView equipment={[]} exercises={[]} />);
  await waitFor(() => expect(screen.getByText(/Update nicht bestätigt: Bitte/)).toBeInTheDocument());
  expect(screen.queryByText(/erfolgreich installiert/i)).not.toBeInTheDocument();
});

it("installs updates using the existing session without another PIN or PIN payload", async () => {
  request.mockImplementation(async (url, _message, init) => {
    if (url === "/api/admin/verify") return authorized;
    if (url === "/api/admin/update" && init?.method === "POST") return { pending: true, jobId: "12345678-1234-1234-1234-123456789abc" };
    if (url === "/api/admin/update") return { hasUpdate: true, version: "0.3.11", latestVersion: "0.3.12", latestCommit: "abcdef0", currentCommit: "1234567" };
    if (url === "/api/admin/health-training-test") return { configured: false, profiles: [], latest: null };
    if (url === "/api/admin/system-status") return { database: { kind: "local", location: "test.db", sizeBytes: 0, error: null }, applicationVolume: { availableBytes: 100, totalBytes: 1000, error: null } };
    return {};
  });
  render(<AdminView equipment={[]} exercises={[]} />);
  await waitFor(() => expect(screen.getByRole("button", { name: /Sperren/ })).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /System, Daten & Speicher/ }));
  expect(screen.queryByRole("heading", { name: "Health-Daten empfangen" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Apple Health \/ Gymondo/ }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "Health-Daten empfangen" })).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: /System, Daten & Speicher/ }));
  fireEvent.click(screen.getByRole("button", { name: "Nach Updates suchen" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Update installieren" })).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Update installieren" }));
  expect(screen.queryByText("Eltern-PIN erneut eingeben")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Jetzt installieren" }));
  await waitFor(() => expect(request.mock.calls.some(call => call[0] === "/api/admin/update" && call[2]?.method === "POST")).toBe(true));
  expect(request.mock.calls.find(call => call[0] === "/api/admin/update" && call[2]?.method === "POST")![2]?.body).toBe("{}");
});
