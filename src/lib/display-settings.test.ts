import { describe, expect, it } from "vitest";
import { getDisplaySettings, setDisplaySettings, DEFAULT_DISPLAY_SETTINGS } from "./display-settings";

describe("display-settings", () => {
  it("returns default display settings initially or on fallback", async () => {
    const settings = await getDisplaySettings();
    expect(typeof settings.idleTimeoutMinutes).toBe("number");
    expect(typeof settings.nightModeEnabled).toBe("boolean");
  });

  it("updates and retrieves idle timeout and night mode", async () => {
    await setDisplaySettings({ idleTimeoutMinutes: 10, nightModeEnabled: false });
    let updated = await getDisplaySettings();
    expect(updated.idleTimeoutMinutes).toBe(10);
    expect(updated.nightModeEnabled).toBe(false);

    await setDisplaySettings({ idleTimeoutMinutes: DEFAULT_DISPLAY_SETTINGS.idleTimeoutMinutes, nightModeEnabled: true });
    updated = await getDisplaySettings();
    expect(updated.idleTimeoutMinutes).toBe(DEFAULT_DISPLAY_SETTINGS.idleTimeoutMinutes);
    expect(updated.nightModeEnabled).toBe(true);
  });
});
