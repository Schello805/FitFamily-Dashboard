// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import "@testing-library/jest-dom/vitest";
import { TouchKeyboard, keyboardDate } from "./touch-keyboard";
import { AdminFamilyEditModal } from "./admin-family-edit-modal";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function Form() {
  const [email, setEmail] = useState("old@example.com");
  const [birthday, setBirthday] = useState("1980-05-31");
  return <><label>E-Mail<input type="email" value={email} onChange={event => setEmail(event.target.value)} /></label>
    <label>Geburtstag<input type="date" value={birthday} onChange={event => setBirthday(event.target.value)} /></label><TouchKeyboard /></>;
}
function open(label: string) {
  fireEvent.focusIn(screen.getByLabelText(label));
  fireEvent.click(screen.getByRole("button", { name: "Bildschirmtastatur öffnen" }));
}
describe("app keyboard without OS keyboard", () => {
  it("opens automatically on a large touch screen, but leaves the phone keyboard alone", () => {
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { maxTouchPoints: 5 }));
    vi.stubGlobal("innerWidth", 1920);
    render(<Form />);
    fireEvent.focusIn(screen.getByLabelText("E-Mail"));
    expect(screen.getByRole("dialog", { name: "E-Mail" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    vi.stubGlobal("innerWidth", 390);
    fireEvent.focusIn(screen.getByLabelText("Geburtstag"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bildschirmtastatur öffnen" })).toBeEnabled();
  });
  it("does not edit fields disabled by their parent fieldset", () => {
    render(<><fieldset disabled><label>Name<input /></label></fieldset><TouchKeyboard /></>);
    fireEvent.focusIn(screen.getByLabelText("Name"));
    expect(screen.queryByRole("button", { name: "Bildschirmtastatur öffnen" })).not.toBeInTheDocument();
  });
  it("updates controlled email fields with letters, @ and dot, without typing", () => {
    render(<Form />);
    open("E-Mail");
    fireEvent.click(screen.getByRole("button", { name: "Leeren" }));
    for (const key of ["p", "a", "p", "a", "@", "x", ".", "d", "e"]) fireEvent.click(screen.getByRole("button", { name: key }));
    fireEvent.click(screen.getByRole("button", { name: "Übernehmen" }));
    expect(screen.getByLabelText("E-Mail")).toHaveValue("papa@x.de");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("updates dates using numeric touch keys and rejects invalid calendar dates", () => {
    render(<Form />);
    open("Geburtstag");
    fireEvent.click(screen.getByRole("button", { name: "Leeren" }));
    for (const digit of "29022024") fireEvent.click(screen.getByRole("button", { name: digit }));
    fireEvent.click(screen.getByRole("button", { name: "Übernehmen" }));
    expect(screen.getByLabelText("Geburtstag")).toHaveValue("2024-02-29");
    expect(keyboardDate("29022023")).toBeNull();
    expect(keyboardDate("31042024")).toBeNull();
  });
  it("cancels without changing the field", () => {
    render(<Form />); open("E-Mail");
    fireEvent.click(screen.getByRole("button", { name: "Leeren" }));
    fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    expect(screen.getByLabelText("E-Mail")).toHaveValue("old@example.com");
  });
  it("puts the admin avatar in a dedicated preview, outside all editable fields", () => {
    render(<AdminFamilyEditModal draft={{ id: "papa", name: "Papa", score: 0, email: null, birthDate: "1980-05-31", startingFitness: 1, avatar: "papa", goal: "Allgemeine Fitness" }} age={46} busy={false} onChange={vi.fn()} onClose={vi.fn()} onSave={vi.fn()} />);
    expect(document.querySelector(".family-avatar-preview .avatar-generated")).not.toBeNull();
    expect(document.querySelector(".admin-edit-fields .avatar-generated")).toBeNull();
    expect(screen.getByText("46 Jahre")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Geburtsdatum ändern" })).toBeEnabled();
  });
});
