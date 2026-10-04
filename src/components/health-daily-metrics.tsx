import type { DashboardProfile } from "@/lib/domain";
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

export function HealthDailyMetrics({ value }: { value: DashboardProfile["healthEnergy"] }) {
  return <section className="health-daily-metrics" aria-label="Apple Health · Tageskennzahlen ohne Wertung">
    <div className="health-daily-label"><span>Apple Health · Alltag</span><small>{value ? new Date(`${value.date}T12:00:00`).toLocaleDateString("de-DE") : "Noch kein Empfang"} · ohne Wertung</small></div>
    <div className="health-daily-values">
      <div><span>Aktive Energie</span><strong>{value ? value.activeEnergyKcal.toLocaleString("de-DE", { maximumFractionDigits: 1 }) : "—"} <small>kcal</small></strong>
        {value ? <GoalProgress amount={value.activeEnergyKcal} goal={value.goalKcal ?? 500} unit="kcal" /> : <small>Warten auf Übertragung</small>}
      </div>
      <div><span>Schritte</span><strong>{value?.stepCount != null ? value.stepCount.toLocaleString("de-DE") : "—"}</strong>{value?.stepCount != null ? <GoalProgress amount={value.stepCount} goal={value.goalSteps ?? 10000} unit="Schritte" /> : <small>Noch nicht übertragen</small>}</div>
    </div>
  </section>;
}
