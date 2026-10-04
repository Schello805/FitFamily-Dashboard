import type { DashboardProfile } from "@/lib/domain";

export function HealthDailyMetrics({ value }: { value: DashboardProfile["healthEnergy"] }) {
  return <section className="health-daily-metrics" aria-label="Apple Health · Tageskennzahlen ohne Wertung">
    <div className="health-daily-label"><span>Apple Health · Alltag</span><small>{value ? new Date(`${value.date}T12:00:00`).toLocaleDateString("de-DE") : "Noch kein Empfang"} · ohne Wertung</small></div>
    <div className="health-daily-values">
      <div><span>Aktive Energie</span><strong>{value ? value.activeEnergyKcal.toLocaleString("de-DE", { maximumFractionDigits: 1 }) : "—"} <small>kcal</small></strong>
        <small>{value ? `${value.goalPercent ?? Math.round(value.activeEnergyKcal / 500 * 100)} % von ${value.goalKcal ?? 500} kcal · Ziel manuell` : "Warten auf Übertragung"}</small>
      </div>
      <div><span>Schritte</span><strong>{value?.stepCount != null ? value.stepCount.toLocaleString("de-DE") : "—"}</strong><small>{value?.stepCount != null ? "Tageswert · keine Punkte" : "Noch nicht übertragen"}</small></div>
    </div>
  </section>;
}
