import type { ActivityTrendPoint } from "./domain";

// Horizontal cubic handles stay between adjacent values: no invented peaks,
// negative dips or connections across missing data. Every real point is retained.
export function makeTrendLine(points: ActivityTrendPoint[], value: (point: ActivityTrendPoint) => number | null, max: number, smooth = false) {
  let path = "";
  let previous: { x: number; y: number } | null = null;
  const format = (number: number) => number.toFixed(1);
  points.forEach((point, index) => {
    const amount = value(point);
    if (amount === null || !Number.isFinite(amount)) { previous = null; return; }
    const x = 3 + 254 * index / Math.max(1, points.length - 1);
    const y = 92 - 84 * Math.max(0, amount) / max;
    if (!previous) path += `M${format(x)} ${format(y)} `;
    else if (smooth) {
      // Longer horizontal handles make turns visibly rounded even in the
      // narrow dashboard chart, while keeping the curve within both values.
      const half = (x - previous.x) / 2;
      path += `C${format(previous.x + half)} ${format(previous.y)} ${format(x - half)} ${format(y)} ${format(x)} ${format(y)} `;
    } else path += `L${format(x)} ${format(y)} `;
    previous = { x, y };
  });
  return path.trim();
}
