// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AdminHealthTrainingTest } from "./admin-health-training-test";
import { requestJson } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({ requestJson: vi.fn() }));
const request = vi.mocked(requestJson);
afterEach(() => { cleanup(); request.mockReset(); });
const status = { configured: false, profiles: [{ id: "papa", name: "Papa" }], latest: null };

it("creates one family key and visibly refreshes the real test receipt", async () => {
  request.mockResolvedValueOnce(status);
  render(<AdminHealthTrainingTest />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Familienschlüssel erstellen" })).toBeEnabled());
  request.mockResolvedValueOnce({ secret: "a".repeat(43) });
  fireEvent.click(screen.getByRole("button", { name: "Familienschlüssel erstellen" }));
  await waitFor(() => expect(screen.getByLabelText("Familienschlüssel")).toHaveValue("a".repeat(43)));
  expect(request.mock.calls[1][2]).toMatchObject({ method: "POST" });
  request.mockResolvedValueOnce({ ...status, configured: true, latest: { profileName: "Papa", importId: "test-import", saved: 1, alreadyReceived: 0,
    workouts: [{ startedAt: "2026-01-01T11:00:00Z", sourceName: "Gymondo", minutes: 20, testPoints: 30, duplicate: false }] } });
  fireEvent.click(screen.getByRole("button", { name: "Empfang prüfen" }));
  await waitFor(() => expect(screen.getByText(/Import-ID test-import/)).toBeInTheDocument());
  expect(screen.getByRole("cell", { name: "Gymondo" })).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "30" })).toBeInTheDocument();
  expect(screen.getByRole("cell", { name: "Neu · nur Vorschau" })).toBeInTheDocument();
});

it("shows a refresh failure instead of claiming successful reception", async () => {
  request.mockResolvedValueOnce(status);
  render(<AdminHealthTrainingTest />);
  await waitFor(() => expect(screen.getByText("Profil-IDs: Papa: papa")).toBeInTheDocument());
  request.mockRejectedValueOnce(new Error("Server nicht erreichbar"));
  fireEvent.click(screen.getByRole("button", { name: "Empfang prüfen" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Server nicht erreichbar"));
  expect(screen.getByText("Noch kein Trainingstest empfangen.")).toBeInTheDocument();
});
