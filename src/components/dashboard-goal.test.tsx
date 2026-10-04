// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { GoalRing } from "./dashboard";
import { UserHelp } from "./user-help";

afterEach(cleanup);
it("fills the goal ring proportionally and caps the drawing, not the actual percentage", () => {
  const { container, rerender } = render(<GoalRing value={50} color="#22d3ee" targetMinutes={150} targetPeriod="Woche" />);
  expect(container.querySelector(".goal-ring-fill")?.getAttribute("stroke-dashoffset")).toBe("50");
  expect(screen.getByRole("img").getAttribute("aria-label")).toContain("150 Minuten pro woche");
  rerender(<GoalRing value={120} color="#22d3ee" targetMinutes={90} targetPeriod="Tag" />);
  expect(container.querySelector(".goal-ring-fill")?.getAttribute("stroke-dashoffset")).toBe("0");
  expect(screen.getByText("120%")).toBeTruthy();
});
it("explains the automatic thresholds and difference between score reset and levels", async () => {
  localStorage.removeItem("fitfamily-user-help-seen-v1");
  render(<UserHelp />);
  expect(await screen.findByText("Trainingslevel: dein langfristiger Fortschritt.")).toBeTruthy();
  expect(screen.getByText(/Level 2 erreichst du ab insgesamt 150 Minuten/)).toBeTruthy();
  expect(screen.getByText(/Ein Punkte-Reset setzt den Level nicht zurück/)).toBeTruthy();
  expect(screen.getByText(/Pro Trainingsminute erhältst du 2 Punkte/)).toBeTruthy();
});
