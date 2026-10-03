import { Activity, Dumbbell } from "lucide-react";
import type { EquipmentStats as Stats } from "@/lib/equipment-stats";
import { formatGermanDate } from "@/lib/date-format";

function equipmentDuration(seconds: number) {
  if (seconds > 0 && seconds < 60) return "< 1 Min.";
  return `${Math.floor(seconds / 60).toLocaleString("de-DE")} Min.`;
}

export function EquipmentStats({ items }: { items: Stats[] }) {
  return <section className="equipment-stats" aria-labelledby="equipment-stats-title">
    <h2 id="equipment-stats-title">Training je Gerät</h2>
    <p>Gesamter Verlauf · abgeschlossene Trainings und Sicherheitspausen</p>
    <div className="equipment-stats-grid">{items.map(item => <article key={item.id}>
      <h3>{item.name}</h3>
      <strong>{equipmentDuration(item.seconds)}</strong>
      <span>{item.sessions} {item.sessions === 1 ? "Einheit" : "Einheiten"}</span>
      <div><span><Dumbbell size={16} /> Kraft: {equipmentDuration(item.strengthSeconds)}</span><span><Activity size={16} /> Ausdauer: {equipmentDuration(item.enduranceSeconds)}</span></div>
      <small>{item.lastTrainedAt ? `Zuletzt: ${formatGermanDate(item.lastTrainedAt)}` : "Noch nicht genutzt"}</small>
    </article>)}</div>
    <p>Je Gerät zählt eine Nutzung pro Einheit. Ohne Geräteauswahl werden Zeiten separat erfasst. Minuten werden erst nach dem Summieren abgerundet.</p>
  </section>;
}
