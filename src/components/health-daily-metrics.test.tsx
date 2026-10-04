// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, it, expect } from "vitest";
import { HealthDailyMetrics } from "./health-daily-metrics";
afterEach(cleanup);
it("distinguishes missing steps from a measured zero and labels date and non-scoring source", () => {
  const value = { date: "2026-10-04", activeEnergyKcal: 250, goalKcal: 500, goalPercent: 50, updatedAt: "2026-10-04 11:00:00" };
  const { rerender } = render(<HealthDailyMetrics value={value} />);
  expect(screen.getByText("Noch nicht übertragen")).toBeTruthy();
  expect(screen.getByText(/50 % von 500/)).toBeTruthy();
  expect(screen.getByText(/4.10.2026 · ohne Wertung/)).toBeTruthy();
  rerender(<HealthDailyMetrics value={{ ...value, stepCount: 0 }} />);
  expect(screen.getByText("0")).toBeTruthy();
  expect(screen.queryByText("Noch nicht übertragen")).toBeNull();
});
