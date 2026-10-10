"use client";
import { useState } from "react";
import type { DashboardProfile } from "@/lib/domain";
import { formatGermanDate, formatGermanLogTimestamp } from "@/lib/date-format";
import { Modal } from "@/components/modal";
type HealthDay = NonNullable<DashboardProfile["healthDailyTrend"]>[number];
type HealthField = "activeEnergyKcal" | "stepCount";

function HealthTrend({ days, field, goal, unit, onOpen }: { days: HealthDay[]; field: HealthField; goal: number; unit: string; onOpen: () => void }) {
  const values = days.map(day => day[field]);
  const known = values.filter((value): value is number => value !== null);
  if (!known.length) return <button type="button" className="health-trend health-trend-empty" onClick={onOpen} aria-label={`${unit}-Verlauf der letzten 30 Tage ansehen`}>30-Tage-Verlauf ansehen</button>;
  const chartMax = Math.max(goal * 1.12, ...known.map(value => value * 1.08), 1);
  const x = (index: number) => 3 + index * 254 / Math.max(days.length - 1, 1);
  const y = (value: number) => 72 - Math.min(value / chartMax, 1) * 64;
  const areas: { line: string; fill: string }[] = [];
  let run: number[] = [];
  const finishRun = () => {
    if (!run.length) return;
    const line = run.map((index, position) => `${position ? "L" : "M"}${x(index).toFixed(1)} ${y(values[index] as number).toFixed(1)}`).join(" ");
    const first = run[0];
    const last = run[run.length - 1];
    const left = run.length === 1 ? Math.max(3, x(first) - 2) : x(first);
    const right = run.length === 1 ? Math.min(257, x(last) + 2) : x(last);
    areas.push({ line, fill: `M${left.toFixed(1)} 72 ${line.replace(/^M/, "L")} L${right.toFixed(1)} 72 Z` });
    run = [];
  };
  values.forEach((value, index) => value === null ? finishRun() : run.push(index));
  finishRun();
  const goalY = y(goal);
  const format = (value: number) => value.toLocaleString("de-DE", { maximumFractionDigits: unit === "kcal" ? 1 : 0 });
  const dateLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  return <button type="button" className="health-trend" onClick={onOpen} aria-label={`${unit}-Verlauf der letzten 30 Tage ansehen`}>
    <svg viewBox="0 0 260 76" preserveAspectRatio="none" role="img" aria-label={`${unit}-Verlauf der letzten 30 Tage. ${known.length} Tageswerte vorhanden. Gestrichelte Linie: Ziel ${format(goal)} ${unit}. Tage ohne Übertragung sind Lücken.`}>
      <path className="health-trend-target" d={`M3 ${goalY.toFixed(1)} H257`} />
      <path className="health-trend-baseline" d="M3 72 H257" />
      {areas.map((area, index) => <g key={index}><path className="health-trend-fill" d={area.fill} /><path className="health-trend-line" d={area.line} /></g>)}
      {days.map((day, index) => day[field] === null ? null : <circle key={day.date} cx={x(index).toFixed(1)} cy={y(day[field] as number).toFixed(1)} r="1.6"><title>{`${dateLabel(day.date)}: ${format(day[field] as number)} ${unit}`}</title></circle>)}
    </svg>
    <span className="health-trend-open">30 Tage · Details</span>
  </button>;
}
function GoalProgress({ amount, goal, unit }: { amount: number; goal: number; unit: string }) {
  const format = (number: number) => number.toLocaleString("de-DE", { maximumFractionDigits: unit === "kcal" ? 1 : 0 });
  const percent = Math.round(amount / goal * 100);
  const reached = amount >= goal;
  return <div className={`health-metric-goal${reached ? " is-reached" : ""}`}>
    <small>{percent} % von {format(goal)} {unit} · {reached ? `Ziel erreicht${amount > goal ? ` · +${format(amount - goal)} ${unit}` : ""}` : `Noch ${format(goal - amount)} ${unit}`}</small>
  </div>;
}

export function HealthDailyMetrics({ value, trend = [], clock = new Date() }: { value: DashboardProfile["healthEnergy"]; trend?: DashboardProfile["healthDailyTrend"]; clock?: Date }) {
  const [openField, setOpenField] = useState<HealthField | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(clock);
  const lastReceived = value?.latestReceivedAt ?? value?.updatedAt;
  const lastReceivedDate = lastReceived ? new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(`${lastReceived.replace(" ", "T")}Z`)) : null;
  const daysBehind = lastReceivedDate ? Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastReceivedDate}T00:00:00Z`)) / 86400000)) : null;
  const openDetails = (field: HealthField) => {
    setSelectedDate([...trend].reverse().find(day => day[field] !== null)?.date ?? trend.at(-1)?.date ?? null);
    setOpenField(field);
  };
  const selectedDay = trend.find(day => day.date === selectedDate);
  const receivedCount = openField ? trend.filter(day => day[openField] !== null).length : 0;
  const metricName = openField === "stepCount" ? "Schritte" : "Aktive Energie";
  return <section className="health-daily-metrics" aria-label="Apple Health · Tageskennzahlen ohne Wertung">
    <div className="health-daily-label"><span>Apple Health · Alltag</span><small>{value ? formatGermanDate(value.date) : "Noch kein Empfang"} · ohne Wertung für Energie &amp; Schritte</small></div>
    <div className="health-daily-values">
      <div className="health-metric-card"><HealthTrend days={trend} field="activeEnergyKcal" goal={value?.goalKcal ?? 500} unit="kcal" onOpen={() => openDetails("activeEnergyKcal")} /><span>Aktive Energie</span><strong>{value ? value.activeEnergyKcal.toLocaleString("de-DE", { maximumFractionDigits: 1 }) : "—"} <small>kcal</small></strong>
        {value ? <GoalProgress amount={value.activeEnergyKcal} goal={value.goalKcal ?? 500} unit="kcal" /> : <small>Warten auf Übertragung</small>}
      </div>
      <div className="health-metric-card"><HealthTrend days={trend} field="stepCount" goal={value?.goalSteps ?? 10000} unit="Schritte" onOpen={() => openDetails("stepCount")} /><span>Schritte</span><strong>{value?.stepCount != null ? value.stepCount.toLocaleString("de-DE") : "—"}</strong>{value?.stepCount != null ? <GoalProgress amount={value.stepCount} goal={value.goalSteps ?? 10000} unit="Schritte" /> : <small>Noch nicht übertragen</small>}</div>
    </div>
    <p className={`health-sync-status${daysBehind === null || daysBehind > 0 || (value && value.date !== today) ? " is-stale" : ""}`} role="status">{value ? daysBehind === 0 ? `Heute übertragen · ${formatGermanLogTimestamp(lastReceived!)}` : `Seit ${daysBehind} ${daysBehind === 1 ? "Tag" : "Tagen"} keine Übertragung · zuletzt ${formatGermanLogTimestamp(lastReceived!)}` : "Noch keine Health-Daten empfangen"}{value && value.date !== today ? ` · letzter Tageswert ${formatGermanDate(value.date)}` : ""}{value && value.stepCount == null ? " · Schritte fehlen" : ""}</p>
    {openField && <Modal onClose={() => setOpenField(null)}><section className="health-trend-dialog" role="dialog" aria-modal="true" aria-labelledby="health-trend-title"><div className="health-trend-dialog-head"><div><small>Apple Health · 30 Tage</small><h2 id="health-trend-title">{metricName}</h2><p>{receivedCount} von 30 Tagen übertragen · Lücken sind keine Nullwerte</p></div><button type="button" onClick={() => setOpenField(null)} aria-label="Verlauf schließen">×</button></div><div className="health-trend-dialog-body"><div className="health-trend-day-list" aria-label="Tageswerte">{[...trend].reverse().map(day => <button type="button" key={day.date} className={day.date === selectedDate ? "is-selected" : ""} aria-pressed={day.date === selectedDate} onClick={() => setSelectedDate(day.date)}><span>{formatGermanDate(day.date)}</span><strong>{day[openField] === null ? "Keine Daten" : `${day[openField]?.toLocaleString("de-DE", { maximumFractionDigits: openField === "stepCount" ? 0 : 1 })} ${openField === "stepCount" ? "Schritte" : "kcal"}`}</strong></button>)}</div><div className="health-trend-day-detail"><small>Ausgewählter Tag</small><h3>{selectedDay ? formatGermanDate(selectedDay.date, { weekday: "long" }) : "Kein Tag ausgewählt"}</h3><dl><div><dt>Aktive Energie</dt><dd>{selectedDay?.activeEnergyKcal == null ? "Nicht übertragen" : `${selectedDay.activeEnergyKcal.toLocaleString("de-DE", { maximumFractionDigits: 1 })} kcal`}</dd></div><div><dt>Schritte</dt><dd>{selectedDay?.stepCount == null ? "Nicht übertragen" : selectedDay.stepCount.toLocaleString("de-DE")}</dd></div><div><dt>Quelle</dt><dd>{selectedDay?.activeEnergyKcal == null ? "Keine Übertragung" : selectedDay.sourceName ?? "Bei älterem Import nicht gespeichert"}</dd></div><div><dt>Empfangen</dt><dd>{selectedDay?.updatedAt ? formatGermanLogTimestamp(selectedDay.updatedAt) : "—"}</dd></div></dl></div></div></section></Modal>}
  </section>;
}
