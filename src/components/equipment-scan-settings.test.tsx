// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EquipmentScanSettings } from "./equipment-scan-settings";
import { requestJson } from "@/lib/api-client";
vi.mock("@/lib/api-client", () => ({ requestJson: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const config = { type: "strength", exerciseId: "exercise-a", exercises: [{ id: "exercise-a", name: "Brustpresse" }], baseUrl: "http://192.168.1.253:3000", tagLabel: "" };
it("loads equipment arriving after mount and saves editable sticker labels", async () => {
  vi.mocked(requestJson).mockResolvedValue(config);
  const view = render(<EquipmentScanSettings equipment={[]} pin="1234" />);
  expect(requestJson).not.toHaveBeenCalled();
  view.rerender(<EquipmentScanSettings equipment={[{ id: "a", name: "Station", active: true }]} pin="1234" />);
  await screen.findByLabelText("Standardübung");
  fireEvent.change(screen.getByLabelText(/Tag-Bezeichnung/), { target: { value: "Sticker 01" } });
  fireEvent.click(screen.getByRole("button", { name: "Zuordnung speichern" }));
  await waitFor(() => expect(requestJson).toHaveBeenLastCalledWith("/api/equipment/a/scan", expect.any(String), expect.objectContaining({ body: expect.stringContaining('"tagLabel":"Sticker 01"') })));
});
it("does not apply a late response to a different selected device", async () => {
  let resolveA!: (value: typeof config) => void;
  vi.mocked(requestJson).mockImplementation(url => String(url).includes("/a/") ? new Promise(resolve => { resolveA = resolve; }) : Promise.resolve({ ...config, exerciseId: "b", exercises: [{ id: "b", name: "Laufband" }] }));
  render(<EquipmentScanSettings equipment={[{ id: "a", name: "Station", active: true }, { id: "b", name: "Band", active: true }]} pin="1234" />);
  fireEvent.change(screen.getByLabelText("Gerät"), { target: { value: "b" } });
  await screen.findByRole("option", { name: "Laufband" });
  await act(async () => resolveA(config));
  expect(screen.queryByRole("option", { name: "Brustpresse" })).not.toBeInTheDocument();
});
it("creates a missing exercise on the selected device and enables saving its assignment", async () => {
  vi.mocked(requestJson).mockImplementation(async (url) => url === "/api/exercises" ? { exercise: { id: "new-exercise", name: "Beine heben" } } : { ...config, exerciseId: null, exercises: [] });
  render(<EquipmentScanSettings equipment={[{ id: "a", name: "Beine heben", active: true }]} pin="1234" />);
  await screen.findByRole("option", { name: "Noch keine Übung zugeordnet" });
  expect(screen.getByRole("button", { name: "Zuordnung speichern" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Übung für dieses Gerät anlegen" }));
  expect(screen.getByLabelText("Übungsname")).toHaveValue("Beine heben");
  fireEvent.change(screen.getByLabelText("Anleitung"), { target: { value: "Beine kontrolliert anheben." } });
  fireEvent.change(screen.getByLabelText("Sicherheitshinweise"), { target: { value: "Bei Schmerzen abbrechen." } });
  fireEvent.click(screen.getByRole("button", { name: "Übung anlegen und auswählen" }));
  await screen.findByRole("option", { name: "Beine heben" });
  expect(screen.getByLabelText("Standardübung")).toHaveValue("new-exercise");
  expect(screen.getByRole("button", { name: "Zuordnung speichern" })).toBeEnabled();
  expect(requestJson).toHaveBeenCalledWith("/api/exercises", expect.any(String), expect.objectContaining({ body: expect.stringContaining('"equipment":"Beine heben"') }));
  expect(screen.getByText("Eigener Übungs-Tag: Beine heben")).toBeInTheDocument();
});
it("keeps the optional exercise tag linked to the selected standard exercise", async () => {
  vi.mocked(requestJson).mockResolvedValue({ ...config, exercises: [...config.exercises, { id: "second", name: "Beinpresse" }] });
  render(<EquipmentScanSettings equipment={[{ id: "a", name: "Station", active: true }]} pin="1234" />);
  await screen.findByLabelText("Standardübung");
  fireEvent.change(screen.getByLabelText("Standardübung"), { target: { value: "second" } });
  expect(screen.getByText("Eigener Übungs-Tag: Beinpresse")).toBeInTheDocument();
  expect(screen.getByLabelText("NFC-Link Beinpresse")).toHaveValue("http://192.168.1.253:3000/scan/uebung/second");
  expect(screen.queryByText("Eigener Übungs-Tag: Brustpresse")).not.toBeInTheDocument();
});
