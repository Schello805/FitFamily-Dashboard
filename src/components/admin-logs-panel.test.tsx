// @vitest-environment jsdom
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { AdminLogsPanel } from "./admin-logs-panel";
afterEach(cleanup);
it("shows the full Health transcript and a dedicated transmission filter", () => {
  render(<AdminLogsPanel entries={[{ id: "receipt", action: "health.energy.failed", createdAt: "2026-10-04 10:00:00", details: { level: "error", message: "Abgelehnt", importId: "test-import", received: { sampleRows: "6.337\tkcal\tWatch" }, errors: ["Quelle fehlt"] } }]} filter="health" loading={false} copying={false} onFilterChange={vi.fn()} onRefresh={vi.fn()} onCopy={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Health · Übertragungen" })).toBeTruthy();
  expect(screen.getByText(/"test-import"/)).toBeTruthy();
  expect(screen.getByText(/"Quelle fehlt"/)).toBeTruthy();
});
