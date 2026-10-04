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
it("shows remaining amounts and caps reached goal bars without hiding excess", () => {
  const value = { date: "2026-10-04", activeEnergyKcal: 288.9, stepCount: 3493, updatedAt: "2026-10-04" };
  const { rerender } = render(<HealthDailyMetrics value={value} />);
  expect(screen.getByText("Noch 211,1 kcal")).toBeTruthy();
  expect(screen.getByText("Noch 6.507 Schritte")).toBeTruthy();
  expect(screen.getByRole("progressbar", { name: "Schritte-Ziel" }).getAttribute("aria-valuemax")).toBe("10000");
  rerender(<HealthDailyMetrics value={{ ...value, goalKcal: 250, goalSteps: 3000 }} />);
  expect(screen.getByText("Ziel erreicht · +38,9 kcal")).toBeTruthy();
  expect(screen.getByText("Ziel erreicht · +493 Schritte")).toBeTruthy();
  expect(screen.getByRole("progressbar", { name: "Schritte-Ziel" }).getAttribute("aria-valuenow")).toBe("3000");
});
it("draws separate 30-day kcal and step areas without joining missing days", () => {
  const value = { date: "2026-10-04", activeEnergyKcal: 200, stepCount: 3000, updatedAt: "2026-10-04" };
  const trend = [
    { date: "2026-10-02", activeEnergyKcal: 100, stepCount: null },
    { date: "2026-10-03", activeEnergyKcal: null, stepCount: 0 },
    { date: "2026-10-04", activeEnergyKcal: 200, stepCount: 3000 }
  ];
  const { container } = render(<HealthDailyMetrics value={value} trend={trend} />);
  expect(screen.getByRole("img", { name: /kcal-Verlauf.*2 Tageswerte/ })).toBeTruthy();
  expect(screen.getByRole("img", { name: /Schritte-Verlauf.*2 Tageswerte/ })).toBeTruthy();
  expect(container.querySelectorAll(".health-trend-fill")).toHaveLength(3);
  expect(screen.getAllByText("Letzte 30 Tage")).toHaveLength(2);
});
