"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Apple, ArrowLeft, CalendarRange, Check, CheckCircle2, Copy, Dumbbell, History, LockKeyhole, QrCode, RotateCcw, Settings2, Smartphone, Square, X, XCircle, Zap } from "lucide-react";
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
import { ProfileEditModal } from "@/components/profile-edit-modal";
import { Avatar } from "@/components/avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { showToast } from "@/components/toast";
import { AppleActivityRings } from "@/components/apple-activity-rings";
import { TouchPinpad } from "@/components/touch-pinpad";
import { ApiRequestError, requestJson } from "@/lib/api-client";
import { Modal } from "@/components/modal";
import { ConnectionStatus } from "@/components/connection-status";
import { useDashboardConnection } from "@/components/use-dashboard-connection";

type Exercise = { id: string; name: string; type: string; equipment: string };

async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the manual-selection-compatible browser API.
    }
  }

  if (typeof document === "undefined" || typeof document.execCommand !== "function") return false;
  const field = document.createElement("textarea");
  field.value = text;
  field.setAttribute("readonly", "");
  field.style.position = "fixed";
  field.style.left = "0";
  field.style.top = "0";
  field.style.opacity = "0";
  document.body.appendChild(field);
  field.focus();
  field.select();
  field.setSelectionRange(0, field.value.length);
  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    document.body.removeChild(field);
  }
  return copied;
}

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
  const [resettingScore, setResettingScore] = useState(false);
  const [handoff, setHandoff] = useState<{ qr: string; url?: string; expiresAt: string; token?: string } | null>(null);
  const [handoffScanned, setHandoffScanned] = useState(false);
  const [longRunning, setLongRunning] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [healthModal, setHealthModal] = useState(false);
  const [testingHealth, setTestingHealth] = useState(false);
  const [healthPinAction, setHealthPinAction] = useState<"create" | "revoke" | "delete">();
  const [healthPin, setHealthPin] = useState("");
  const [healthPinError, setHealthPinError] = useState("");
  const [healthPinBusy, setHealthPinBusy] = useState(false);
  const [healthSyncToken, setHealthSyncToken] = useState("");
  const [healthTokenConfigured, setHealthTokenConfigured] = useState(false);
  const [healthTokenStatus, setHealthTokenStatus] = useState<"loading" | "ready" | "error">("loading");
  const [showHealthSyncToken, setShowHealthSyncToken] = useState(false);
  const [copiedShortcutPrompt, setCopiedShortcutPrompt] = useState(false);
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

  useEffect(() => {
    if (!healthModal) return;
    requestJson<{ configured?: boolean }>(
      `/api/sync/apple-health/token?profileId=${encodeURIComponent(profile.id)}`,
      "Sync-Schlüsselstatus nicht verfügbar.", { cache: "no-store" }
    )
      .then((data) => {
        setHealthTokenConfigured(Boolean(data?.configured));
        setHealthTokenStatus("ready");
      })
      .catch(() => setHealthTokenStatus("error"));
  }, [healthModal, profile.id]);

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

  async function saveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setProfileNotice("");
    const form = new FormData(event.currentTarget);
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
          pin: editPin
        })
      });
      setEditingProfile(false);
      showToast({
        type: "success",
        title: "Profil aktualisiert",
        message: `Angaben für ${profile.name} wurden gespeichert.`
      });
      await refresh(true);
    } catch (error) {
      const err = error instanceof ApiRequestError
        ? error.message
        : "Keine Verbindung. Bitte prüfe das Heimnetz und versuche es erneut.";
      setProfileNotice(err);
      showToast({ type: "error", title: "Verbindungsfehler", message: err });
    } finally {
      setBusy(false);
    }
  }

  async function resetProfileScore() {
    if (editPin.length !== 4) {
      setProfileNotice("Bitte zuerst die 4-stellige Eltern-PIN eingeben.");
      return;
    }
    if (!window.confirm(`Punktestand von ${profile.name} wirklich auf 0 setzen? Der Trainingsverlauf bleibt erhalten.`)) return;
    setResettingScore(true);
    setProfileNotice("");
    try {
      await requestJson("/api/admin/reset-score", "Punktestand konnte nicht zurückgesetzt werden.", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: editPin, profileId: profile.id })
      });
      showToast({ type: "success", title: "Punktestand zurückgesetzt", message: "Der Trainingsverlauf bleibt erhalten." });
      await refresh(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Punktestand konnte nicht zurückgesetzt werden.";
      setProfileNotice(message);
      showToast({ type: "error", title: "Zurücksetzen fehlgeschlagen", message });
    } finally {
      setResettingScore(false);
    }
  }

  function getWebhookUrl() {
    if (serverBaseUrl && typeof window !== "undefined" && (window.location.origin.includes("localhost") || window.location.origin.includes("127.0.0.1"))) {
      return `${serverBaseUrl.replace(/\/$/, "")}/api/sync/apple-health`;
    }
    return typeof window !== "undefined" ? `${window.location.origin}/api/sync/apple-health` : "";
  }

  async function copyShortcutPrompt() {
    const prompt = `Erstelle einen iPhone-Kurzbefehl „FitFamily Health Sync“ ausschließlich mit den eingebauten Apple-Kurzbefehle- und Health-Aktionen. Keine KI-, Cloud-Modell- oder Drittanbieter-Aktion im fertigen Kurzbefehl. Gesundheitsdaten dürfen nur an diesen FitFamily-Server gesendet werden: ${getWebhookUrl()}.

Der Kurzbefehl überträgt zunächst ausschließlich die echten Tageswerte von HEUTE. Keine 30-Tage-Gesamtsummen, keine rückwirkenden Daten und keine erfundenen Beispieldaten. Suche jede Health-Art separat mit Startdatum „heute“, summiere nur deren heutige Treffer und verwende diese JSON-Feldnamen:
- Aktive Energie / Active Energy: kcal -> moveCalories (Zahl)
- Trainingsminuten / Exercise Time: Minuten -> exerciseMinutes (Zahl)
- Schritte / Steps: Summe als ganze Zahl -> stepCount (ganze Zahl)
- Stehzeit / Stand Time: Minuten -> standMinutes (Zahl; der Server rechnet automatisch in standHours um)
- Geh- und Laufdistanz / Walking + Running Distance: Kilometer -> walkingRunningDistanceKm (Zahl)
- Strecke (Fahrrad) / Cycling Distance: Kilometer -> cyclingDistanceKm (Zahl)
Keine Etagen übertragen. Zahlen müssen numerische JSON-Zahlen ohne Einheitstext bleiben. „Stand Time“ ist die verfügbare Stehzeit-Schnittstelle; der Stehen-Ring („Stand Hours“) ist ein anderer Apple-Health-Wert.

Der POST-Body enthält profileId = „${profile.id}“, secret = „HIER_DEN_SYNC_SCHLUESSEL_EINFUEGEN“ und dailyActivity mit genau einem Tageswörterbuch. Dieses hat date im Format YYYY-MM-DD (heutiges lokales Datum) und die oben genannten Felder. Führe genau eine Aktion „Inhalte von URL abrufen“ aus: POST an ${getWebhookUrl()}, Haupttext JSON. Den Secret-Platzhalter unverändert lassen; ich ersetze ihn selbst durch meinen privaten FitFamily-Schlüssel. Kein echter Schlüssel in einen geteilten Kurzbefehl. Zeige die Antwort des Servers an.

Falls Kurzbefehle eine Health-Art oder einen Schritt nicht unterstützt, erfinde keine andere Datenstruktur, sondern erkläre genau, welche Aktion ich stattdessen antippen muss. iPhone und FitFamily-Server müssen im selben WLAN sein oder über VPN erreichbar sein.`;
    if (await copyTextToClipboard(prompt)) {
      setCopiedShortcutPrompt(true);
      showToast({ type: "success", title: "Einrichtung kopiert", message: "Füge den Text in deine KI ein. Deinen Schlüssel setzt du anschließend nur in deinem persönlichen Kurzbefehl ein." });
      setTimeout(() => setCopiedShortcutPrompt(false), 2500);
    } else {
      showToast({ type: "error", title: "Kopieren nicht möglich", message: prompt });
    }
  }

  function requestHealthPin(action: "create" | "revoke" | "delete") {
    setHealthPin("");
    setHealthPinError("");
    setHealthPinAction(action);
  }

  async function manageHealthToken(action: "create" | "revoke", pin: string): Promise<boolean> {
    try {
      const data = await requestJson<{ token?: string }>("/api/sync/apple-health/token", "Sync-Schlüssel konnte nicht geändert werden.", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileId: profile.id, pin, action })
      });
      if (action === "create" && typeof data.token === "string") {
        setHealthSyncToken(data.token);
        setShowHealthSyncToken(true);
        setHealthTokenConfigured(true);
        setHealthTokenStatus("ready");
        const copied = await copyTextToClipboard(data.token);
        showToast({
          type: "success",
          title: "Sync-Schlüssel erstellt",
          message: copied
            ? "Schlüssel erstellt und angezeigt. Nach dem Erstellen des Kurzbefehls hier erneut auf Kopieren tippen und den Wert in deiner privaten Kopie bei secret einsetzen."
            : "Schlüssel erstellt und wird im Feld angezeigt. Nach dem Erstellen des Kurzbefehls hier kopieren und in deiner privaten Kopie bei secret einsetzen."
        });
      } else {
        setHealthSyncToken("");
        setShowHealthSyncToken(false);
        setHealthTokenConfigured(false);
        setHealthTokenStatus("ready");
        showToast({ type: "info", title: "Sync-Schlüssel widerrufen", message: "Apple-Health-Übertragungen dieses Profils sind jetzt gesperrt." });
      }
      return true;
    } catch (error) {
      setHealthPinError(error instanceof Error ? error.message : "Keine Verbindung zum Dashboard.");
      return false;
    }
  }

  async function copyHealthToken() {
    if (await copyTextToClipboard(healthSyncToken)) {
      showToast({ type: "info", title: "Schlüssel kopiert", message: "Füge ihn in deinen persönlichen Kurzbefehl ein." });
    } else {
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
      const data = await requestJson<{ message?: string }>("/api/sync/apple-health", "Der Schlüssel konnte nicht geprüft werden.", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: profile.id,
          secret: healthSyncToken,
          dryRun: true
        })
      });
      showToast({
          type: "sparkles",
          title: "Schlüsselprüfung erfolgreich",
          message: data.message ?? "Der Sync-Schlüssel ist gültig. Es wurden keine Trainingsdaten gespeichert."
      });
    } catch (error) {
      showToast({
        type: "error",
        title: "Sync-Fehler",
        message: error instanceof Error ? error.message : "Konnte nicht mit dem Dashboard synchronisieren."
      });
    } finally {
      setTestingHealth(false);
    }
  }

  const [resettingHealth, setResettingHealth] = useState(false);
  const [confirmResetHealth, setConfirmResetHealth] = useState(false);

  async function performHealthReset(pin: string): Promise<boolean> {
    setResettingHealth(true);
    try {
      const data = await requestJson<{ message?: string }>(`/api/sync/apple-health?profileId=${encodeURIComponent(profile.id)}`, "Vorgang fehlgeschlagen.", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin })
      });
      showToast({
          type: "success",
          title: "Apple Health getrennt & gelöscht",
          message: data.message ?? "Daten wurden erfolgreich entfernt."
      });
      setConfirmResetHealth(false);
      setHealthSyncToken("");
      setHealthTokenConfigured(false);
      setHealthTokenStatus("ready");
      setProfile((prev) => ({ ...prev, appleHealthRings: null }));
      await refresh(true);
      return true;
    } catch (error) {
      setHealthPinError(error instanceof ApiRequestError ? error.message : "Konnte nicht mit dem Server kommunizieren.");
      return false;
    } finally {
      setResettingHealth(false);
    }
  }

  async function submitHealthPin() {
    if (!healthPinAction || healthPin.length !== 4) return;
    setHealthPinBusy(true);
    setHealthPinError("");
    try {
      let succeeded: boolean;
      if (healthPinAction === "delete") {
        succeeded = await performHealthReset(healthPin);
      } else {
        succeeded = await manageHealthToken(healthPinAction, healthPin);
      }
      if (succeeded) {
        setHealthPinAction(undefined);
        setHealthPin("");
      }
    } catch (error) {
      setHealthPinError(error instanceof Error ? error.message : "Die PIN konnte nicht geprüft werden.");
    } finally {
      setHealthPinBusy(false);
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
      <ConnectionStatus className="profile-connection-status" connectionError={connectionError} lastRefreshedAt={lastRefreshedAt} />

      <section className="training-hero">
        <div className="profile-hero-left">
          <Avatar profile={profile} size="large" />
          <div className="training-copy">
            <span className="section-kicker">Was möchtest du tun?</span>
            <h2>{profile.activeTraining ? "Dein Training läuft" : "Bereit, wenn du es bist."}</h2>
            <p>Starte direkt oder setze deinen persönlichen Trainingsplan fort.</p>
            <div className="avatar-meta-pills">
              <span className="avatar-pill stage">Stufe {profile.fitnessStage} von {getFitnessStageCount(profile.id, profile.birthDate)}</span>
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
          title="Apple Health verbinden und synchronisieren"
        >
          <Apple size={20} />
          <div className="profile-nav-text">
            <b>Apple Health</b>
            <small>Tagesdaten verbinden</small>
          </div>
        </button>
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
        onResetScore={() => void resetProfileScore()}
        onSubmit={saveProfile}
        onAvatarSaved={(saved) => { setProfile((current) => ({ ...current, customAvatar: saved })); void refresh(true); }}
      />}

      {healthModal && (
        <Modal onClose={() => setHealthModal(false)}>
          <div className="health-modal" role="dialog" aria-modal="true" aria-labelledby="health-modal-title">
            <button type="button" className="modal-close" onClick={() => setHealthModal(false)} aria-label="Apple Health schließen">×</button>
            <div className="health-modal-header">
              <div className="health-apple-circle"><Apple size={30} /></div>
              <div>
                <h2 id="health-modal-title">Apple Health für {profile.name}</h2>
                <span className="health-connection-status" role="status">{healthTokenStatus === "error" ? "Schlüsselstatus konnte nicht geprüft werden" : healthTokenStatus === "loading" ? "Schlüsselstatus wird geprüft" : healthTokenConfigured ? "Schlüssel eingerichtet" : "Noch nicht eingerichtet"}</span>
              </div>
            </div>

            <p className="health-modal-desc">Einmal verbinden, danach deine Tagesdaten mit dem iPhone synchronisieren.</p>

            <section className="health-workflow-step">
              <h3><span>1</span> Verbindung vorbereiten</h3>
              <p>Erstelle deinen persönlichen Schlüssel für die sichere Verbindung.</p>
              <div className="health-url-input-wrap health-key-input">
                <input
                  aria-label="Apple-Health-Sync-Schlüssel"
                  type={showHealthSyncToken ? "text" : "password"}
                  autoComplete="off"
                  value={healthSyncToken}
                  placeholder={healthTokenConfigured ? "Schlüssel eingerichtet · neu erstellen zum Anzeigen" : "Noch kein Schlüssel erstellt"}
                  onChange={(event) => setHealthSyncToken(event.target.value)}
                />
                {healthSyncToken && <button type="button" className="health-copy-btn" onClick={() => setShowHealthSyncToken((visible) => !visible)}>{showHealthSyncToken ? "Verbergen" : "Anzeigen"}</button>}
                {healthSyncToken && <button type="button" className="health-copy-btn" onClick={() => void copyHealthToken()} aria-label="Sync-Schlüssel kopieren"><Copy size={16} /></button>}
              </div>
              <div className="health-workflow-actions">
                <button type="button" className="health-primary-btn" onClick={() => requestHealthPin("create")}>
                  <Zap size={16} /> {healthTokenConfigured ? "Neuen Schlüssel erstellen" : "Schlüssel erstellen"}
                </button>
                {healthTokenConfigured && <small>{healthSyncToken ? "Kopiere den Schlüssel und füge ihn im Kurzbefehl ein." : "Der Schlüssel ist aus Sicherheitsgründen verborgen. Erstelle einen neuen, um ihn erneut zu kopieren."}</small>}
              </div>
            </section>

            <section className="health-workflow-step">
              <h3><span>2</span> Kurzbefehl einrichten</h3>
              <p>Kopiere die Einrichtung und erstelle damit deinen iPhone-Kurzbefehl. Der Schlüssel wird nicht mitkopiert.</p>
              <button type="button" className="health-primary-btn" onClick={copyShortcutPrompt}>
                {copiedShortcutPrompt ? <Check size={16} /> : <Copy size={16} />}
                {copiedShortcutPrompt ? "Einrichtung kopiert" : "Einrichtung kopieren"}
              </button>
            </section>

            <section className="health-workflow-step">
              <h3><span>3</span> Synchronisieren</h3>
              <p>Füge den Schlüssel im Kurzbefehl ein. Öffne ihn danach auf dem iPhone und tippe auf ▶︎.</p>
              <button type="button" className="health-secondary-btn" disabled={testingHealth || resettingHealth || !healthSyncToken} onClick={testHealthSync}>
                <Zap size={16} /> {testingHealth ? "Wird geprüft …" : "Verbindung prüfen"}
              </button>
              <small>Prüft die Verbindung, ohne Daten zu importieren.</small>
              {profile.appleHealthRings && <div className="health-ring-preview"><AppleActivityRings rings={profile.appleHealthRings} compact /></div>}
            </section>

            <details className="health-advanced-actions">
              <summary>Verbindung verwalten</summary>
              <div className="health-danger-zone">
                {healthTokenConfigured && <button type="button" disabled={testingHealth || resettingHealth} onClick={() => requestHealthPin("revoke")}>Schlüssel widerrufen</button>}
                {confirmResetHealth ? (
                  <>
                    <strong>Alle Apple-Health-Daten dieses Profils und die Verbindung löschen?</strong>
                    <button type="button" disabled={resettingHealth} onClick={() => requestHealthPin("delete")}>{resettingHealth ? "Wird gelöscht …" : "Löschen bestätigen"}</button>
                    <button type="button" onClick={() => setConfirmResetHealth(false)}>Abbrechen</button>
                  </>
                ) : (
                  <button type="button" disabled={testingHealth || resettingHealth} onClick={() => setConfirmResetHealth(true)}>
                    <RotateCcw size={14} /> Apple-Health-Daten löschen
                  </button>
                )}
              </div>
            </details>
          </div>
        </Modal>
      )}

      {healthPinAction && (
        <Modal className="health-pin-backdrop" onClose={() => setHealthPinAction(undefined)} closeDisabled={healthPinBusy}>
          <div className="confirm-modal-card health-pin-card" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="health-pin-title">
            <button type="button" className="modal-close" disabled={healthPinBusy} onClick={() => setHealthPinAction(undefined)} aria-label="Schließen"><X size={20} /></button>
            <div className="confirm-modal-top">
              <div className={`confirm-modal-icon ${healthPinAction === "delete" ? "danger" : "primary"}`}>
                {healthPinAction === "delete" ? <RotateCcw size={26} /> : <LockKeyhole size={26} />}
              </div>
            </div>
            <h3 id="health-pin-title">
              {healthPinAction === "delete" ? "Health-Daten löschen" : healthPinAction === "create" ? "Sync-Schlüssel erstellen" : "Sync-Schlüssel widerrufen"}
            </h3>
            <p>{healthPinAction === "delete" ? "Apple-Health-Daten dieses Profils und die Verbindung werden unwiderruflich gelöscht. Zur Bestätigung Eltern-PIN eingeben." : "Zur Bestätigung bitte die vierstellige Eltern-PIN eingeben."}</p>
            <div className="confirm-pin-section">
              <b>Eltern-PIN</b>
              <TouchPinpad value={healthPin} disabled={healthPinBusy} onChange={(value) => { setHealthPin(value); setHealthPinError(""); }} />
              {healthPinError && <p className="form-error" role="alert">{healthPinError}</p>}
            </div>
            <div className="confirm-modal-actions">
              <button type="button" className="confirm-cancel-btn" disabled={healthPinBusy} onClick={() => setHealthPinAction(undefined)}>Abbrechen</button>
              <button type="button" className={`confirm-submit-btn ${healthPinAction === "delete" ? "danger" : "primary"}`} disabled={healthPinBusy || healthPin.length !== 4} onClick={() => void submitHealthPin()}>
                {healthPinBusy ? "Wird verarbeitet …" : healthPinAction === "delete" ? "Löschen & trennen" : "Bestätigen"}
              </button>
            </div>
          </div>
        </Modal>
      )}

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
                  Scanne den QR-Code mit der iPhone- oder Android-Kamera. <b>{profile.name}</b> öffnet sich direkt auf deinem Smartphone zur mobilen Trainingssteuerung und Apple Health Synchronisation (10 Minuten gültig).
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
