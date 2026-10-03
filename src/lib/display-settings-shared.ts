import { DEFAULT_TIME_ZONE } from "./display-time";

export type DisplaySettings = {
  timeZone: string;
  idleTimeoutMinutes: number; // Tagsüber: 0 = aus, bis zu 180 Minuten
  nightModeEnabled: boolean;
  nightIdleTimeoutMinutes: number; // Nachts: 0 = aus, 1, 2, 5, 10, 15, 30
  nightStartTime: string; // z.B. "22:30"
  nightEndTime: string; // z.B. "06:30"
};

export const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  timeZone: DEFAULT_TIME_ZONE,
  idleTimeoutMinutes: 5,
  nightModeEnabled: true,
  nightIdleTimeoutMinutes: 1,
  nightStartTime: "22:30",
  nightEndTime: "06:30"
};
