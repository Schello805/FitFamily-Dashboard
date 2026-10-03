import { db } from "@/lib/db";
import { DEFAULT_DISPLAY_SETTINGS, type DisplaySettings } from "./display-settings-shared";
import { CLOCK_TIME_PATTERN, validTimeZone } from "./display-time";

export * from "./display-settings-shared";

export async function getDisplaySettings(): Promise<DisplaySettings> {
  try {
    const client = await db();
    const result = await client.execute({
      sql: "SELECT key, value FROM settings WHERE key IN ('display_time_zone', 'idle_timeout_minutes', 'night_mode_enabled', 'night_idle_timeout_minutes', 'night_start_time', 'night_end_time')"
    });

    let idleTimeoutMinutes = DEFAULT_DISPLAY_SETTINGS.idleTimeoutMinutes;
    let nightModeEnabled = DEFAULT_DISPLAY_SETTINGS.nightModeEnabled;
    let nightIdleTimeoutMinutes = DEFAULT_DISPLAY_SETTINGS.nightIdleTimeoutMinutes;
    let nightStartTime = DEFAULT_DISPLAY_SETTINGS.nightStartTime;
    let nightEndTime = DEFAULT_DISPLAY_SETTINGS.nightEndTime;
    let timeZone = DEFAULT_DISPLAY_SETTINGS.timeZone;

    for (const row of result.rows) {
      if (row.key === "display_time_zone" && validTimeZone(row.value)) timeZone = row.value;
      if (row.key === "idle_timeout_minutes" && row.value !== null) {
        const val = Number(row.value);
        if (!Number.isNaN(val) && val >= 0) idleTimeoutMinutes = val;
      }
      if (row.key === "night_mode_enabled" && row.value !== null) {
        nightModeEnabled = row.value === "true" || row.value === "1";
      }
      if (row.key === "night_idle_timeout_minutes" && row.value !== null) {
        const val = Number(row.value);
        if (!Number.isNaN(val) && val >= 0) nightIdleTimeoutMinutes = val;
      }
      if (row.key === "night_start_time" && typeof row.value === "string" && CLOCK_TIME_PATTERN.test(row.value.trim())) {
        nightStartTime = row.value.trim();
      }
      if (row.key === "night_end_time" && typeof row.value === "string" && CLOCK_TIME_PATTERN.test(row.value.trim())) {
        nightEndTime = row.value.trim();
      }
    }

    return {
      timeZone,
      idleTimeoutMinutes,
      nightModeEnabled,
      nightIdleTimeoutMinutes,
      nightStartTime,
      nightEndTime
    };
  } catch {
    return DEFAULT_DISPLAY_SETTINGS;
  }
}

export async function setDisplaySettings(settings: {
  timeZone?: string;
  idleTimeoutMinutes?: number;
  nightModeEnabled?: boolean;
  nightIdleTimeoutMinutes?: number;
  nightStartTime?: string;
  nightEndTime?: string;
}): Promise<DisplaySettings> {
  const client = await db();
  if (settings.timeZone !== undefined) {
    if (!validTimeZone(settings.timeZone)) throw new Error("Ungültige Zeitzone.");
    await client.execute({
      sql: "INSERT INTO settings (key, value, updated_at) VALUES ('display_time_zone', ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
      args: [settings.timeZone]
    });
  }

  if (typeof settings.idleTimeoutMinutes === "number" && !Number.isNaN(settings.idleTimeoutMinutes)) {
    await client.execute({
      sql: `INSERT INTO settings (key, value, updated_at) VALUES ('idle_timeout_minutes', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      args: [String(Math.max(0, Math.floor(settings.idleTimeoutMinutes)))]
    });
  }

  if (typeof settings.nightModeEnabled === "boolean") {
    await client.execute({
      sql: `INSERT INTO settings (key, value, updated_at) VALUES ('night_mode_enabled', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      args: [settings.nightModeEnabled ? "true" : "false"]
    });
  }

  if (typeof settings.nightIdleTimeoutMinutes === "number" && !Number.isNaN(settings.nightIdleTimeoutMinutes)) {
    await client.execute({
      sql: `INSERT INTO settings (key, value, updated_at) VALUES ('night_idle_timeout_minutes', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      args: [String(Math.max(0, Math.floor(settings.nightIdleTimeoutMinutes)))]
    });
  }

  if (typeof settings.nightStartTime === "string" && CLOCK_TIME_PATTERN.test(settings.nightStartTime.trim())) {
    await client.execute({
      sql: `INSERT INTO settings (key, value, updated_at) VALUES ('night_start_time', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      args: [settings.nightStartTime.trim()]
    });
  }

  if (typeof settings.nightEndTime === "string" && CLOCK_TIME_PATTERN.test(settings.nightEndTime.trim())) {
    await client.execute({
      sql: `INSERT INTO settings (key, value, updated_at) VALUES ('night_end_time', ?, CURRENT_TIMESTAMP)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      args: [settings.nightEndTime.trim()]
    });
  }

  return getDisplaySettings();
}
