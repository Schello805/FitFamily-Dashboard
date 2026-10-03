import { describe, expect, it } from "vitest";
import { automaticTheme, getNextThemeSetting, resolveTheme, type ThemeSetting } from "./theme";
import { DEFAULT_DISPLAY_SETTINGS } from "./display-settings-shared";

describe("Theme Management", () => {
  it("uses Berlin and daylight saving rather than the machine's timezone", () => {
    expect(automaticTheme(new Date("2026-07-01T04:30:00Z"))).toBe("light"); // 06:30 Berlin
    expect(automaticTheme(new Date("2026-01-01T04:30:00Z"))).toBe("dark"); // 05:30 Berlin
    expect(automaticTheme(new Date("2026-07-01T20:30:00Z"))).toBe("dark");
    expect(automaticTheme(new Date("2026-07-01T20:30:00Z"), { ...DEFAULT_DISPLAY_SETTINGS, timeZone: "America/New_York" })).toBe("light");
  });
  it("resolves explicit light and dark themes", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("cycles correctly through system -> light -> dark -> system", () => {
    expect(getNextThemeSetting("system")).toBe("light");
    expect(getNextThemeSetting("light")).toBe("dark");
    expect(getNextThemeSetting("dark")).toBe("system");
  });

  it("handles unknown setting gracefully in cycle", () => {
    expect(getNextThemeSetting("unknown" as ThemeSetting)).toBe("system");
  });
});
