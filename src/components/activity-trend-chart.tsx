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
    const y = 43 - (39 * Math.max(0, amount)) / max;
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
    ? `${targetMinutes} Min./Woche · gleichmäßig ${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(targetMinutes / 7)} Min./Tag`
    : `${targetMinutes} Min./Tag`;
  const firstDate = points[0]?.date;
  const lastDate = points.at(-1)?.date;
  const formatDate = (date?: string) => date ? new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit" }).format(new Date(`${date}T12:00:00`)) : "";
  const explanation = `30 Tage. Ist = der jeweils höhere Tageswert aus Apple-Health-Trainingsminuten und abgeschlossenen FitFamily-Trainingsminuten; die Werte werden nicht addiert, um Doppelzählung zu vermeiden. Soll: ${targetLabel}. Fehlende Übertragungen erscheinen als Lücke.`;

  return (
    <div className="dashboard-history-chart" title={explanation} aria-label={explanation}>
      <div className="dashboard-history-chart-heading">
        <span>VERLAUF · 30 TAGE</span>
        <span>{hasData ? "IST / SOLL" : "NOCH KEINE IST-DATEN"}</span>
      </div>
      <svg viewBox="0 0 260 48" role="img" aria-label={`Tagesverlauf der Trainingsminuten. ${explanation}`} preserveAspectRatio="none">
        <path className="dashboard-history-grid" d="M2 4H258 M2 23H258 M2 43H258" />
        {points.length > 1 && <path className="dashboard-history-target" d={targetLine} />}
        {hasData && <path className="dashboard-history-actual" d={actualLine} style={{ stroke: color }} />}
      </svg>
      <div className="dashboard-history-chart-footer">
        <span>{formatDate(firstDate)}</span>
        <span className="dashboard-history-legend"><i className="history-legend-actual" style={{ background: color }} /> IST <i className="history-legend-target" /> SOLL {new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(points[0]?.targetMinutes ?? 0)} Min./Tag</span>
        <span>{formatDate(lastDate)}</span>
      </div>
    </div>
  );
}
