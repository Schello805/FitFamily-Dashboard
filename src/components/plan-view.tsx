"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, BookOpen, CalendarDays, ChevronLeft, ChevronRight, Cpu, Download, Play, RefreshCw, Sparkles, Trash2, Upload, Video, X } from "lucide-react";
import { getFitnessStageCount, type DashboardProfile } from "@/lib/domain";
import { showToast } from "@/components/toast";
import { normalizePlanJson, type NormalizedPlan, type NormalizedSession } from "@/lib/plan-normalizer";
import { resolveExerciseId } from "@/lib/exercise-guides";
import { youtubeVideoId } from "@/lib/exercise-video";
import { PlanSessionRunner, type PlanExerciseMedia } from "./plan-session-runner";
import { KioskIdleBar } from "@/components/kiosk-idle-bar";
import { formatGermanDate } from "@/lib/date-format";
import { YoutubePlayer } from "@/components/youtube-player";
import { requestJson } from "@/lib/api-client";
import { useRecordingChoice } from "./recording-choice";
import type { RecordingMode } from "@/lib/recording-mode";

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
  manualPdfUrl?: string | null;
  mode?: "video" | "manual";
  loading?: boolean;
};

export function PlanView({ profile, goals }: { profile: DashboardProfile; goals: string[] }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [startingSession, setStartingSession] = useState(false);
  const [unitDialog, setUnitDialog] = useState<{ session: NormalizedSession; startedAt: string; recordingMode: RecordingMode } | null>(null);
  const recording = useRecordingChoice();
  const [preparationSeconds, setPreparationSeconds] = useState(30);
  const [unitAudio, setUnitAudio] = useState<AudioContext | null>(null);
  const [selectedExercise, setSelectedExercise] = useState<SessionExercise | null>(null);
  const [exerciseMedia, setExerciseMedia] = useState<Record<string, PlanExerciseMedia>>({});
  const [runningUnitKey, setRunningUnitKey] = useState<string | null>(null);
  const [weekPage, setWeekPage] = useState<{ planId: string; page: number } | null>(null);
  const load = () => requestJson<{ plans?: Plan[] }>(`/api/plans?profileId=${encodeURIComponent(profile.id)}`, "Trainingspläne konnten nicht geladen werden.")
    .then((data) => setPlans(data.plans ?? []));
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

  useEffect(() => {
    if (!unitDialog) return;
    let cancelled = false;
    const exercises = unitDialog.session.exercises.length ? unitDialog.session.exercises : [unitDialog.session.title];
    Promise.all([
      requestJson<{ exercises: { name: string; equipment: string; videoUrl: string | null }[] }>("/api/exercises", "Übungsgeräte konnten nicht geladen werden.", { cache: "no-store" }),
      requestJson<{ equipment: { name: string; manualPdfUrl: string | null }[] }>("/api/equipment", "Geräte-PDFs konnten nicht geladen werden.", { cache: "no-store" })
    ]).then(([catalog, devices]) => {
      if (cancelled) return;
      const byName = new Map(catalog.exercises.map(item => [item.name.trim().toLocaleLowerCase("de"), item]));
      const byDevice = new Map(devices.equipment.map(item => [item.name.trim().toLocaleLowerCase("de"), item]));
      setExerciseMedia(Object.fromEntries(exercises.flatMap(name => {
        const match = byName.get(name.trim().toLocaleLowerCase("de"));
        if (!match) return [];
        return [[name, { equipment: match.equipment, manualPdfUrl: byDevice.get(match.equipment.trim().toLocaleLowerCase("de"))?.manualPdfUrl ?? null, videoUrl: match.videoUrl }]];
      })));
    }).catch(() => { if (!cancelled) setExerciseMedia({}); });
    return () => { cancelled = true; };
  }, [unitDialog]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = JSON.parse(localStorage.getItem("fitfamily_running_plan_unit") ?? "null") as { key?: string } | null;
        if (saved?.key?.startsWith(`${profile.id}:`)) setRunningUnitKey(saved.key);
      } catch { /* Ein beschädigter Eintrag wird beim nächsten Start ersetzt. */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [profile.id]);

  function openUnitView(session: NormalizedSession, startedAt: string, recordingMode: RecordingMode = "app") {
    setSelectedExercise(null);
    setExerciseMedia({});
    setUnitDialog({ session, startedAt, recordingMode });
  }

  async function startUnit(session: NormalizedSession) {
    // Unlock audio directly in the user's click before modal/network awaits.
    try { const context = new AudioContext(); void context.resume(); setUnitAudio(context); } catch { /* Visual timer works without audio. */ }
    const sessionKey = `${profile.id}:${session.date ?? ""}:${session.title}`;
    try {
      const saved = JSON.parse(localStorage.getItem("fitfamily_running_plan_unit") ?? "null") as { key?: string; startedAt?: string; recordingMode?: RecordingMode } | null;
      if (saved?.key === sessionKey && saved.startedAt) {
        setRunningUnitKey(sessionKey);
        openUnitView(session, saved.startedAt, saved.recordingMode);
        return;
      }
    } catch { /* Ein defekter lokaler Eintrag wird beim nächsten Start ersetzt. */ }
    setStartingSession(true);
    try {
      const recordingMode = await recording.ask();
      if (!recordingMode) return;
      const settings = await requestJson<{ settings: { preparationSeconds?: number } }>("/api/admin/display-settings", "Vorbereitungszeit konnte nicht geladen werden.");
      setPreparationSeconds(settings.settings.preparationSeconds ?? 30);
      const startedAt = new Date().toISOString();
      localStorage.setItem("fitfamily_running_plan_unit", JSON.stringify({ key: sessionKey, startedAt, recordingMode }));
      setRunningUnitKey(sessionKey);
      openUnitView(session, startedAt, recordingMode);
      showToast({
        type: "success",
        title: `Einheit bereit: ${session.title}`,
        message: "Der Vorbereitungs-Countdown läuft. Vorbereitungszeit wird nicht gewertet."
      });
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

  async function loadExercise(exerciseName: string, mode: "video" | "manual" = "video") {
    let id = resolveExerciseId(exerciseName);
    setSelectedExercise({ id, name: exerciseName, mode, loading: true });
    try {
      const matchData = await requestJson<{ exercise?: { id?: string | number } }>(
        `/api/exercises?name=${encodeURIComponent(exerciseName)}`, "Übung konnte nicht gefunden werden.", { cache: "no-store" }
      );
      if (matchData.exercise?.id) id = String(matchData.exercise.id);
      setSelectedExercise({ id, name: exerciseName, mode, loading: true });
      const data = await requestJson<{ guide: ExerciseGuideData; videoUrl?: string | null; manualPdfUrl?: string | null }>(
        `/api/exercises/${encodeURIComponent(id)}`, "Übungsanleitung konnte nicht geladen werden.", { cache: "no-store" }
      );
      setSelectedExercise({ id, name: exerciseName, mode, guide: data.guide, videoUrl: data.videoUrl ?? null, manualPdfUrl: data.manualPdfUrl ?? null });
    } catch (error) {
      setSelectedExercise({ id, name: exerciseName, mode });
      showToast({ type: "error", title: "Anleitung nicht verfügbar", message: error instanceof Error ? error.message : "Bitte Verbindung prüfen." });
    }
  }

  async function create(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setNotice(""); const form = new FormData(event.currentTarget);
    try {
      const result = await requestJson<{ fallbackReason?: string; provider?: string }>("/api/plans", "Plan konnte nicht erstellt werden.", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        profileId: profile.id, goal: form.get("goal"), level: form.get("level"), sessionsPerWeek: Number(form.get("sessions")), minutesPerSession: Number(form.get("minutes")), targetDate: form.get("targetDate") || null, provider: form.get("provider")
      }) });
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
      await requestJson("/api/plans", "Der Trainingsplan konnte nicht importiert werden.", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "import", profileId: profile.id, plan }) });
      setNotice("Trainingsplan importiert. Der vorherige aktive Plan wurde archiviert.");
      showToast({
        type: "success",
        title: "Trainingsplan importiert",
        message: "Der importierte Plan ist ab jetzt aktiv."
      });
      await load();
    } catch (error) {
      const err = error instanceof SyntaxError
        ? "Die Datei enthält kein gültiges JSON. Nutze am besten die FitFamily-Vorlage."
        : error instanceof Error ? error.message : "Der Trainingsplan konnte nicht importiert werden.";
      setNotice(err);
      showToast({ type: "error", title: error instanceof SyntaxError ? "Ungültiges Format" : "Import fehlgeschlagen", message: err });
    } finally {
      setBusy(false);
    }
  }

  async function archivePlan() {
    if (!active || !window.confirm(`Möchtest du „${active.title}“ archivieren? Der Plan kann später wiederhergestellt werden.`)) return;
    setBusy(true);
    try {
      await requestJson("/api/plans", "Trainingsplan konnte nicht archiviert werden.", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId: profile.id, planId: active.id }) });
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
      await requestJson("/api/plans", "Trainingsplan konnte nicht wiederhergestellt werden.", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId: profile.id, planId: plan.id }) });
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
      {recording.dialog}
      <KioskIdleBar redirectUrl="/" seconds={120} color={profile.color} title={`Trainingsplan von ${profile.name}`} paused={Boolean(unitDialog) || recording.open} />
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
            {active.target_date ? formatGermanDate(active.target_date) : "Offenes Ende"}
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
                              {session.date ? `${formatGermanDate(session.date, { weekday: "short" })} · ` : ""}
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
      <div className="modal-backdrop plan-unit-backdrop">
        <div className="plan-runner-layout">
          <PlanSessionRunner profileId={profile.id} session={unitDialog.session} recordingMode={unitDialog.recordingMode} preparationSeconds={preparationSeconds} audioContext={unitAudio} exerciseMedia={exerciseMedia} onGuide={(name, mode) => void loadExercise(name, mode)} onClose={() => { localStorage.removeItem("fitfamily_running_plan_unit"); setRunningUnitKey(null); setUnitDialog(null); setSelectedExercise(null); }} />
            {selectedExercise ? (
              <section className="plan-exercise-detail" aria-live="polite">
                <div className="plan-exercise-detail-heading">
                  <div><small>{selectedExercise.guide?.equipment ?? "Übungsanleitung"}</small><h3>{selectedExercise.name}</h3></div>
                  <button type="button" aria-label="Anleitung schließen" onClick={() => setSelectedExercise(null)}><X /></button>
                </div>
                {selectedExercise.loading ? <p>{selectedExercise.mode === "manual" ? "Geräte-PDF wird geöffnet …" : "Video wird geladen …"}</p> : selectedExercise.guide ? (
                  <>
                    {selectedExercise.mode === "manual" ? selectedExercise.manualPdfUrl ? (
                      <>
                        <div className="plan-manual-toolbar"><b>Geräteanleitung · {selectedExercise.guide.equipment}</b><a href={selectedExercise.manualPdfUrl} target="_blank" rel="noreferrer">PDF separat öffnen ↗</a></div>
                        <iframe className="plan-manual-pdf" src={selectedExercise.manualPdfUrl} title={`PDF-Geräteanleitung: ${selectedExercise.guide.equipment}`} />
                      </>
                    ) : <p className="plan-no-video">Für „{selectedExercise.guide.equipment}“ ist hier keine PDF-Geräteanleitung hinterlegt.</p> : <>
                      {selectedExercise.videoUrl && (youtubeVideoId(selectedExercise.videoUrl) ? (
                        <YoutubePlayer videoId={youtubeVideoId(selectedExercise.videoUrl)!} title={`Übungsvideo: ${selectedExercise.name}`} onPlayingChange={() => {}} />
                      ) : <a className="plan-external-video" href={selectedExercise.videoUrl} target="_blank" rel="noreferrer"><Video size={18} /> Übungsvideo öffnen</a>)}
                      {!selectedExercise.videoUrl && <p className="plan-no-video">Für diese Übung ist noch kein YouTube-Video hinterlegt.</p>}
                    </>}
                    {selectedExercise.mode !== "manual" && <div className="plan-guide-columns">
                      <div><h4>Vorbereitung</h4>{selectedExercise.guide.setup.map((step) => <p key={step}>{step}</p>)}</div>
                      <div><h4>Ausführung</h4>{selectedExercise.guide.movement.map((step) => <p key={step}>{step}</p>)}</div>
                      <div><h4>Atmung &amp; Tempo</h4><p>{selectedExercise.guide.breathing}</p><p>{selectedExercise.guide.tempo}</p></div>
                      <div><h4>Sicherheit</h4>{selectedExercise.guide.safety.map((step) => <p key={step}>{step}</p>)}</div>
                    </div>}
                  </>
                ) : <p>Die Anleitung ist derzeit nicht verfügbar.</p>}
              </section>
            ) : <section className="plan-exercise-detail plan-exercise-placeholder"><Video size={38} /><b>Übung auswählen</b><p>Die Anleitung und das eingebettete Video erscheinen hier.</p></section>}
        </div>
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
