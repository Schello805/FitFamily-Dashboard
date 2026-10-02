"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Apple, ArrowLeft, CalendarRange, Check, CheckCircle2, Copy, Dumbbell, History, LockKeyhole, QrCode, RotateCcw, Settings2, Smartphone, Square, X, XCircle, Zap } from "lucide-react";
import {
  avatarAssetForProfile,
  GOALS,
  getAvatarProgress,
  getFitnessStageCount,
  getStartingFitnessStages,
  physiqueLabel,
  type AvatarDesignId,
  type DashboardProfile,
  type TrainingType
} from "@/lib/domain";
import { LiveDuration } from "@/components/live-duration";
import { AvatarPicker } from "@/components/avatar-picker";
import { Avatar } from "@/components/avatar";
import { ThemeToggle } from "@/components/theme-toggle";
import { showToast } from "@/components/toast";
import { AppleActivityRings } from "@/components/apple-activity-rings";
import { TouchPinpad } from "@/components/touch-pinpad";

type Exercise = { id: string; name: string; type: string; equipment: string };
type AppleHealthSyncLog = { id: string; action: string; createdAt: string; details: Record<string, unknown> };

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
  const [handoff, setHandoff] = useState<{ qr: string; url?: string; expiresAt: string; token?: string } | null>(null);
  const [handoffScanned, setHandoffScanned] = useState(false);
  const [longRunning, setLongRunning] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [healthModal, setHealthModal] = useState(false);
  const [testingHealth, setTestingHealth] = useState(false);
  const [healthPinAction, setHealthPinAction] = useState<"create" | "revoke" | "delete" | "logs">();
  const [healthPin, setHealthPin] = useState("");
  const [healthPinError, setHealthPinError] = useState("");
  const [healthPinBusy, setHealthPinBusy] = useState(false);
  const [healthSyncLogs, setHealthSyncLogs] = useState<AppleHealthSyncLog[] | null>(null);
  const [healthSyncToken, setHealthSyncToken] = useState("");
  const [healthTokenConfigured, setHealthTokenConfigured] = useState(false);
  const [showHealthSyncToken, setShowHealthSyncToken] = useState(false);
  const [copiedShortcutPrompt, setCopiedShortcutPrompt] = useState(false);
  const [prepCountdown, setPrepCountdown] = useState<{
    type: TrainingType;
    exerciseId?: string | null;
    secondsLeft: number;
  } | null>(null);
  const [editAvatar, setEditAvatar] = useState<AvatarDesignId>(avatarAssetForProfile(initialProfile.id, initialProfile.avatar) as AvatarDesignId);
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
    profile.enduranceMinutes,
    getFitnessStageCount(profile.id, editBirthDate || null)
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
          email: profile.email ?? null,
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

  const [copiedPayload, setCopiedPayload] = useState(false);

  async function copySamplePayload() {
    const payload = JSON.stringify({
      profileId: profile.id,
      secret: healthSyncToken || "HIER_DEN_SYNC_SCHLUESSEL_EINFUEGEN",
      dailyActivity: [{ date: new Date().toISOString().slice(0, 10), moveCalories: 420, exerciseMinutes: 32, standHours: 10, stepCount: 7350, walkingRunningDistanceKm: 5.2, flightsClimbed: 7 }],
      workouts: []
    }, null, 2);
    if (await copyTextToClipboard(payload)) {
      setCopiedPayload(true);
      showToast({ type: "info", title: "JSON kopiert", message: "JSON-Muster in Zwischenablage kopiert." });
      setTimeout(() => setCopiedPayload(false), 2000);
    } else {
      showToast({ type: "info", title: "JSON-Muster", message: payload });
    }
  }

  async function copyShortcutPrompt() {
    const prompt = `Erstelle einen iPhone-Kurzbefehl „FitFamily Health Sync“ ausschließlich mit den eingebauten Apple-Kurzbefehle- und Health-Aktionen. Keine KI-, Cloud-Modell- oder Drittanbieter-Aktion im fertigen Kurzbefehl. Gesundheitsdaten dürfen nur an diesen FitFamily-Server gesendet werden: ${getWebhookUrl()}.

Der Kurzbefehl soll zwei Arten echter Daten für die letzten 30 Kalendertage übertragen: (A) Tageswerte der Aktivitätsringe und (B) echte abgeschlossene Workouts. Es dürfen niemals eine 30-Tage-Gesamtsumme anstelle von Tageswerten oder erfundene Beispieldaten übertragen werden.

A) Baue eine Liste dailyActivity mit höchstens einem Wörterbuch je Datum. Verwende „Health-Proben suchen“ jeweils für die letzten 30 Tage, gruppiere bzw. summiere die Treffer pro Kalendertag und füge den Wert in das Wörterbuch dieses Datums ein. Verwende diese Health-Typen, Einheiten und JSON-Feldnamen:
- Aktive Energie / Active Energy: Summe pro Tag in kcal -> moveCalories (Zahl)
- Trainingsminuten / Exercise Time: Summe pro Tag in Minuten -> exerciseMinutes (Zahl)
- Stehstunden / Stand Hours: Tageswert -> standHours (Zahl 0 bis 24)
- Schritte / Steps: Summe pro Tag als ganze Zahl -> stepCount (ganze Zahl)
- Geh- und Laufdistanz / Walking + Running Distance: Summe pro Tag in Kilometern -> walkingRunningDistanceKm (Zahl)
- Gestiegene Etagen / Flights Climbed: Summe pro Tag als ganze Zahl -> flightsClimbed (ganze Zahl)
Jedes Tageswörterbuch braucht date im Format YYYY-MM-DD. Wenn ein Typ an einem Tag keinen Wert hat, lass dieses Feld weg; trage keine Null als Ersatz für fehlende Daten ein. Alle sechs Typen getrennt abfragen und anschließend anhand date in dieselbe Tagesliste zusammenführen. Achte darauf, dass Zahlen numerische JSON-Zahlen bleiben, keine Texte mit Einheit. Die Kurzbefehle-Aktion „Summe“ darf nur auf Treffer des jeweiligen einzelnen Tages angewendet werden, niemals auf den ganzen 30-Tage-Zeitraum.

B) Suche zusätzlich echte abgeschlossene Apple-Health-Workouts der letzten 30 Tage. Erstelle je Workout ein Wörterbuch mit echter id, falls verfügbar, title, startedAt und endedAt als ISO-8601 mit Zeitzone sowie calories und distanceKm, wenn Health sie liefert. Nicht durch Aktivitätsringe ersetzen. Sammle sie in workouts.

Führe am Ende genau eine Aktion „Inhalte von URL abrufen“ aus: POST an ${getWebhookUrl()}, Haupttext JSON. Der Body hat genau diese drei obersten Felder: profileId = „${profile.id}“, secret = „HIER_DEN_SYNC_SCHLUESSEL_EINFUEGEN“, dailyActivity = Tagesliste, workouts = Workoutliste. Den Secret-Platzhalter unverändert lassen; ich ersetze ihn nach dem Erstellen selbst durch meinen privaten FitFamily-Schlüssel. Kein echter Schlüssel in einen geteilten Kurzbefehl. Zeige die Antwort des Servers an.

Wichtig für den Aufbau: Erstelle zuerst alle 6 Tageswert-Abfragen einzeln und füge deren Ergebnisse nach Datum zu dailyActivity zusammen; danach die Workout-Abfrage und dann den einen POST. Falls Kurzbefehle einen Schritt nicht unterstützt, erfinde keine andere Datenstruktur, sondern erkläre mir genau, welche Aktion ich stattdessen antippen muss. iPhone und FitFamily-Server müssen im selben WLAN sein oder über VPN erreichbar sein.`;
    if (await copyTextToClipboard(prompt)) {
      setCopiedShortcutPrompt(true);
      showToast({ type: "success", title: "Erstellungsauftrag kopiert", message: "Füge ihn in deine KI ein. Wichtig: keine KI-Aktion im fertigen Kurzbefehl und den Sync-Schlüssel erst in der persönlichen Kopie eintragen." });
      setTimeout(() => setCopiedShortcutPrompt(false), 2500);
    } else {
      showToast({ type: "error", title: "Kopieren nicht möglich", message: prompt });
    }
  }

  function requestHealthPin(action: "create" | "revoke" | "delete" | "logs") {
    setHealthPin("");
    setHealthPinError("");
    setHealthPinAction(action);
  }

  async function manageHealthToken(action: "create" | "revoke", pin: string): Promise<boolean> {
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
      showToast({ type: "info", title: "Schlüssel kopiert", message: "Jetzt im Kurzbefehle-Wörterbuch als secret einfügen." });
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
          title: "Schlüsselprüfung erfolgreich",
          message: data.message ?? "Der Sync-Schlüssel ist gültig. Es wurden keine Trainingsdaten gespeichert."
        });
      } else {
        showToast({
          type: "error",
          title: "Sync-Fehler",
          message: data.error ?? "Der Schlüssel konnte nicht geprüft werden."
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

  async function performHealthReset(pin: string): Promise<boolean> {
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
        return true;
      } else {
        setHealthPinError(data.error ?? "Vorgang fehlgeschlagen.");
        return false;
      }
    } catch {
      setHealthPinError("Konnte nicht mit dem Server kommunizieren.");
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
      if (healthPinAction === "logs") {
        const response = await fetch("/api/sync/apple-health/log", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileId: profile.id, pin: healthPin })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Protokoll konnte nicht geladen werden.");
        setHealthSyncLogs(Array.isArray(data.logs) ? data.logs : []);
        succeeded = true;
      } else if (healthPinAction === "delete") {
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
            birthDate={editBirthDate || null}
            name={profile.name}
            size="medium"
          />
          <div className="preview-info">
            <strong>Vorschau: {physiqueLabel(previewProgress.physique)} (Stufe {previewProgress.fitnessStage} von {getFitnessStageCount(profile.id, editBirthDate || null)})</strong>
            <p>Basiert auf {Math.round(profile.strengthMinutes)} Min. Kraft und {Math.round(profile.enduranceMinutes)} Min. Ausdauer.</p>
          </div>
        </div>
        <label>Anzeigename<input name="name" required maxLength={30} defaultValue={profile.name} /></label>
        <label>Geburtsdatum<input name="birthDate" type="date" value={editBirthDate} onChange={(event) => { const birthDate = event.target.value; setEditBirthDate(birthDate); setEditStartingFitness((value) => Math.min(value, getStartingFitnessStages(profile.id, birthDate || null).length)); }} /></label>
        <div className="avatar-choice">
          <span>Figur im Dashboard</span>
          <AvatarPicker value={editAvatar} onChange={setEditAvatar} />
        </div>
        <label>Start-Fitness
          <select name="startingFitness" value={editStartingFitness} onChange={(e) => setEditStartingFitness(Number(e.target.value))}>
            {getStartingFitnessStages(profile.id, editBirthDate || null).map((st) => (
              <option key={st.stage} value={st.stage}>{st.label} ({st.description})</option>
            ))}
          </select>
        </label>
        <p className="field-hint">
          Die Stufe steigt mit je 15 Trainingsstunden automatisch an. Erwachsene haben sieben Stufen, Kinder drei; das Verhältnis aus Kraft und Ausdauer bestimmt den Trainingsfokus.
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

            <p className="health-modal-desc">Einmal einrichten, dann den Kurzbefehl auf dem iPhone starten:</p>

            <section className="health-workflow-step">
              <h3><span>1</span> Schlüssel erzeugen</h3>
              <p>Eltern-PIN eingeben. Der Schlüssel bleibt hier sichtbar. Nach dem Erstellen des Kurzbefehls kannst du ihn über das Kopiersymbol übernehmen.</p>
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
                  <Zap size={16} /> {healthTokenConfigured ? "Schlüssel neu erstellen" : "Schlüssel erstellen"}
                </button>
                {healthTokenConfigured && <button type="button" className="health-ghost-btn" onClick={() => requestHealthPin("revoke")}>Widerrufen</button>}
                <small>{healthSyncToken ? "Nach Schritt 2 hier erneut kopieren und in Schritt 3 bei secret einsetzen." : healthTokenConfigured ? "Der bisherige Schlüssel ist nicht erneut abrufbar. Erzeuge hier einen neuen; der alte wird ungültig." : "Der Schlüssel wird einmal angezeigt. Nach Schritt 2 hier kopieren und in Schritt 3 einsetzen."}</small>
              </div>
            </section>

            <section className="health-workflow-step">
              <h3><span>2</span> Kurzbefehl erstellen lassen</h3>
              <p>Der Erstellungsauftrag umfasst Workouts sowie bis zu 30 einzelne Tageswerte: Bewegungsenergie, Trainingsminuten, Stehstunden, Schritte, Geh-/Laufstrecke und Etagen. Die Tageswerte werden nach Datum zusammengeführt, nicht als Monatssumme gesendet. Er enthält Zieladresse und Profil, aber keinen echten Schlüssel. Den bisherigen iCloud-Kurzbefehl bitte nicht verwenden.</p>
              <small className="health-webhook-note"><b>Zieladresse (automatisch enthalten):</b> {getWebhookUrl()}</small>
              <div className="health-workflow-actions">
                <button
                  type="button"
                  className="health-copy-btn"
                  onClick={copyShortcutPrompt}
                >
                  {copiedShortcutPrompt ? <Check size={15} /> : <Copy size={15} />}
                  <span>{copiedShortcutPrompt ? "Kopiert" : "Erstellungsauftrag kopieren"}</span>
                </button>
                <button
                  type="button"
                  className="health-copy-btn"
                  onClick={copySamplePayload}
                >
                  {copiedPayload ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedPayload ? "Kopiert" : "JSON-Beispiel"}</span>
                </button>
              </div>
            </section>

            <section className="health-workflow-step">
              <h3><span>3</span> Schlüssel privat einsetzen</h3>
              <p>Den von der KI erstellten Kurzbefehl in Apples „Kurzbefehle“ hinzufügen und öffnen. Im JSON-Feld <code>secret</code> den Platzhalter <code>HIER_DEN_SYNC_SCHLUESSEL_EINFUEGEN</code> durch deinen persönlichen Schlüssel ersetzen. Zieladresse und Profil sind schon eingetragen. Speichern; den Schlüssel nicht öffentlich teilen.</p>
              {healthSyncToken && <button type="button" className="health-copy-btn" onClick={() => void copyHealthToken()}><Copy size={16} /> Schlüssel kopieren</button>}
              <button type="button" className="health-secondary-btn" disabled={testingHealth || resettingHealth || !healthSyncToken} onClick={testHealthSync}>
                <Zap size={16} /> {testingHealth ? "Prüfe Schlüssel …" : "Schlüssel prüfen (ohne Import)"}
              </button>
              <small>Nur eine folgenlose Prüfung. Für den echten Import den Kurzbefehl in Schritt 4 auf dem iPhone ausführen.</small>
            </section>

            <section className="health-workflow-step">
              <h3><span>4</span> Kurzbefehl auf dem iPhone ausführen</h3>
              <p>Jetzt in Apples „Kurzbefehle“-App den Kurzbefehl öffnen und auf ▶︎ tippen. Beim ersten Lauf Health-Zugriff erlauben. Die angezeigte Antwort bestätigt Importanzahl oder Fehler.</p>
              {profile.appleHealthRings && <div className="health-ring-preview"><AppleActivityRings rings={profile.appleHealthRings} compact /></div>}
            </section>

            <section className="health-danger-zone">
              <button type="button" disabled={testingHealth || resettingHealth} onClick={() => requestHealthPin("logs")}>
                <History size={14} /> Sync-Protokoll anzeigen
              </button>
              {confirmResetHealth ? (
                <>
                  <strong>Apple-Health-Daten dieses Profils unwiderruflich löschen und Verbindung trennen?</strong>
                  <button type="button" disabled={resettingHealth} onClick={() => requestHealthPin("delete")}>{resettingHealth ? "Löscht …" : "Weiter zur PIN-Eingabe"}</button>
                  <button type="button" onClick={() => setConfirmResetHealth(false)}>Abbrechen</button>
                </>
              ) : (
                <button type="button" disabled={testingHealth || resettingHealth} onClick={() => setConfirmResetHealth(true)}>
                  <RotateCcw size={14} /> Daten löschen &amp; Verbindung trennen
                </button>
              )}
            </section>
            {healthSyncLogs && (
              <section className="health-sync-log" aria-label="Apple-Health-Sync-Protokoll">
                <div className="health-sync-log-heading">
                  <strong>Letzte Sync-Aufrufe</strong>
                  <button type="button" onClick={() => setHealthSyncLogs(null)} aria-label="Protokoll schließen"><X size={16} /></button>
                </div>
                {healthSyncLogs.length === 0 ? (
                  <p>Noch kein gültiger Sync-Aufruf beim Dashboard angekommen. Wenn der Kurzbefehl vorher hängen bleibt, wird hier kein Eintrag erscheinen.</p>
                ) : (
                  <ol>
                    {healthSyncLogs.map((entry) => {
                      const status = String(entry.details.status ?? (entry.action.endsWith("failed") ? "failed" : "received"));
                      const label = status === "completed" ? "Abgeschlossen" : status === "checked" ? "Schlüssel geprüft · kein Import" : status === "failed" ? "Fehler" : "Angekommen · keine Abschlussmeldung";
                      const counts = [
                        entry.details.received !== undefined ? `${entry.details.received} empfangen` : null,
                        entry.details.imported !== undefined ? `${entry.details.imported} importiert` : null,
                        entry.details.skipped !== undefined ? `${entry.details.skipped} übersprungen` : null
                      ].filter(Boolean).join(" · ");
                      return <li key={entry.id} className={`health-sync-log-entry ${status}`}>
                        <div><b>{label}</b><time>{new Date(entry.createdAt.replace(" ", "T") + (entry.createdAt.endsWith("Z") ? "" : "Z")).toLocaleString("de-DE")}</time></div>
                        {counts && <span>{counts}</span>}
                        {typeof entry.details.message === "string" && <small>{entry.details.message}</small>}
                      </li>;
                    })}
                  </ol>
                )}
              </section>
            )}
          </div>
        </div>
      )}

      {healthPinAction && (
        <div className="modal-backdrop health-pin-backdrop" onClick={() => !healthPinBusy && setHealthPinAction(undefined)}>
          <div className="confirm-modal-card health-pin-card" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="health-pin-title">
            <button type="button" className="modal-close" disabled={healthPinBusy} onClick={() => setHealthPinAction(undefined)} aria-label="Schließen"><X size={20} /></button>
            <div className="confirm-modal-top">
              <div className={`confirm-modal-icon ${healthPinAction === "delete" ? "danger" : "primary"}`}>
                {healthPinAction === "delete" ? <RotateCcw size={26} /> : <LockKeyhole size={26} />}
              </div>
            </div>
            <h3 id="health-pin-title">
              {healthPinAction === "delete" ? "Health-Daten löschen" : healthPinAction === "create" ? "Sync-Schlüssel erstellen" : healthPinAction === "revoke" ? "Sync-Schlüssel widerrufen" : "Sync-Protokoll anzeigen"}
            </h3>
            <p>{healthPinAction === "delete" ? "Apple-Health-Daten dieses Profils und die Verbindung werden unwiderruflich gelöscht. Zur Bestätigung Eltern-PIN eingeben." : healthPinAction === "logs" ? "Das Protokoll enthält Zeitpunkte, importierte und übersprungene Einheiten sowie Serverfehler. Zur Freigabe Eltern-PIN eingeben." : "Zur Bestätigung bitte die vierstellige Eltern-PIN eingeben."}</p>
            <div className="confirm-pin-section">
              <b>Eltern-PIN</b>
              <TouchPinpad value={healthPin} disabled={healthPinBusy} onChange={(value) => { setHealthPin(value); setHealthPinError(""); }} />
              {healthPinError && <p className="form-error" role="alert">{healthPinError}</p>}
            </div>
            <div className="confirm-modal-actions">
              <button type="button" className="confirm-cancel-btn" disabled={healthPinBusy} onClick={() => setHealthPinAction(undefined)}>Abbrechen</button>
              <button type="button" className={`confirm-submit-btn ${healthPinAction === "delete" ? "danger" : "primary"}`} disabled={healthPinBusy || healthPin.length !== 4} onClick={() => void submitHealthPin()}>
                {healthPinBusy ? "Wird verarbeitet …" : healthPinAction === "delete" ? "Löschen & trennen" : healthPinAction === "logs" ? "Protokoll öffnen" : "Bestätigen"}
              </button>
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
