// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AdminView } from "./admin-view";
import { ApiRequestError, requestJson } from "@/lib/api-client";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/api-client", async original => ({ ...await original<object>(), requestJson: vi.fn() }));
const request = vi.mocked(requestJson);
const authorized = { expiresAt: Date.now() + 60000, providers: { openai: false, gemini: false }, usage: {}, models: { openai: "", gemini: "" }, nas: false };
beforeEach(() => {
  request.mockReset();
  request.mockImplementation(async (_url, _message, init) => {
    if (init?.method === "POST") return authorized;
    throw new ApiRequestError("Nicht angemeldet", 401);
  });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({})));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
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
