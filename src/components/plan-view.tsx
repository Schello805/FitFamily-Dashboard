"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpen, CalendarDays, ChevronLeft, ChevronRight, Cpu, Download, Play, RefreshCw, Sparkles, Square, Trash2, Upload, Video, X } from "lucide-react";
import { getFitnessStageCount, type DashboardProfile } from "@/lib/domain";
import { showToast } from "@/components/toast";
import { normalizePlanJson, type NormalizedPlan, type NormalizedSession } from "@/lib/plan-normalizer";
import { resolveExerciseId } from "@/lib/exercise-guides";
import { youtubeVideoId } from "@/lib/exercise-video";
import { exerciseSlotSeconds, formatCountdown, getCurrentExerciseIndex, getExerciseRemainingSeconds } from "@/lib/plan-timers";
import { KioskIdleBar } from "@/components/kiosk-idle-bar";
import { LiveDuration } from "@/components/live-duration";
import { YoutubePlayer } from "@/components/youtube-player";

type Plan = {
  id: string;
  title: string;
  goal: string;
  target_date: string | null;
  status: string;
  plan_json: NormalizedPlan | Record<string, unknown>;
};

function getCurrentPlanWeek(weeks: NormalizedPlan["weeks"]) {
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const todayWeek = weeks.find((week) => week.sessions.some((session) => session.date === todayKey));
  if (todayWeek) return todayWeek.week;
  const upcoming = weeks
    .flatMap((week) => week.sessions.filter((session) => session.date && session.date > todayKey).map((session) => ({ week: week.week, date: session.date! })))
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  return upcoming?.week ?? weeks[0]?.week ?? null;
}

type ExerciseGuideData = {
  id: string;
  name: string;
  equipment: string;
  setup: string[];
  movement: string[];
  breathing: string;
  tempo: string;
  mistakes: string[];
  safety: string[];
};

type SessionExercise = {
  id: string;
  name: string;
  guide?: ExerciseGuideData;
  videoUrl?: string | null;
  loading?: boolean;
};

export function PlanView({ profile, goals }: { profile: DashboardProfile; goals: string[] }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [startingSession, setStartingSession] = useState(false);
  const [stoppingSession, setStoppingSession] = useState(false);
  const [unitDialog, setUnitDialog] = useState<{ session: NormalizedSession; startedAt: string } | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [idleCloseSeconds, setIdleCloseSeconds] = useState(30);
  const [selectedExercise, setSelectedExercise] = useState<SessionExercise | null>(null);
  const [isVideoPlaying, setIsVideoPlaying] = useState(false);
  const [runningUnitKey, setRunningUnitKey] = useState<string | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const lastBeep = useRef<number | null>(null);
  const unitLastActivity = useRef(0);
  const [weekPage, setWeekPage] = useState<{ planId: string; page: number } | null>(null);
  const load = () => fetch(`/api/plans?profileId=${profile.id}`).then((response) => response.json()).then((data) => setPlans(data.plans || []));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const active = plans.find((plan) => plan.status === "active");
  const archivedPlans = plans.filter((plan) => plan.status === "archived");
  const activePlanJson = active ? normalizePlanJson(active.plan_json) : null;
  const weeks = activePlanJson?.weeks ?? [];
  const currentWeek = getCurrentPlanWeek(weeks);
  const currentWeekIndex = weeks.findIndex((week) => week.week === currentWeek);
  const weekPageCount = Math.max(1, Math.ceil(weeks.length / 4));
  const requestedWeekPage = weekPage && weekPage.planId === active?.id ? weekPage.page : Math.floor(Math.max(0, currentWeekIndex) / 4);
  const visibleWeekPage = Math.min(requestedWeekPage, weekPageCount - 1);
  const visibleWeeks = weeks.slice(visibleWeekPage * 4, visibleWeekPage * 4 + 4);
  const unitTotalSeconds = unitDialog ? Math.max(1, unitDialog.session.minutes) * 60 : 0;
  const unitElapsedSeconds = Math.max(0, unitTotalSeconds - remainingSeconds);
  const unitExercises = unitDialog?.session.exercises ?? [];
  const currentExerciseIndex = unitExercises.length
    ? getCurrentExerciseIndex(unitTotalSeconds, unitElapsedSeconds, unitExercises.length)
    : -1;
  const currentExerciseRemaining = currentExerciseIndex >= 0
    ? getExerciseRemainingSeconds(unitTotalSeconds, unitElapsedSeconds, unitExercises.length, currentExerciseIndex)
    : 0;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem("fitfamily_running_plan_unit") ?? "null") as { key?: string } | null;
        if (saved?.key?.startsWith(`${profile.id}:`)) setRunningUnitKey(saved.key);
      } catch { /* Ein beschädigter Eintrag wird beim nächsten Start ersetzt. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [profile.id]);

  useEffect(() => {
    if (!unitDialog || isVideoPlaying) return;
    unitLastActivity.current = Date.now();
    const recordActivity = () => { unitLastActivity.current = Date.now(); };
    const updateIdleTimer = () => {
      const left = Math.max(0, Math.ceil((unitLastActivity.current + 30_000 - Date.now()) / 1000));
      setIdleCloseSeconds(left);
      if (left === 0) {
        setUnitDialog(null);
        setSelectedExercise(null);
      }
    };
    const events = ["pointerdown", "keydown", "touchstart", "wheel"] as const;
    const interval = window.setInterval(updateIdleTimer, 250);
    events.forEach((event) => window.addEventListener(event, recordActivity, { passive: true }));
    return () => {
      window.clearInterval(interval);
      events.forEach((event) => window.removeEventListener(event, recordActivity));
    };
  }, [unitDialog, isVideoPlaying]);

  useEffect(() => {
    if (!unitDialog) return;
    const duration = Math.max(1, unitDialog.session.minutes) * 60;
    const updateCountdown = () => {
      const left = Math.max(0, Math.ceil((new Date(unitDialog.startedAt).getTime() + duration * 1000 - Date.now()) / 1000));
      setRemainingSeconds(left);
      if ((left === 30 || left <= 5) && left !== lastBeep.current) {
        lastBeep.current = left;
        try {
          const context = audioContext.current;
          if (context && context.state !== "closed") {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            oscillator.frequency.value = left <= 5 ? 880 : 660;
            gain.gain.value = 0.08;
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start();
            oscillator.stop(context.currentTime + 0.12);
          }
        } catch { /* Audio ist optional; der visuelle Countdown bleibt verfügbar. */ }
      }
    };
    updateCountdown();
    const interval = window.setInterval(updateCountdown, 250);
    return () => window.clearInterval(interval);
  }, [unitDialog]);

  function openUnitView(session: NormalizedSession, startedAt: string) {
    setSelectedExercise(null);
    lastBeep.current = null;
    setIdleCloseSeconds(30);
    if (!audioContext.current && typeof window !== "undefined") {
      try { audioContext.current = new window.AudioContext(); void audioContext.current.resume(); } catch { /* Browser ohne AudioContext */ }
    }
    setUnitDialog({ session, startedAt });
  }

  async function startUnit(session: NormalizedSession) {
    const sessionKey = `${profile.id}:${session.date ?? ""}:${session.title}`;
    try {
      const saved = JSON.parse(localStorage.getItem("fitfamily_running_plan_unit") ?? "null") as { key?: string; startedAt?: string } | null;
      if (saved?.key === sessionKey && saved.startedAt) {
        setRunningUnitKey(sessionKey);
        openUnitView(session, saved.startedAt);
        return;
      }
    } catch { /* Ein defekter lokaler Eintrag wird beim nächsten Start ersetzt. */ }
    setStartingSession(true);
    try {
      const response = await fetch("/api/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "start",
          profileId: profile.id,
          type: session.type,
          source: "touch"
        })
      });
      if (response.ok) {
        const startedAt = new Date().toISOString();
        localStorage.setItem("fitfamily_running_plan_unit", JSON.stringify({ key: sessionKey, startedAt }));
        setRunningUnitKey(sessionKey);
        openUnitView(session, startedAt);
        showToast({
          type: "success",
          title: `Einheit gestartet: ${session.title}`,
          message: `${session.type === "strength" ? "Krafttraining (+1 Pkt./Min.)" : "Ausdauertraining (+2 Pkt./Min.)"} läuft.`
        });
      } else {
        const data = await response.json().catch(() => null);
        showToast({
          type: "error",
          title: "Start fehlgeschlagen",
          message: data?.error ?? "Training konnte nicht gestartet werden."
        });
      }
    } catch {
      showToast({
        type: "error",
        title: "Verbindungsfehler",
        message: "Server konnte nicht erreicht werden."
      });
    } finally {
      setStartingSession(false);
    }
  }

  async function loadExercise(exerciseName: string) {
    let id = resolveExerciseId(exerciseName);
    setSelectedExercise({ id, name: exerciseName, loading: true });
    try {
      const matchResponse = await fetch(`/api/exercises?name=${encodeURIComponent(exerciseName)}`, { cache: "no-store" });
      if (matchResponse.ok) {
        const matchData = await matchResponse.json();
        if (matchData.exercise?.id) id = String(matchData.exercise.id);
      }
      setSelectedExercise({ id, name: exerciseName, loading: true });
      const response = await fetch(`/api/exercises/${encodeURIComponent(id)}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Übungsanleitung konnte nicht geladen werden.");
      setSelectedExercise({ id, name: exerciseName, guide: data.guide, videoUrl: data.videoUrl ?? null });
    } catch (error) {
      setSelectedExercise({ id, name: exerciseName });
      showToast({ type: "error", title: "Anleitung nicht verfügbar", message: error instanceof Error ? error.message : "Bitte Verbindung prüfen." });
    }
  }

  async function stopUnit() {
    setStoppingSession(true);
    try {
      const response = await fetch("/api/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", profileId: profile.id })
      });
      if (!response.ok) throw new Error("Das Training konnte nicht beendet werden.");
      localStorage.removeItem("fitfamily_running_plan_unit");
      setRunningUnitKey(null);
      setUnitDialog(null);
      setSelectedExercise(null);
      showToast({ type: "success", title: "Einheit beendet", message: "Die Trainingszeit wurde gespeichert." });
    } catch (error) {
      showToast({ type: "error", title: "Stoppen fehlgeschlagen", message: error instanceof Error ? error.message : "Bitte Verbindung prüfen." });
    } finally {
      setStoppingSession(false);
    }
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice(""); const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        profileId: profile.id, goal: form.get("goal"), level: form.get("level"), sessionsPerWeek: Number(form.get("sessions")), minutesPerSession: Number(form.get("minutes")), targetDate: form.get("targetDate") || null, provider: form.get("provider")
      }) });
      const result = await response.json();
      if (!response.ok) {
        const err = result.error ?? "Plan konnte nicht erstellt werden.";
        setNotice(err);
        showToast({ type: "error", title: "Fehler beim Erstellen", message: err });
        return;
      }
      const selectedProvider = form.get("provider");
      const msg = result.fallbackReason
        ? result.fallbackReason
        : result.provider === "local"
        ? (selectedProvider !== "local" ? "Plan als lokale Vorlage erstellt (kein aktiver KI-Schlüssel hinterlegt)." : "Plan erstellt (lokale Vorlage).")
        : `Plan mit ${result.provider === "openai" ? "OpenAI" : "Gemini"} erstellt.`;
      setNotice(msg);
      showToast({
        type: "sparkles",
        title: "Neuer Trainingsplan bereit",
        message: msg
      });
      setCreating(false);
      await load();
    } catch {
      const err = "Verbindungsfehler beim Erstellen des Plans.";
      setNotice(err);
      showToast({ type: "error", title: "Verbindungsfehler", message: err });
    } finally {
      setBusy(false);
    }
  }

  async function importJson(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    event.currentTarget.value = "";
    if (file.size > 512 * 1024) {
      const err = "Die Plan-Datei darf höchstens 512 KB groß sein.";
      setNotice(err);
      showToast({ type: "error", title: "Datei zu groß", message: err });
      return;
    }
    setBusy(true); setNotice("");
    try {
      const plan = JSON.parse(await file.text());
      const response = await fetch("/api/plans", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "import", profileId: profile.id, plan }) });
      const result = await response.json();
      if (!response.ok) {
        const err = result.error ?? "Der Trainingsplan konnte nicht importiert werden.";
        setNotice(err);
        showToast({ type: "error", title: "Import fehlgeschlagen", message: err });
        return;
      }
      setNotice("Trainingsplan importiert. Der vorherige aktive Plan wurde archiviert.");
      showToast({
        type: "success",
        title: "Trainingsplan importiert",
        message: "Der importierte Plan ist ab jetzt aktiv."
      });
      await load();
    } catch {
      const err = "Die Datei enthält kein gültiges JSON. Nutze am besten die FitFamily-Vorlage.";
      setNotice(err);
      showToast({ type: "error", title: "Ungültiges Format", message: err });
    } finally {
      setBusy(false);
    }
  }

  async function archivePlan() {
    if (!active || !window.confirm(`Möchtest du „${active.title}“ archivieren? Der Plan kann später wiederhergestellt werden.`)) return;
    setBusy(true);
    try {
      const response = await fetch("/api/plans", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId: profile.id, planId: active.id }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Trainingsplan konnte nicht archiviert werden.");
      showToast({ type: "success", title: "Trainingsplan archiviert", message: "Du kannst den Plan unten jederzeit wiederherstellen." });
      await load();
    } catch (error) {
      showToast({ type: "error", title: "Archivieren fehlgeschlagen", message: error instanceof Error ? error.message : "Bitte Verbindung prüfen." });
    } finally {
      setBusy(false);
    }
  }

  async function restorePlan(plan: Plan) {
    setBusy(true);
    try {
      const response = await fetch("/api/plans", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId: profile.id, planId: plan.id }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Trainingsplan konnte nicht wiederhergestellt werden.");
      showToast({ type: "success", title: "Trainingsplan wiederhergestellt", message: `„${plan.title}“ ist wieder aktiv.` });
      await load();
    } catch (error) {
      showToast({ type: "error", title: "Wiederherstellung fehlgeschlagen", message: error instanceof Error ? error.message : "Bitte Verbindung prüfen." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="subpage" style={{ "--profile": profile.color } as React.CSSProperties}>
      <KioskIdleBar redirectUrl="/" seconds={120} color={profile.color} title={`Trainingsplan von ${profile.name}`} paused={isVideoPlaying} />
      <header>
        <Link href={`/profil/${profile.id}`} title={`Zurück zur Profilseite von ${profile.name}`}>
          <ArrowLeft /> Zurück
        </Link>
        <div>
          <span>Persönlicher Plan</span>
          <h1>{profile.name}</h1>
        </div>
        <div className="plan-actions">
          <a className="plan-template" href="/assets/trainingsplan-vorlage.json" download title="JSON-Vorlage für Trainingspläne herunterladen">
            <Download /> Vorlage
          </a>
          <label className="plan-import" title="Eigene Trainingsplan-JSON-Datei hochladen">
            <Upload /> JSON laden
            <input type="file" accept="application/json,.json" onChange={importJson} disabled={busy} />
          </label>
          <button onClick={() => setCreating(true)} title="Neuen KI-Trainingsplan generieren">
            <Sparkles /> Neuer Plan
          </button>
          {active && <button type="button" className="plan-archive-action" disabled={busy} onClick={() => void archivePlan()}><Trash2 /> Plan archivieren</button>}
        </div>
      </header>
    {notice && <p className="notice">{notice}</p>}
    {active ? (
      <section className="plan-document">
        <div className="plan-head">
          <div>
            <span className="setup-badge">Aktiver Plan</span>
            <h2>{active.title}</h2>
            <p>{activePlanJson?.summary || "Persönlicher Trainingsplan"}</p>
          </div>
          <div className="plan-meta">
            <CalendarDays />
            {active.target_date ? new Date(active.target_date).toLocaleDateString("de-DE") : "Offenes Ende"}
            <small>
              {activePlanJson?.provider === "local"
                ? "Lokaler Vorschlag"
                : activePlanJson?.provider
                  ? `Erstellt mit ${activePlanJson.provider}`
                  : "Aktiv"}
            </small>
          </div>
        </div>

        {activePlanJson && weeks.length > 0 ? (
          <>
            {weekPageCount > 1 && (
              <div className="plan-week-toolbar">
                <span>Wochenübersicht · vier Wochen pro Ansicht</span>
                <div>
                  <button type="button" onClick={() => active && setWeekPage({ planId: active.id, page: (visibleWeekPage + weekPageCount - 1) % weekPageCount })} aria-label="Vorherige vier Wochen"><ChevronLeft /></button>
                  <b>Woche {visibleWeeks[0]?.week}–{visibleWeeks[visibleWeeks.length - 1]?.week} von {weeks.length}</b>
                  <button type="button" onClick={() => active && setWeekPage({ planId: active.id, page: (visibleWeekPage + 1) % weekPageCount })} aria-label="Nächste vier Wochen"><ChevronRight /></button>
                </div>
              </div>
            )}
            <div className="week-grid">
              {visibleWeeks.map((week) => {
                const isCurrent = week.week === currentWeek;
                return (
                  <article key={week.week} className={isCurrent ? "current-week" : ""}>
                    <h3>Woche {week.week}{isCurrent && <span className="week-current-badge">Diese Woche</span>}</h3>
                    {week.sessions.length ? week.sessions.map((session, index) => {
                      const sessionKey = `${profile.id}:${session.date ?? ""}:${session.title}`;
                      const isRunningUnit = runningUnitKey === sessionKey;
                      return (
                        <div key={`${week.week}-${session.date ?? index}-${index}`} className={`plan-session-card compact-session-card ${isRunningUnit ? "is-running-unit" : ""}`}>
                          <div className="compact-session-main">
                            <button type="button" className="compact-session-title compact-session-open" onClick={() => void startUnit(session)} disabled={startingSession} title={`Einheit „${session.title}“ öffnen oder starten`}>{session.title}</button>
                            <div className="compact-session-meta">
                              {session.date ? `${new Date(`${session.date}T12:00:00`).toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })} · ` : ""}
                              {session.minutes} Min.{session.distanceKm ? ` · ${session.distanceKm} km` : ""}
                              {session.exercises?.length ? ` · ${session.exercises.length} Übungen` : ""}
                            </div>
                          </div>
                          <button type="button" className={`plan-round-start-btn ${isRunningUnit ? "is-open-unit-btn" : ""}`} onClick={() => void startUnit(session)} disabled={startingSession} title={`Einheit „${session.title}“ ${isRunningUnit ? "öffnen" : "starten"}`}>
                            {startingSession ? <RefreshCw className="spin" size={17} /> : isRunningUnit ? <BookOpen size={16} /> : <Play size={16} fill="currentColor" />}
                            <span>{startingSession ? "Startet…" : isRunningUnit ? "Öffnen" : "Einheit starten"}</span>
                          </button>
                        </div>
                      );
                    }) : <p className="empty-week">Ruhetag</p>}
                  </article>
                );
              })}
            </div>
          </>
        ) : (
          <div className="empty-state" style={{ marginTop: "1.5rem" }}>
            <p>Für diesen Plan konnten keine Einheiten angezeigt werden.</p>
            <button onClick={() => setCreating(true)} style={{ marginTop: "0.5rem" }}>
              <Sparkles /> Neuen Plan generieren
            </button>
          </div>
        )}
      </section>
    ) : <section className="empty-state large"><Cpu /><h2>Noch kein Trainingsplan</h2><p>Erstelle einen einfachen, auf eure Geräte abgestimmten Vorschlag.</p><button onClick={() => setCreating(true)}>Plan erstellen</button></section>}
    {archivedPlans.length > 0 && <details className="plan-archive-list"><summary>Archivierte Pläne <span>{archivedPlans.length}</span></summary><div>{archivedPlans.map((plan) => <article key={plan.id}><span><b>{plan.title}</b><small>{plan.goal}</small></span><button type="button" disabled={busy} onClick={() => void restorePlan(plan)}>Wiederherstellen</button></article>)}</div></details>}
    {unitDialog && (
      <div className="modal-backdrop plan-unit-backdrop" onClick={() => { setUnitDialog(null); setSelectedExercise(null); setIsVideoPlaying(false); }}>
        <section className="plan-unit-dialog" role="dialog" aria-modal="true" aria-labelledby="plan-unit-title" onClick={(event) => event.stopPropagation()}>
          <button type="button" className="modal-close" aria-label="Einheit schließen" onClick={() => { setUnitDialog(null); setSelectedExercise(null); setIsVideoPlaying(false); }}><X /></button>
          <div className={`plan-unit-heading ${remainingSeconds <= 30 && remainingSeconds > 0 ? "is-countdown-warning" : ""} ${remainingSeconds === 0 ? "is-countdown-finished" : ""}`}>
            <div className="plan-unit-title-block"><span className="setup-badge">Einheit läuft · {unitDialog.session.type === "endurance" ? "Ausdauer" : "Kraft"}</span>
              <h2 id="plan-unit-title">{unitDialog.session.title}</h2>
              <p>{unitDialog.session.date ? `${new Date(`${unitDialog.session.date}T12:00:00`).toLocaleDateString("de-DE")} · ` : ""}{unitDialog.session.minutes} Min.{unitDialog.session.distanceKm ? ` · ${unitDialog.session.distanceKm} km` : ""}</p>
            </div>
            <div className="plan-unit-live"><span>{remainingSeconds === 0 ? "ZEIT ERREICHT" : "EINHEIT · GESAMT"}</span><strong className={remainingSeconds <= 5 && remainingSeconds > 0 ? "countdown-last-five" : ""}>{formatCountdown(remainingSeconds)}</strong><small>Trainingszeit <LiveDuration since={unitDialog.startedAt} /></small></div>
          </div>
          <div className="plan-unit-content">
            <div className="plan-unit-exercises">
              <h3>Geplante Übungen {unitExercises.length > 1 && <small className="plan-exercise-split-note">Zeit gleichmäßig verteilt</small>}</h3>
              {currentExerciseIndex >= 0 && (
                <div className="plan-current-exercise">
                  <div><small>JETZT · ÜBUNG {currentExerciseIndex + 1}/{unitExercises.length}</small><strong>{unitExercises[currentExerciseIndex]}</strong></div>
                  <time>{formatCountdown(currentExerciseRemaining)}</time>
                </div>
              )}
              {unitDialog.session.exercises?.length ? unitDialog.session.exercises.map((exercise, index) => (
                <article key={`${exercise}-${index}`} className={`plan-unit-exercise-row ${index === currentExerciseIndex ? "is-current-exercise" : ""}`}>
                  <span>{index + 1}</span>
                  <button type="button" className="plan-exercise-name" onClick={() => void loadExercise(exercise)}><span>{exercise}</span><small>{formatCountdown(exerciseSlotSeconds(unitTotalSeconds, unitDialog.session.exercises.length, index))}</small></button>
                  <button type="button" className="plan-exercise-guide" onClick={() => void loadExercise(exercise)}><BookOpen size={17} /><span>Anleitung</span></button>
                </article>
              )) : <p className="empty-week">Für diese Einheit sind keine einzelnen Übungen hinterlegt.</p>}
            </div>
            {selectedExercise ? (
              <section className="plan-exercise-detail" aria-live="polite">
                <div className="plan-exercise-detail-heading">
                  <div><small>{selectedExercise.guide?.equipment ?? "Übungsanleitung"}</small><h3>{selectedExercise.name}</h3></div>
                  <button type="button" aria-label="Anleitung schließen" onClick={() => setSelectedExercise(null)}><X /></button>
                </div>
                {selectedExercise.loading ? <p>Anleitung wird geladen…</p> : selectedExercise.guide ? (
                  <>
                    {selectedExercise.videoUrl && (youtubeVideoId(selectedExercise.videoUrl) ? (
                      <YoutubePlayer videoId={youtubeVideoId(selectedExercise.videoUrl)!} title={`Anleitungsvideo: ${selectedExercise.name}`} onPlayingChange={setIsVideoPlaying} />
                    ) : <a className="plan-external-video" href={selectedExercise.videoUrl} target="_blank" rel="noreferrer"><Video size={18} /> Video öffnen</a>)}
                    {!selectedExercise.videoUrl && <p className="plan-no-video">Für diese Übung ist noch kein Video hinterlegt.</p>}
                    <div className="plan-guide-columns">
                      <div><h4>Vorbereitung</h4>{selectedExercise.guide.setup.map((step) => <p key={step}>{step}</p>)}</div>
                      <div><h4>Ausführung</h4>{selectedExercise.guide.movement.map((step) => <p key={step}>{step}</p>)}</div>
                      <div><h4>Atmung &amp; Tempo</h4><p>{selectedExercise.guide.breathing}</p><p>{selectedExercise.guide.tempo}</p></div>
                      <div><h4>Sicherheit</h4>{selectedExercise.guide.safety.map((step) => <p key={step}>{step}</p>)}</div>
                    </div>
                  </>
                ) : <p>Die Anleitung ist derzeit nicht verfügbar.</p>}
              </section>
            ) : <section className="plan-exercise-detail plan-exercise-placeholder"><Video size={38} /><b>Übung auswählen</b><p>Die Anleitung und das eingebettete Video erscheinen hier.</p></section>}
          </div>
          <footer className="plan-unit-footer">
            <div className={`plan-idle-countdown ${isVideoPlaying ? "is-paused" : ""}`} style={{ "--idle-progress": `${((30 - idleCloseSeconds) / 30) * 100}%` } as React.CSSProperties}>
              <span>{isVideoPlaying ? "Schließ-Timer pausiert · Video läuft" : "Fenster schließt bei Inaktivität in"}</span>
              <strong>{formatCountdown(idleCloseSeconds)}</strong>
            </div>
            <button type="button" className="plan-unit-stop" disabled={stoppingSession} onClick={() => void stopUnit()}><Square size={17} fill="currentColor" />{stoppingSession ? "Wird beendet…" : "Einheit beenden"}</button>
          </footer>
        </section>
      </div>
    )}
    {creating && (() => {
      const stageCount = getFitnessStageCount(profile.id, profile.birthDate);
      const defaultLevel = stageCount === 3
        ? profile.fitnessStage <= 1 ? "Einsteiger" : profile.fitnessStage === 2 ? "Fortgeschritten" : "Erfahren"
        : profile.fitnessStage <= 3 ? "Einsteiger" : profile.fitnessStage <= 5 ? "Fortgeschritten" : "Erfahren";
      return (
        <div className="modal-backdrop"><form className="plan-modal" onSubmit={create}><button type="button" className="modal-close" onClick={() => setCreating(false)}>×</button><span className="setup-badge">Neuer Trainingsplan</span><h2>Ziel für {profile.name} festlegen</h2><label>Trainingsziel<select name="goal" defaultValue={profile.goal}>{goals.map((goal) => <option key={goal}>{goal}</option>)}</select></label><label>Trainingsstand<select name="level" defaultValue={defaultLevel}><option>Einsteiger</option><option>Fortgeschritten</option><option>Erfahren</option></select></label><div className="two-fields"><label>Einheiten pro Woche<select name="sessions" defaultValue={3}>{[1,2,3,4,5,6,7].map((value) => <option key={value}>{value}</option>)}</select></label><label>Dauer<select name="minutes" defaultValue={30}>{[15,30,45,60,90].map((value) => <option key={value} value={value}>{value} Min.</option>)}</select></label></div><label>Zieldatum (optional)<input name="targetDate" type="date" /></label><label>Planerstellung<select name="provider"><option value="openai">OpenAI</option><option value="gemini">Google Gemini</option><option value="local">Ohne KI · lokal</option></select></label><p className="ai-privacy">Es werden nur Ziel, Niveau, Zeit und Geräte anonymisiert übertragen.</p><button className="primary-submit" disabled={busy}>{busy ? "Plan wird erstellt …" : "Plan erstellen"}</button></form></div>
      );
    })()}
    </main>
  );
}
