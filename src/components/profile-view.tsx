"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Apple, ArrowLeft, CalendarRange, Check, CheckCircle2, Copy, Dumbbell, History, QrCode, RotateCcw, Settings2, Smartphone, Square, XCircle, Zap } from "lucide-react";
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
  const [healthSyncToken, setHealthSyncToken] = useState("");
  const [healthTokenConfigured, setHealthTokenConfigured] = useState(false);
  const [showHealthSyncToken, setShowHealthSyncToken] = useState(false);
  const [copiedShortcutPrompt, setCopiedShortcutPrompt] = useState(false);
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

  useEffect(() => {
    if (!healthModal) return;
    fetch(`/api/sync/apple-health/token?profileId=${encodeURIComponent(profile.id)}`, { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => setHealthTokenConfigured(Boolean(data?.configured)))
      .catch(() => setHealthTokenConfigured(false));
  }, [healthModal, profile.id]);

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
      } else {
        const errData = await response.json().catch(() => null);
        showToast({
          type: "error",
          title: "Fehler",
          message: errData?.error ?? "Training konnte nicht aktualisiert werden."
        });
      }
    } catch {
      showToast({
        type: "error",
        title: "Verbindungsfehler",
        message: "Server konnte nicht erreicht werden."
      });
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
      if (!response.ok) {
        const err = result.error ?? "Profil konnte nicht gespeichert werden.";
        setProfileNotice(err);
        showToast({ type: "error", title: "Fehler beim Speichern", message: err });
        return;
      }
      setEditingProfile(false);
      showToast({
        type: "success",
        title: "Profil aktualisiert",
        message: `Angaben für ${profile.name} wurden gespeichert.`
      });
      await refresh();
    } catch {
      const err = "Keine Verbindung. Bitte prüfe das Heimnetz und versuche es erneut.";
      setProfileNotice(err);
      showToast({ type: "error", title: "Verbindungsfehler", message: err });
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
      secret: healthSyncToken || "HIER_DEN_SYNC_SCHLUESSEL_EINFUEGEN",
      workouts: [{
        id: "apple-health-workout-id",
        title: "Lauftraining",
        type: "endurance",
        startedAt: new Date(Date.now() - 30 * 60000).toISOString(),
        endedAt: new Date().toISOString(),
        calories: 250,
        distanceKm: 5
      }]
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

  async function copyShortcutPrompt() {
    const prompt = `Erstelle einen iPhone-Kurzbefehl „FitFamily Health Sync“, der ausschließlich lokale Apple-Kurzbefehle-Aktionen verwendet. Füge KEINE KI-, Cloud-Modell-, ChatGPT-, Gemini- oder sonstige Drittanbieter-Aktion in den fertigen Kurzbefehl ein. Er darf keine Gesundheitsdaten an andere Ziele als meinen lokalen FitFamily-PC senden.

Suche echte, abgeschlossene Apple-Health-Workouts der letzten 30 Tage und sortiere nach Startdatum. Wiederhole für jedes gefundene Workout und erstelle ein Wörterbuch mit den echten Werten: id (eindeutige Workout-ID, falls verfügbar), title (Workout-/Aktivitätstyp), startedAt und endedAt (ISO-8601 inklusive Zeitzone), calories (aktive Trainingsenergie in kcal, wenn vorhanden) und distanceKm (Workout-Distanz in Kilometern, wenn vorhanden). Verwende keine erfundenen Beispielwerte und keine zusammengefassten Aktivitätsringe als Ersatz für Workouts. Sammle die Wörterbücher in einer Liste.

Sende danach per „Inhalte von URL abrufen“ einen HTTP-POST mit JSON an ${getWebhookUrl()}. Der JSON-Body muss genau diese obersten Felder enthalten: profileId = „${profile.id}“, secret = der später in FitFamily erzeugte persönliche Sync-Schlüssel, workouts = die Liste der echten Workouts. Der Sync-Schlüssel darf NICHT in den öffentlich geteilten iCloud-Kurzbefehl eingebaut werden; ich trage ihn erst in meine persönliche Kopie ein. Keine Daten an die KI senden. Zeige die Serverantwort an, damit Importanzahl oder Fehler sichtbar sind.`;
    try {
      await navigator.clipboard.writeText(prompt);
      setCopiedShortcutPrompt(true);
      showToast({ type: "success", title: "Erstellungsauftrag kopiert", message: "Füge ihn in deine KI ein. Wichtig: keine KI-Aktion im fertigen Kurzbefehl und den Sync-Schlüssel erst in der persönlichen Kopie eintragen." });
      setTimeout(() => setCopiedShortcutPrompt(false), 2500);
    } catch {
      showToast({ type: "error", title: "Kopieren nicht möglich", message: prompt });
    }
  }

  async function manageHealthToken(action: "create" | "revoke") {
    const pin = window.prompt("Eltern-PIN eingeben (4 Ziffern), um den Apple-Health-Sync-Schlüssel " + (action === "create" ? "zu erstellen" : "zu widerrufen") + ":");
    if (!pin) return;
    if (!/^\d{4}$/.test(pin)) {
      showToast({ type: "error", title: "Ungültige PIN", message: "Bitte genau vier Ziffern eingeben." });
      return;
    }
    try {
      const response = await fetch("/api/sync/apple-health/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: profile.id, pin, action })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Sync-Schlüssel konnte nicht geändert werden.");
      if (action === "create" && typeof data.token === "string") {
        setHealthSyncToken(data.token);
        setShowHealthSyncToken(true);
        setHealthTokenConfigured(true);
        await navigator.clipboard.writeText(data.token).catch(() => undefined);
        showToast({ type: "success", title: "Sync-Schlüssel erstellt", message: "Der Schlüssel wurde kopiert. Bitte sicher in den Kurzbefehl übernehmen – er wird nur jetzt angezeigt." });
      } else {
        setHealthSyncToken("");
        setShowHealthSyncToken(false);
        setHealthTokenConfigured(false);
        showToast({ type: "info", title: "Sync-Schlüssel widerrufen", message: "Apple-Health-Übertragungen dieses Profils sind jetzt gesperrt." });
      }
    } catch (error) {
      showToast({ type: "error", title: "Sync-Schlüssel", message: error instanceof Error ? error.message : "Keine Verbindung zum Dashboard." });
    }
  }

  async function copyHealthToken() {
    try {
      await navigator.clipboard.writeText(healthSyncToken);
      showToast({ type: "info", title: "Schlüssel kopiert", message: "Jetzt im Kurzbefehle-Wörterbuch als secret einfügen." });
    } catch {
      showToast({ type: "error", title: "Kopieren nicht möglich", message: "Markiere den Schlüssel im Eingabefeld und kopiere ihn manuell." });
    }
  }

  async function testHealthSync() {
    if (!healthSyncToken) {
      showToast({ type: "error", title: "Sync-Schlüssel fehlt", message: "Erstelle zuerst einen Schlüssel und kopiere ihn in deinen Kurzbefehl." });
      return;
    }
    setTestingHealth(true);
    try {
      const response = await fetch("/api/sync/apple-health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: profile.id,
          secret: healthSyncToken,
          dryRun: true
        })
      });
      const data = await response.json();
      if (response.ok) {
        showToast({
          type: "sparkles",
          title: "Verbindung erfolgreich",
          message: data.message ?? "Der Sync-Schlüssel ist gültig. Es wurden keine Trainingsdaten gespeichert."
        });
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
    const pin = window.prompt("Eltern-PIN eingeben (4 Ziffern), um die Apple-Health-Daten zu löschen:");
    if (!pin) return;
    if (!/^\d{4}$/.test(pin)) {
      showToast({ type: "error", title: "Ungültige PIN", message: "Bitte genau vier Ziffern eingeben." });
      return;
    }
    setResettingHealth(true);
    try {
      const response = await fetch(`/api/sync/apple-health?profileId=${encodeURIComponent(profile.id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin })
      });
      const data = await response.json();
      if (response.ok) {
        showToast({
          type: "success",
          title: "Apple Health getrennt & gelöscht",
          message: data.message ?? "Daten wurden erfolgreich entfernt."
        });
        setConfirmResetHealth(false);
        setHealthSyncToken("");
        setHealthTokenConfigured(false);
        setProfile((prev) => ({ ...prev, appleHealthRings: null }));
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
        <button
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
        </button>
      </section>

      {activeType === "strength" && (
        <section className="exercise-picker">
          <div><span className="section-kicker">Optional genauer erfassen</span><h3>Aktuelle Übung</h3></div>
          <div className="exercise-scroll">
            {exercises.filter((exercise) => exercise.type === "strength").map((exercise) => (
              <button
                key={exercise.id}
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
        <Link href={`/profil/${profile.id}/plan`} title="Persönlichen Trainingsplan und Wochenetappen anzeigen">
          <CalendarRange />
          <div className="profile-nav-text">
            <b>Trainingsplan</b>
            <small>Wochen &amp; Etappen</small>
          </div>
        </Link>
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
            title="QR-Code anzeigen: Profil auf dem Smartphone öffnen für mobile Steuerung &amp; Apple Health"
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
          onClick={() => setHealthModal(true)}
          title="Apple Health Kurzbefehl, Webhook und Synchronisation verwalten"
        >
          <Apple size={20} />
          <div className="profile-nav-text">
            <b>Apple Health</b>
            <small>Sync &amp; Kurzbefehl</small>
          </div>
        </button>
        <button
          type="button"
          onClick={openProfileEditor}
          title="Name, Geburtsdatum, Avatar und PIN für dieses Profil anpassen"
        >
          <Settings2 />
          <div className="profile-nav-text">
            <b>Profil bearbeiten</b>
            <small>Avatar, Ziel &amp; PIN</small>
          </div>
        </button>
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
        <label>Eltern-PIN<input name="pin" type="password" inputMode="numeric" autoComplete="current-password" minLength={4} maxLength={4} pattern="[0-9]{4}" onChange={(event) => { event.currentTarget.value = event.currentTarget.value.replace(/\D/g, "").slice(0, 4); }} required /></label>
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
              Übertrage Workouts aus Apple Health mit einem selbst eingerichteten iOS-Kurzbefehl in dieses Profil. Importierte Einheiten zählen nach der FitFamily-Punkteregel. Apple-Aktivitätsringe werden nur übernommen, wenn der Kurzbefehl echte Ringwerte mitsendet.
            </p>

            <div style={{ margin: "0 0 16px", padding: "10px 14px", borderRadius: "12px", background: "var(--subtle-bg)", border: "1px solid var(--line)", fontSize: "12px", color: "var(--muted)", display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "16px" }}>💡</span>
              <span><strong>Fitness-Apps:</strong> Trainings aus Apps wie Gymondo, Strava, Garmin oder Nike Training Club können übernommen werden, wenn sie in Apple Health gespeichert sind und dein Kurzbefehl diese Trainings abfragt.</span>
            </div>

            {profile.appleHealthRings ? (
              <div style={{ marginBottom: "16px" }}>
                <AppleActivityRings
                  rings={profile.appleHealthRings}
                  compact
                />
              </div>
            ) : (
              <div style={{ margin: "0 0 16px", padding: "12px 14px", borderRadius: "12px", background: "var(--subtle-bg)", border: "1px dashed var(--line)", fontSize: "12px", color: "var(--muted)", display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "16px" }}>⚪</span>
                <span><strong>Keine Daten verknüpft:</strong> Die Aktivitätsringe werden angezeigt, sobald eine Synchronisation von deinem iPhone erfolgt ist.</span>
              </div>
            )}

            <div className="health-action-row">
                <button
                  type="button"
                  className="health-secondary-btn"
                  disabled={testingHealth || resettingHealth || !healthSyncToken}
                onClick={testHealthSync}
                style={{ flex: 1 }}
              >
                <Zap size={18} />
                <span>{testingHealth ? "Prüfe …" : healthSyncToken ? "Verbindung testen (ohne Daten zu speichern)" : "Schlüssel eingeben zum Testen"}</span>
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
            </div>

            <div className="health-url-box">
              <label>Sync-Schlüssel · {healthTokenConfigured ? "eingerichtet" : "noch nicht eingerichtet"}</label>
              <p style={{ margin: "6px 0 10px", fontSize: "12px", color: "var(--muted)" }}>
                Der Schlüssel schützt den Webhook dieses Profils. Er wird nur beim Erstellen angezeigt und muss als „secret“ in den Kurzbefehl.
              </p>
              <div className="health-url-input-wrap" style={{ marginBottom: "8px" }}>
                <input
                  aria-label="Apple-Health-Sync-Schlüssel"
                  type={showHealthSyncToken ? "text" : "password"}
                  autoComplete="off"
                  value={healthSyncToken}
                  placeholder="Schlüssel aus Kurzbefehle einfügen oder neu erstellen"
                  onChange={(event) => setHealthSyncToken(event.target.value)}
                />
                <button type="button" className="health-copy-btn" disabled={!healthSyncToken} onClick={() => setShowHealthSyncToken((visible) => !visible)}>
                  {showHealthSyncToken ? "Verbergen" : "Anzeigen"}
                </button>
                <button type="button" className="health-copy-btn" disabled={!healthSyncToken} onClick={() => void copyHealthToken()} aria-label="Sync-Schlüssel kopieren">
                  <Copy size={16} />
                </button>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button type="button" className="health-copy-btn" onClick={() => void manageHealthToken("create")}>
                  <Zap size={16} /> {healthTokenConfigured ? "Schlüssel erneuern" : "Sync-Schlüssel erstellen"}
                </button>
                {healthTokenConfigured && <button type="button" className="health-ghost-btn" onClick={() => void manageHealthToken("revoke")}>Schlüssel widerrufen</button>}
              </div>
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
              <h4>Apple Health verbinden</h4>
              <p style={{ margin: "4px 0 10px", fontSize: "12px", color: "var(--muted)", lineHeight: 1.5 }}>
                FitFamily nimmt echte, abgeschlossene Workouts mit Start- und Endzeit entgegen. Die KI kann beim <em>Erstellen</em> helfen; der fertige Kurzbefehl darf aber keine KI- oder Cloud-Modell-Aktion enthalten. Der zuletzt geprüfte iCloud-Kurzbefehl sendet nur ein KI-erzeugtes Feld <code>data</code> statt <code>profileId</code>, <code>secret</code> und <code>workouts</code> und ist deshalb noch nicht kompatibel.
              </p>
              <ol style={{ paddingLeft: "20px", display: "grid", gap: "6px", fontSize: "12px" }}>
                <li>Auftrag unten kopieren und in deine KI einfügen.</li>
                <li>Den persönlichen Sync-Schlüssel erst in deine eigene Kurzbefehl-Kopie eintragen – niemals in den öffentlichen iCloud-Link.</li>
                <li>Beim ersten Lauf den Health-Zugriff erlauben. „Verbindung testen“ speichert keine Trainingsdaten.</li>
              </ol>
              <div style={{ marginTop: "12px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={copyShortcutPrompt}
                  style={{ padding: "9px 12px", fontSize: "12px", fontWeight: 750, borderRadius: "9px", border: 0, background: "var(--brand)", color: "#062421", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "7px" }}
                >
                  {copiedShortcutPrompt ? <Check size={15} /> : <Copy size={15} />}
                  <span>{copiedShortcutPrompt ? "Auftrag kopiert" : "KI-Auftrag kopieren"}</span>
                </button>
                <button
                  type="button"
                  onClick={copySamplePayload}
                  style={{ padding: "9px 12px", fontSize: "12px", fontWeight: 700, borderRadius: "9px", border: "1px solid var(--line)", background: "var(--subtle-bg)", color: "var(--text)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "7px" }}
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
                  <span className="setup-badge">Smartphone-Kopplung</span>
                  {!isMobile && (
                    <span className="modal-idle-badge" onClick={resetTimer} title="Automatische Rückkehr zum Dashboard bei Inaktivität (Tippen zum Verlängern)">
                      Dashboard in {secondsLeft}s
                    </span>
                  )}
                </div>
                <h2>Profil auf dem Handy öffnen</h2>
                <p style={{ maxWidth: "480px", margin: "6px auto 14px", lineHeight: "1.45", fontSize: "13px", color: "var(--muted)" }}>
                  Scanne den QR-Code mit der iPhone- oder Android-Kamera. <b>{profile.name}</b> öffnet sich direkt auf deinem Smartphone zur mobilen Trainingssteuerung und Apple Health Synchronisation (10 Minuten gültig).
                </p>
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
