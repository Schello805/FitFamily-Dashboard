import type { ActivityTrendPoint } from "@/lib/domain";

function makeLine(points: ActivityTrendPoint[], value: (point: ActivityTrendPoint) => number | null, max: number) {
  let path = "";
  let open = false;
  points.forEach((point, index) => {
    const amount = value(point);
    if (amount === null) {
      open = false;
      return;
    }
    const x = 3 + (254 * index) / Math.max(1, points.length - 1);
    const y = 92 - (84 * Math.max(0, amount)) / max;
    path += `${open ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)} `;
    open = true;
  });
  return path.trim();
}

export function ActivityTrendChart({ points, color, targetMinutes, targetPeriod }: {
  points: ActivityTrendPoint[];
  color: string;
  targetMinutes: number;
  targetPeriod: "Tag" | "Woche";
}) {
  const hasData = points.some((point) => point.activityMinutes !== null);
  const scaleMax = Math.max(10, ...points.map((point) => Math.max(point.targetMinutes, point.activityMinutes ?? 0))) * 1.12;
  const targetLine = makeLine(points, (point) => point.targetMinutes, scaleMax);
  const actualLine = makeLine(points, (point) => point.activityMinutes, scaleMax);
  const targetLabel = targetPeriod === "Woche"
    ? `${targetMinutes} Minuten/Woche (gleichmäßig ${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(targetMinutes / 7)} Minuten/Tag)`
    : `${targetMinutes} Minuten/Tag`;
  const firstMonthlyIndex = points.findIndex((point) => point.resolution === "Monat");
  const firstDailyIndex = points.findIndex((point) => point.resolution === "Tag");
  const yearIndex = points.findIndex((point) => point.resolution === "Jahr");
  const marker = (index: number) => index < 0 ? 0 : (254 * index) / Math.max(1, points.length - 1) + 3;
  const explanation = `Zeitauflösung: ältere Daten je Jahr, danach je Monat, die letzten 30 Tage täglich. Ist = der jeweils höhere Tageswert aus Apple-Health-Trainingsminuten und abgeschlossenen FitFamily-Trainingsminuten; diese Werte werden nicht addiert, damit dasselbe Training nicht doppelt zählt. Monats- und Jahreswerte sind Durchschnittswerte pro Tag aus den Tagen, für die Daten vorliegen. Soll: ${targetLabel}. Fehlende Übertragungen bleiben Lücken.`;

  return (
    <div className="dashboard-history-chart" title={explanation} aria-label={explanation}>
      <div className="dashboard-history-chart-heading">
        <span>VERLAUF · JAHRE / MONATE / TAGE</span>
        <span>{hasData ? "IST / SOLL" : "NOCH KEINE IST-DATEN"}</span>
      </div>
      <svg viewBox="0 0 260 100" role="img" aria-label={`Verlauf der durchschnittlichen täglichen Trainingsminuten. ${explanation}`} preserveAspectRatio="none">
        <path className="dashboard-history-grid" d="M2 8H258 M2 50H258 M2 92H258" />
        {yearIndex > 0 && <path className="dashboard-history-period-separator" d={`M${marker(firstMonthlyIndex)} 3V97`} />}
        {firstDailyIndex > 0 && <path className="dashboard-history-period-separator" d={`M${marker(firstDailyIndex)} 3V97`} />}
        {points.length > 1 && <path className="dashboard-history-target" d={targetLine} />}
        {hasData && <path className="dashboard-history-actual" d={actualLine} style={{ stroke: color }} />}
        {points.map((point, index) => point.activityMinutes === null ? null : (
          <circle key={`${point.resolution}-${point.date}`} className="dashboard-history-point" cx={(3 + (254 * index) / Math.max(1, points.length - 1)).toFixed(1)} cy={(92 - (84 * Math.max(0, point.activityMinutes)) / scaleMax).toFixed(1)} r="2.5" style={{ fill: color }}>
            <title>{point.label}: Ø {new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(point.activityMinutes)} Minuten/Tag, Daten für {point.measuredDays} von {point.periodDays} Tagen.</title>
          </circle>
        ))}
      </svg>
      <div className="dashboard-history-chart-footer">
        <span>{points[0]?.label ?? ""}</span>
        <span>{points[firstDailyIndex]?.label ?? ""}</span>
        <span>{points.at(-1)?.label ?? ""}</span>
        <span className="dashboard-history-legend"><i className="history-legend-actual" style={{ background: color }} /> IST <i className="history-legend-target" /> SOLL {new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(points.at(-1)?.targetMinutes ?? 0)} Minuten/Tag</span>
      </div>
    </div>
  );
}
