// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HistoryView } from "./history-view";
import { requestJson } from "@/lib/api-client";
import type { DashboardProfile } from "@/lib/domain";
vi.mock("@/lib/api-client", () => ({requestJson:vi.fn()}));
vi.mock("@/components/kiosk-idle-bar", () => ({KioskIdleBar:()=>null}));
vi.mock("@/components/toast", () => ({showToast:vi.fn()}));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
const profile={id:"papa",name:"Papa",color:"#22d3ee",score:7} as DashboardProfile;
const session={id:"health:example",startedAt:"2025-08-31T15:21:55Z",endedAt:"2025-08-31T15:27:57Z",status:"completed",source:"health_import",segments:[{id:"health:example",type:"endurance",exerciseName:"Test Health",startedAt:"2025-08-31T15:21:55Z",endedAt:"2025-08-31T15:27:57Z",durationSeconds:316}]};
it("exposes Health editing, sends active minutes separately and refreshes the score", async () => {
  vi.mocked(requestJson).mockResolvedValueOnce({sessions:[session],equipmentStats:[]}).mockResolvedValueOnce({profiles:[profile]})
    .mockResolvedValueOnce({ok:true}).mockResolvedValueOnce({sessions:[session],equipmentStats:[]}).mockResolvedValueOnce({profiles:[{...profile,score:1}]});
  render(<HistoryView profile={profile} />);
  fireEvent.click(await screen.findByRole("button",{name:"Trainingseinheit bearbeiten"}));
  fireEvent.change(screen.getByLabelText("Aktive Trainingsminuten"),{target:{value:"1"}});
  for(const digit of ["1","2","3","4"]) fireEvent.click(screen.getByRole("button",{name:digit}));
  fireEvent.click(screen.getByRole("button",{name:"Änderungen speichern"}));
  await waitFor(() => expect(requestJson).toHaveBeenCalledWith("/api/manual-training",expect.any(String),expect.objectContaining({method:"PUT",body:expect.stringContaining('"durationSeconds":60')})));
  await waitFor(() => expect(screen.queryByRole("heading",{name:"Training anpassen"})).not.toBeInTheDocument());
  expect(screen.getByText("Punkte gesamt").previousElementSibling).toHaveTextContent("1");
});
it("allows deleting an imported entry but requires a separate confirmation and PIN", async () => {
  vi.mocked(requestJson).mockResolvedValueOnce({sessions:[session],equipmentStats:[]}).mockResolvedValueOnce({profiles:[profile]});
  render(<HistoryView profile={profile} />);
  fireEvent.click(await screen.findByRole("button",{name:"Trainingseinheit löschen"}));
  expect(screen.getByRole("button",{name:"Aus Verlauf und Wertung entfernen"})).toBeDisabled();
  expect(requestJson).toHaveBeenCalledTimes(2);
});
it("keeps the exact stored seconds when saving the rounded minutes unchanged", async () => {
  vi.mocked(requestJson).mockResolvedValueOnce({sessions:[session],equipmentStats:[]}).mockResolvedValueOnce({profiles:[profile]})
    .mockResolvedValueOnce({ok:true}).mockResolvedValueOnce({sessions:[session],equipmentStats:[]}).mockResolvedValueOnce({profiles:[profile]});
  render(<HistoryView profile={profile} />);
  fireEvent.click(await screen.findByRole("button",{name:"Trainingseinheit bearbeiten"}));
  expect(screen.getByLabelText("Aktive Trainingsminuten")).toHaveValue(5.27);
  for(const digit of ["1","2","3","4"]) fireEvent.click(screen.getByRole("button",{name:digit}));
  fireEvent.click(screen.getByRole("button",{name:"Änderungen speichern"}));
  await waitFor(() => expect(requestJson).toHaveBeenCalledWith("/api/manual-training",expect.any(String),expect.objectContaining({method:"PUT",body:expect.stringContaining('"durationSeconds":316')})));
});
