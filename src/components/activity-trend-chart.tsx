import type { ActivityTrendPoint } from "@/lib/domain";
import { useCallback, useEffect, useId, useState } from "react";
import { X } from "lucide-react";
import { Modal } from "@/components/modal";

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

export function ActivityTrendChart({ points, color, targetMinutes, targetPeriod, profileName }: {
  points: ActivityTrendPoint[];
  color: string;
  targetMinutes: number;
  targetPeriod: "Tag" | "Woche";
  profileName?: string;
}) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const titleId = useId();
  const closeDetails = useCallback(() => setDetailsOpen(false), []);
  useEffect(() => {
    if (!detailsOpen) return;
    let timer = window.setTimeout(closeDetails, 60_000);
    const resetTimer = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(closeDetails, 60_000);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") resetTimer();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("pointerdown", resetTimer);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("pointerdown", resetTimer);
    };
  }, [detailsOpen, closeDetails]);
  const hasData = points.some((point) => point.activityMinutes !== null);
  const rawMax = Math.max(10, ...points.map((point) => Math.max(point.targetMinutes, point.activityMinutes ?? 0))) * 1.12;
  const scaleStep = 10 ** Math.floor(Math.log10(rawMax));
  const scaleMax = Math.ceil(rawMax / scaleStep) * scaleStep;
  const axisFormat = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 });
  const targetLine = makeLine(points, (point) => point.targetMinutes, scaleMax);
  const actualLine = makeLine(points, (point) => point.activityMinutes, scaleMax);
  const targetLabel = targetPeriod === "Woche"
    ? `${targetMinutes} Minuten/Woche (gleichmäßig ${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(targetMinutes / 7)} Minuten/Tag)`
    : `${targetMinutes} Minuten/Tag`;
  const firstMonthlyIndex = points.findIndex((point) => point.resolution === "Monat");
  const firstDailyIndex = points.findIndex((point) => point.resolution === "Tag");
  const yearIndex = points.findIndex((point) => point.resolution === "Jahr");
  const marker = (index: number) => index < 0 ? 0 : (254 * index) / Math.max(1, points.length - 1) + 3;
  const explanation = `Zeitauflösung: ältere Daten je Jahr, danach je Monat, die letzten 30 Tage täglich. Ist = die Summe der abgeschlossenen FitFamily-Trainingsminuten pro Tag. Monats- und Jahreswerte sind Durchschnittswerte pro Tag aus den Tagen, für die Daten vorliegen. Soll: ${targetLabel}. Tage ohne abgeschlossene Trainings bleiben Lücken.`;

  const chart = (large = false) => <div className={`dashboard-history-chart${large ? " dashboard-history-chart-large" : ""}`} title={explanation} aria-label={large ? explanation : `Trainingsverlauf${profileName ? ` von ${profileName}` : ""} öffnen`}
    {...(!large ? { role: "button", tabIndex: 0, "aria-haspopup": "dialog" as const, "aria-expanded": detailsOpen, onClick: () => setDetailsOpen(true), onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setDetailsOpen(true); } } } : {})}>
      <div className="dashboard-history-chart-heading">
        <span>VERLAUF · JAHRE / MONATE / TAGE</span>
        <span>{hasData ? "IST / SOLL" : "NOCH KEINE IST-DATEN"}</span>
      </div>
      <div className="dashboard-history-plot">
        <div className="dashboard-history-y-axis" aria-label="Vertikale Achse: Minuten pro Tag" style={{ width: `${axisFormat.format(scaleMax).length + 5}ch` }}>
          {[scaleMax, scaleMax / 2, 0].map((value, index) => <span key={value} style={{ top: `${8 + 42 * index}%` }}>{axisFormat.format(value)} Min.</span>)}
        </div>
        <svg viewBox="0 0 260 100" role="img" aria-label={`Verlauf der durchschnittlichen täglichen Trainingsminuten. ${explanation}`} preserveAspectRatio="none">
        <path className="dashboard-history-grid" d="M2 8H258 M2 50H258 M2 92H258" />
        {yearIndex > 0 && <path className="dashboard-history-period-separator" d={`M${marker(firstMonthlyIndex)} 3V97`} />}
        {firstDailyIndex > 0 && <path className="dashboard-history-period-separator" d={`M${marker(firstDailyIndex)} 3V97`} />}
        {points.length > 1 && <path className="dashboard-history-target" d={targetLine} />}
        {hasData && <path className="dashboard-history-actual" d={actualLine} pathLength={1} style={{ stroke: color }} />}
        {points.map((point, index) => point.activityMinutes === null ? null : (
          <circle key={`${point.resolution}-${point.date}`} className="dashboard-history-point" cx={(3 + (254 * index) / Math.max(1, points.length - 1)).toFixed(1)} cy={(92 - (84 * Math.max(0, point.activityMinutes)) / scaleMax).toFixed(1)} r="2.5" style={{ fill: color }}>
            <title>{`${point.label}: Ø ${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(point.activityMinutes)} Minuten/Tag, Daten für ${point.measuredDays} von ${point.periodDays} Tagen.`}</title>
          </circle>
        ))}
        </svg>
      </div>
      <div className="dashboard-history-chart-footer">
        <span>{points[0]?.label ?? ""}</span>
        <span>{points[firstDailyIndex]?.label ?? ""}</span>
        <span>{points.at(-1)?.label ?? ""}</span>
        <span className="dashboard-history-legend"><i className="history-legend-actual" style={{ background: color }} /> IST <i className="history-legend-target" /> SOLL {new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(points.at(-1)?.targetMinutes ?? 0)} Minuten/Tag</span>
      </div>
    </div>;

  return <>
    {chart()}
    {detailsOpen && <Modal className="dashboard-history-backdrop" onClose={closeDetails}>
      <section className="dashboard-history-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <button className="dashboard-history-close" type="button" aria-label="Verlauf schließen" onClick={closeDetails}><X size={22} /></button>
        <h2 id={titleId}>Dein Trainingsverlauf</h2>
        <p>Die Kurve zeigt deinen tatsächlichen Verlauf im Vergleich zu deinem persönlichen Soll.</p>
        {chart(true)}
        <div className="dashboard-history-explanation">
          <p><strong>Ist:</strong> Pro Tag zählt die Summe deiner abgeschlossenen Kraft- und Ausdauertrainings in FitFamily.</p>
          <p><strong>Zeitraum:</strong> Die letzten 30 Tage einzeln, davor monatsweise und ältere Werte jahresweise. Monats- und Jahreswerte sind durchschnittliche Minuten pro Tag; Tage ohne übertragene Daten bleiben als Lücke sichtbar.</p>
          <p><strong>Soll:</strong> {targetLabel}. Die Kurve wird mit den Dashboarddaten aktualisiert. Das Dashboard fragt den Server alle 5 Sekunden ab. Laufende Trainings fließen nach Abschluss in die Kurve ein.</p>
        </div>
        <small>Schließt sich bei Inaktivität nach 60 Sekunden. Zum Schließen außen tippen oder Escape drücken.</small>
      </section>
    </Modal>}
  </>;
}
