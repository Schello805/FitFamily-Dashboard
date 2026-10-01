import { describe, expect, it } from "vitest";
import { getNextThemeSetting, resolveTheme, type ThemeSetting } from "./theme";

describe("Theme Management", () => {
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
