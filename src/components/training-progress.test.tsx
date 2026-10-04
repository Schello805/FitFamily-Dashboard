// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { TrainingProgress } from "./training-progress";
import { Avatar } from "./avatar";
import { trainingProgress } from "@/lib/training-progress";

afterEach(cleanup);

it("clearly identifies automatic progress separately from self-assessed fitness", () => {
  render(<TrainingProgress progress={trainingProgress(150)} />);
  expect(screen.getByText("★ Trainingslevel 2")).toBeInTheDocument();
  expect(screen.getByText("Automatischer Aufstieg")).toBeInTheDocument();
  expect(screen.getByText("Noch 300 Trainingsminuten bis Level 3")).toBeInTheDocument();
  expect(screen.getByText(/Unabhängig von deiner Fitness-Selbsteinschätzung/)).toBeInTheDocument();
});

it("shows the earned training level on the avatar, not the selected fitness stage", () => {
  render(<Avatar profile={{ id: "papa", avatar: "papa", fitnessStage: 5, physique: "balanced", trainingProgress: { level: 2 } }} />);
  expect(screen.getByText("★ Level 2")).toBeInTheDocument();
  expect(screen.getByLabelText("Trainingslevel 2, automatischer Aufstieg")).toBeInTheDocument();
  expect(screen.queryByText("Stufe 5")).not.toBeInTheDocument();
});

it("labels editing previews without a training level as manually chosen fitness", () => {
  render(<Avatar id="papa" avatar="papa" fitnessStage={5} />);
  expect(screen.getByLabelText("Fitness-Selbsteinschätzung 5, manuell gewählt")).toHaveTextContent("Fitness 5");
});
