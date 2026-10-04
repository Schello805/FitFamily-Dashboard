import { describe, expect, it } from "vitest";
import { getDisplaySettings, setDisplaySettings, DEFAULT_DISPLAY_SETTINGS } from "./display-settings";

describe("display-settings", () => {
  it("stores only the centrally allowed preparation times", async () => {
    for (const preparationSeconds of [5, 10, 20, 30, 60]) {
      expect((await setDisplaySettings({ preparationSeconds })).preparationSeconds).toBe(preparationSeconds);
    }
    await expect(setDisplaySettings({ preparationSeconds: 15 })).rejects.toThrow("Vorbereitungszeit");
    await setDisplaySettings({ preparationSeconds: 30 });
  });
  it("defaults to Berlin and saves only valid IANA zones", async () => {
    await setDisplaySettings({ timeZone: "Europe/Berlin" });
    expect((await getDisplaySettings()).timeZone).toBe("Europe/Berlin");
    await setDisplaySettings({ timeZone: "America/New_York" });
    expect((await getDisplaySettings()).timeZone).toBe("America/New_York");
    await expect(setDisplaySettings({ timeZone: "Invalid/Zone" })).rejects.toThrow("Zeitzone");
    await setDisplaySettings({ timeZone: "Europe/Berlin" });
  });
  it("returns default display settings initially or on fallback", async () => {
    const settings = await getDisplaySettings();
    expect(typeof settings.idleTimeoutMinutes).toBe("number");
    expect(typeof settings.nightModeEnabled).toBe("boolean");
    expect(typeof settings.nightIdleTimeoutMinutes).toBe("number");
    expect(typeof settings.nightStartTime).toBe("string");
    expect(typeof settings.nightEndTime).toBe("string");
  });

  it("updates and retrieves idle timeout and night mode", async () => {
    await setDisplaySettings({
      idleTimeoutMinutes: 10,
      nightModeEnabled: false,
      nightIdleTimeoutMinutes: 2,
      nightStartTime: "23:00",
      nightEndTime: "07:00"
    });
    let updated = await getDisplaySettings();
    expect(updated.idleTimeoutMinutes).toBe(10);
    expect(updated.nightModeEnabled).toBe(false);
    expect(updated.nightIdleTimeoutMinutes).toBe(2);
    expect(updated.nightStartTime).toBe("23:00");
    expect(updated.nightEndTime).toBe("07:00");

    await setDisplaySettings({
      idleTimeoutMinutes: DEFAULT_DISPLAY_SETTINGS.idleTimeoutMinutes,
      nightModeEnabled: true,
      nightIdleTimeoutMinutes: DEFAULT_DISPLAY_SETTINGS.nightIdleTimeoutMinutes,
      nightStartTime: DEFAULT_DISPLAY_SETTINGS.nightStartTime,
      nightEndTime: DEFAULT_DISPLAY_SETTINGS.nightEndTime
    });
    updated = await getDisplaySettings();
    expect(updated.idleTimeoutMinutes).toBe(DEFAULT_DISPLAY_SETTINGS.idleTimeoutMinutes);
    expect(updated.nightModeEnabled).toBe(true);
    expect(updated.nightIdleTimeoutMinutes).toBe(DEFAULT_DISPLAY_SETTINGS.nightIdleTimeoutMinutes);
    expect(updated.nightStartTime).toBe(DEFAULT_DISPLAY_SETTINGS.nightStartTime);
    expect(updated.nightEndTime).toBe(DEFAULT_DISPLAY_SETTINGS.nightEndTime);
  });
});
