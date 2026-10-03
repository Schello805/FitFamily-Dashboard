import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

describe("dashboard layout constraints (real browser geometry is checked separately)", () => {
  it("reserves intrinsic score and Health rows and allows short kiosk screens to scroll", () => {
    const cardRule = css.match(/^\.profile-card \{([^}]+)\}/m)?.[1];
    expect(cardRule).toContain("grid-template-rows: auto auto auto auto");
    expect(css).toContain("grid-template-rows: repeat(2, minmax(min-content, 1fr))");
    const shellRules = Array.from(css.matchAll(/\.dashboard-shell\s*\{([^}]+)\}/g), (match) => match[1]);
    expect(shellRules.some((rule) => /(?:^|;)\s*height:\s*100dvh/.test(rule))).toBe(false);
    const compactRules = css.slice(css.indexOf("@media (min-width: 901px) and (max-height: 850px)"));
    expect(compactRules).toContain(".profile-card .profile-heading > .dashboard-history-chart { height: 100px; min-height: 100px; }");
  });

  it("keeps the chart above the stretched profile link hit area", () => {
    const linkRule = css.match(/^\.profile-card-link::after \{([^}]+)\}/m)?.[1] ?? "";
    const chartRule = css.match(/^\.profile-card \.profile-heading > \.dashboard-history-chart \{([^}]+)\}/m)?.[1] ?? "";
    const zIndex = (rule: string) => Number(rule.match(/z-index:\s*(\d+)/)?.[1]);
    expect(zIndex(chartRule)).toBeGreaterThan(zIndex(linkRule));
  });

  it("uses touch hardware detection rather than phone width and keeps night settings unframed", () => {
    const touchRules = css.slice(css.indexOf("@media (any-pointer: coarse)"));
    expect(touchRules).toContain("--touch-target-size: 48px");
    expect(touchRules).toContain("--pinpad-key-height: 58px");
    const toggle = css.match(/^\.night-mode-toggle-wrap \{([^}]+)\}/m)?.[1] ?? "";
    expect(toggle).not.toMatch(/border:|background:/);
    expect(toggle).toContain("min-height: 48px");
  });
});
