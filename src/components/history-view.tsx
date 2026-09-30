"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Activity, Apple, ArrowLeft, Dumbbell, PencilLine, Plus } from "lucide-react";
import type { DashboardProfile } from "@/lib/domain";
import { TouchPinpad } from "@/components/touch-pinpad";

type Segment = { id: string; type: "strength" | "endurance"; exerciseName: string | null; startedAt: string; endedAt: string | null };
type Session = { id: string; startedAt: string; endedAt: string | null; status: string; source: string; edited: boolean; segments: Segment[] };

import { showToast } from "@/components/toast";

function minutes(start: string, end: string | null) { return Math.max(0, Math.round((new Date(end ?? Date.now()).getTime() - new Date(start).getTime()) / 60000)); }

export function HistoryView({ profile }: { profile: DashboardProfile }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [manual, setManual] = useState(false);
  const [manualPin, setManualPin] = useState("");
  const [error, setError] = useState("");
  const load = () => fetch(`/api/history/${profile.id}`).then((response) => response.json()).then((data) => setSessions(data.sessions));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const totals = useMemo(() => sessions.reduce((sum, session) => sum + session.segments.reduce((segmentSum, segment) => segmentSum + minutes(segment.startedAt, segment.endedAt), 0), 0), [sessions]);

  async function addManual(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    const data = new FormData(event.currentTarget);
    const date = String(data.get("date")); const start = String(data.get("start")); const end = String(data.get("end"));
    const response = await fetch("/api/manual-training", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
      pin: data.get("pin"), profileId: profile.id, type: data.get("type"), startedAt: new Date(`${date}T${start}`).toISOString(), endedAt: new Date(`${date}T${end}`).toISOString(), exerciseId: null
    }) });
    const result = await response.json();
    if (!response.ok) {
      const msg = result.error ?? "Eintrag konnte nicht gespeichert werden";
      setError(msg);
      showToast({ type: "error", title: "Fehler beim Nachtragen", message: msg });
      return;
    }
    setManual(false); setManualPin(""); load();
    showToast({ type: "success", title: "Training nachgetragen", message: "Einheit wurde erfolgreich im Verlauf gespeichert." });
  }

  return <main className="subpage" style={{ "--profile": profile.color } as React.CSSProperties}>
    <header><Link href={`/profil/${profile.id}`}><ArrowLeft /> Zurück</Link><div><span>Gesamtverlauf</span><h1>{profile.name}</h1></div><button onClick={() => { setManual(true); setManualPin(""); setError(""); }}><Plus /> Nachtragen</button></header>
    <section className="history-stats"><div><strong>{profile.score}</strong><span>Punkte gesamt</span></div><div><strong>{totals}</strong><span>Trainingsminuten</span></div><div><strong>{sessions.length}</strong><span>Einheiten</span></div></section>
    <section className="session-list">{sessions.length === 0 ? <div className="empty-state"><Activity /><h2>Noch kein Training</h2><p>Deine erste Einheit erscheint automatisch hier.</p></div> : sessions.map((session) => <article key={session.id}>
      <div className="session-date"><strong>{new Date(session.startedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "short" })}</strong><span>{new Date(session.startedAt).toLocaleDateString("de-DE", { weekday: "long", year: "numeric" })}</span></div>
      <div className="segment-list">{session.segments.map((segment) => <div key={segment.id}>{segment.type === "strength" ? <Dumbbell /> : <Activity />}<span><b>{segment.exerciseName ?? (segment.type === "strength" ? "Krafttraining" : "Ausdauertraining")}</b><small>{new Date(segment.startedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} · {minutes(segment.startedAt, segment.endedAt)} Minuten</small></span></div>)}</div>
      {(session.edited || session.source === "manual") && <em><PencilLine /> Manuell bearbeitet</em>}
      {session.source === "apple_health" && <em className="apple-source"><Apple size={14} /> Apple Health Sync</em>}
    </article>)}</section>
    {manual && (
      <div className="modal-backdrop">
        <form className="manual-modal" onSubmit={addManual}>
          <button type="button" className="modal-close" onClick={() => { setManual(false); setManualPin(""); }}>×</button>
          <span className="setup-badge">Nachtragen</span>
          <h2>Training hinzufügen</h2>
          <label>Datum<input name="date" type="date" required defaultValue={new Date().toISOString().split("T")[0]} /></label>
          <div className="two-fields">
            <label>Start<input name="start" type="time" required /></label>
            <label>Ende<input name="end" type="time" required /></label>
          </div>
          <label>Training
            <select name="type">
              <option value="strength">Kraft</option>
              <option value="endurance">Ausdauer</option>
            </select>
          </label>
          <label>Eltern-PIN (4–8 Ziffern)</label>
          <TouchPinpad value={manualPin} onChange={setManualPin} />
          <input type="hidden" name="pin" value={manualPin} />
          {error && <p className="form-error">{error}</p>}
          <button className="primary-submit" disabled={manualPin.length < 4}>Speichern</button>
        </form>
      </div>
    )}
  </main>;
}
