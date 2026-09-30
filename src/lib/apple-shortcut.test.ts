import { describe, expect, it } from "vitest";
import { generateAppleShortcutXml } from "./apple-shortcut";

describe("generateAppleShortcutXml", () => {
  it("generates valid Apple Shortcuts plist XML with profile information", () => {
    const xml = generateAppleShortcutXml("papa", "Papa");
    expect(xml).toContain("<!DOCTYPE plist PUBLIC");
    expect(xml).toContain("<string>papa</string>");
    expect(xml).toContain("FitFamily Apple Health Sync für Papa");
    expect(xml).toContain("/api/sync/apple-health");
    expect(xml).toContain("WFWorkflowActions");
  });
});
