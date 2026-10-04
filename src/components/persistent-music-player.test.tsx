// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { PersistentMusicPlayer } from "./persistent-music-player";
import { RADIO_STATIONS } from "@/lib/radio";

const route = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("./theme-toggle", () => ({ ThemeToggle: () => <button>Design</button> }));
vi.mock("@/lib/api-client", () => ({ requestJson: vi.fn(async () => ({ title: "Artist · A very long song title" })) }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); route.pathname = "/"; });

it("keeps the same radio element, audio and station/song across navigation", async () => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  const view = render(<PersistentMusicPlayer />);
  const launch = screen.getByRole("button", { name: "Radiosteuerung öffnen" });
  const audio = view.container.querySelector("audio");
  fireEvent.click(launch);
  fireEvent.click(screen.getByRole("button", { name: "Radio starten" }));
  await waitFor(() => expect(launch).toHaveTextContent("Artist · A very long song title"));
  expect(launch).toHaveTextContent(RADIO_STATIONS[0].name);
  expect(launch).toHaveAttribute("title", `${RADIO_STATIONS[0].name} · Artist · A very long song title`);
  route.pathname = "/profil/papa";
  view.rerender(<PersistentMusicPlayer />);
  expect(view.container.firstElementChild).toHaveClass("persistent-radio");
  expect(view.container.firstElementChild?.className).toBe("persistent-radio");
  expect(view.container.querySelector("audio")).toBe(audio);
  expect(screen.getByRole("button", { name: /Radiosteuerung öffnen/ })).toBe(launch);
  expect(launch).toHaveTextContent("Artist · A very long song title");
});

it("provides a four-tile-wide desktop launch, mobile text and modal exclusion", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const rules = css.slice(css.indexOf("/* One radio anchor"));
  expect(rules).toContain("width: 304px; min-width: 304px; max-width: 304px");
  expect(rules).toContain(".music-launch small { display: block;");
  expect(rules).toContain('body:has([role="dialog"][aria-modal="true"]) .persistent-radio { visibility: hidden; pointer-events: none; }');
  expect(rules).not.toContain("subpage-radio");
});
