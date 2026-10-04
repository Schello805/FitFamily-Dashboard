import type { DashboardProfile } from "@/lib/domain";
type HealthDay = NonNullable<DashboardProfile["healthDailyTrend"]>[number];

function HealthTrend({ days, field, goal, unit }: { days: HealthDay[]; field: "activeEnergyKcal" | "stepCount"; goal: number; unit: string }) {
  const values = days.map(day => day[field]);
  const known = values.filter((value): value is number => value !== null);
  if (!known.length) return <small className="health-trend-empty">Noch keine Tageswerte im 30-Tage-Verlauf</small>;
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
  return <div className="health-trend">
    <div className="health-trend-heading"><span>Letzte 30 Tage</span><span>Ziel {format(goal)} {unit}</span></div>
    <svg viewBox="0 0 260 76" preserveAspectRatio="none" role="img" aria-label={`${unit}-Verlauf der letzten 30 Tage. ${known.length} Tageswerte vorhanden. Gestrichelte Linie: Ziel ${format(goal)} ${unit}. Tage ohne Übertragung sind Lücken.`}>
      <path className="health-trend-target" d={`M3 ${goalY.toFixed(1)} H257`} />
      <path className="health-trend-baseline" d="M3 72 H257" />
      {areas.map((area, index) => <g key={index}><path className="health-trend-fill" d={area.fill} /><path className="health-trend-line" d={area.line} /></g>)}
      {days.map((day, index) => day[field] === null ? null : <circle key={day.date} cx={x(index).toFixed(1)} cy={y(day[field] as number).toFixed(1)} r="1.6"><title>{`${dateLabel(day.date)}: ${format(day[field] as number)} ${unit}`}</title></circle>)}
    </svg>
    <div className="health-trend-dates"><span>{dateLabel(days[0].date)}</span><span>{dateLabel(days[days.length - 1].date)}</span></div>
  </div>;
}
function GoalProgress({ amount, goal, unit }: { amount: number; goal: number; unit: string }) {
  const format = (number: number) => number.toLocaleString("de-DE", { maximumFractionDigits: unit === "kcal" ? 1 : 0 });
  const percent = Math.round(amount / goal * 100);
  const reached = amount >= goal;
  return <div className={`health-metric-goal${reached ? " is-reached" : ""}`}>
    <small>{percent} % von {format(goal)} {unit}</small>
    <div className="health-metric-bar" role="progressbar" aria-label={`${unit}-Ziel`} aria-valuemin={0} aria-valuemax={goal} aria-valuenow={Math.min(amount, goal)} aria-valuetext={`${format(amount)} von ${format(goal)} ${unit}`}><i style={{ width: `${Math.min(100, Math.max(0, amount / goal * 100))}%` }} /></div>
    <b>{reached ? `Ziel erreicht${amount > goal ? ` · +${format(amount - goal)} ${unit}` : ""}` : `Noch ${format(goal - amount)} ${unit}`}</b>
  </div>;
}

export function HealthDailyMetrics({ value, trend = [] }: { value: DashboardProfile["healthEnergy"]; trend?: DashboardProfile["healthDailyTrend"] }) {
  return <section className="health-daily-metrics" aria-label="Apple Health · Tageskennzahlen ohne Wertung">
    <div className="health-daily-label"><span>Apple Health · Alltag</span><small>{value ? new Date(`${value.date}T12:00:00`).toLocaleDateString("de-DE") : "Noch kein Empfang"} · ohne Wertung</small></div>
    <div className="health-daily-values">
      <div><span>Aktive Energie</span><strong>{value ? value.activeEnergyKcal.toLocaleString("de-DE", { maximumFractionDigits: 1 }) : "—"} <small>kcal</small></strong>
        {value ? <GoalProgress amount={value.activeEnergyKcal} goal={value.goalKcal ?? 500} unit="kcal" /> : <small>Warten auf Übertragung</small>}
        <HealthTrend days={trend} field="activeEnergyKcal" goal={value?.goalKcal ?? 500} unit="kcal" />
      </div>
      <div><span>Schritte</span><strong>{value?.stepCount != null ? value.stepCount.toLocaleString("de-DE") : "—"}</strong>{value?.stepCount != null ? <GoalProgress amount={value.stepCount} goal={value.goalSteps ?? 10000} unit="Schritte" /> : <small>Noch nicht übertragen</small>}<HealthTrend days={trend} field="stepCount" goal={value?.goalSteps ?? 10000} unit="Schritte" /></div>
    </div>
  </section>;
}
