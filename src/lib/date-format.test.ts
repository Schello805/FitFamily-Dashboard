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

  it("formats a local date and time consistently", () => {
    expect(formatGermanDateTime(new Date(2026, 9, 2, 8, 5))).toBe("02.10.2026, 08:05");
    expect(formatGermanTime(new Date(2026, 9, 2, 8, 5))).toBe("08:05");
  });

  it("interprets timezone-free server log dates as UTC", () => {
    expect(formatGermanLogTimestamp("2026-10-02 06:05:00")).toContain("02.10.2026");
  });
});
