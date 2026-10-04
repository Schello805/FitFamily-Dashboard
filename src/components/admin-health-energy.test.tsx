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
  expect(screen.getByRole("link", { name: "Mac-Skript herunterladen (.command)" })).toHaveAttribute("href", "/api/admin/health-shortcut?profileId=papa");
  vi.mocked(requestJson).mockResolvedValueOnce({ configured: true, profiles: [], latest: null,
    energyDaily: [{ profile_id: "papa", profile_name: "Papa", date: "2026-10-04", active_energy_kcal: 343.39, updated_at: "2026-10-04 12:00:00" }],
    energyAttempt: { level: "error", message: "Aktive Energie abgelehnt.", importId: "example-import", errors: ["Ungültige Einheit"] }
  });
  fireEvent.click(screen.getByRole("button", { name: "Empfang prüfen" }));
  await waitFor(() => expect(screen.getByRole("cell", { name: "343,4" })).toBeInTheDocument());
  expect(screen.getByRole("alert")).toHaveTextContent("Ungültige Einheit");
  expect(screen.getByRole("alert")).toHaveTextContent("example-import");
  expect(screen.getByText(/Wiederholter Empfang ersetzt den Tageswert/)).toBeInTheDocument();
});
