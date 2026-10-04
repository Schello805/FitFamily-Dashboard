"use client";
import { useEffect, useRef, useState } from "react";
import { exerciseSlotSeconds, formatCountdown } from "@/lib/plan-timers";
import type { NormalizedSession } from "@/lib/plan-normalizer";
import type { RecordingMode } from "@/lib/recording-mode";
import { requestJson } from "@/lib/api-client";

type Run = { phase: "ready" | "preparing" | "starting" | "running" | "finished"; index: number; deadline: number; sessionId?: string; completed: number };
export function PlanSessionRunner({ profileId, session, recordingMode, preparationSeconds, audioContext, onClose, onGuide }: {
  profileId: string; session: NormalizedSession; recordingMode: RecordingMode; preparationSeconds: number;
  onClose: () => void; onGuide: (name: string, mode?: "video" | "manual") => void;
  audioContext?: AudioContext | null;
}) {
  const exercises = session.exercises.length ? session.exercises : [session.title];
  const total = Math.max(1, session.minutes) * 60;
  const key = `fitfamily_plan_runner:${profileId}:${session.date ?? ""}:${session.title}`;
  const [run, setRun] = useState<Run>(() => ({ phase: "preparing", index: 0, deadline: Date.now() + preparationSeconds * 1000, completed: 0 }));
  const [now, setNow] = useState(() => Date.now()), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const audio = useRef<AudioContext | null>(audioContext ?? null), transition = useRef(false), lastTone = useRef("");
  const restored = useRef(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem(key) ?? "null") as Run | null;
        if (saved && ["ready", "preparing", "running", "finished"].includes(saved.phase) && Number.isInteger(saved.index) && saved.index >= 0 && saved.index < exercises.length && Number.isFinite(saved.deadline) && saved.completed >= 0 && saved.completed <= total) {
          // Returning after an abandoned preparation must not start a workout.
          setRun(saved.phase === "preparing" && saved.deadline <= Date.now() ? { ...saved, phase: "ready", deadline: 0 } : saved);
        }
      } catch { /* Ignore damaged local state. */ }
      restored.current = true;
    }, 0);
    return () => clearTimeout(timer);
  }, [key, exercises.length, total]);
  useEffect(() => { if (restored.current) localStorage.setItem(key, JSON.stringify(run)); }, [key, run]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 200); return () => clearInterval(timer); }, []);
  useEffect(() => () => { void audio.current?.close(); }, []);
  const slot = exerciseSlotSeconds(total, exercises.length, run.index);
  const left = ["preparing", "running"].includes(run.phase) ? Math.max(0, Math.ceil((run.deadline - now) / 1000)) : slot;
  const elapsed = run.phase === "running" ? Math.min(slot, Math.max(0, slot - left)) : 0;
  const remainingTotal = Math.max(0, total - run.completed - elapsed);
  useEffect(() => {
    if (!["preparing", "running"].includes(run.phase)) return;
    const toneKey = `${run.index}:${run.phase}:${left}`;
    if ((left <= 5 || (run.phase === "running" && left === 30)) && lastTone.current !== toneKey) {
      lastTone.current = toneKey;
      try {
        const context = audio.current;
        if (context?.state === "running") {
          const oscillator = context.createOscillator(), gain = context.createGain();
          oscillator.frequency.value = left === 0 ? 1100 : left <= 5 ? 880 : 660;
          gain.gain.value = 0.08; oscillator.connect(gain); gain.connect(context.destination);
          oscillator.start(); oscillator.stop(context.currentTime + (left === 0 ? .3 : .12));
        }
      } catch { /* Visual countdown remains usable without browser audio. */ }
    }
    if (left !== 0 || transition.current) return;
    transition.current = true;
    if (run.phase === "preparing") {
      // Timer expiry is an external clock event, not derived render state.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBusy(true);
      void requestJson<{ sessionId: string; plannedEndAt: string }>("/api/training", "Übung konnte nicht gestartet werden.", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", profileId, type: session.type, recordingMode, source: "touch", plannedDurationSeconds: slot })
      }).then(result => { setRun(previous => ({ ...previous, phase: "running", sessionId: result.sessionId, deadline: Date.parse(result.plannedEndAt) })); setError(""); })
        .catch(error => { setRun(previous => ({ ...previous, phase: "ready", deadline: 0 })); setError(error instanceof Error ? error.message : "Verbindung prüfen."); })
        .finally(() => { transition.current = false; setBusy(false); });
    } else {
      // The persisted server deadline caps credit even if this request fails or
      // the browser slept. A session ID prevents stopping a later NFC session.
      const sessionId = run.sessionId;
      setBusy(true);
      setRun(previous => ({ ...previous, phase: "finished", deadline: 0, completed: previous.completed + slot }));
      void requestJson("/api/training", "Ende konnte nicht bestätigt werden.", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "stop", profileId, sessionId }) })
        .catch(() => setError("Verbindung unterbrochen. Die serverseitige Zeitgrenze verhindert zusätzliche Minuten; bitte Verbindung vor der nächsten Übung prüfen."))
        .finally(() => { transition.current = false; setBusy(false); });
    }
  }, [left, run.phase, run.index, run.sessionId, profileId, recordingMode, session.type, slot]);
  function prepare(next = false) {
    try { audio.current ??= new AudioContext(); void audio.current.resume(); } catch { /* Audio is optional. */ }
    lastTone.current = ""; setError("");
    setRun(previous => ({ ...previous, index: next ? previous.index + 1 : previous.index, phase: "preparing", sessionId: undefined, deadline: Date.now() + preparationSeconds * 1000 }));
  }
  async function end() {
    setBusy(true);
    try {
      if (run.phase === "running") await requestJson("/api/training", "Stoppen fehlgeschlagen.", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "stop", profileId, sessionId: run.sessionId }) });
      localStorage.removeItem(key); onClose();
    } catch (error) { setError(error instanceof Error ? error.message : "Verbindung prüfen."); }
    finally { setBusy(false); }
  }
  return <section className="plan-unit-dialog" role="dialog" aria-modal="true" aria-labelledby="runner-title">
    <div className="plan-unit-heading"><div><h2 id="runner-title">{session.title}</h2><p>{recordingMode === "health" ? "App-Timer ohne Wertung · manueller Health-Import nötig" : "Nur aktive Übungszeit zählt"}</p></div><div className="plan-unit-live"><span>TRAININGSZEIT NOCH</span><strong>{formatCountdown(remainingTotal)}</strong><small>Vorbereitung und Wechsel sind ausgeschlossen</small></div></div>
    <div className="plan-current-exercise"><div><small>ÜBUNG {run.index + 1}/{exercises.length}</small><strong>{exercises[run.index]}</strong></div><time>{formatCountdown(run.phase === "finished" ? 0 : left)}</time></div>
    <p className="plan-runner-phase" role="status">{run.phase === "preparing" ? `Mach dich bereit für ${exercises[run.index]}. Geh zum Gerät – Trainingszeit startet nach dem Countdown.` : run.phase === "running" ? "Übung läuft" : run.phase === "finished" ? "Übung beendet. Keine Zeit läuft bis zum nächsten bewussten Start." : "Bereit? Starte die Vorbereitung, wenn du zum Gerät gehen möchtest."}</p>
    {error && <p role="alert">{error}</p>}
    <div className="plan-unit-exercises">{exercises.map((exercise, index) => <article className={`plan-unit-exercise-row ${run.index === index ? "is-current-exercise" : ""}`} key={`${exercise}:${index}`}><span>{index + 1}</span><button onClick={() => onGuide(exercise)}>{exercise}</button><time>{formatCountdown(exerciseSlotSeconds(total, exercises.length, index))}</time><button onClick={() => onGuide(exercise, "manual")}>PDF</button></article>)}</div>
    <footer className="plan-unit-footer">
      {run.phase === "ready" && <button disabled={busy} onClick={() => prepare()}>Übung starten · {preparationSeconds} Sek. vorbereiten</button>}
      {run.phase === "finished" && run.index < exercises.length - 1 && <button disabled={busy} onClick={() => prepare(true)}>Nächste Übung starten · {preparationSeconds} Sek. vorbereiten</button>}
      <button disabled={busy} onClick={() => void end()}>{run.phase === "preparing" ? "Vorbereitung abbrechen / Einheit beenden" : "Einheit beenden"}</button>
    </footer>
  </section>;
}
