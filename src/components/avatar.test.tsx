// @vitest-environment jsdom
import { render, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Avatar } from "./avatar";
import { personalHeadLayout } from "@/lib/domain";

afterEach(cleanup);
describe("Persönliche Kinderköpfe", () => {
  it.each(["fabian", "frieda", "fabian-alt", "frieda-alt"] as const)("verwendet bei %s dieselbe Figur-Geometrie für Vorschau und gespeicherten Kopf", (avatar) => {
    const head = personalHeadLayout("kind", avatar);
    const { container, rerender } = render(<Avatar id="kind" avatar={avatar} customAvatar customAvatarSrc="data:image/png;base64,AA==" />);
    const frame = container.querySelector<HTMLElement>(".avatar-figure")!;
    expect(frame.style.getPropertyValue("--head-top")).toBe(`${head.top}%`);
    expect(frame.style.getPropertyValue("--head-cutoff")).toBe(`${head.cutoff}%`);
    expect(container.querySelector(".has-personal-head .avatar-personal-head")).not.toBeNull();
    rerender(<Avatar id="kind" avatar={avatar} customAvatar />);
    expect(container.querySelector(".avatar-personal-head")?.getAttribute("src")).toBe("/api/profiles/kind/avatar");
    expect(frame.style.getPropertyValue("--head-top")).toBe(`${head.top}%`);
  });
  it("blendet den Standardkopf nur bei eigenem Kopf aus", () => {
    const { container } = render(<Avatar id="frieda" avatar="frieda" />);
    expect(container.querySelector(".has-personal-head")).toBeNull();
    expect(container.querySelector(".avatar-personal-head")).toBeNull();
  });

  it("misst auch die Erwachsenenfiguren am Hals statt die kleine Standard-Geometrie zu verwenden", () => {
    expect(personalHeadLayout("mama", "female")).toEqual({ top: 2, width: 44, height: 29, cutoff: 30 });
    expect(personalHeadLayout("papa", "male")).toEqual({ top: 4, width: 54, height: 28, cutoff: 30 });
  });
});
