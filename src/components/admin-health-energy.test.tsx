// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AdminHealthTrainingTest } from "./admin-health-training-test";
import { requestJson } from "@/lib/api-client";

vi.mock("@/lib/api-client", () => ({ requestJson: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
it("shows empty energy separately and refreshes the exact received kcal/error status", async () => {
  vi.mocked(requestJson).mockResolvedValueOnce({ configured: true, profiles: [{ id: "papa", name: "Papa" }], latest: null, energyDaily: [] });
  render(<AdminHealthTrainingTest />);
  await waitFor(() => expect(screen.getByText("Profil-IDs: Papa: papa")).toBeInTheDocument());
  expect(screen.getByText("Noch keine aktive Energie empfangen.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Familienschlüssel ersetzen" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Mac-App herunterladen · inklusive Kurzbefehl-Signierung" })).toHaveAttribute("href", "/api/admin/health-shortcut?format=app&profileId=papa&server=http%3A%2F%2F192.168.1.253%3A3000");
  vi.mocked(requestJson).mockResolvedValueOnce({ configured: true, profiles: [], latest: null,
    energyDaily: [{ profile_id: "papa", profile_name: "Papa", date: "2026-10-04", active_energy_kcal: 343.39, updated_at: "2026-10-04 12:00:00" }],
    energyAttempt: { level: "error", message: "Aktive Energie abgelehnt.", importId: "example-import", errors: ["Ungültige Einheit"] }
  });
  fireEvent.click(screen.getByRole("button", { name: "Empfang prüfen" }));
  await waitFor(() => expect(screen.getByRole("cell", { name: "343,4" })).toBeInTheDocument());
  expect(screen.getByRole("alert")).toHaveTextContent("Ungültige Einheit");
  expect(screen.getByRole("alert")).toHaveTextContent("example-import");
  expect(screen.getByText(/überträgt die letzten 30 Kalendertage/)).toBeInTheDocument();
});
it("saves the daily goals and a weekly training goal per profile", async () => {
  const status = { configured: true, profiles: [{ id: "papa", name: "Papa" }], latest: null };
  vi.mocked(requestJson).mockResolvedValue(status);
  render(<AdminHealthTrainingTest />);
  const steps = await screen.findByRole("spinbutton", { name: "Schritte-Ziel für Papa" });
  expect(steps).toHaveValue(10000);
  expect(screen.getByRole("spinbutton", { name: "Trainingsziel pro Woche für Papa" })).toHaveValue(150);
  fireEvent.change(steps, { target: { value: "8000" } });
  fireEvent.click(screen.getByRole("button", { name: "Ziele speichern" }));
  await waitFor(() => expect(requestJson).toHaveBeenCalledWith("/api/admin/health-training-test", expect.any(String), expect.objectContaining({ method: "PATCH", body: JSON.stringify({ profileId: "papa", goalKcal: 500, goalSteps: 8000, trainingGoalMinutes: 150 }) })));
});

it("deletes exactly one Apple-Health day after confirmation", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.mocked(requestJson)
    .mockResolvedValueOnce({ configured: true, profiles: [{ id: "papa", name: "Papa" }], latest: null, energyDaily: [{ profile_id: "papa", profile_name: "Papa", date: "2026-10-04", active_energy_kcal: 343.39, updated_at: "2026-10-04 12:00:00" }] })
    .mockResolvedValueOnce({ ok: true, deleted: 1 })
    .mockResolvedValueOnce({ configured: true, profiles: [{ id: "papa", name: "Papa" }], latest: null, energyDaily: [] });
  render(<AdminHealthTrainingTest />);
  const remove = await screen.findByRole("button", { name: "Apple-Health-Daten von Papa am 2026-10-04 löschen" });
  fireEvent.click(remove);
  await waitFor(() => expect(requestJson).toHaveBeenCalledWith("/api/admin/health-training-test", expect.any(String), expect.objectContaining({ method: "DELETE", body: JSON.stringify({ profileId: "papa", date: "2026-10-04" }) })));
  expect(confirm).toHaveBeenCalledOnce();
  expect(await screen.findByText("Apple-Health-Daten von Papa am 2026-10-04 gelöscht.")).toBeInTheDocument();
  confirm.mockRestore();
});
