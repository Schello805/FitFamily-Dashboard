// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { GoalRing } from "./dashboard";
import { UserHelp } from "./user-help";

afterEach(cleanup);
it("shows weekly pace behind real progress and hides orange as soon as the precise minutes meet it", () => {
  const props = { value: 7, color: "#22d3ee", targetMinutes: 150, targetPeriod: "Woche" as const, clock: new Date("2026-10-05T12:00:00Z"), timeZone: "Europe/Berlin" };
  const { container, rerender } = render(<GoalRing {...props} actualMinutes={10} />);
  expect(Number(container.querySelector(".goal-ring-expected")?.getAttribute("stroke-dashoffset"))).toBeCloseTo(100 - 100 / 7);
  expect(screen.getByText("Bis heute: 21,4 Min.")).toBeTruthy();
  rerender(<GoalRing {...props} value={14} actualMinutes={21.5} />);
  expect(container.querySelector(".goal-ring-expected")).toBeNull();
});
it("uses the selected timezone at the Sunday to Monday boundary and keeps daily goals without weekly pace", () => {
  const props = { value: 20, color: "#22d3ee", targetMinutes: 150, targetPeriod: "Woche" as const, clock: new Date("2026-10-04T22:30:00Z") };
  const { container, rerender } = render(<GoalRing {...props} timeZone="America/New_York" />);
  expect(container.querySelector(".goal-ring-expected")?.getAttribute("stroke-dashoffset")).toBe("0");
  expect(screen.getByText("Bis heute: 150 Min.")).toBeTruthy();
  rerender(<GoalRing {...props} timeZone="Europe/Berlin" />);
  expect(screen.getByText("Bis heute: 21,4 Min.")).toBeTruthy();
  expect(container.querySelector(".goal-ring-expected")).toBeNull();
  rerender(<GoalRing {...props} targetPeriod="Tag" targetMinutes={90} />);
  expect(container.querySelector(".goal-ring-pace")).toBeNull();
});
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
  expect(screen.getByText(/Pro App-Trainingsminute erhältst du 1 Punkt für Kraft oder 2 Punkte für Ausdauer/)).toBeTruthy();
});
