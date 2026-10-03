import { describe, expect, it } from "vitest";
import { formatGermanDate, formatGermanDateTime, formatGermanLogTimestamp, formatGermanTime, formatGermanWeekday } from "@/lib/date-format";

describe("German date formatting", () => {
  it("renders date-only values in day-month-year order with leading zeroes", () => {
    expect(formatGermanDate("2026-10-02")).toBe("02.10.2026");
  });

  it("keeps an optional weekday before the numeric date", () => {
    expect(formatGermanDate("2026-10-02", { weekday: "short" })).toBe("Fr., 02.10.2026");
    expect(formatGermanWeekday("2026-10-02")).toBe("Freitag");
  });

  it("uses Berlin independent of the host timezone, and supports an explicit zone", () => {
    const utc = new Date("2026-10-02T06:05:00Z");
    expect(formatGermanDateTime(utc)).toBe("02.10.2026, 08:05");
    expect(formatGermanTime(utc)).toBe("08:05");
    expect(formatGermanTime(utc, "America/New_York")).toBe("02:05");
    expect(formatGermanDate("1980-05-31", { timeZone: "Pacific/Kiritimati" })).toBe("31.05.1980");
  });

  it("interprets timezone-free server log dates as UTC", () => {
    expect(formatGermanLogTimestamp("2026-10-02 06:05:00")).toBe("02.10.2026, 08:05");
  });
});
