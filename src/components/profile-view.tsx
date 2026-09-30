"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Activity, ArrowLeft, CalendarRange, Dumbbell, History, QrCode, Settings2, Square } from "lucide-react";
import { GOALS, type DashboardProfile, type TrainingType } from "@/lib/domain";
import { AVATAR_IDS, type AvatarId } from "@/lib/domain";
import { LiveDuration } from "@/components/live-duration";
import { AvatarPicker } from "@/components/avatar-picker";

type Exercise = { id: string; name: string; type: string; equipment: string };

export function ProfileView({ initialProfile, exercises }: { initialProfile: DashboardProfile; exercises: Exercise[] }) {
  const [profile, setProfile] = useState(initialProfile);
  const [busy, setBusy] = useState(false);
  const [handoff, setHandoff] = useState<{ qr: string; expiresAt: string } | null>(null);
  const [longRunning, setLongRunning] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState("");
  const router = useRouter();

  const refresh = useCallback(async () => {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    if (!response.ok) return;
    const current = (await response.json()).profiles.find((item: DashboardProfile) => item.id === profile.id);
    if (current) setProfile(current);
  }, [profile.id]);

  useEffect(() => {
    let timeout: number;
    const reset = () => {
      window.clearTimeout(timeout);
      timeout = window.setTimeout(() => router.push("/"), 120_000);
    };
    const events = ["pointerdown", "keydown", "scroll"] as const;
    events.forEach((event) => window.addEventListener(event, reset, { passive: true }));
    reset();
    return () => {
      window.clearTimeout(timeout);
      events.forEach((event) => window.removeEventListener(event, reset));
    };
  }, [router]);

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
        ? { action: "start", profileId: profile.id, type, exerciseId: exerciseId ?? null, source: "touch" }
        : { action: "stop", profileId: profile.id })
    });
    if (response.ok) playTone(type ? (type === "strength" ? 520 : 660) : 360);
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
    const response = await fetch("/api/handoff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ profileId: profile.id }) });
    if (response.ok) setHandoff(await response.json());
  }

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setProfileNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/profiles/${profile.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), birthDate: form.get("birthDate") || null, avatar: form.get("avatar"), goal: form.get("goal"), pin: form.get("pin") })
      });
      const result = await response.json();
      if (!response.ok) return setProfileNotice(result.error ?? "Profil konnte nicht gespeichert werden.");
      setEditingProfile(false); setProfileNotice("Profil wurde gespeichert."); await refresh();
    } catch {
      setProfileNotice("Keine Verbindung. Bitte prüfe das Heimnetz und versuche es erneut.");
    } finally {
      setBusy(false);
    }
  }

  function openProfileEditor() {
    setProfileNotice(""); setEditingProfile(true);
  }

  const activeType = profile.activeTraining?.type;
  return (
    <main className="profile-shell" style={{ "--profile": profile.color } as React.CSSProperties}>
      <header className="profile-topbar">
        <Link href="/" className="icon-link"><ArrowLeft size={30} /><span>Dashboard</span></Link>
        <div><span className="eyebrow">Training für</span><h1>{profile.name}</h1></div>
        <div className="profile-score"><strong>{profile.score.toLocaleString("de-DE")}</strong><span>Punkte</span></div>
      </header>

      <section className="training-hero">
        <div className="training-copy">
          <span className="section-kicker">Was möchtest du tun?</span>
          <h2>{profile.activeTraining ? "Dein Training läuft" : "Bereit, wenn du es bist."}</h2>
          <p>Starte direkt oder setze deinen persönlichen Trainingsplan fort.</p>
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

      <nav className="profile-nav">
        <Link href={`/profil/${profile.id}/plan`}><CalendarRange /><span>Trainingsplan</span></Link>
        <Link href={`/profil/${profile.id}/verlauf`}><History /><span>Verlauf</span></Link>
        <button onClick={openHandoff}><QrCode /><span>Am Handy öffnen</span></button>
        <button onClick={openProfileEditor}><Settings2 /><span>Profil bearbeiten</span></button>
      </nav>
      {profileNotice && <p className="profile-notice" role="status">{profileNotice}</p>}
      {editingProfile && <div className="modal-backdrop" onClick={() => setEditingProfile(false)}><form className="profile-edit-modal" onSubmit={saveProfile} onClick={(event) => event.stopPropagation()}>
        <button type="button" className="modal-close" onClick={() => setEditingProfile(false)}>×</button>
        <span className="setup-badge">Profil bearbeiten</span><h2>Angaben für {profile.name}</h2>
        <label>Anzeigename<input name="name" required maxLength={30} defaultValue={profile.name} /></label>
        <label>Geburtsdatum<input name="birthDate" type="date" defaultValue={profile.birthDate ?? ""} /></label>
        <div className="avatar-choice"><span>Figur im Dashboard</span><AvatarPicker value={AVATAR_IDS.includes(profile.avatar as AvatarId) ? profile.avatar as AvatarId : profile.id as AvatarId} /></div>
        <label>Trainingsziel<select name="goal" defaultValue={profile.goal}>{GOALS.map((goal) => <option key={goal}>{goal}</option>)}</select></label>
        <label>Eltern-PIN<input name="pin" type="password" inputMode="numeric" autoComplete="current-password" minLength={4} maxLength={8} pattern="[0-9]{4,8}" required /></label>
        {profileNotice && <p className="form-error" role="alert">{profileNotice}</p>}
        <button className="primary-submit" disabled={busy}>{busy ? "Wird gespeichert …" : "Änderungen speichern"}</button>
      </form></div>}
      {handoff && <div className="modal-backdrop" onClick={() => setHandoff(null)}><section className="qr-modal" onClick={(event) => event.stopPropagation()}>
        <button className="modal-close" onClick={() => setHandoff(null)}>×</button>
        <span className="setup-badge">Sicherer Übergang</span><h2>Auf dem Handy fortfahren</h2><p>Scanne den Code. Er ist zehn Minuten und genau einmal gültig.</p>
        <Image src={handoff.qr} alt="QR-Code zum Öffnen des Profils auf dem Handy" width={330} height={330} unoptimized />
      </section></div>}
    </main>
  );
}
