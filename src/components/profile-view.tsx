"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, ArrowLeft, CalendarRange, CheckCircle2, Dumbbell, History, QrCode, Settings2, Smartphone, Square, XCircle, Zap } from "lucide-react";
import {
  avatarAssetForProfile,
  getFitnessStageCount,
  getStartingFitnessStages,
  physiqueLabel,
  type AvatarDesignId,
  type DashboardProfile,
  type TrainingType
} from "@/lib/domain";
import { LiveDuration } from "@/components/live-duration";
import { TrainingProgress } from "@/components/training-progress";
import { ProfileEditModal } from "@/components/profile-edit-modal";
import { Avatar } from "@/components/avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { showToast } from "@/components/toast";
import { ApiRequestError, requestJson } from "@/lib/api-client";
import { Modal } from "@/components/modal";
import { ConnectionStatus } from "@/components/connection-status";
import { useDashboardConnection } from "@/components/use-dashboard-connection";

type Exercise = { id: string; name: string; type: string; equipment: string };

export function ProfileView({
  initialProfile,
  exercises
}: {
  initialProfile: DashboardProfile;
  exercises: Exercise[];
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [busy, setBusy] = useState(false);
  const [resettingScore, setResettingScore] = useState(false);
  const [handoff, setHandoff] = useState<{ qr: string; url?: string; expiresAt: string; token?: string } | null>(null);
  const [handoffScanned, setHandoffScanned] = useState(false);
  const [longRunning, setLongRunning] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [prepCountdown, setPrepCountdown] = useState<{
    type: TrainingType;
    exerciseId?: string | null;
    secondsLeft: number;
  } | null>(null);
  const [editAvatar, setEditAvatar] = useState<AvatarDesignId>(avatarAssetForProfile(initialProfile.id, initialProfile.avatar) as AvatarDesignId);
  const [editPin, setEditPin] = useState("");
  const [editStartingFitness, setEditStartingFitness] = useState<number>(Math.min(initialProfile.startingFitness, getStartingFitnessStages(initialProfile.id, initialProfile.birthDate).length));
  const [editBirthDate, setEditBirthDate] = useState(initialProfile.birthDate ?? "");
  const [profileNotice, setProfileNotice] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const checkMobile = () => {
      const params = new URLSearchParams(window.location.search);
      const isMobileParam = params.get("mobil") === "1";
      const isNarrow = window.innerWidth <= 680;
      setIsMobile(isMobileParam || isNarrow);

      // Feedback when connected via QR code
      if (params.get("verbunden") === "1" || params.get("gekoppelt") === "1") {
        showToast({
          type: "success",
          title: "📱 Smartphone erfolgreich verbunden!",
          message: `Willkommen, ${initialProfile.name}! Du kannst dein Training jetzt direkt hier auf dem Handy steuern.`
        });
        const cleanUrl = window.location.pathname + (isMobileParam ? "?mobil=1" : "");
        window.history.replaceState({}, "", cleanUrl);
      }
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, [initialProfile.name]);

  // Poll handoff token status when QR modal is open
  useEffect(() => {
    if (!handoff?.token || handoffScanned) return;
    const interval = window.setInterval(async () => {
      try {
        const data = await requestJson<{ scanned?: boolean }>(
          `/api/handoff?token=${encodeURIComponent(handoff.token!)}`, "Verbindungsstatus nicht verfügbar."
        );
        if (data.scanned) {
          setHandoffScanned(true);
          showToast({
            type: "success",
            title: "Smartphone verbunden!",
            message: `${profile.name} steuert das Training jetzt auf dem Handy.`
          });
          setTimeout(() => {
            setHandoff(null);
            setHandoffScanned(false);
          }, 2400);
        }
      } catch {}
    }, 1200);
    return () => window.clearInterval(interval);
  }, [handoff?.token, handoffScanned, profile.name]);

  const { refresh, connectionError, lastRefreshedAt } = useDashboardConnection((data) => {
    const current = data.profiles.find((item) => item.id === profile.id);
    if (current) setProfile(current);
  });

  const [totalIdleSeconds] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("fitfamily_subpage_idle_timeout");
        if (stored !== null && !isNaN(Number(stored))) {
          return Number(stored);
        }
      } catch {}
    }
    return 60;
  });
  const [secondsLeft, setSecondsLeft] = useState(totalIdleSeconds);
  const [progress, setProgress] = useState(100);
  const deadlineRef = useRef<number | null>(null);

  const resetTimer = useCallback(() => {
    if (totalIdleSeconds <= 0) return;
    deadlineRef.current = Date.now() + totalIdleSeconds * 1000;
    setSecondsLeft(totalIdleSeconds);
    setProgress(100);
  }, [totalIdleSeconds]);

  useEffect(() => {
    if (isMobile || totalIdleSeconds <= 0) return;
    deadlineRef.current = Date.now() + totalIdleSeconds * 1000;
    const handleActivity = () => resetTimer();
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((event) => window.addEventListener(event, handleActivity, { passive: true }));

    const interval = window.setInterval(() => {
      if (!deadlineRef.current || prepCountdown !== null) return;
      const remainingMs = Math.max(0, deadlineRef.current - Date.now());
      const remainingSec = Math.ceil(remainingMs / 1000);
      setSecondsLeft(remainingSec);
      setProgress((remainingMs / (totalIdleSeconds * 1000)) * 100);

      if (remainingMs <= 0) {
        window.clearInterval(interval);
        router.push("/");
      }
    }, 250);

    return () => {
      window.clearInterval(interval);
      events.forEach((event) => window.removeEventListener(event, handleActivity));
    };
  }, [resetTimer, router, isMobile, prepCountdown, totalIdleSeconds]);

  useEffect(() => {
    const update = () => setLongRunning(Boolean(profile.activeTraining && Date.now() - new Date(profile.activeTraining.startedAt).getTime() > 2 * 60 * 60 * 1000));
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, [profile.activeTraining]);

  // Remind user when the active exercise changes mid-session
  const prevExerciseIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const currentExId = profile.activeTraining?.exerciseId ?? null;
    const previous = prevExerciseIdRef.current;
    if (previous !== undefined && previous !== currentExId && profile.activeTraining) {
      const exName = profile.activeTraining.exerciseName;
      showToast({
        type: "info",
        title: "💡 Übungswechsel",
        message: exName
          ? `Jetzt läuft: ${exName}`
          : "Neue Übung gestartet — weiter so!"
      });
    }
    prevExerciseIdRef.current = currentExId;
  }, [profile.activeTraining?.exerciseId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!prepCountdown) return;

    if (prepCountdown.secondsLeft <= 0) {
      const { type, exerciseId } = prepCountdown;
      const timeout = window.setTimeout(() => {
        setPrepCountdown(null);
        void action(type, exerciseId ?? undefined);
      }, 450);
      return () => window.clearTimeout(timeout);
    }

    const timer = window.setTimeout(() => {
      if (prepCountdown.secondsLeft <= 4 && prepCountdown.secondsLeft > 1) {
        playTone(660);
      } else if (prepCountdown.secondsLeft === 1) {
        playTone(880);
      }
      setPrepCountdown((prev) => prev ? { ...prev, secondsLeft: prev.secondsLeft - 1 } : null);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [prepCountdown]); // eslint-disable-line react-hooks/exhaustive-deps

  async function action(type?: TrainingType, exerciseId?: string) {
    setBusy(true);
    try {
      await requestJson("/api/training", "Training konnte nicht aktualisiert werden.", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(type
          ? { action: "start", profileId: profile.id, type, exerciseId: exerciseId ?? null, source: isMobile ? "mobile" : "touch" }
          : { action: "stop", profileId: profile.id })
      });
      playTone(type ? (type === "strength" ? 520 : 660) : 360);
      if (type === "strength") {
          const ex = exerciseId ? exercises.find((e) => e.id === exerciseId) : null;
          showToast({
            type: "success",
            title: "💪 Krafttraining gestartet",
            message: ex ? `Übung: ${ex.name} (+1 Punkt/Minute)` : "Trainingszeit läuft (+1 Punkt je Minute)."
          });
      } else if (type === "endurance") {
          showToast({
            type: "success",
            title: "🏃 Ausdauertraining gestartet",
            message: "Trainingszeit läuft (+2 Punkte je Minute)."
          });
      } else {
          setProfile((current) => ({ ...current, activeTraining: null }));
          showToast({
            type: "info",
            title: "✓ Training beendet & gespeichert",
            message: "Klasse Einsatz! Punkte und Trainingszeit wurden gutgeschrieben."
          });
      }
      await refresh(true);
      if (exerciseId) router.push(`/uebung/${exerciseId}?profil=${profile.id}`);
    } catch (error) {
      showToast({
        type: "error",
        title: "Training fehlgeschlagen",
        message: error instanceof Error ? error.message : "Server konnte nicht erreicht werden."
      });
    } finally {
      setBusy(false);
    }
  }

  function requestTrainingStart(type: TrainingType, exerciseId?: string) {
    if (busy) return;
    if (activeType === type && (!exerciseId || profile.activeTraining?.exerciseId === exerciseId)) {
      return;
    }
    playTone(520);
    setPrepCountdown({
      type,
      exerciseId: exerciseId ?? null,
      secondsLeft: 10
    });
  }

  function cancelCountdown() {
    setPrepCountdown(null);
    showToast({
      type: "info",
      title: "Start abgebrochen",
      message: "Kein Training gestartet."
    });
  }

  function instantStart() {
    if (!prepCountdown) return;
    const { type, exerciseId } = prepCountdown;
    setPrepCountdown(null);
    void action(type, exerciseId ?? undefined);
  }

  function playTone(frequency: number) {
    try {
      const AudioContextClass = window.AudioContext;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.04, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.12);
      oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.12);
    } catch { /* Ton ist optional. */ }
  }

  async function openHandoff() {
    const clientOrigin = typeof window !== "undefined" && !window.location.origin.includes("0.0.0.0") && !window.location.origin.includes("localhost") && !window.location.origin.includes("127.0.0.1")
      ? window.location.origin
      : undefined;
    try {
      const result = await requestJson<typeof handoff>("/api/handoff", "Handy-Verbindung konnte nicht gestartet werden.", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: profile.id, clientOrigin })
      });
      setHandoff(result);
    } catch (error) {
      showToast({ type: "error", title: "Handy-Verbindung fehlgeschlagen", message: error instanceof Error ? error.message : "Keine Verbindung zum Dashboard." });
    }
  }

  async function saveProfile(form: FormData, pin: string): Promise<boolean> {
    setBusy(true); setProfileNotice("");
    try {
      await requestJson(`/api/profiles/${profile.id}`, "Profil konnte nicht gespeichert werden.", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: String(form.get("email") ?? "").trim() || null,
          birthDate: form.get("birthDate") || null,
          avatar: editAvatar,
          startingFitness: Number(editStartingFitness),
          goal: form.get("goal"),
          pin
        })
      });
      setEditingProfile(false);
      showToast({
        type: "success",
        title: "Profil aktualisiert",
        message: `Angaben für ${profile.name} wurden gespeichert.`
      });
      await refresh(true);
      return true;
    } catch (error) {
      const err = error instanceof ApiRequestError
        ? error.message
        : "Keine Verbindung. Bitte prüfe das Heimnetz und versuche es erneut.";
      setProfileNotice(err);
      showToast({ type: "error", title: "Verbindungsfehler", message: err });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function resetProfileScore(pin: string): Promise<boolean> {
    if (pin.length !== 4) {
      setProfileNotice("Bitte zuerst die 4-stellige Eltern-PIN eingeben.");
      return false;
    }
    setResettingScore(true);
    setProfileNotice("");
    try {
      await requestJson("/api/admin/reset-score", "Punktestand konnte nicht zurückgesetzt werden.", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, profileId: profile.id })
      });
      showToast({ type: "success", title: "Punktestand zurückgesetzt", message: "Der Trainingsverlauf bleibt erhalten." });
      await refresh(true);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Punktestand konnte nicht zurückgesetzt werden.";
      setProfileNotice(message);
      showToast({ type: "error", title: "Zurücksetzen fehlgeschlagen", message });
      return false;
    } finally {
      setResettingScore(false);
    }
  }

  function openProfileEditor() {
    setProfileNotice("");
    setEditAvatar(avatarAssetForProfile(profile.id, profile.avatar) as AvatarDesignId);
    setEditBirthDate(profile.birthDate ?? "");
    setEditStartingFitness(Math.min(profile.startingFitness, getStartingFitnessStages(profile.id, profile.birthDate).length));
    setEditPin("");
    setEditingProfile(true);
  }

  const activeType = profile.activeTraining?.type;
  return (
    <main className="profile-shell" style={{ "--profile": profile.color } as React.CSSProperties}>
      <header className="profile-topbar">
        <Link href="/" className="icon-link" title="Zurück zum Hauptdashboard">
          <ArrowLeft size={isMobile ? 20 : 26} />
          <span>Dashboard</span>
        </Link>
        <div className="profile-topbar-title">
          <span className="eyebrow">Training für</span>
          <h1>{profile.name}</h1>
        </div>
        <div className="profile-topbar-right">
          <ThemeToggle showLabel={!isMobile} />
          {!isMobile && (
            <div
              className={`profile-idle-badge ${secondsLeft <= 15 ? "is-warning" : ""}`}
              onClick={resetTimer}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  resetTimer();
                }
              }}
              title="Automatische Rückkehr zum Dashboard bei Inaktivität (Tippen zum Verlängern)"
              role="button"
              tabIndex={0}
            >
              <div className="profile-idle-badge-track">
                <div className="profile-idle-badge-fill" style={{ width: `${progress}%` }} />
              </div>
              <span className="idle-pulse-dot" />
              <div className="profile-idle-badge-text">
                <small>Dashboard zurück in</small>
                <b>{secondsLeft}s</b>
              </div>
            </div>
          )}
          <div className="profile-score" title={`Aktueller Punktestand von ${profile.name}`}>
            <strong>{profile.score.toLocaleString("de-DE")}</strong>
            <span>Punkte</span>
          </div>
        </div>
      </header>

      {isMobile && (
        <>
          <div className="mobile-connected-banner">
            <Smartphone size={16} />
            <span>Handy-Steuerung aktiv</span>
          </div>
        </>
      )}
      <ConnectionStatus className="profile-connection-status" connectionError={connectionError} lastRefreshedAt={lastRefreshedAt} />

      <TrainingProgress progress={profile.trainingProgress} />
      <section className="training-hero">
        <div className="profile-hero-left">
          <Avatar profile={profile} size="large" />
          <div className="training-copy">
            <span className="section-kicker">Was möchtest du tun?</span>
            <h2>{profile.activeTraining ? "Dein Training läuft" : "Bereit, wenn du es bist."}</h2>
            <p>Starte direkt oder setze deinen persönlichen Trainingsplan fort.</p>
            <div className="avatar-meta-pills">
              <span className="avatar-pill stage">Fitnessstufe {profile.fitnessStage} von {getFitnessStageCount(profile.id, profile.birthDate)}</span>
              <span className={`avatar-pill physique ${profile.physique}`}>{physiqueLabel(profile.physique)}</span>
              <span className="avatar-pill minutes">
                {Math.round(profile.strengthMinutes)}m Kraft · {Math.round(profile.enduranceMinutes)}m Ausdauer
              </span>
            </div>
          </div>
        </div>
        <div className="profile-hero-right">
          {profile.activeTraining && (
            <div className="running-clock">
              {profile.activeTraining.equipmentName && <small>{profile.activeTraining.equipmentName}</small>}
              <span>{profile.activeTraining.exerciseName ?? (activeType === "strength" ? "Krafttraining" : "Ausdauertraining")}</span>
              <strong><LiveDuration since={profile.activeTraining.segmentStartedAt} /></strong>
              {longRunning && <em>Bitte prüfen: Läuft dieses Training noch?</em>}
            </div>
          )}
        </div>
      </section>

      <section className="training-entry-grid" aria-label="Training starten">
        <div className="training-direct-entry">
          <span className="section-kicker">Direkt starten</span>
      <section className={`training-actions ${profile.activeTraining ? "has-active-training" : ""}`}>
        <button
          disabled={busy}
          className={`training-button strength ${activeType === "strength" ? "selected" : ""}`}
          onClick={() => requestTrainingStart("strength")}
          title="Krafttraining starten (+1 Punkt je Minute)"
        >
          <span className="button-icon"><Dumbbell size={46} /></span>
          <span>
            <small>{activeType === "strength" ? "Läuft gerade" : "Starten"}</small>
            <strong>Kraft</strong>
            <em>1 Punkt je Minute</em>
          </span>
        </button>
        <button
          disabled={busy}
          className={`training-button endurance ${activeType === "endurance" ? "selected" : ""}`}
          onClick={() => requestTrainingStart("endurance")}
          title="Ausdauertraining starten (+2 Punkte je Minute)"
        >
          <span className="button-icon"><Activity size={46} /></span>
          <span>
            <small>{activeType === "endurance" ? "Läuft gerade" : "Starten"}</small>
            <strong>Ausdauer</strong>
            <em>2 Punkte je Minute</em>
          </span>
        </button>
        {profile.activeTraining && <button
          disabled={busy || !profile.activeTraining}
          className="training-button stop"
          onClick={() => action()}
          title="Laufendes Training beenden und Punkte verbuchen"
        >
          <Square size={38} fill="currentColor" />
          <span>
            <small>Training</small>
            <strong>Stoppen</strong>
          </span>
        </button>}
      </section>
        </div>
        <Link className="training-plan-entry" href={`/profil/${profile.id}/plan`}>
          <CalendarRange size={38} />
          <span><small>Mit deinem Plan trainieren</small><strong>KI-Trainingsplan</strong><em>Plan erstellen oder fortsetzen</em></span>
        </Link>
      </section>

      {activeType === "strength" && (
        <section className="exercise-picker">
          <div><span className="section-kicker">Optional genauer erfassen</span><h3>Aktuelle Übung</h3></div>
          <div className="exercise-scroll">
            {exercises.filter((exercise) => exercise.type === "strength").map((exercise) => (
              <button
                key={exercise.id}
                disabled={busy}
                className={profile.activeTraining?.exerciseId === exercise.id ? "active" : ""}
                onClick={() => requestTrainingStart("strength", exercise.id)}
                title={`Übung ${exercise.name} (${exercise.equipment}) auswählen`}
              >
                <Dumbbell size={20} />
                <span>{exercise.name}<small>{exercise.equipment}</small></span>
              </button>
            ))}
          </div>
        </section>
      )}

      <nav className={`profile-nav ${isMobile ? "mobile-nav" : ""}`}>
        <Link href={`/profil/${profile.id}/verlauf`} title="Bisherige Trainingseinheiten und Zeiten ansehen">
          <History />
          <div className="profile-nav-text">
            <b>Verlauf</b>
            <small>Historie &amp; Zeiten</small>
          </div>
        </Link>
        {!isMobile && (
          <button
            type="button"
            onClick={openHandoff}
            title="QR-Code anzeigen: Profil auf dem Smartphone öffnen für mobile Trainingssteuerung"
          >
            <QrCode />
            <div className="profile-nav-text">
              <b>Am Handy öffnen</b>
              <small>QR-Code scannen</small>
            </div>
          </button>
        )}
        <button
          type="button"
          onClick={openProfileEditor}
          title="Name, Geburtsdatum, Avatar und PIN für dieses Profil anpassen"
        >
          <Settings2 />
          <div className="profile-nav-text">
            <b>Profil &amp; Familie</b>
            <small>Daten, Avatar &amp; Punktestand</small>
          </div>
        </button>
      </nav>
      {profileNotice && <p className="profile-notice" role="status">{profileNotice}</p>}
      {editingProfile && <ProfileEditModal
        profile={profile}
        avatar={editAvatar}
        onAvatarChange={setEditAvatar}
        birthDate={editBirthDate}
        onBirthDateChange={(birthDate) => {
          setEditBirthDate(birthDate);
          setEditStartingFitness((stage) => Math.min(stage, getStartingFitnessStages(profile.id, birthDate || null).length));
        }}
        startingFitness={editStartingFitness}
        onStartingFitnessChange={setEditStartingFitness}
        pin={editPin}
        onPinChange={setEditPin}
        secondsLeft={secondsLeft}
        isMobile={isMobile}
        busy={busy}
        resettingScore={resettingScore}
        notice={profileNotice}
        onClose={() => setEditingProfile(false)}
        onResetIdleTimer={resetTimer}
        onResetScore={resetProfileScore}
        onSubmit={saveProfile}
        onAvatarSaved={(saved) => { setProfile((current) => ({ ...current, customAvatar: saved })); void refresh(true); }}
      />}

      {prepCountdown && (
        <Modal className="prep-countdown-overlay" onClose={cancelCountdown}>
          <div className="prep-countdown-card" role="dialog" aria-modal="true" aria-labelledby="prep-countdown-title">
            <div className="prep-countdown-badge">
              {prepCountdown.type === "strength" ? <Dumbbell size={16} /> : <Activity size={16} />}
              <span>{prepCountdown.type === "strength" ? "Krafttraining" : "Ausdauertraining"}</span>
            </div>

            <h2 className="prep-countdown-title" id="prep-countdown-title">
              {prepCountdown.secondsLeft === 0 ? "LOS GEHT'S!" : "Bereitmachen!"}
            </h2>
            <p className="prep-countdown-subtitle">
              {prepCountdown.exerciseId
                ? exercises.find((e) => e.id === prepCountdown.exerciseId)?.name ?? "Übung startet gleich"
                : prepCountdown.type === "strength"
                  ? "Trainingszeit startet in wenigen Sekunden (+1 Punkt/Min.)"
                  : "Trainingszeit startet in wenigen Sekunden (+2 Punkte/Min.)"}
            </p>

            <div className="prep-countdown-ring-wrap">
              <svg className="prep-countdown-svg" viewBox="0 0 200 200">
                <circle className="prep-ring-track" cx="100" cy="100" r="86" />
                <circle
                  className="prep-ring-progress"
                  cx="100"
                  cy="100"
                  r="86"
                  style={{
                    strokeDasharray: 540.35,
                    strokeDashoffset: 540.35 * (1 - prepCountdown.secondsLeft / 10),
                    stroke: prepCountdown.type === "strength" ? "#a78bfa" : "#2dd4bf"
                  }}
                />
              </svg>
              {prepCountdown.secondsLeft === 0 ? (
                <span className="prep-countdown-go">GO!</span>
              ) : (
                <span key={prepCountdown.secondsLeft} className="prep-countdown-number">
                  {prepCountdown.secondsLeft}
                </span>
              )}
            </div>

            <div className="prep-countdown-actions">
              <button
                type="button"
                className="prep-cancel-btn"
                onClick={cancelCountdown}
              >
                <XCircle size={22} />
                <span>Abbrechen (Verklickt?)</span>
              </button>
              <button
                type="button"
                className="prep-instant-btn"
                onClick={instantStart}
              >
                <Zap size={18} />
                <span>Sofort starten (Überspringen)</span>
              </button>
            </div>
          </div>
        </Modal>
      )}

      {handoff && (
        <Modal onClose={() => { setHandoff(null); setHandoffScanned(false); }}>
          <section className="qr-modal" role="dialog" aria-modal="true" aria-labelledby="handoff-title">
            <button className="modal-close" onClick={() => { setHandoff(null); setHandoffScanned(false); }} aria-label="Handy-Verbindung schließen">×</button>
            {handoffScanned ? (
              <div className="qr-modal-scanned">
                <div className="qr-modal-scanned-icon"><CheckCircle2 size={38} /></div>
                <h3 id="handoff-title">Smartphone verbunden!</h3>
                <p>{profile.name} ist jetzt auf dem Smartphone aktiv.</p>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "4px" }}>
                  <span className="setup-badge">Smartphone-Kopplung</span>
                  {!isMobile && (
                    <button type="button" className="modal-idle-badge" onClick={resetTimer} title="Automatische Rückkehr zum Dashboard bei Inaktivität (Tippen zum Verlängern)">
                      Dashboard in {secondsLeft}s
                    </button>
                  )}
                </div>
                <h2 id="handoff-title">Profil auf dem Handy öffnen</h2>
                <p style={{ maxWidth: "480px", margin: "6px auto 14px", lineHeight: "1.45", fontSize: "13px", color: "var(--muted)" }}>
                  Scanne den QR-Code mit der iPhone- oder Android-Kamera. <b>{profile.name}</b> öffnet sich direkt auf deinem Smartphone zur mobilen Trainingssteuerung (10 Minuten gültig).
                </p>
                <Image src={handoff.qr} alt="QR-Code zum Öffnen des Profils auf dem Handy" width={330} height={330} unoptimized />
                {handoff.url && <p style={{ wordBreak: "break-all", fontSize: "12px", color: "var(--muted)", margin: "12px 0 0", textAlign: "center" }}><code>{handoff.url}</code></p>}
              </>
            )}
          </section>
        </Modal>
      )}
    </main>
  );
}
