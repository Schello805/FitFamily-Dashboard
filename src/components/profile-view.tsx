"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, ArrowLeft, CalendarRange, CheckCircle2, Dumbbell, History, QrCode, Settings2, Smartphone, Square } from "lucide-react";
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

type Exercise = { id: string; name: string; type: string; equipment: string };

export function ProfileView({ initialProfile, exercises }: { initialProfile: DashboardProfile; exercises: Exercise[] }) {
  const [profile, setProfile] = useState(initialProfile);
  const [busy, setBusy] = useState(false);
  const [handoff, setHandoff] = useState<{ qr: string; url?: string; expiresAt: string; token?: string } | null>(null);
  const [handoffScanned, setHandoffScanned] = useState(false);
  const [longRunning, setLongRunning] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
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

  const TOTAL_IDLE_SECONDS = 60;
  const [secondsLeft, setSecondsLeft] = useState(TOTAL_IDLE_SECONDS);
  const [progress, setProgress] = useState(100);
  const deadlineRef = useRef<number | null>(null);

  const resetTimer = useCallback(() => {
    deadlineRef.current = Date.now() + TOTAL_IDLE_SECONDS * 1000;
    setSecondsLeft(TOTAL_IDLE_SECONDS);
    setProgress(100);
  }, []);

  useEffect(() => {
    if (isMobile) return;
    deadlineRef.current = Date.now() + TOTAL_IDLE_SECONDS * 1000;
    const handleActivity = () => resetTimer();
    const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    events.forEach((event) => window.addEventListener(event, handleActivity, { passive: true }));

    const interval = window.setInterval(() => {
      if (!deadlineRef.current) return;
      const remainingMs = Math.max(0, deadlineRef.current - Date.now());
      const remainingSec = Math.ceil(remainingMs / 1000);
      setSecondsLeft(remainingSec);
      setProgress((remainingMs / (TOTAL_IDLE_SECONDS * 1000)) * 100);

      if (remainingMs <= 0) {
        window.clearInterval(interval);
        router.push("/");
      }
    }, 250);

    return () => {
      window.clearInterval(interval);
      events.forEach((event) => window.removeEventListener(event, handleActivity));
    };
  }, [resetTimer, router, isMobile]);

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
      {!isMobile && (
        <div className="profile-idle-bar-container" title={`Automatische Rückkehr zum Dashboard in ${secondsLeft}s (Tippen zum Zurücksetzen)`} onClick={resetTimer}>
          <div className="profile-idle-bar-fill" style={{ width: `${progress}%` }} />
        </div>
      )}
      <header className="profile-topbar">
        <Link href="/" className="icon-link"><ArrowLeft size={isMobile ? 22 : 30} /><span>Dashboard</span></Link>
        <div className="profile-topbar-title"><span className="eyebrow">Training für</span><h1>{profile.name}</h1></div>
        <div className="profile-topbar-right">
          <ThemeToggle />
          {!isMobile && (
            <div className="profile-idle-badge" onClick={resetTimer} title="Automatische Rückkehr zum Dashboard bei Inaktivität (Tippen zum Verlängern)">
              <span className="idle-pulse-dot" />
              <small>Dashboard in</small>
              <b>{secondsLeft}s</b>
            </div>
          )}
          <div className="profile-score"><strong>{profile.score.toLocaleString("de-DE")}</strong><span>Punkte</span></div>
        </div>
      </header>

      {isMobile && (
        <div className="mobile-connected-banner">
          <Smartphone size={16} />
          <span>Handy-Steuerung aktiv · Live mit Dashboard synchronisiert</span>
        </div>
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
        {profile.activeTraining && (
          <div className="running-clock">
            <span>{profile.activeTraining.exerciseName ?? (activeType === "strength" ? "Krafttraining" : "Ausdauertraining")}</span>
            <strong><LiveDuration since={profile.activeTraining.segmentStartedAt} /></strong>
            {longRunning && <em>Bitte prüfen: Läuft dieses Training noch?</em>}
          </div>
        )}
      </section>

      <section className="training-actions">
        <button disabled={busy} className={`training-button strength ${activeType === "strength" ? "selected" : ""}`} onClick={() => action("strength")}>
          <span className="button-icon"><Dumbbell size={46} /></span><span><small>{activeType === "strength" ? "Läuft gerade" : "Starten"}</small><strong>Kraft</strong><em>1 Punkt je Minute</em></span>
        </button>
        <button disabled={busy} className={`training-button endurance ${activeType === "endurance" ? "selected" : ""}`} onClick={() => action("endurance")}>
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
              <button key={exercise.id} className={profile.activeTraining?.exerciseId === exercise.id ? "active" : ""} onClick={() => action("strength", exercise.id)}>
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
        <button onClick={openProfileEditor}><Settings2 /><span>Profil bearbeiten</span></button>
      </nav>
      {profileNotice && <p className="profile-notice" role="status">{profileNotice}</p>}
      {editingProfile && <div className="modal-backdrop" onClick={() => setEditingProfile(false)}><form className="profile-edit-modal" onSubmit={saveProfile} onClick={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" onClick={() => setEditingProfile(false)}>×</button>
        <span className="setup-badge">Profil bearbeiten</span><h2>Angaben für {profile.name}</h2>
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
                <span className="setup-badge">Sicherer Übergang</span>
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
