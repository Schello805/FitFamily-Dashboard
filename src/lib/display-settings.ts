import { db } from "@/lib/db";

export type DisplaySettings = {
  idleTimeoutMinutes: number; // 0 = aus, 1, 2, 5, 10, 15, 30
  nightModeEnabled: boolean;
};

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  idleTimeoutMinutes: 5,
  nightModeEnabled: true
};

export async function getDisplaySettings(): Promise<DisplaySettings> {
  try {
    const client = await db();
    const result = await client.execute({
      sql: "SELECT key, value FROM settings WHERE key IN ('idle_timeout_minutes', 'night_mode_enabled')"
    });

    let idleTimeoutMinutes = DEFAULT_DISPLAY_SETTINGS.idleTimeoutMinutes;
    let nightModeEnabled = DEFAULT_DISPLAY_SETTINGS.nightModeEnabled;

    for (const row of result.rows) {
      if (row.key === "idle_timeout_minutes" && row.value !== null) {
        const val = Number(row.value);
        if (!Number.isNaN(val) && val >= 0) idleTimeoutMinutes = val;
      }
      if (row.key === "night_mode_enabled" && row.value !== null) {
        nightModeEnabled = row.value === "true" || row.value === "1";
      }
    }

    return { idleTimeoutMinutes, nightModeEnabled };
  } catch {
    return DEFAULT_DISPLAY_SETTINGS;
  }
}

export async function setDisplaySettings(settings: {
  idleTimeoutMinutes?: number;
  nightModeEnabled?: boolean;
}): Promise<DisplaySettings> {
  const client = await db();

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

  return getDisplaySettings();
}
