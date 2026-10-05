// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import "@testing-library/jest-dom/vitest";
import { WeeklyRecapCard } from "./weekly-recap-card";

it("separates App and imported training and does not compare incomplete Health weeks as if complete", () => {
  render(<WeeklyRecapCard recap={{
    lastWeek: { startDate: "2026-09-28", endDate: "2026-10-04", appMinutes: 30, healthMinutes: 10, strengthMinutes: 30, enduranceMinutes: 10, steps: 4000, stepDays: 1, activeEnergyKcal: 300, energyDays: 2 },
    previousWeek: { startDate: "2026-09-21", endDate: "2026-09-27", appMinutes: 20, healthMinutes: 0, strengthMinutes: 20, enduranceMinutes: 0, steps: 3000, stepDays: 1, activeEnergyKcal: 0, energyDays: 0 }
  }} />);
  expect(screen.getByRole("region", { name: "Wochenrückblick" })).toBeInTheDocument();
  expect(screen.getByText("Davon FitFamily")).toBeInTheDocument();
  expect(screen.getByText("Davon Apple Health")).toBeInTheDocument();
  expect(screen.getAllByText("Vergleich erst mit 7/7 Tagen")).toHaveLength(2);
  expect(screen.getByText("+20 Min. zur Vorwoche")).toBeInTheDocument();
});
