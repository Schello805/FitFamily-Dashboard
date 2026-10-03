// @vitest-environment jsdom
/* eslint-disable @next/next/no-img-element */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { useState, type ComponentProps } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { Dashboard } from "@/components/dashboard";
import { ProfileView } from "@/components/profile-view";
import { ProfileEditModal } from "@/components/profile-edit-modal";
import { ActivityTrendChart } from "@/components/activity-trend-chart";
import { Modal } from "@/components/modal";
import ErrorPage from "@/app/error";
import { PROFILE_SEEDS, type DashboardProfile } from "@/lib/domain";

const { push, toast } = vi.hoisted(() => ({ push: vi.fn(), toast: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/link", () => ({ default: (props: ComponentProps<"a">) => <a {...props} /> }));
vi.mock("next/image", () => ({ default: (props: ComponentProps<"img">) => <img alt={props.alt ?? ""} src={props.src} width={props.width} height={props.height} /> }));
vi.mock("@/components/toast", () => ({ showToast: toast }));
vi.mock("@/components/avatar", () => ({ Avatar: () => <span>Avatar</span> }));
vi.mock("@/components/user-help", () => ({ UserHelp: () => null }));
vi.mock("@/components/personal-avatar-editor", () => ({ PersonalAvatarEditor: () => null }));
vi.mock("@/components/theme-toggle", () => ({ ThemeToggle: () => <button>Design</button> }));

const profile: DashboardProfile = {
  ...PROFILE_SEEDS[1], strengthMinutes: 0, enduranceMinutes: 0, fitnessStage: 1,
  physique: "balanced", strengthShare: 0.5, trainingMinutes: 0, score: 12,
  totalMinutes: 0, todayMinutes: 0, targetPercent: 0, targetMinutes: 150,
  targetPeriod: "Woche", nextTraining: null, activeTraining: null, activityTrend: []
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem("fitfamily_subpage_idle_timeout", "0");
  window.history.replaceState({}, "", "/");
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("dashboard interactions and freshness", () => {
  it("asks for a PIN only when saving profile changes and retains the draft on cancel", async () => {
    const save = vi.fn(async (form: FormData, pin: string) => Boolean(form && pin));
    function Editor() {
      const [pin, setPin] = useState("");
      return <ProfileEditModal profile={profile} avatar="papa" onAvatarChange={() => {}} birthDate={profile.birthDate ?? ""} onBirthDateChange={() => {}} startingFitness={1} onStartingFitnessChange={() => {}} pin={pin} onPinChange={setPin} secondsLeft={0} isMobile busy={false} resettingScore={false} notice="" onClose={() => {}} onResetIdleTimer={() => {}} onResetScore={async () => true} onSubmit={save} onAvatarSaved={() => {}} />;
    }
    render(<Editor />);
    expect(screen.queryByRole("group", { name: "PIN-Tastenfeld" })).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Figur im Dashboard" })).toHaveValue("papa");
    fireEvent.change(screen.getByLabelText("E-Mail-Adresse"), { target: { value: "test@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Änderungen speichern" }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("group", { name: "PIN-Tastenfeld" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.getByLabelText("E-Mail-Adresse")).toHaveValue("test@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Änderungen speichern" }));
    for (const digit of ["2", "4", "6", "8"]) fireEvent.click(screen.getByRole("button", { name: digit }));
    fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(save.mock.calls[0]?.[1]).toBe("2468");
  });
  it("hydrates chart tooltips with real activity data without rebuilding the page", async () => {
    const chart = <ActivityTrendChart points={[{
      date: "2026-10-03", label: "03.10.", resolution: "Tag", activityMinutes: 42,
      targetMinutes: 21.4, measuredDays: 1, periodDays: 1
    }]} color="#22d3ee" targetMinutes={150} targetPeriod="Woche" />;
    const container = document.createElement("div");
    container.innerHTML = renderToString(chart);
    document.body.append(container);
    const onRecoverableError = vi.fn();
    let root: ReturnType<typeof hydrateRoot>;
    await act(async () => { root = hydrateRoot(container, chart, { onRecoverableError }); });
    expect(container.querySelector("svg title")).toHaveTextContent("03.10.: Ø 42 Minuten/Tag");
    expect(onRecoverableError).not.toHaveBeenCalled();
    await act(async () => root!.unmount());
    container.remove();
  });
  it("opens a history dialog outside the card and returns focus on Escape", () => {
    const view = render(<article style={{ transform: "scale(1)", overflow: "hidden" }}>
      <ActivityTrendChart points={[]} color="#22d3ee" targetMinutes={150} targetPeriod="Woche" />
    </article>);
    const chart = screen.getByRole("button");
    chart.focus();
    fireEvent.click(chart);
    const dialog = screen.getByRole("dialog", { name: "Dein Trainingsverlauf" });
    expect(view.container).not.toContainElement(dialog);
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    expect(screen.getByRole("button", { name: "Verlauf schließen" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(chart).toHaveFocus();
  });

  it("labels the vertical minute scale in both compact and expanded charts", () => {
    render(<ActivityTrendChart points={[{ date: "2026-10-03", label: "03.10.", resolution: "Tag", activityMinutes: 42, targetMinutes: 21.4, measuredDays: 1, periodDays: 1 }]} color="#22d3ee" targetMinutes={150} targetPeriod="Woche" />);
    const axis = screen.getByLabelText("Vertikale Achse: Minuten pro Tag");
    expect(axis).toHaveTextContent("50 Min.");
    expect(axis).toHaveTextContent("25 Min.");
    expect(axis).toHaveTextContent("0 Min.");
    expect([...axis.children].map((tick) => (tick as HTMLElement).style.top)).toEqual(["8%", "50%", "92%"]);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getAllByLabelText("Vertikale Achse: Minuten pro Tag")).toHaveLength(2);
    expect(screen.getAllByText("50 Min.")).toHaveLength(2);
  });

  it("retains last data but shows loss of connection and recovers on reconnect", async () => {
    let disconnected = false;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/dashboard") {
        if (disconnected) throw new TypeError("Network unavailable");
        return Response.json({ profiles: [profile] });
      }
      if (String(input) === "/api/version") return Response.json({ version: "test", commit: "test" });
      return Response.json({});
    }));
    render(<Dashboard initialProfiles={[profile]} version="test" revision="test" />);
    await screen.findByText("Lokal verbunden");
    expect(screen.getByText(/Letzte Aktualisierung:/)).toBeInTheDocument();
    disconnected = true;
    fireEvent(window, new Event("offline"));
    expect(screen.getByText("Verbindung unterbrochen")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Papa: Profil öffnen" })).toBeInTheDocument();
    fireEvent(window, new Event("online"));
    await waitFor(() => expect(screen.queryByText("Lokal verbunden")).not.toBeInTheDocument());
    disconnected = false;
    fireEvent(window, new Event("online"));
    await screen.findByText("Lokal verbunden");
  });
});

describe("profile request recovery", () => {
  it("does not restore a stopped training from a poll that began before the stop", async () => {
    const running = { ...profile, activeTraining: {
      sessionId: "session", segmentId: "segment", type: "strength" as const,
      exerciseId: null, exerciseName: null, startedAt: new Date().toISOString(), segmentStartedAt: new Date().toISOString()
    } };
    let resolveInitial!: (response: Response) => void;
    const initialPoll = new Promise<Response>((resolve) => { resolveInitial = resolve; });
    let polls = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/training") return Response.json({ changed: true });
      polls += 1;
      return polls === 1 ? initialPoll : Response.json({ profiles: [profile] });
    }));
    render(<ProfileView initialProfile={running} exercises={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /Training\s*Stoppen/ }));
    await screen.findByText("Lokal verbunden");
    await act(async () => { resolveInitial(Response.json({ profiles: [running] })); });
    expect(screen.queryByRole("button", { name: /Training\s*Stoppen/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Starten\s*Kraft/ })).toBeEnabled();
  });

  it("clears busy after a successful stop whose subsequent refresh fails", async () => {
    let stopped = false;
    const running = { ...profile, activeTraining: {
      sessionId: "session", segmentId: "segment", type: "strength" as const,
      exerciseId: null, exerciseName: null, startedAt: new Date().toISOString(), segmentStartedAt: new Date().toISOString()
    } };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/training") { stopped = true; return Response.json({ changed: true }); }
      if (stopped) throw new TypeError("Refresh unavailable");
      return Response.json({ profiles: [running] });
    }));
    render(<ProfileView initialProfile={running} exercises={[]} />);
    await screen.findByText("Lokal verbunden");
    fireEvent.click(screen.getByRole("button", { name: /Training\s*Stoppen/ }));
    await screen.findByText("Verbindung unterbrochen");
    expect(screen.getByRole("button", { name: /Starten\s*Ausdauer/ })).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "✓ Training beendet & gespeichert" }));
  });

  it("does not navigate to an exercise when its start is rejected", async () => {
    const running = { ...profile, activeTraining: {
      sessionId: "session", segmentId: "segment", type: "strength" as const,
      exerciseId: null, exerciseName: null, startedAt: new Date().toISOString(), segmentStartedAt: new Date().toISOString()
    } };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/training") return Response.json({ error: "Gerät nicht verfügbar." }, { status: 409 });
      return Response.json({ profiles: [running] });
    }));
    render(<ProfileView initialProfile={running} exercises={[{ id: "push-up", name: "Liegestütze", type: "strength", equipment: "Klimmzugstation" }]} />);
    await screen.findByText("Lokal verbunden");
    fireEvent.click(screen.getByRole("button", { name: /Liegestütze\s*Klimmzugstation/ }));
    fireEvent.click(screen.getByRole("button", { name: /Sofort starten/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ type: "error", message: "Gerät nicht verfügbar." })));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /Liegestütze\s*Klimmzugstation/ })).toBeEnabled();
  });

  it("cancels a keyboard countdown without starting training", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("/api/dashboard");
      return Response.json({ profiles: [profile] });
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<ProfileView initialProfile={profile} exercises={[]} />);
    await screen.findByText("Lokal verbunden");
    const start = screen.getByRole("button", { name: /Starten\s*Kraft/ });
    start.focus();
    fireEvent.click(start);
    expect(screen.getByRole("dialog", { name: "Bereitmachen!" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(start).toHaveFocus();
    expect(fetchMock.mock.calls.every(([input]) => input !== "/api/training")).toBe(true);
  });

  it("reports handoff failures without exposing retired Health controls", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/dashboard") return Response.json({ profiles: [profile] });
      throw new TypeError("Network unavailable");
    }));
    render(<ProfileView initialProfile={profile} exercises={[]} />);
    await screen.findByText("Lokal verbunden");
    fireEvent.click(screen.getByRole("button", { name: /Am Handy öffnen/ }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Handy-Verbindung fehlgeschlagen" })));
    expect(screen.queryByText(/Apple Health/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Starten\s*Kraft/ })).toBeEnabled();
    expect(screen.getByRole("button", { name: /Starten\s*Ausdauer/ })).toBeEnabled();
    expect(screen.getByRole("link", { name: /Trainingsplan/ })).toHaveAttribute("href", "/profil/papa/plan");
  });
});

describe("dialog keyboard behavior", () => {
  it("closes only the top dialog and restores its parent focus and background state", () => {
    function NestedDialogs() {
      const [childOpen, setChildOpen] = useState(false);
      return <Modal onClose={() => undefined}>
        <section role="dialog" aria-modal="true" aria-label="Parent">
          <button onClick={() => setChildOpen(true)}>Open child</button>
          {childOpen && <Modal onClose={() => setChildOpen(false)}>
            <section role="dialog" aria-modal="true" aria-label="Child"><button>Child action</button></section>
          </Modal>}
        </section>
      </Modal>;
    }
    const view = render(<NestedDialogs />);
    const trigger = screen.getByRole("button", { name: "Open child" });
    fireEvent.click(trigger);
    expect(screen.getByRole("button", { name: "Child action" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Child" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Parent" })).toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(view.container).toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("hidden");
  });

  it("traps focus, makes the background inert, and blocks close while busy", () => {
    const close = vi.fn();
    const view = render(<><button>Outside</button><Modal onClose={close} closeDisabled>
      <section role="dialog" aria-modal="true" aria-label="Confirm"><button>First</button><button>Last</button></section>
    </Modal></>);
    expect(view.container).toHaveAttribute("inert");
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "Last" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("button", { name: "First" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(close).not.toHaveBeenCalled();
  });

  it("uses the server-content retry action on the error page", () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true })));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const retry = vi.fn();
    render(<ErrorPage error={new Error("Unavailable")} retry={retry} />);
    fireEvent.click(screen.getByRole("button", { name: "Erneut versuchen" }));
    expect(retry).toHaveBeenCalledOnce();
  });
});
