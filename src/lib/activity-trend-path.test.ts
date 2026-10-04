import { expect, it } from "vitest";
import type { ActivityTrendPoint } from "./domain";
import { makeTrendLine } from "./activity-trend-path";
const points = (values: (number | null)[]) => values.map(activityMinutes => ({ activityMinutes })) as ActivityTrendPoint[];
it("smooths through exact endpoints with handles bounded by their values", () => {
  expect(makeTrendLine(points([0,100,0]), p => p.activityMinutes, 100, true)).toBe("M3.0 92.0 C66.5 92.0 66.5 8.0 130.0 8.0 C193.5 8.0 193.5 92.0 257.0 92.0");
});
it("does not bridge missing days and leaves the target unsmoothed", () => {
  expect(makeTrendLine(points([20,null,50]), p => p.activityMinutes, 100, true)).toBe("M3.0 75.2 M257.0 50.0");
  expect(makeTrendLine(points([0,100]), p => p.activityMinutes, 100)).toBe("M3.0 92.0 L257.0 8.0");
});
