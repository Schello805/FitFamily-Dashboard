// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import "@testing-library/jest-dom/vitest";
import { ExerciseStartButton } from "./exercise-start-button";
import { ScanStart } from "./scan-start";
import { requestJson } from "@/lib/api-client";
import { HEALTH_RECORDING_QUESTION } from "@/lib/recording-mode";
vi.mock("next/navigation",()=>({useRouter:()=>({push:vi.fn()})}));
vi.mock("@/components/toast",()=>({showToast:vi.fn()}));
vi.mock("@/lib/api-client",()=>({requestJson:vi.fn()}));
const request=vi.mocked(requestJson);
afterEach(()=>{cleanup();request.mockReset();vi.unstubAllGlobals();});
it("does not start until an explicit answer, and forwards Health mode",async()=>{
  request.mockResolvedValue({ok:true});
  render(<ExerciseStartButton profileId="papa" exerciseId="x" exerciseName="Test" />);
  fireEvent.click(screen.getByRole("button",{name:"Übung jetzt starten"}));
  expect(screen.getByRole("dialog",{name:HEALTH_RECORDING_QUESTION})).toBeInTheDocument();
  expect(request).not.toHaveBeenCalled();
  expect(screen.getByText(/Health-Daten fehlen dadurch nicht/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Ja · nur importierte Trainingszeit werten"}));
  await waitFor(()=>expect(request).toHaveBeenCalled());
  expect(JSON.parse(String(request.mock.calls[0][2]?.body))).toMatchObject({recordingMode:"health"});
});
it("cancel does not start a session",async()=>{
  render(<ExerciseStartButton profileId="papa" exerciseId="x" exerciseName="Test" />);
  fireEvent.click(screen.getByRole("button",{name:"Übung jetzt starten"}));
  fireEvent.keyDown(document,{key:"Escape"});
  await waitFor(()=>expect(screen.getByRole("button",{name:"Übung jetzt starten"})).toBeEnabled());
  expect(request).not.toHaveBeenCalled();
});
it("asks on NFC scans even in StrictMode and sends the selected app mode",async()=>{
  const fetchMock=vi.fn(async(input: RequestInfo | URL,init?:RequestInit)=>{
    expect(input).toBe("/api/scan"); expect(init?.method).toBe("POST");
    return Response.json({error:"Synthetic rejection"},{status:409});
  });
  vi.stubGlobal("fetch",fetchMock);
  render(<StrictMode><ScanStart kind="geraet" id="test-device" /></StrictMode>);
  await screen.findByRole("dialog",{name:HEALTH_RECORDING_QUESTION});
  expect(fetchMock).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Nein · App-Trainingszeit werten"}));
  await screen.findByRole("alert");
  expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({recordingMode:"app",kind:"geraet"});
});
