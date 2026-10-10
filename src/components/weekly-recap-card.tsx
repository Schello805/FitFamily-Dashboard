import type { WeeklyRecap, WeeklyRecapPeriod } from "@/lib/weekly-recap";
import { formatGermanDate } from "@/lib/date-format";

const number = (value: number, digits = 1) => value.toLocaleString("de-DE", { maximumFractionDigits: digits });
function change(current: number, previous: number, unit: string, comparable = true) {
  if (!comparable) return "Vergleich erst mit 7/7 Tagen";
  const difference = Math.round((current - previous) * 10) / 10;
  if (difference === 0) return "gleich wie zuvor";
  return `${difference > 0 ? "+" : "−"}${number(Math.abs(difference), unit === "Schritte" ? 0 : 1)} ${unit}`;
}
function periodLabel(period: WeeklyRecapPeriod) {
  return `${formatGermanDate(period.startDate, { year: undefined })}–${formatGermanDate(period.endDate, { year: undefined })}`;
}
export function WeeklyRecapCard({ recap }: { recap?: WeeklyRecap }) {
  if (!recap) return null;
  const { lastWeek: last, previousWeek: before } = recap;
  const rows = [
    { label: "Training gesamt", current: last.appMinutes + last.healthMinutes, previous: before.appMinutes + before.healthMinutes, unit: "Min.", digits: 1, note: "Nur gewertete Trainingszeit" },
    { label: "Kraft", current: last.strengthMinutes, previous: before.strengthMinutes, unit: "Min.", digits: 1, note: "App + importierte Trainings" },
    { label: "Ausdauer", current: last.enduranceMinutes, previous: before.enduranceMinutes, unit: "Min.", digits: 1, note: "App + importierte Trainings" },
    { label: "Davon FitFamily", current: last.appMinutes, previous: before.appMinutes, unit: "Min.", digits: 1, note: "Direkt in der App" },
    { label: "Davon Apple Health", current: last.healthMinutes, previous: before.healthMinutes, unit: "Min.", digits: 1, note: "Importierte Trainingsminuten" },
    { label: "Schritte", current: last.steps, previous: before.steps, unit: "Schritte", digits: 0, note: `${last.stepDays}/7 Tage empfangen · ohne Wertung`, comparable: last.stepDays === 7 && before.stepDays === 7 },
    { label: "Aktive Energie", current: last.activeEnergyKcal, previous: before.activeEnergyKcal, unit: "kcal", digits: 1, note: `${last.energyDays}/7 Tage empfangen · ohne Wertung`, comparable: last.energyDays === 7 && before.energyDays === 7 }
  ];
  return <section className="weekly-recap" aria-label="Wochenrückblick">
    <div className="weekly-recap-heading"><div><span className="section-kicker">Dein Rückblick</span><h2>Letzte Woche</h2><p>{periodLabel(last)} · verglichen mit {periodLabel(before)}</p></div><div className="weekly-recap-split"><span>Kraft {number(last.strengthMinutes)} Min.</span><span>Ausdauer {number(last.enduranceMinutes)} Min.</span></div></div>
    <div className="weekly-recap-grid">{rows.map(row => <article key={row.label}><span>{row.label}</span><strong>{number(row.current, row.digits)} <small>{row.unit}</small></strong><small>{row.note}</small><em>{change(row.current, row.previous, row.unit, row.comparable)}{row.comparable === false ? "" : " zur Vorwoche"}</em></article>)}</div>
    <p className="weekly-recap-note">Schritte und kcal summieren empfangene Tage; fehlende Tage sind keine Nullwerte. Vergleiche nur bei gleicher Datenabdeckung.</p>
  </section>;
}
