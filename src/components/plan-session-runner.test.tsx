// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";
import { PlanSessionRunner } from "./plan-session-runner";
import { requestJson } from "@/lib/api-client";
vi.mock("@/lib/api-client", () => ({ requestJson: vi.fn() }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.mocked(requestJson).mockReset(); localStorage.clear(); });
it("excludes preparation, stops the exercise and waits for a conscious next start", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-04T10:00:00Z"));
  vi.mocked(requestJson).mockImplementation(async (_url, _message, options) => {
    const body = JSON.parse(String(options?.body));
    return body.action === "start" ? { sessionId: "owned", plannedEndAt: new Date(Date.now() + 60000).toISOString() } : { changed: true };
  });
  render(<PlanSessionRunner profileId="test" session={{ title: "Test", type: "strength", minutes: 2, exercises: ["Aufwärmen", "Brustpresse"] }} recordingMode="app" preparationSeconds={5} onClose={() => {}} onGuide={() => {}} />);
  expect(screen.getByText(/Mach dich bereit für Aufwärmen/)).toBeInTheDocument();
  expect(requestJson).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(JSON.parse(String(vi.mocked(requestJson).mock.calls[0][2]?.body))).toMatchObject({ plannedDurationSeconds: 60 });
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(screen.getByText(/Übung beendet/)).toBeInTheDocument();
  expect(vi.mocked(requestJson)).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(vi.mocked(requestJson)).toHaveBeenCalledTimes(2);
  fireEvent.click(screen.getByRole("button", { name: /Nächste Übung starten/ }));
  expect(screen.getByText(/Mach dich bereit für Brustpresse/)).toBeInTheDocument();
  expect(vi.mocked(requestJson)).toHaveBeenCalledTimes(2);
});
