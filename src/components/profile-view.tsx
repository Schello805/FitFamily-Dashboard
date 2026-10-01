"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Apple, ArrowLeft, CalendarRange, Check, CheckCircle2, Copy, Download, Dumbbell, History, QrCode, RotateCcw, Settings2, Smartphone, Square, XCircle, Zap } from "lucide-react";
import {
  AVATAR_IDS,
  FITNESS_STAGES,
  GOALS,
  getAvatarProgress,
  physiqueLabel,
  type AvatarId,
  type DashboardProfile,
  type TrainingType
} from "@/lib/domain";
import { LiveDuration } from "@/components/live-duration";
import { AvatarPicker } from "@/components/avatar-picker";
import { Avatar } from "@/components/avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { showToast } from "@/components/toast";
import { AppleActivityRings } from "@/components/apple-activity-rings";

type Exercise = { id: string; name: string; type: string; equipment: string };

export function ProfileView({
  initialProfile,
  exercises,
  serverBaseUrl
}: {
  initialProfile: DashboardProfile;
  exercises: Exercise[];
  serverBaseUrl?: string;
}) {
  const [profile, setProfile] = useState(initialProfile);
  const [busy, setBusy] = useState(false);
  const [handoff, setHandoff] = useState<{ qr: string; url?: string; expiresAt: string; token?: string } | null>(null);
  const [handoffScanned, setHandoffScanned] = useState(false);
  const [longRunning, setLongRunning] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [healthModal, setHealthModal] = useState(false);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [testingHealth, setTestingHealth] = useState(false);
  const [prepCountdown, setPrepCountdown] = useState<{
    type: TrainingType;
    exerciseId?: string | null;
    secondsLeft: number;
  } | null>(null);
  const [editAvatar, setEditAvatar] = useState<AvatarId>(
    AVATAR_IDS.includes(initialProfile.avatar as AvatarId) ? (initialProfile.avatar as AvatarId) : (initialProfile.id as AvatarId)
  );
  const [editStartingFitness, setEditStartingFitness] = useState<number>(initialProfile.startingFitness);
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
        const response = await fetch(`/api/handoff?token=${encodeURIComponent(handoff.token!)}`);
        const data = await response.json();
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

  const previewProgress = getAvatarProgress(
    editStartingFitness,
    profile.strengthMinutes,
    profile.enduranceMinutes
  );

  const refresh = useCallback(async () => {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    if (!response.ok) return;
    const current = (await response.json()).profiles.find((item: DashboardProfile) => item.id === profile.id);
    if (current) setProfile(current);
  }, [profile.id]);

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
    const interval = window.setInterval(refresh, 5000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    const update = () => setLongRunning(Boolean(profile.activeTraining && Date.now() - new Date(profile.activeTraining.startedAt).getTime() > 2 * 60 * 60 * 1000));
    update();
    const timer = window.setInterval(update, 60_000);
    return () => window.clearInterval(timer);
  }, [profile.activeTraining]);

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
    const response = await fetch("/api/training", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(type
        ? { action: "start", profileId: profile.id, type, exerciseId: exerciseId ?? null, source: isMobile ? "mobile" : "touch" }
        : { action: "stop", profileId: profile.id })
    });
    if (response.ok) {
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
        showToast({
          type: "info",
          title: "✓ Training beendet & gespeichert",
          message: "Klasse Einsatz! Punkte und Trainingszeit wurden gutgeschrieben."
        });
      }
    }
    await refresh();
    setBusy(false);
    if (exerciseId) router.push(`/uebung/${exerciseId}?profil=${profile.id}`);
  }

  function requestTrainingStart(type: TrainingType, exerciseId?: string) {
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
    const response = await fetch("/api/handoff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: profile.id, clientOrigin })
    });
    if (response.ok) setHandoff(await response.json());
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setProfileNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/profiles/${profile.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          birthDate: form.get("birthDate") || null,
          avatar: editAvatar,
          startingFitness: Number(editStartingFitness),
          goal: form.get("goal"),
          pin: form.get("pin")
        })
      });
      const result = await response.json();
      if (!response.ok) return setProfileNotice(result.error ?? "Profil konnte nicht gespeichert werden.");
      setEditingProfile(false);
      showToast({
        type: "success",
        title: "Profil aktualisiert",
        message: `Angaben für ${profile.name} wurden gespeichert.`
      });
      await refresh();
    } catch {
      setProfileNotice("Keine Verbindung. Bitte prüfe das Heimnetz und versuche es erneut.");
    } finally {
      setBusy(false);
    }
  }

  function getWebhookUrl() {
    if (serverBaseUrl && typeof window !== "undefined" && (window.location.origin.includes("localhost") || window.location.origin.includes("127.0.0.1"))) {
      return `${serverBaseUrl.replace(/\/$/, "")}/api/sync/apple-health`;
    }
    return typeof window !== "undefined" ? `${window.location.origin}/api/sync/apple-health` : "";
  }

  async function copyWebhookUrl() {
    const url = getWebhookUrl();
    try {
      await navigator.clipboard.writeText(url);
      setCopiedWebhook(true);
      showToast({ type: "info", title: "URL kopiert", message: "Webhook-URL in Zwischenablage kopiert." });
      setTimeout(() => setCopiedWebhook(false), 2000);
    } catch {
      showToast({ type: "info", title: "Webhook-URL", message: url });
    }
  }

  const [copiedPayload, setCopiedPayload] = useState(false);

  async function copySamplePayload() {
    const payload = JSON.stringify({
      profileId: profile.id,
      title: "Lauftraining",
      type: "endurance",
      durationMinutes: 30,
      calories: 250
    }, null, 2);
    try {
      await navigator.clipboard.writeText(payload);
      setCopiedPayload(true);
      showToast({ type: "info", title: "JSON kopiert", message: "JSON-Muster in Zwischenablage kopiert." });
      setTimeout(() => setCopiedPayload(false), 2000);
    } catch {
      showToast({ type: "info", title: "JSON-Muster", message: payload });
    }
  }

  async function testHealthSync() {
    setTestingHealth(true);
    try {
      const currentMove = profile.appleHealthRings?.moveCalories || 0;
      const currentEx = profile.appleHealthRings?.exerciseMinutes || 0;
      const currentStand = profile.appleHealthRings?.standHours || 7;

      const response = await fetch("/api/sync/apple-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: profile.id,
          title: "Apple Health Test-Lauf",
          type: "endurance",
          durationMinutes: 30,
          calories: 260,
          moveCalories: Math.max(380, currentMove + 260),
          moveGoal: profile.appleHealthRings?.moveGoal || 500,
          exerciseMinutes: Math.max(30, currentEx + 30),
          exerciseGoal: profile.appleHealthRings?.exerciseGoal || 30,
          standHours: Math.min(12, currentStand + 1),
          standGoal: 12
        })
      });
      const data = await response.json();
      if (response.ok) {
        showToast({
          type: "sparkles",
          title: "Apple Health synchronisiert! 🍎",
          message: data.message ?? "30 Min. Test-Lauf & Aktivitätsringe erfolgreich aktualisiert."
        });
        await refresh();
      } else {
        showToast({
          type: "error",
          title: "Sync-Fehler",
          message: data.error ?? "Fehler beim Testen des Apple Health Syncs."
        });
      }
    } catch {
      showToast({
        type: "error",
        title: "Verbindungsfehler",
        message: "Konnte nicht mit dem Dashboard synchronisieren."
      });
    } finally {
      setTestingHealth(false);
    }
  }

  const [resettingHealth, setResettingHealth] = useState(false);
  const [confirmResetHealth, setConfirmResetHealth] = useState(false);

  async function performHealthReset() {
    setResettingHealth(true);
    try {
      const response = await fetch(`/api/sync/apple-health?profileId=${encodeURIComponent(profile.id)}`, {
        method: "DELETE"
      });
      const data = await response.json();
      if (response.ok) {
        showToast({
          type: "success",
          title: "Apple Health getrennt & gelöscht",
          message: data.message ?? "Daten wurden erfolgreich entfernt."
        });
        setConfirmResetHealth(false);
        await refresh();
      } else {
        showToast({
          type: "error",
          title: "Fehler beim Zurücksetzen",
          message: data.error ?? "Vorgang fehlgeschlagen."
        });
      }
    } catch {
      showToast({
        type: "error",
        title: "Verbindungsfehler",
        message: "Konnte nicht mit dem Server kommunizieren."
      });
    } finally {
      setResettingHealth(false);
    }
  }

  function openProfileEditor() {
    setProfileNotice("");
    setEditAvatar(
      AVATAR_IDS.includes(profile.avatar as AvatarId) ? (profile.avatar as AvatarId) : (profile.id as AvatarId)
    );
    setEditStartingFitness(profile.startingFitness);
    setEditingProfile(true);
  }

  const activeType = profile.activeTraining?.type;
  return (
    <main className="profile-shell" style={{ "--profile": profile.color } as React.CSSProperties}>
      {!isMobile && totalIdleSeconds > 0 && (
        <div className="profile-idle-bar-container" title={`Automatische Rückkehr zum Dashboard in ${secondsLeft}s (Tippen zum Zurücksetzen)`} onClick={resetTimer}>
          <div className="profile-idle-bar-fill" style={{ width: `${progress}%` }} />
        </div>
      )}
      <header className="profile-topbar">
        <Link href="/" className="icon-link">
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
              className="profile-idle-badge"
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
              <span className="idle-pulse-dot" />
              <div className="profile-idle-badge-text">
                <small>Dashboard in</small>
                <b>{secondsLeft}s</b>
              </div>
            </div>
          )}
          <div className="profile-score">
            <strong>{profile.score.toLocaleString("de-DE")}</strong>
            <span>Punkte</span>
          </div>
        </div>
      </header>

      {isMobile && (
        <>
          <div className="mobile-connected-banner">
            <Smartphone size={16} />
            <span>Handy-Steuerung aktiv · Live mit Dashboard synchronisiert</span>
          </div>
          <div className="mobile-health-card">
            <div className="mobile-health-info">
              <div className="health-badge-icon"><Apple size={22} /></div>
              <div>
                <strong>Apple Health Kurzbefehl</strong>
                <p>Trainings von Apple Watch / iPhone übertragen</p>
              </div>
            </div>
            <button type="button" className="health-connect-btn" onClick={() => setHealthModal(true)}>
              Einrichten
            </button>
          </div>
        </>
      )}

      <section className="training-hero">
        <div className="profile-hero-left">
          <Avatar profile={profile} size="large" />
          <div className="training-copy">
            <span className="section-kicker">Was möchtest du tun?</span>
            <h2>{profile.activeTraining ? "Dein Training läuft" : "Bereit, wenn du es bist."}</h2>
            <p>Starte direkt oder setze deinen persönlichen Trainingsplan fort.</p>
            <div className="avatar-meta-pills">
              <span className="avatar-pill stage">Stufe {profile.fitnessStage} von 5</span>
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
              <span>{profile.activeTraining.exerciseName ?? (activeType === "strength" ? "Krafttraining" : "Ausdauertraining")}</span>
              <strong><LiveDuration since={profile.activeTraining.segmentStartedAt} /></strong>
              {longRunning && <em>Bitte prüfen: Läuft dieses Training noch?</em>}
            </div>
          )}
          {profile.appleHealthRings && (
            <AppleActivityRings
              rings={profile.appleHealthRings}
              onOpenSync={() => setHealthModal(true)}
            />
          )}
        </div>
      </section>

      <section className="training-actions">
        <button disabled={busy} className={`training-button strength ${activeType === "strength" ? "selected" : ""}`} onClick={() => requestTrainingStart("strength")}>
          <span className="button-icon"><Dumbbell size={46} /></span><span><small>{activeType === "strength" ? "Läuft gerade" : "Starten"}</small><strong>Kraft</strong><em>1 Punkt je Minute</em></span>
        </button>
        <button disabled={busy} className={`training-button endurance ${activeType === "endurance" ? "selected" : ""}`} onClick={() => requestTrainingStart("endurance")}>
          <span className="button-icon"><Activity size={46} /></span><span><small>{activeType === "endurance" ? "Läuft gerade" : "Starten"}</small><strong>Ausdauer</strong><em>2 Punkte je Minute</em></span>
        </button>
        <button disabled={busy || !profile.activeTraining} className="training-button stop" onClick={() => action()}>
          <Square size={38} fill="currentColor" /><span><small>Training</small><strong>Stoppen</strong></span>
        </button>
      </section>

      {activeType === "strength" && (
        <section className="exercise-picker">
          <div><span className="section-kicker">Optional genauer erfassen</span><h3>Aktuelle Übung</h3></div>
          <div className="exercise-scroll">
            {exercises.filter((exercise) => exercise.type === "strength").map((exercise) => (
              <button key={exercise.id} className={profile.activeTraining?.exerciseId === exercise.id ? "active" : ""} onClick={() => requestTrainingStart("strength", exercise.id)}>
                <Dumbbell size={20} /><span>{exercise.name}<small>{exercise.equipment}</small></span>
              </button>
            ))}
          </div>
        </section>
      )}

      <nav className={`profile-nav ${isMobile ? "mobile-nav" : ""}`}>
        <Link href={`/profil/${profile.id}/plan`}><CalendarRange /><span>Trainingsplan</span></Link>
        <Link href={`/profil/${profile.id}/verlauf`}><History /><span>Verlauf</span></Link>
        {!isMobile && <button onClick={openHandoff}><QrCode /><span>Am Handy öffnen</span></button>}
        <button type="button" onClick={() => setHealthModal(true)}><Apple size={20} /><span>Apple Health</span></button>
        <button type="button" onClick={openProfileEditor}><Settings2 /><span>Profil bearbeiten</span></button>
      </nav>
      {profileNotice && <p className="profile-notice" role="status">{profileNotice}</p>}
      {editingProfile && <div className="modal-backdrop" onClick={() => setEditingProfile(false)}><form className="profile-edit-modal" onSubmit={saveProfile} onClick={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" onClick={() => setEditingProfile(false)}>×</button>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
          <span className="setup-badge">Profil bearbeiten</span>
          {!isMobile && (
            <span className="modal-idle-badge" onClick={resetTimer} title="Automatische Rückkehr zum Dashboard bei Inaktivität (Tippen zum Verlängern)">
              Dashboard in {secondsLeft}s
            </span>
          )}
        </div>
        <h2>Angaben für {profile.name}</h2>
        <div className="profile-edit-preview-row">
          <Avatar
            id={profile.id}
            avatar={editAvatar}
            color={profile.color}
            fitnessStage={previewProgress.fitnessStage}
            physique={previewProgress.physique}
            name={profile.name}
            size="medium"
          />
          <div className="preview-info">
            <strong>Vorschau: {physiqueLabel(previewProgress.physique)} (Stufe {previewProgress.fitnessStage} von 5)</strong>
            <p>Basiert auf {Math.round(profile.strengthMinutes)} Min. Kraft und {Math.round(profile.enduranceMinutes)} Min. Ausdauer.</p>
          </div>
        </div>
        <label>Anzeigename<input name="name" required maxLength={30} defaultValue={profile.name} /></label>
        <label>Geburtsdatum<input name="birthDate" type="date" defaultValue={profile.birthDate ?? ""} /></label>
        <div className="avatar-choice">
          <span>Figur im Dashboard</span>
          <AvatarPicker value={editAvatar} onChange={setEditAvatar} />
        </div>
        <label>Start-Fitness
          <select name="startingFitness" value={editStartingFitness} onChange={(e) => setEditStartingFitness(Number(e.target.value))}>
            {FITNESS_STAGES.map((st) => (
              <option key={st.stage} value={st.stage}>{st.label} ({st.description})</option>
            ))}
          </select>
        </label>
        <p className="field-hint">
          Startstufe 1–5 legt das Ausgangslevel fest. Alle 15 Trainingsstunden (900 Min.) steigt die Stufe automatisch um 1 an (maximal Stufe 5). Das Verhältnis von Kraft zu Ausdauer bestimmt den Fokus.
        </p>
        <label>Trainingsziel<select name="goal" defaultValue={profile.goal}>{GOALS.map((goal) => <option key={goal}>{goal}</option>)}</select></label>
        <label>Eltern-PIN<input name="pin" type="password" inputMode="numeric" autoComplete="current-password" minLength={4} maxLength={8} pattern="[0-9]{4,8}" required /></label>
        {profileNotice && <p className="form-error" role="alert">{profileNotice}</p>}
        <button className="primary-submit" disabled={busy}>{busy ? "Wird gespeichert …" : "Änderungen speichern"}</button>
      </form></div>}

      {healthModal && (
        <div className="modal-backdrop" onClick={() => setHealthModal(false)}>
          <div className="health-modal" onClick={(event) => event.stopPropagation()}>
            <button type="button" className="modal-close" onClick={() => setHealthModal(false)}>×</button>
            <div className="health-modal-header">
              <div className="health-apple-circle"><Apple size={30} /></div>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                  <span className="setup-badge">iOS Kurzbefehle</span>
                  {!isMobile && (
                    <span className="modal-idle-badge" onClick={resetTimer} title="Automatische Rückkehr zum Dashboard bei Inaktivität (Tippen zum Verlängern)">
                      Dashboard in {secondsLeft}s
                    </span>
                  )}
                </div>
                <h2>Apple Health für {profile.name}</h2>
              </div>
            </div>

            <p className="health-modal-desc">
              Synchronisiere deine Trainings (Laufen, Radfahren, Krafttraining, etc.) direkt aus Apple Health mit deinem FitFamily Profil. Jeder Lauf und jedes Training schreibt dir automatisch Punkte gut!
            </p>

            <div style={{ margin: "0 0 16px", padding: "10px 14px", borderRadius: "12px", background: "var(--subtle-bg)", border: "1px solid var(--line)", fontSize: "12px", color: "var(--muted)", display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "16px" }}>💡</span>
              <span><strong>Kompatibel mit Gymondo & Fitness-Apps:</strong> Auch Trainings aus Gymondo, Strava, Garmin oder Nike Training Club werden automatisch übernommen, sobald sie in Apple Health gespeichert sind.</span>
            </div>

            {profile.appleHealthRings && (
              <div style={{ marginBottom: "16px" }}>
                <AppleActivityRings
                  rings={profile.appleHealthRings}
                  compact
                />
              </div>
            )}

            <div className="health-action-row">
              <button
                type="button"
                className="health-secondary-btn"
                disabled={testingHealth || resettingHealth}
                onClick={testHealthSync}
                style={{ flex: 1 }}
              >
                <Zap size={18} />
                <span>{testingHealth ? "Übertrage …" : "Test-Training & Ringe synchronisieren"}</span>
              </button>
              {confirmResetHealth ? (
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", padding: "10px", borderRadius: "10px", background: "rgba(225, 29, 72, 0.1)", border: "1px solid rgba(225, 29, 72, 0.3)", width: "100%" }}>
                  <span style={{ fontSize: "12px", color: "var(--danger)", fontWeight: 650, flex: "1 1 100%" }}>
                    Alle Apple Health Daten &amp; Ringe für {profile.name} unwiderruflich löschen &amp; trennen?
                  </span>
                  <button
                    type="button"
                    style={{ padding: "8px 14px", fontSize: "12px", background: "var(--danger)", color: "#fff", border: 0, borderRadius: "8px", fontWeight: 700, cursor: "pointer" }}
                    disabled={resettingHealth}
                    onClick={performHealthReset}
                  >
                    {resettingHealth ? "Löscht …" : "Ja, Daten löschen & trennen"}
                  </button>
                  <button
                    type="button"
                    style={{ padding: "8px 14px", fontSize: "12px", background: "transparent", border: "1px solid var(--line)", borderRadius: "8px", color: "var(--muted)", cursor: "pointer" }}
                    onClick={() => setConfirmResetHealth(false)}
                  >
                    Abbrechen
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="health-ghost-btn"
                  disabled={testingHealth || resettingHealth}
                  onClick={() => setConfirmResetHealth(true)}
                  title="Synchronisierte Apple Health Daten für dieses Profil löschen & trennen"
                  style={{
                    padding: "10px 14px",
                    fontSize: "12px",
                    fontWeight: 650,
                    border: "1px solid rgba(225, 29, 72, 0.4)",
                    borderRadius: "10px",
                    background: "rgba(225, 29, 72, 0.08)",
                    color: "var(--danger)",
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px"
                  }}
                >
                  <RotateCcw size={14} />
                  <span>Daten zurücksetzen &amp; trennen</span>
                </button>
              )}
              <a
                href={`/api/shortcuts/${profile.id}?download=1`}
                className="health-ghost-btn"
                download={`FitFamily_Sync_${profile.name}.shortcut`}
                title="Rohdatei (.shortcut) herunterladen"
                style={{ padding: "10px 14px", fontSize: "12px", border: "1px solid var(--line)", borderRadius: "10px", display: "inline-flex", alignItems: "center", gap: "6px", color: "var(--muted)" }}
              >
                <Download size={14} />
                <span>.shortcut Datei</span>
              </a>
            </div>

            <div className="health-url-box">
              <label>1. Deine persönliche Webhook-Adresse</label>
              <div className="health-url-input-wrap">
                <input
                  readOnly
                  value={getWebhookUrl()}
                />
                <button type="button" className="health-copy-btn" onClick={copyWebhookUrl}>
                  {copiedWebhook ? <Check size={16} /> : <Copy size={16} />}
                  <span>{copiedWebhook ? "Kopiert!" : "URL Kopieren"}</span>
                </button>
              </div>
            </div>

            <div className="health-steps-card">
              <h4>Schnell-Einrichtung in der iOS & Mac &bdquo;Kurzbefehle&ldquo;-App (ca. 60 Sek.):</h4>
              <p style={{ margin: "4px 0 10px", fontSize: "11px", color: "var(--muted)", lineHeight: 1.4 }}>
                Hinweis: Apple blockiert auf aktuellen Geräten den Import unsignierter .shortcut-Dateien (&bdquo;nicht signiert / ungültiges Profil&ldquo;). Das manuelle Anlegen in der Kurzbefehle-App ist kinderleicht:
              </p>
              <ol style={{ paddingLeft: "20px", display: "grid", gap: "8px", fontSize: "12px" }}>
                <li>
                  <strong>Kurzbefehl erstellen:</strong> Öffne auf iPhone oder Mac die App <em>Kurzbefehle</em> und tippe oben auf <strong>+</strong> (Neuer Kurzbefehl).
                </li>
                <li>
                  <strong>Aktion 1 hinzufügen:</strong> Suche nach <em>&bdquo;Trainings suchen&bdquo;</em> (Kategorie Gesundheit/Health) &rarr; Sortieren nach <em>Startdatum (Neueste zuerst)</em>, Begrenzung: <em>1 Training</em>.
                </li>
                <li>
                  <strong>Aktion 2 hinzufügen:</strong> Suche nach <em>&bdquo;Inhalte von URL abrufen&bdquo;</em>:
                  <ul style={{ margin: "4px 0 0", paddingLeft: "16px", color: "var(--muted)" }}>
                    <li><strong>URL:</strong> Oben auf &bdquo;URL Kopieren&ldquo; tippen und einfügen.</li>
                    <li><strong>Methode:</strong> <code>POST</code></li>
                    <li><strong>Anforderungstext:</strong> <code>JSON</code> mit Feld <code>profileId</code> = <code>{profile.id}</code></li>
                  </ul>
                </li>
                <li>
                  <strong>Automation (optional & empfohlen):</strong> Im Reiter <em>&bdquo;Automation&ldquo;</em> &rarr; <em>&bdquo;Neue Automation&ldquo;</em> &rarr; <em>&bdquo;Apple Watch Training beendet&ldquo;</em> &rarr; diesen Kurzbefehl automatisch ausführen lassen.
                </li>
              </ol>

              <div style={{ marginTop: "12px", display: "flex", gap: "8px" }}>
                <button
                  type="button"
                  onClick={copySamplePayload}
                  style={{ padding: "8px 12px", fontSize: "11px", fontWeight: 700, borderRadius: "8px", border: "1px solid var(--line)", background: "var(--subtle-bg)", color: "var(--text)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "6px" }}
                >
                  {copiedPayload ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedPayload ? "JSON kopiert!" : "Muster-JSON kopieren"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {prepCountdown && (
        <div className="prep-countdown-overlay" onClick={cancelCountdown}>
          <div className="prep-countdown-card" onClick={(event) => event.stopPropagation()}>
            <div className="prep-countdown-badge">
              {prepCountdown.type === "strength" ? <Dumbbell size={16} /> : <Activity size={16} />}
              <span>{prepCountdown.type === "strength" ? "Krafttraining" : "Ausdauertraining"}</span>
            </div>

            <h2 className="prep-countdown-title">
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
        </div>
      )}

      {handoff && (
        <div className="modal-backdrop" onClick={() => { setHandoff(null); setHandoffScanned(false); }}>
          <section className="qr-modal" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => { setHandoff(null); setHandoffScanned(false); }}>×</button>
            {handoffScanned ? (
              <div className="qr-modal-scanned">
                <div className="qr-modal-scanned-icon"><CheckCircle2 size={38} /></div>
                <h3>Smartphone verbunden!</h3>
                <p>{profile.name} ist jetzt auf dem Smartphone aktiv.</p>
              </div>
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", marginBottom: "4px" }}>
                  <span className="setup-badge">Sicherer Übergang</span>
                  {!isMobile && (
                    <span className="modal-idle-badge" onClick={resetTimer} title="Automatische Rückkehr zum Dashboard bei Inaktivität (Tippen zum Verlängern)">
                      Dashboard in {secondsLeft}s
                    </span>
                  )}
                </div>
                <h2>Auf dem Handy fortfahren</h2>
                <p>Scanne den Code mit deiner Smartphone-Kamera. Er ist zehn Minuten gültig.</p>
                <Image src={handoff.qr} alt="QR-Code zum Öffnen des Profils auf dem Handy" width={330} height={330} unoptimized />
                {handoff.url && <p style={{ wordBreak: "break-all", fontSize: "12px", color: "var(--muted)", margin: "12px 0 0", textAlign: "center" }}><code>{handoff.url}</code></p>}
              </>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
